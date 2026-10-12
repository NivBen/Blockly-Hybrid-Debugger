// Copies the third-party files the page loads at runtime from node_modules into vendor/,
// so the site needs no CDN and runs fully offline (e.g. from the Docker image).
// Paths are mirrored: node_modules/<path> is served as ./vendor/<path>.
const fs = require('fs');
const path = require('path');

const MODULES = path.join(__dirname, 'node_modules');
const VENDOR = path.join(__dirname, 'vendor');

// php-wasm ships a ~15MB build for every PHP version; only the one exec_worker.js asks for is copied.
// Keep in sync with PHP_VERSION there.
const PHP_BUILD = 'php8.4-web.mjs';

function copy(relPath) {
    fs.cpSync(path.join(MODULES, relPath), path.join(VENDOR, relPath), { recursive: true });
}

fs.rmSync(VENDOR, { recursive: true, force: true });

copy('codemirror/lib');
copy('codemirror/mode');
copy('jquery/dist/jquery.slim.min.js');
copy('@popperjs/core/dist/umd/popper.min.js');
copy('bootstrap/dist');
copy('handsontable/dist/handsontable.full.min.js');
copy('pyodide');
copy('fengari-web/dist/fengari-web.js');

// php-wasm: its shared modules, the chosen build, and the .wasm binary that build loads
const phpDir = path.join(MODULES, 'php-wasm');
fs.readdirSync(phpDir)
    .filter((name) => name.endsWith('.mjs') && !/^php\d/.test(name))
    .forEach((name) => copy(`php-wasm/${name}`));
copy(`php-wasm/${PHP_BUILD}`);
const wasm = fs.readFileSync(path.join(phpDir, PHP_BUILD), 'utf8').match(/new URL\("([0-9a-f]+\.wasm)"/);
if (!wasm) {
    throw new Error(`copy_vendor: could not find the .wasm file loaded by php-wasm/${PHP_BUILD}`);
}
copy(`php-wasm/${wasm[1]}`);
