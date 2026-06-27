/*
 * GLANCER in-browser language runtimes for Multi-Language Execution (main-thread coordinator).
 *
 * Actual execution happens in exec_worker.js (a Web Worker). This module manages
 * that worker and exposes window.GlancerRuntimes.run() to the bundled app.
 *
 * Running in a worker lets us enforce a hard per-program time limit: a synchronous
 * infinite loop cannot be interrupted on the main thread, but the worker can be
 * terminated, which frees the resources the runaway program was consuming.
 *
 * Execution targets (see paper "Glassbox Debugging", Sect. 4.5):
 *   - Python : Pyodide (CPython compiled to WebAssembly)
 *   - PHP    : php-wasm (PHP compiled to WebAssembly)
 *   - Lua    : Fengari  (Lua VM, as in the paper)
 *   - JavaScript : executed directly in the worker
 *   - Dart   : no in-browser interpreter exists -> not supported here
 */

const WORKER_URL = "./exec_worker.js";
const SUPPORTED = ["JavaScript", "UneditedJavaScript", "Python", "PHP", "Lua"];

let worker = null;
let nextId = 1;
// Pending runs awaiting a worker reply, keyed by message id.
const pending = new Map();

function getWorker() {
    if (!worker) {
        worker = new Worker(WORKER_URL);
        worker.onmessage = (event) => {
            const entry = pending.get(event.data.id);
            if (entry) {
                pending.delete(event.data.id);
                entry.resolve(event.data);
            }
        };
        worker.onerror = (event) => {
            // A fatal worker error invalidates every in-flight run.
            const message = event.message || "Execution worker crashed";
            pending.forEach((entry) => entry.resolve({
                status: "error",
                output: "",
                error: message,
            }));
            pending.clear();
            destroyWorker();
        };
    }
    return worker;
}

function destroyWorker() {
    if (worker) {
        worker.terminate();
        worker = null;
    }
}

// Run `code` for `language`, enforcing a wall-clock limit, and return a uniform
// result descriptor. opts: { timeoutMs:number, inputs:string[] }.
function run(language, code, opts) {
    const options = opts || {};
    const timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0
        ? options.timeoutMs
        : 10000;
    const inputs = Array.isArray(options.inputs) ? options.inputs : [];

    if (SUPPORTED.indexOf(language) === -1) {
        return Promise.resolve({
            language,
            status: "unsupported",
            output: "",
            error: `${language} cannot be executed in the browser.`,
            durationMs: 0,
        });
    }

    const id = nextId++;
    const started = performance.now();
    const w = getWorker();

    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(Object.assign(
                { language, durationMs: Math.round(performance.now() - started) },
                result
            ));
        };

        const timer = setTimeout(() => {
            pending.delete(id);
            // The worker is busy in a synchronous loop and cannot reply; kill it.
            destroyWorker();
            finish({
                status: "timeout",
                output: "",
                error: `Execution stopped: exceeded the ${Math.round(timeoutMs / 1000)}s time limit `
                    + `(possible infinite loop).`,
            });
        }, timeoutMs);

        pending.set(id, { resolve: finish });
        w.postMessage({ id, language, code, inputs });
    });
}

function isSupported(language) {
    return SUPPORTED.indexOf(language) !== -1;
}

// Kept for API compatibility; per-batch input is now passed explicitly to run().
function beginBatch() {}

window.GlancerRuntimes = { run, isSupported, beginBatch };
