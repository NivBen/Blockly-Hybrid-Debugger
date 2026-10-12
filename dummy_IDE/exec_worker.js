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
 *
 * A run also reports the final value of the program's variables, so a
 * multi-language execution says what the program computed and not only what it
 * printed. The caller sends the wanted variables as [{ name, identifier }]:
 * `name` is the Blockly variable as the user named it, `identifier` is what that
 * language's generator called it in the source (`count`, `$count`, ...). Each
 * runtime is asked in its own terms - python's repr, php's var_export, lua's
 * tostring - and reports its own type name alongside the value, so a 1 that is
 * an `int` to Python and a `number` to JavaScript stays visible as one value
 * described two ways instead of being flattened into one runtime's vocabulary.
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

// Runtimes are served from ./vendor (copied from node_modules by copy_vendor.js), so execution works offline.
const VENDOR_URL = new URL("./vendor/", self.location).href;
const PYODIDE_INDEX = `${VENDOR_URL}pyodide/`;
const PHP_WASM_URL = `${VENDOR_URL}php-wasm/PhpWeb.mjs`;
// only this version's build is copied into vendor/; keep in sync with PHP_BUILD in copy_vendor.js
const PHP_VERSION = "8.4";
const FENGARI_URL = `${VENDOR_URL}fengari-web/dist/fengari-web.js`;

// Input queue for the current run; nextInput() consumes one line at a time.
let inputQueue = [];
function nextInput() {
    return inputQueue.length ? inputQueue.shift() : "";
}

/* ------------------------------------------------------- variable capture */

/* Identifiers are interpolated into program source, so only the shape Blockly's generators
   actually emit is let through: Blockly.Names.safeName_ reduces every user name to word
   characters, and the PHP generator prefixes them with '$'. Anything of another shape did not
   come from a generator and is dropped rather than injected into a program. */
const SAFE_IDENTIFIER = /^\$?[A-Za-z_][A-Za-z0-9_]*$/;
function captureTargets(wanted) {
    return (Array.isArray(wanted) ? wanted : []).filter((v) =>
        v && typeof v.name === "string"
        && typeof v.identifier === "string" && SAFE_IDENTIFIER.test(v.identifier));
}

// utf-8 safe base64, so a name list can be handed to PHP without escaping it into its source
function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
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

/* Reads the wanted names out of the namespace the program just ran in. Written in Python rather
   than walked from JavaScript because the interesting part is what Python thinks it holds: repr()
   and type().__name__ are the interpreter's own answer, where converting the values to JS first
   would report a list as an Array and an int as a number. */
const PY_CAPTURE = [
    "import json as __glancer_json",
    "__glancer_out = []",
    "for __glancer_name, __glancer_id in __glancer_json.loads(__glancer_wanted):",
    "    if __glancer_id not in globals(): continue",
    "    __glancer_v = globals()[__glancer_id]",
    "    __glancer_out.append({",
    "        'name': __glancer_name,",
    // a str is shown as the user would read it; everything else as Python writes it
    "        'value': __glancer_v if isinstance(__glancer_v, str) else repr(__glancer_v),",
    "        'type': type(__glancer_v).__name__,",
    "    })",
    "__glancer_result = __glancer_json.dumps(__glancer_out)",
].join("\n");

async function runPython(code, wanted, captured) {
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
    /* The interpreter is reused across runs, so the program gets a namespace of its own. Sharing
       py.globals would let a previous run's leftovers be reported as this one's variables - a name
       the user has since deleted from the workspace would still answer with its old value.
       __name__ is set because a bare dict has none, and a program that tests for it would
       otherwise raise where the same code run as a script would not. */
    const namespace = py.runPython("{'__name__': '__main__'}");
    try {
        await py.runPythonAsync(code, { globals: namespace });
    } finally {
        py.setStdout({});
        py.setStderr({});
        // in a finally so a program that raised still reports the state it reached
        try {
            const targets = captureTargets(wanted).map((v) => [v.name, v.identifier]);
            if (targets.length) {
                namespace.set("__glancer_wanted", JSON.stringify(targets));
                await py.runPythonAsync(PY_CAPTURE, { globals: namespace });
                JSON.parse(namespace.get("__glancer_result")).forEach((v) => captured.push(v));
            }
        } catch (captureError) {
            // a failed capture must not replace the program's own error
            console.warn("Python variable capture failed:", captureError);
        }
        namespace.destroy(); // PyProxy objects are not garbage collected for us
    }
    return out;
}

/* -------------------------------------------------------------------- PHP */

/* PHP is the one runtime whose state does not outlive the program: php.run() is a request, and
   once it returns there is nothing left to inspect. So the capture is appended to the source and
   runs as the program's last act, printing its result between two markers that are cut back out
   of the output below. get_defined_vars() rather than isset() because a variable holding null is
   still a variable the program has. */
const PHP_VARS_OPEN = "__GLANCER_VARS__";
const PHP_VARS_CLOSE = "__GLANCER_END__";

function phpCaptureEpilogue(targets) {
    if (!targets.length) return "";
    const wanted = toBase64(JSON.stringify(targets.map((v) => [v.name, v.identifier.slice(1)])));
    return "\n"
        + "$__glancer_defined = get_defined_vars();\n"
        + "$__glancer_out = array();\n"
        + "foreach (json_decode(base64_decode('" + wanted + "'), true) as $__glancer_pair) {\n"
        + "    if (!array_key_exists($__glancer_pair[1], $__glancer_defined)) { continue; }\n"
        + "    $__glancer_v = $__glancer_defined[$__glancer_pair[1]];\n"
        + "    if (is_string($__glancer_v)) { $__glancer_r = $__glancer_v; }\n"
        + "    else if (is_array($__glancer_v)) { $__glancer_r = json_encode($__glancer_v); }\n"
        + "    else { $__glancer_r = var_export($__glancer_v, true); }\n"
        + "    $__glancer_out[] = array('name' => $__glancer_pair[0],\n"
        + "        'value' => $__glancer_r, 'type' => gettype($__glancer_v));\n"
        + "}\n"
        + "echo '" + PHP_VARS_OPEN + "' . json_encode($__glancer_out) . '" + PHP_VARS_CLOSE + "';\n";
}

async function runPhp(code, wanted, captured) {
    const { PhpWeb } = await import(PHP_WASM_URL);
    const php = new PhpWeb({ version: PHP_VERSION });
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
    await php.run(src + phpCaptureEpilogue(captureTargets(wanted)));

    // lift the capture back out of the output, so the user sees only what their program printed
    const start = out.lastIndexOf(PHP_VARS_OPEN);
    const end = start === -1 ? -1 : out.indexOf(PHP_VARS_CLOSE, start);
    if (start === -1 || end === -1) return out; // a fatal error stopped the program before the epilogue
    try {
        JSON.parse(out.slice(start + PHP_VARS_OPEN.length, end)).forEach((v) => captured.push(v));
    } catch (captureError) {
        console.warn("PHP variable capture failed:", captureError);
    }
    return out.slice(0, start) + out.slice(end + PHP_VARS_CLOSE.length);
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

function runLua(code, wanted, captured) {
    const fengari = getFengari();
    const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
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

    /* The Lua generator assigns to globals, and the state outlives luaL_dostring, so the variables
       are read straight off it. Done before the error check so a program that failed part way
       still reports the state it had reached. luaL_tolstring is what `print` would show, honouring
       a __tostring metamethod, which keeps this column agreeing with the output column. */
    captureTargets(wanted).forEach((v) => {
        const type = lua.lua_getglobal(L, to_luastring(v.identifier));
        if (!lua.lua_isnoneornil(L, -1)) {
            captured.push({
                name: v.name,
                value: valToStr(L, -1),
                type: to_jsstring(lua.lua_typename(L, type)),
            });
        }
        lua.lua_pop(L, 1);
    });

    if (status !== lua.LUA_OK) {
        throw new Error(lua.lua_tojsstring(L, -1));
    }
    return out;
}

/* --------------------------------------------------------------- JavaScript */

/* The generated program declares its variables with `var`, which scopes them to the wrapper
   function below rather than to anything this module can reach. So the capture is an epilogue
   inside that same wrapper - a lookup from out here would only find undeclared names. It sits in
   a finally so a program that threw still reports the state it reached, and each read is guarded
   because a variable the workspace declares but the program never uses is never emitted. */
function jsCaptureEpilogue(targets) {
    return targets.map((v) =>
        "try { __glancer_out.push({ name: " + JSON.stringify(v.name)
        + ", value: __glancer_render(" + v.identifier + ")"
        + ", type: typeof " + v.identifier + " }); } catch (e) {}"
    ).join("\n");
}

// values cross a postMessage, so they are rendered here rather than sent as live objects
function jsRender(value) {
    if (typeof value === "string") return value;
    try {
        const rendered = JSON.stringify(value);
        return rendered === undefined ? String(value) : rendered;
    } catch (e) {
        return String(value); // circular, or otherwise not serialisable
    }
}

// Blockly's JS generator uses window.alert for "print" and window.prompt for input.
async function runJavaScript(code, wanted, captured) {
    let out = "";
    self.alert = (m) => { out += String(m) + "\n"; };
    self.prompt = () => nextInput();
    const log = console.log;
    console.log = (...a) => { out += a.map(String).join(" ") + "\n"; };
    try {
        const epilogue = jsCaptureEpilogue(captureTargets(wanted));
        const fn = new Function("__glancer_out", "__glancer_render",
            `"use strict"; return (async () => {\ntry {\n${code}\n} finally {\n${epilogue}\n}\n})();`);
        await fn(captured, jsRender);
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
    const { id, language, code, inputs, variables } = event.data;
    inputQueue = Array.isArray(inputs) ? inputs.slice() : [];
    const runner = runners[language];
    if (!runner) {
        self.postMessage({
            id,
            status: "unsupported",
            output: "",
            error: `${language} cannot be executed in the browser.`,
            variables: [],
        });
        return;
    }
    /* The runners append to this rather than returning it, so whatever a run managed to capture
       survives the program throwing: the error path reports the state the program had reached,
       which is the half of a failed run worth having. */
    const captured = [];
    try {
        const output = await runner(code, variables, captured);
        self.postMessage({ id, status: "ok", output, error: "", variables: captured });
    } catch (err) {
        self.postMessage({
            id,
            status: "error",
            output: "",
            error: (err && (err.message || err.toString())) || "Unknown runtime error",
            variables: captured,
        });
    }
};
