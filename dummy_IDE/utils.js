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

// execute remote code, using current editor content on given programming language
export const executeCodeRemotely = (prog_language) => {
    const editor = PL_to_editor(prog_language)[0];
    const params = { prog_language: prog_language, code: editor.getValue() };
    fetch("/api/exec-remotely", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    })
        .then(async (response) => {
            if (!response.ok) {
                const err = await response.json();
                throw err;
            }
            return response.json();
        })
        .then((res_data) => {
            if (res_data.message) {
                console.log(res_data.message);
                alert(res_data.message);
            }
        })
        .catch((error) => {
            console.error("Error:", error);
            let errorMessage = `An error occurred while executing remote ${prog_language} script.`;
            if (error.error && error.details) {
                errorMessage = `${error.error}\n\nDetails: ${error.details}`;
            }
            alert(errorMessage);
        });
};

// remove all code editors gutter highlights and reset highlightedBlockID
export const removeGutterAndBlockHighlights = () => {
    Object.keys(ProgrammingLanguages).forEach(language => {
        let [editor,] = PL_to_editor(language);
        for (let i = 0; i < editor.lineCount(); i++) { // remove gutter highlights
            editor.removeLineClass(i, "wrap", "highlight-line");
        }
    });
    Blockly_Debugger.actions["Highlight"].highlightedBlockID = undefined;
}

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