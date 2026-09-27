// A small output terminal docked at the bottom of the page. The program's print blocks
// (window.alert in the generated JavaScript) and runtime errors are written here with a
// timestamp, instead of a blocking alert that paused the whole debugger. It minimizes to a
// round "Debugger console" button in the bottom right corner, which opens it again.

const MAX_LINES = 1000; // oldest lines are dropped past this, so a print inside an infinite loop cannot swamp the page
const SCROLL_STICK_PX = 20; // keep following new output while scrolled within this distance of the bottom
const MIN_WIDTH = 260; // smallest size the terminal can be resized to
const MIN_HEIGHT = 100;

const terminal = document.getElementById("outputTerminal");
const terminal_header = terminal.querySelector(".output-terminal-header");
const terminal_lines = document.getElementById("outputTerminalLines");
const bubble = document.getElementById("outputTerminalBubble");
const bubble_badge = document.getElementById("outputTerminalBubbleBadge");

let pending_lines = []; // lines waiting for the next frame, a fast print loop is rendered in batches
let flush_scheduled = false;
let minimized = false; // minimized by the user, new output waits in the bubble until they open it
let unread = 0; // lines printed while minimized, counted on the bubble
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

const setUnread = (count) => {
    unread = count;
    bubble_badge.textContent = count === 0 ? "" : count > 99 ? "99+" : String(count); // an empty badge is hidden
};

// the page starts with only the bubble. the program's first print opens the terminal, unless
// the user has minimized it themselves by then
const openOutputTerminal = () => {
    minimized = false;
    setUnread(0);
    bubble.style.display = "none";
    terminal.style.display = "flex";
    keepInViewport(); // the window may have shrunk while it was minimized
    terminal_lines.scrollTop = terminal_lines.scrollHeight;
};

const minimizeOutputTerminal = () => {
    minimized = true;
    terminal.style.display = "none";
    bubble.style.display = "flex";
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
    if (minimized) setUnread(unread + 1);
    else if (!isOutputTerminalShown()) openOutputTerminal(); // the program's first print
};

// called when a debugging session starts, so its first print is marked off from earlier output
export const beginOutputTerminalSession = () => {
    session_printed = false;
};

document.getElementById("outputTerminalMinimizeButton").onclick = minimizeOutputTerminal;
bubble.onclick = openOutputTerminal;

document.getElementById("outputTerminalClearButton").onclick = () => {
    pending_lines = [];
    terminal_lines.innerHTML = "";
};

// Drag and resize - START
// the terminal starts docked bottom right by the stylesheet. the first drag or resize pins it
// to an explicit left/top/width/height, which it then keeps while it is minimized and reopened

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
    if (event.button !== 0 || event.target.closest("button")) return; // leave the Clear and minimize buttons clickable
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
