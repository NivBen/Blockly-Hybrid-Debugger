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
export const executeCodeRemotely = (prog_language, editor) => {
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

export const enableDebuggerControls = (enable) => {
    enable ? // border around main body when in a debugging session
        document.getElementById('main_container').classList.add("debug_session_border") :
        document.getElementById('main_container').classList.remove("debug_session_border");
    document.getElementById('StartButton').disabled = enable;
    document.getElementById('ContinueButton').disabled = !enable;
    document.getElementById('StepInButton').disabled = !enable;
    document.getElementById('StepOutButton').disabled = !enable;
    document.getElementById('StepOverButton').disabled = !enable;
    document.getElementById('StepParentButton').disabled = !enable;
    document.getElementById('StopButton').disabled = !enable;
}

export const enableValTableCloseButton = () => {
    const valTableCloseButton = document.getElementById("val-table-close-button");
    valTableCloseButton.style.display = "block";
    valTableCloseButton.onclick = () => {
        valTableCloseButton.style.display = "none";
        document.getElementById("val_table").innerHTML = '';
    }
}
