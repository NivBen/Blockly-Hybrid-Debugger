import {
    PL_to_editor,
    ProgrammingLanguages,
} from './index.js';
import { Blockly_Debugger } from "../debugger/init.js";

export const removeEmptyLines = (str) => {
    return !str ? "" : str.split(/\r?\n/) // Split input text into an array of lines
        .filter(line => line.trim() !== "") // Filter out lines that are empty or contain only whitespace
        .join("\n"); // Join line array into a string
}

// adds a line class over every code line a block generates, from the line its code starts
// on down to its last, the same span the breakpoint bracket draws in the gutter.
// returns the first line, or -1 when the block generates no code in that language
export function highlightBlockCodeRange(editor, generated_code, lineClass) {
    if (!generated_code || !generated_code.lineNumber) return -1;
    const first_line = generated_code.lineNumber - 1;
    const last_line = Math.min(first_line + generated_code.lineCount - 1, editor.lineCount() - 1);
    for (let line = first_line; line <= last_line; line++) {
        editor.addLineClass(line, "wrap", lineClass);
    }
    return first_line;
}

// removes a line highlight from a whole editor
export function removeCodeLineHighlight(editor, lineClass) {
    for (let line = 0; line < editor.lineCount(); line++) {
        editor.removeLineClass(line, "wrap", lineClass);
    }
}

// remove all code editors gutter highlights and reset highlightedBlockID
export const removeGutterAndBlockHighlights = () => {
    Object.keys(ProgrammingLanguages).forEach(language => {
        let [editor,] = PL_to_editor(language);
        removeCodeLineHighlight(editor, "highlight-line"); // remove gutter highlights
    });
    Blockly_Debugger.actions["Highlight"].highlightedBlockID = undefined;
}

// shows a small popover at a viewport point, e.g. where the user clicked. it dismisses
// itself after hold_ms, stays for as long as the pointer rests on it so a longer message
// can be read, and closes on the next click anywhere outside it
let tooltip_element = null;
let tooltip_dismiss_timer = null;
let tooltip_outside_click_listener = null;
const TOOLTIP_LEAVE_DELAY_MS = 600; // grace period once the pointer moves off

export const showTooltip = (title, detail, x, y, hold_ms = 2000) => {
    hideTooltip();
    tooltip_element = document.createElement("div");
    tooltip_element.className = "click-tooltip";
    const title_element = document.createElement("strong");
    title_element.textContent = title;
    tooltip_element.appendChild(title_element);
    if (detail) {
        const detail_element = document.createElement("div");
        detail_element.className = "click-tooltip-detail";
        detail_element.textContent = detail;
        tooltip_element.appendChild(detail_element);
    }
    document.body.appendChild(tooltip_element);
    // keep the popover inside the viewport, it is placed just below and right of the point
    const { width, height } = tooltip_element.getBoundingClientRect();
    tooltip_element.style.left = `${Math.max(4, Math.min(x + 12, window.innerWidth - width - 4))}px`;
    tooltip_element.style.top = `${Math.max(4, Math.min(y + 12, window.innerHeight - height - 4))}px`;

    const dismissIn = (delay) => {
        clearTimeout(tooltip_dismiss_timer);
        tooltip_dismiss_timer = setTimeout(hideTooltip, delay);
    };
    tooltip_element.addEventListener("mouseenter", () => clearTimeout(tooltip_dismiss_timer));
    tooltip_element.addEventListener("mouseleave", () => dismissIn(TOOLTIP_LEAVE_DELAY_MS));
    dismissIn(hold_ms);

    // close on a click anywhere else. it is attached on the next tick so the very click
    // that opened the popover does not close it again on its way up to the document
    setTimeout(() => {
        if (!tooltip_element) return; // already dismissed
        tooltip_outside_click_listener = (event) => {
            if (tooltip_element && !tooltip_element.contains(event.target)) hideTooltip();
        };
        document.addEventListener("mousedown", tooltip_outside_click_listener, true);
    }, 0);
};

// removes the popover currently on screen, if any
export const hideTooltip = () => {
    clearTimeout(tooltip_dismiss_timer);
    if (tooltip_outside_click_listener) {
        document.removeEventListener("mousedown", tooltip_outside_click_listener, true);
        tooltip_outside_click_listener = null;
    }
    if (tooltip_element) tooltip_element.remove();
    tooltip_element = null;
};

// enable/disable all debugger controls 
export const enableDebuggerControls = (enable) => {
    document.getElementById('StartButton').disabled = enable;
    if (!enable) {
        // border around main body when in a debugging session
        $('#fieldsetWrapper').toggleClass('hide-legend-border');
        $('#StartButton').addClass('btn-info');
        $('#StartButton').removeClass('btn-secondary');
    } else {
        $('#fieldsetWrapper').toggleClass('hide-legend-border');
        $('#StartButton').removeClass('btn-info');
        $('#StartButton').addClass('btn-secondary');
    }
    const debugger_step_control_btns = ["ContinueButton", "StepInButton", "StepOutButton", "StepOverButton", "StepParentButton", "StopButton"];
    debugger_step_control_btns.forEach(btn_id => {
        document.getElementById(btn_id).disabled = !enable;
        if (enable) {
            $(`#${btn_id}`).addClass('btn-info');
            $(`#${btn_id}`).removeClass('btn-secondary');
        } else {
            $(`#${btn_id}`).removeClass('btn-info');
            $(`#${btn_id}`).addClass('btn-secondary');
        }
    });
}

// enable variable and watch table close button when finished debugging session
export const enableValTableCloseButton = () => {
    const valTableCloseButton = document.getElementById("val-table-close-button");
    valTableCloseButton.style.display = "block";
    valTableCloseButton.onclick = () => {
        valTableCloseButton.style.display = "none";
        document.getElementById("val_table").innerHTML = '';
    }
}

// simple copy to clipboard function, on a given string
export const copyToClipboard = async (text) => {
  try {
        await navigator.clipboard.writeText(text);
        return console.log("text copied successfully");
    } catch (err) {
        return console.error("Failed to copy: ", err);
    }
}


// create a temporay popup when pressing an element with given ids
export const tempClickPopup = (container_element_id, popup_element_id, copy_func = () => { }, popup_text = () => { }) => {   // Copy button click event
    document.getElementById(container_element_id).addEventListener('click', () => {
        // Show success popup
        const popup = document.getElementById(popup_element_id);
        const popup_text_param = popup_text();
        popup.innerText = popup_text_param ? popup_text_param : "Copied to clipboard!";
        popup.style.display = 'block';
        copy_func();
        // Hide popup a few seconds
        setTimeout(() => {
            popup.style.display = 'none';
        }, 1000);
    });
}