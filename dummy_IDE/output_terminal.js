// A small closable output terminal docked at the bottom of the page. The program's print
// blocks (window.alert in the generated JavaScript) and runtime errors are written here
// with a timestamp, instead of a blocking alert that paused the whole debugger.

const MAX_LINES = 1000; // oldest lines are dropped past this, so a print inside an infinite loop cannot swamp the page
const SCROLL_STICK_PX = 20; // keep following new output while scrolled within this distance of the bottom
const MIN_WIDTH = 260; // smallest size the terminal can be resized to
const MIN_HEIGHT = 100;

const terminal = document.getElementById("outputTerminal");
const terminal_header = terminal.querySelector(".output-terminal-header");
const terminal_lines = document.getElementById("outputTerminalLines");
const toggle_button = document.getElementById("OutputTerminalButton");

let pending_lines = []; // lines waiting for the next frame, a fast print loop is rendered in batches
let flush_scheduled = false;
let dismissed = false; // closed by the user during the current session, do not pop it open again
let session_printed = false; // whether the current debugging session printed anything yet

// HH:MM:SS.mmm, the milliseconds tell apart prints that happen in quick succession
const formatTime = (time) => {
    const date = new Date(time);
    const pad = (num, len = 2) => String(num).padStart(len, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

const createLine = (text, time, level) => {
    const line = document.createElement("div");
    line.className = `output-terminal-line ${level}`;
    const time_element = document.createElement("span");
    time_element.className = "output-terminal-time";
    time_element.textContent = `[${formatTime(time)}]`;
    const text_element = document.createElement("span");
    text_element.className = "output-terminal-text";
    text_element.textContent = text; // textContent, never markup - it is whatever the program printed
    line.append(time_element, text_element);
    return line;
};

const flushPendingLines = () => {
    flush_scheduled = false;
    const at_bottom = terminal_lines.scrollHeight - terminal_lines.scrollTop - terminal_lines.clientHeight <= SCROLL_STICK_PX;
    const fragment = document.createDocumentFragment();
    pending_lines.forEach(line => fragment.appendChild(line));
    pending_lines = [];
    terminal_lines.appendChild(fragment);
    while (terminal_lines.childElementCount > MAX_LINES) {
        terminal_lines.firstElementChild.remove();
    }
    if (at_bottom) terminal_lines.scrollTop = terminal_lines.scrollHeight;
};

const queueLine = (line) => {
    pending_lines.push(line);
    if (!flush_scheduled) {
        flush_scheduled = true;
        requestAnimationFrame(flushPendingLines);
    }
};

export const showOutputTerminal = (show) => {
    terminal.style.display = show ? "flex" : "none";
    toggle_button.classList.toggle("active", show);
    if (show) {
        keepInViewport(); // the window may have shrunk while it was hidden
        terminal_lines.scrollTop = terminal_lines.scrollHeight;
    }
};

const isOutputTerminalShown = () => terminal.style.display === "flex";

// writes one line of program output. level is "output" for prints or "error" for runtime errors
export const printToOutputTerminal = (text, time = Date.now(), level = "output") => {
    // mark where each debugging session's output begins, when earlier sessions left some behind
    if (!session_printed && (terminal_lines.childElementCount > 0 || pending_lines.length > 0)) {
        const separator = document.createElement("div");
        separator.className = "output-terminal-separator";
        separator.textContent = `new session · ${formatTime(time)}`;
        queueLine(separator);
    }
    session_printed = true;
    queueLine(createLine(text, time, level));
    if (!dismissed && !isOutputTerminalShown()) showOutputTerminal(true);
};

// called when a debugging session starts: the terminal may pop open again on its first print
export const beginOutputTerminalSession = () => {
    dismissed = false;
    session_printed = false;
};

document.getElementById("outputTerminalCloseButton").onclick = () => {
    dismissed = true;
    showOutputTerminal(false);
};

document.getElementById("outputTerminalClearButton").onclick = () => {
    pending_lines = [];
    terminal_lines.innerHTML = "";
};

// the navbar button reopens the terminal after it was closed, or closes it
toggle_button.onclick = () => {
    const show = !isOutputTerminalShown();
    dismissed = !show;
    showOutputTerminal(show);
};

// Drag and resize - START
// the terminal starts docked bottom right by the stylesheet. the first drag or resize pins it
// to an explicit left/top/width/height, which it then keeps while it is closed and reopened

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// the fixed navbar sits above the terminal, the header must never slip under it out of reach
const minTop = () => document.querySelector("nav.navbar").getBoundingClientRect().bottom;

const applyRect = (left, top, width, height) => {
    Object.assign(terminal.style, {
        left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
        right: "auto", bottom: "auto",
    });
};

// pulls a pinned terminal back on screen, shrinking it if the window got smaller than it
function keepInViewport() {
    if (!terminal.style.left || !isOutputTerminalShown()) return; // docked by the stylesheet, it follows the window on its own
    const rect = terminal.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth);
    const height = Math.min(rect.height, window.innerHeight - minTop());
    applyRect(clamp(rect.left, 0, window.innerWidth - width), clamp(rect.top, minTop(), window.innerHeight - height), width, height);
}

// follows one pointer from its pointerdown until it is released, calling onMove with how far it
// moved and the terminal's rect when the gesture began
const trackPointer = (event, onMove) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const start = terminal.getBoundingClientRect();
    const [start_x, start_y] = [event.clientX, event.clientY];
    const move = (move_event) => onMove(move_event.clientX - start_x, move_event.clientY - start_y, start);
    handle.setPointerCapture(event.pointerId); // keep the moves coming even when the pointer outruns the panel
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", () => handle.removeEventListener("pointermove", move), { once: true });
};

// drag the terminal around by its header
terminal_header.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return; // leave the Clear and close buttons clickable
    trackPointer(event, (dx, dy, start) => applyRect(
        clamp(start.left + dx, 0, window.innerWidth - start.width),
        clamp(start.top + dy, minTop(), window.innerHeight - start.height),
        start.width, start.height));
});

// resize from any edge or corner, each handle moves the sides named in its edges (e.g. "n", "se")
["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach(edges => {
    const handle = document.createElement("div");
    handle.className = `output-terminal-resize ${edges}`;
    terminal.appendChild(handle);
    handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        trackPointer(event, (dx, dy, start) => {
            let { left, top, right, bottom } = start;
            if (edges.includes("w")) left = clamp(start.left + dx, 0, right - MIN_WIDTH);
            if (edges.includes("e")) right = clamp(start.right + dx, left + MIN_WIDTH, window.innerWidth);
            if (edges.includes("n")) top = clamp(start.top + dy, minTop(), bottom - MIN_HEIGHT);
            if (edges.includes("s")) bottom = clamp(start.bottom + dy, top + MIN_HEIGHT, window.innerHeight);
            applyRect(left, top, right - left, bottom - top);
        });
    });
});

window.addEventListener("resize", keepInViewport);
// Drag and resize - END
