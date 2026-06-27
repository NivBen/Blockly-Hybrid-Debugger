/*
 * GLANCER execution worker.
 *
 * Runs a single program in one target language and posts back its captured
 * output / runtime error. Execution happens inside this Web Worker so the main
 * thread can enforce a hard time limit: if a program (e.g. an infinite loop)
 * exceeds the limit, the main thread calls worker.terminate(), which frees all
 * resources the runaway computation was using. A synchronous infinite loop
 * cannot be interrupted any other way in the browser.
 *
 * This is a classic worker (so importScripts is available for Fengari). The
 * WebAssembly runtimes are loaded lazily, on first use of their language.
 *
 *   - Python : Pyodide (CPython compiled to WebAssembly)
 *   - PHP    : php-wasm (PHP compiled to WebAssembly)
 *   - Lua    : Fengari  (Lua VM)
 *   - JavaScript : evaluated directly in the worker
 *
 * Program input is supplied up front (an array of lines) and consumed in order
 * by each language's input primitive, so every language receives identical
 * input. Interactive prompting is not possible from a worker.
 */

// Several browser runtimes (php-wasm, fengari-web) and Blockly-generated code
// expect a DOM. Provide minimal window/document shims so they load and run in a
// worker that has no real DOM. These cover only what those libraries touch.
self.window = self; // self already has addEventListener/dispatchEvent/location
// fengari-interop references the HTMLDocument constructor, which is absent in a worker.
self.HTMLDocument = self.HTMLDocument || function HTMLDocument() {};
self.document = self.document || {
    readyState: "complete",
    currentScript: { src: "" },
    location: self.location,
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    getElementsByClassName() { return []; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
    head: { appendChild() {} },
    body: { appendChild() {} },
};

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PHP_WASM_URL = "https://cdn.jsdelivr.net/npm/php-wasm@0.1.0/PhpWeb.mjs";
const FENGARI_URL = "https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js";

// Input queue for the current run; nextInput() consumes one line at a time.
let inputQueue = [];
function nextInput() {
    return inputQueue.length ? inputQueue.shift() : "";
}

/* ----------------------------------------------------------------- Python */

let pyodidePromise = null;
function getPyodide() {
    if (!pyodidePromise) {
        pyodidePromise = (async () => {
            const { loadPyodide } = await import(`${PYODIDE_INDEX}pyodide.mjs`);
            return await loadPyodide({ indexURL: PYODIDE_INDEX });
        })();
    }
    return pyodidePromise;
}

async function runPython(code) {
    const py = await getPyodide();
    let out = "";
    py.setStdout({ batched: (s) => { out += s + "\n"; } });
    py.setStderr({ batched: (s) => { out += s + "\n"; } });
    globalThis.__glancerInput = () => nextInput();
    await py.runPythonAsync(
        "import builtins as __glancer_b, js as __glancer_js\n" +
        "def __glancer_input(prompt=''):\n" +
        "    return __glancer_js.__glancerInput()\n" +
        "__glancer_b.input = __glancer_input\n" +
        "__glancer_b.raw_input = __glancer_input\n"
    );
    try {
        await py.runPythonAsync(code);
    } finally {
        py.setStdout({});
        py.setStderr({});
    }
    return out;
}

/* -------------------------------------------------------------------- PHP */

async function runPhp(code) {
    const { PhpWeb } = await import(PHP_WASM_URL);
    const php = new PhpWeb();
    let out = "";
    const append = (e) => {
        const d = e && e.detail;
        out += Array.isArray(d) ? d.join("") : (d == null ? "" : String(d));
    };
    php.addEventListener("output", append);
    php.addEventListener("error", append);
    await php.binary; // wait for the WASM module to be ready
    let src = code.trim();
    if (!src.startsWith("<?php") && !src.startsWith("<?")) {
        src = "<?php\n" + src;
    }
    await php.run(src);
    return out;
}

/* -------------------------------------------------------------------- Lua */

let fengariLoaded = false;
function getFengari() {
    if (!fengariLoaded) {
        importScripts(FENGARI_URL); // relies on the window/document/HTMLDocument shims above
        fengariLoaded = true;
    }
    return self.fengari;
}

function runLua(code) {
    const fengari = getFengari();
    const { lua, lauxlib, lualib, to_luastring } = fengari;
    let out = "";

    const valToStr = (L, idx) => {
        lauxlib.luaL_tolstring(L, idx);
        const s = lua.lua_tojsstring(L, -1);
        lua.lua_pop(L, 1);
        return s;
    };

    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    // Override print() to capture output instead of writing to the console.
    lua.lua_pushcfunction(L, (L) => {
        const n = lua.lua_gettop(L);
        const parts = [];
        for (let i = 1; i <= n; i++) parts.push(valToStr(L, i));
        out += parts.join("\t") + "\n";
        return 0;
    });
    lua.lua_setglobal(L, to_luastring("print"));

    // fengari-web does not open the `io` library; create a minimal one.
    lua.lua_getglobal(L, to_luastring("io"));
    if (!lua.lua_istable(L, -1)) {
        lua.lua_pop(L, 1);
        lua.lua_newtable(L);
        lua.lua_pushvalue(L, -1);
        lua.lua_setglobal(L, to_luastring("io"));
    }
    lua.lua_pushcfunction(L, (L) => {
        lua.lua_pushstring(L, to_luastring(nextInput()));
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring("read"));
    lua.lua_pushcfunction(L, (L) => {
        const n = lua.lua_gettop(L);
        for (let i = 1; i <= n; i++) out += valToStr(L, i);
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring("write"));
    lua.lua_pop(L, 1);

    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        throw new Error(lua.lua_tojsstring(L, -1));
    }
    return out;
}

/* --------------------------------------------------------------- JavaScript */

// Blockly's JS generator uses window.alert for "print" and window.prompt for input.
async function runJavaScript(code) {
    let out = "";
    self.alert = (m) => { out += String(m) + "\n"; };
    self.prompt = () => nextInput();
    const log = console.log;
    console.log = (...a) => { out += a.map(String).join(" ") + "\n"; };
    try {
        const fn = new Function(`"use strict"; return (async () => {\n${code}\n})();`);
        await fn();
    } finally {
        console.log = log;
    }
    return out;
}

/* -------------------------------------------------------------- dispatcher */

const runners = {
    JavaScript: runJavaScript,
    UneditedJavaScript: runJavaScript,
    Python: runPython,
    PHP: runPhp,
    Lua: runLua,
};

self.onmessage = async (event) => {
    const { id, language, code, inputs } = event.data;
    inputQueue = Array.isArray(inputs) ? inputs.slice() : [];
    const runner = runners[language];
    if (!runner) {
        self.postMessage({
            id,
            status: "unsupported",
            output: "",
            error: `${language} cannot be executed in the browser.`,
        });
        return;
    }
    try {
        const output = await runner(code);
        self.postMessage({ id, status: "ok", output, error: "" });
    } catch (err) {
        self.postMessage({
            id,
            status: "error",
            output: "",
            error: (err && (err.message || err.toString())) || "Unknown runtime error",
        });
    }
};
