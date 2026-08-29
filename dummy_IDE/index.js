import './init_blockly.js';
import '../debugger/debugger.js';
import '../generator/blockly/blockly.js';
import { Blockly_Debugger } from '../debugger/debugger.js';
import { breakpointIO_export, getBlockToCodeMapping, getLineToBlockGroupsMapping } from '../debugger/actions/breakpoints.js'; 
import { Blockly_Debuggee } from '../debuggee/init.js';
import { Breakpoint_Icon } from '../generator/blockly/core/breakpoint.js';
import {
    showTooltip,
    highlightBlockCodeRange,
    removeCodeLineHighlight,
    removeGutterAndBlockHighlights,
    enableDebuggerControls,
    tempClickPopup,
    copyToClipboard,
} from './utils.js';

document.getElementById("ContinueButton").onclick = Blockly_Debugger.actions["Continue"].handler;
document.getElementById("StepInButton").onclick = Blockly_Debugger.actions["StepIn"].handler;
document.getElementById("StepOverButton").onclick = Blockly_Debugger.actions["StepOver"].handler;
document.getElementById("StepParentButton").onclick = Blockly_Debugger.actions["StepParent"].handler;
document.getElementById("StepOutButton").onclick = Blockly_Debugger.actions["StepOut"].handler;
document.getElementById("StopButton").onclick = Blockly_Debugger.actions["Stop"].handler;
document.getElementById("StartButton").onclick = Blockly_Debugger.actions["Start"].handler;
document.getElementById("ExportBreakpointsSubmit").onclick = Blockly_Debugger.actions["DownloadExportBreakpoints"].handler;
document.getElementById("CopyBreakpointsToClipboard").onclick = Blockly_Debugger.actions["CopyBreakpointsToClipboard"].handler;

// supported PL mapping
export const ProgrammingLanguages = {
    "JavaScript": 0,
    "Python": 1,
    "Dart": 2,
    "PHP": 3,
    "Lua": 4,
};

const main_workspace = window.workspace["blockly2"]; // main workspace

document.addEventListener('DOMContentLoaded', () => {
    enableDebuggerControls(false); // debugger cobntrols are disabled by default
    // set default text of previewed snapshot span
    document.getElementById("previewedSnapshotSpan").innerHTML = "No Previewed Snapshot.";

    // populate the dropdowns with options
    function populatePLDropdowns() {
        Object.keys(ProgrammingLanguages).forEach(language => {
            main_pl_dropdown.innerHTML += `<option value="${language}">${language}</option>`;
            secondary_pl_dropdown.innerHTML += `<option value="${language}">${language}</option>`;
            export_pl_dropdown.innerHTML += `<option value="${language}">${language}</option>`;
        });
    }
            
    // update select options for prgramming langauge dropdowns
    function updatePLDropdowns() {
        const mainSelection = main_pl_dropdown.value;
        const secondarySelection = secondary_pl_dropdown.value;
        // Update options in secondary dropdown
        Array.from(secondary_pl_dropdown.options).forEach(option => {
            if (option.value !== "None") {
                option.disabled = (option.value === mainSelection);
            }
        });
        // Update options in main dropdown
        Array.from(main_pl_dropdown.options).forEach(option => {
            if (option.value !== "None") {
                option.disabled = (option.value === secondarySelection);
            }
        });
        Object.keys(ProgrammingLanguages).forEach(language => { (PL_to_editor(language)[0]).refresh(); }); // refresh editors
    }

    function updateActiveClass(language, isActive) {
        const button = document.querySelector(`#${language}Tab`);
        if (button) {
            if (isActive) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }
    }

    // update the selected prgramming langauge state and display the selected option
    function updateSelectedPL(event, language_display_type) { 
        let selectedOption = event.target.value;
        if (language_display_type === 'main') {
            Blockly_Debuggee.state.mainProgrammingLanguage = selectedOption; // update main PL
            // remove active class from all tabs
            Object.keys(ProgrammingLanguages).forEach(language => {
                updateActiveClass(language, false);
            });
            updateActiveClass(Blockly_Debuggee.state.mainProgrammingLanguage, true); // update active class for main PL
        } else { // update secondary PL
            Blockly_Debuggee.state.secondaryProgrammingLanguage = selectedOption;
        }
        // show only the selected PL editors
        const editorWrappers = document.querySelectorAll('.editor-wrapper');
        editorWrappers.forEach((editor, index) => {
            editor.style.display = (index === ProgrammingLanguages[Blockly_Debuggee.state.mainProgrammingLanguage] ||
                index === ProgrammingLanguages[Blockly_Debuggee.state.secondaryProgrammingLanguage])
                ? 'block' : 'none'; 
        });
        updatePLDropdowns();
    }

    // Update selected programming languages according to dropdown selection
    const main_pl_dropdown = document.getElementById('main_language_options');
    const secondary_pl_dropdown = document.getElementById('secondary_language_options');
    main_pl_dropdown.addEventListener('change', () => updateSelectedPL(event, 'main')); 
    secondary_pl_dropdown.addEventListener('change', () => updateSelectedPL(event, 'secondary')); 
    // Initial dropdown display update
    populatePLDropdowns();
    updatePLDropdowns();
    
    function delay(time) {
        return new Promise(resolve => setTimeout(resolve, time));
    }
    delay(1000).then(() => { 
        // select default programming language option by default
        main_pl_dropdown.selectedIndex = 1; // first langauge is default (after none)
        secondary_pl_dropdown.selectedIndex = 2; // second langauge is default (after none and first language)
    });
    // wait a second for blockly to generate code for all PL before hiding all editors beside selected language
    delay(1000).then(() => updateSelectedPL({ target: main_pl_dropdown }, 'main'));
    delay(1000).then(() => updateSelectedPL({ target: secondary_pl_dropdown }, 'secondary'));
    
    // temp popups on clicks
    tempClickPopup("CopyBreakpointsToClipboard", "CopyBreakpointsToClipboardPopup"); // has external copy function
    tempClickPopup("CopyJavaScriptCodeBtn", "CopyJavaScriptCodeBtnPopup",
        () => { copyToClipboard(UneditedJavaScriptEditor.getValue()) });
    tempClickPopup("CopyPythonCodeBtn", "CopyPythonCodeBtnPopup",
        () => { copyToClipboard(PythonEditor.getValue()) });
    tempClickPopup("CopyDartCodeBtn", "CopyDartCodeBtnPopup",
        () => { copyToClipboard(DartEditor.getValue()) });
    tempClickPopup("CopyPHPCodeBtn", "CopyPHPCodeBtnPopup",
        () => { copyToClipboard(PhpEditor.getValue()) });
    tempClickPopup("CopyLuaCodeBtn", "CopyLuaCodeBtnPopup",
        () => { copyToClipboard(LuaEditor.getValue()) });
    tempClickPopup("saveSnapshotButton", "saveSnapshotButtonPopup",
        undefined, () => { return "Snapshot Saved!" });
    tempClickPopup("LoadSnapshotButton", "LoadSnapshotButtonPopup", undefined,
        () => {
            return (Blockly_Debuggee.state.currPreviewSnapshotIndex === undefined) ? "No Snapshot Selected!" : "Snapshot Loaded!";
        });
    tempClickPopup("logSnapshotsButton", "logSnapshotsButtonPopup",
        () => {
            copyToClipboard(JSON.stringify(Blockly_Debuggee.state.snapshots, null, 2));
     });

    // Set default behavior for remote execution langauges
    const switches = document.querySelectorAll('.switch input');
    switches.forEach((switchInput) => {
        if (switchInput.classList.contains('JavaScriptExecution') || 
            switchInput.classList.contains('PythonExecution')) {
            switchInput.checked = true; // Set the default switches to checked
        } else {
            switchInput.checked = false; // Uncheck all other switches
        }
    });

    // Listen for changes on each switch
    switches.forEach((switchInput) => {
        switchInput.addEventListener('change', function () {
            console.log(`${this.className} switch is now ${this.checked ? 'ON' : 'OFF'}`);
        });
    });
});

const export_pl_dropdown = document.getElementById('export_language_options');
// update the selected prgramming langauge for breakpoint export
export_pl_dropdown.addEventListener('change', (event) => {
    Blockly_Debuggee.state.exportedProgrammingLanguage = event.target.value; // update exported PL
    if (breakpointIO_export.length === 0) {
        BreakpointIOEditor.setValue("[]"); // default export is an empty array
    } else {
        BreakpointIOEditor.setValue(JSON.stringify(breakpointIO_export[ProgrammingLanguages[Blockly_Debuggee.state.exportedProgrammingLanguage]], null, 2)); // updated exported JSON display
    }
    refreshExportBreakpointsPreview(); // the preview follows the exported language
}); 

// Snapshot Definition - Start
// Display Blockly XML Modal and Snapshot dropdown and logic
const currProgramXML = document.getElementById('curr_program_XML');
const currSnapshotXML = document.getElementById('curr_snapshot_XML');
const saveSnapshotButton = document.getElementById('saveSnapshotButton');
const snapshotDropdownToggleButton = document.getElementById('snapshotDropdownToggleButton');
const snapshotList = document.getElementById('snapshotList');

saveSnapshotButton.addEventListener('click', () => {
    const currentText = currProgramXML.textContent.trim();
    if (currentText === '') {
        alert('Text box is empty. Please enter some text.');
        return;
    }
    const timestamp = new Date();
    const curr_breakpoints = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
        return { block_id: obj.block_id, enable: obj.enable };
    });
    const snapshot = {
        source: "Manual",
        text: currentText,
        time: timestamp,
        blockly_breakpoints: curr_breakpoints,
    };
    Blockly_Debuggee.state.snapshots.push(snapshot);
    // udpate button text with new snapshot counter
    const index_of_parenthesis = snapshotDropdownToggleButton.textContent.lastIndexOf("(");
    snapshotDropdownToggleButton.textContent = snapshotDropdownToggleButton.textContent.slice(0, index_of_parenthesis+1).trim() +
        Blockly_Debuggee.state.snapshots.length + ")";
    renderSnapshotButtons();
});

// Function to format date and time
function formatDateTime(timestamp) {
    const dd = String(timestamp.getDate()).padStart(2, '0');
    const mm = String(timestamp.getMonth() + 1).padStart(2, '0'); // January is 0!
    const hh = String(timestamp.getHours()).padStart(2, '0');
    const min = String(timestamp.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} | ${hh}:${min}`;
}

// Function to create a snapshot button
const createSnapshotButton = (snapshot, index) => {
    const button = document.createElement('button');
    button.className = 'snapshot-button';
    button.innerHTML = `Preview ${snapshot.source} Snapshot ${formatDateTime(snapshot.time)} &emsp;<span class="delete">&times;</span>`;
    button.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete')) { // Handle delete action
            event.stopPropagation(); // Prevent triggering the button's click event
            Blockly_Debuggee.state.snapshots.splice(index, 1);
            // udpate button text with new snapshot counter
            const index_of_parenthesis = snapshotDropdownToggleButton.textContent.lastIndexOf("(");
            snapshotDropdownToggleButton.textContent = snapshotDropdownToggleButton.textContent.slice(0, index_of_parenthesis+1).trim() +
                Blockly_Debuggee.state.snapshots.length + ")";
            renderSnapshotButtons();
            // clear current preview if previewed is deleted
            if (Blockly_Debuggee.state.currPreviewSnapshotIndex === index) {
                currSnapshotXML.textContent = '';
                Blockly_Debuggee.state.currPreviewSnapshotIndex = undefined;
            }
        } else { // Handle load action
            currSnapshotXML.textContent = Blockly_Debuggee.state.snapshots[index].text;
            Blockly_Debuggee.state.currPreviewSnapshotIndex = index;
            document.getElementById("previewedSnapshotSpan").innerHTML = `Previewed ${snapshot.source} Snapshot: ${formatDateTime(snapshot.time)}`;
            // close snapshot list after selecting a snapshot
            snapshotList.style.display = 'none';
            snapshotDropdownToggleButton.textContent = "▽" + snapshotDropdownToggleButton.textContent.slice(1);
        }
    });
    button.title = `Saved on: ${formatDateTime(snapshot.time)}`;
    return button;
}

// Toggle visibility of snapshot list
snapshotDropdownToggleButton.addEventListener('click', () => {
    if (!snapshotList.style.display || snapshotList.style.display === 'none') {
        snapshotList.style.display = 'block';
        snapshotDropdownToggleButton.textContent = "△" + snapshotDropdownToggleButton.textContent.slice(1);
    } else {
        snapshotList.style.display = 'none';
        snapshotDropdownToggleButton.textContent = "▽" + snapshotDropdownToggleButton.textContent.slice(1);
    }
});

export function renderSnapshotButtons() {
    snapshotList.innerHTML = ''; // Clear the list
    Blockly_Debuggee.state.snapshots.forEach((snapshot, index) => {
        const button = createSnapshotButton(snapshot, index);
        snapshotList.appendChild(button);
    });
}
// Snapshot Definition - End


// Editors Definition - Start
export const BreakpointIOEditor = CodeMirror.fromTextArea(document.getElementById("BreakpointIO_export_JSON"), {
    mode: "javascript",
    lineNumbers: true,
    indentUnit: 4,
    lineWrapping: true,
    matchBrackets: true,
    readOnly: false,
});
// shows the exported language's generated code beside the JSON, carrying the same breakpoint
// gutter, so the line numbers in the export can be read against the code they point at.
// its mode follows the exported language - see refreshExportBreakpointsPreview
export const BreakpointIOPreviewEditor = CodeMirror.fromTextArea(document.getElementById("BreakpointIO_export_preview"), {
    mode: "javascript",
    lineNumbers: true,
    indentUnit: 4,
    lineWrapping: true,
    matchBrackets: true,
    readOnly: true,
    gutters: ["breakpoints"],
});
BreakpointIOPreviewEditor.getWrapperElement().classList.add("breakpoint-preview-editor");
export const PythonEditor = CodeMirror.fromTextArea(document.getElementById("python_code"), {
    mode: {
        name: "python",
        version: 3,
        singleLineStringErrors: false
    },
    lineNumbers: true,
    indentUnit: 4,
    lineWrapping: true,
    matchBrackets: true,
    readOnly: true,
    gutters: ["breakpoints"],
});
export const UneditedJavaScriptEditor = CodeMirror.fromTextArea(document.getElementById("javascript_code"), {
    mode: "javascript",
    lineNumbers: true,
    indentUnit: 4,
    lineWrapping: true,
    matchBrackets: true,
    readOnly: true,
    gutters: ["breakpoints"],
});
export const DartEditor = CodeMirror.fromTextArea(document.getElementById("dart_code"), {
    mode: { name: "dart" }, 
    lineNumbers: true,
    indentUnit: 4,
    lineWrapping: true,
    matchBrackets: true,
    readOnly: true,
    gutters: ["breakpoints"],
});
export const PhpEditor = CodeMirror.fromTextArea(document.getElementById("php_code"), {
    mode: { name: "text/x-php" }, 
    lineNumbers: true,
    indentUnit: 4,
    lineWrapping: true,
    matchBrackets: true,
    readOnly: true,
    gutters: ["breakpoints"],
});
export const LuaEditor = CodeMirror.fromTextArea(document.getElementById("lua_code"), {
    mode: { name: "lua" }, 
    lineNumbers: true,
    indentUnit: 4,
    lineWrapping: true,
    matchBrackets: true,
    readOnly: true,
    gutters: ["breakpoints"],
});
Object.keys(ProgrammingLanguages).forEach(language => { // set editors placeholder
    const editor = PL_to_editor(language)[0];
    editor.setValue(`Generated ${language} code will be here...`);
    // marks the read-only generated-code editors, whose gutter toggles breakpoints,
    // apart from the editable BreakpointIO JSON editor - see index.css for the cursors
    editor.getWrapperElement().classList.add("generated-code-editor");
});

// set initial editor code according to "startBlocks"
const python_code = Blockly.Python.workspaceToCode(main_workspace);
const javascript_code = Blockly.UneditedJavaScript.workspaceToCode(main_workspace);
const dart_code = Blockly.Dart.workspaceToCode(main_workspace);
const php_code = Blockly.PHP.workspaceToCode(main_workspace);
const lua_code = Blockly.Lua.workspaceToCode(main_workspace);
BreakpointIOEditor.setValue("[]"); // default export is an empty array
PythonEditor.setValue(python_code);
UneditedJavaScriptEditor.setValue(javascript_code);
DartEditor.setValue(dart_code);
PhpEditor.setValue(php_code);
LuaEditor.setValue(lua_code);


let isUpdating = false, previousCode = {};
const updateCodeFromBlockly = () => {
    if (!isUpdating) {
        isUpdating = true;
        try {
            const updated_javascript_code = Blockly.UneditedJavaScript.workspaceToCode(main_workspace);
            if (previousCode.JavaScript !== updated_javascript_code) {
                UneditedJavaScriptEditor.setValue(updated_javascript_code);
                previousCode.JavaScript = updated_javascript_code;
            }
        } catch (error) {
            UneditedJavaScriptEditor.setValue("// Error in JavaScript Code Generation");
        }
        try {
            const updated_python_code = Blockly.Python.workspaceToCode(main_workspace);
            if (previousCode.Python !== updated_python_code) {
                PythonEditor.setValue(updated_python_code);
                previousCode.Python = updated_python_code;
            }
        } catch (error) {
            PythonEditor.setValue("# Error in Python Code Generation");
        }
        try {
            const updated_dart_code = Blockly.Dart.workspaceToCode(main_workspace);
            if (previousCode.Dart !== updated_dart_code) {
                DartEditor.setValue(updated_dart_code);
                previousCode.Dart = updated_dart_code;
            }
        } catch (error) {
            DartEditor.setValue("// Error in Dart Code Generation");
        }
        try {
            const updated_php_code = Blockly.PHP.workspaceToCode(main_workspace);
            if (previousCode.PHP !== updated_php_code) {
                PhpEditor.setValue(updated_php_code);
                previousCode.PHP = updated_php_code;
            }
        } catch (error) {
            PhpEditor.setValue("# Error in PHP Code Generation");
        }
        try {
            const updated_lua_code = Blockly.Lua.workspaceToCode(main_workspace);
            if (previousCode.Lua !== updated_lua_code) {
                LuaEditor.setValue(updated_lua_code);
                previousCode.Lua = updated_lua_code;
            }
        } catch (error) {
            LuaEditor.setValue("-- Error in Lua Code Generation");
        }
        isUpdating = false;
        refreshExportBreakpointsPreview(); // regenerated code, the open preview has to follow
  }
}

// Start the update interval
setInterval(updateCodeFromBlockly, 2000); // Update every 2 seconds
main_workspace.addChangeListener(updateCodeFromBlockly);  // Blockly workspace change detection

// convert PL to CodeMirror editor var and editor ID
export function PL_to_editor(programming_language) {
    switch (programming_language) {
        // case "JavaScript":
        //     return [JavaScriptEditor, "JavaScript"];
        case "Python":
            return [PythonEditor, "Python"];
        case "Dart":
            return [DartEditor, "Dart"];
        case "PHP":
            return [PhpEditor, "PHP"];
        case "Lua":
            return [LuaEditor, "Lua"];
        default:
            return [UneditedJavaScriptEditor, "UneditedJavaScript"];
    }
}
/* mirrors the exported language's code editor - its text and its breakpoint gutter - into the
   export modal. the markers are cloned from that editor rather than computed again, so the
   preview can never disagree with the gutter the user set the breakpoints on.
   only the open modal is worth updating, a hidden CodeMirror cannot measure itself anyway */
export function refreshExportBreakpointsPreview() {
    if (document.getElementById("ExportBreakpointsModal").style.display !== "block") return;
    const language = Blockly_Debuggee.state.exportedProgrammingLanguage;
    const [source_editor] = PL_to_editor(language);
    document.getElementById("ExportBreakpointsPreviewLanguage").textContent = language;
    BreakpointIOPreviewEditor.setOption("mode", source_editor.getOption("mode"));
    if (BreakpointIOPreviewEditor.getValue() !== source_editor.getValue()) {
        BreakpointIOPreviewEditor.setValue(source_editor.getValue());
    }
    // the bracket lanes widen the gutter, the preview has to reserve the same width
    BreakpointIOPreviewEditor.getWrapperElement().style.setProperty("--breakpoint-lanes",
        source_editor.getWrapperElement().style.getPropertyValue("--breakpoint-lanes") || 1);
    BreakpointIOPreviewEditor.clearGutter("breakpoints");
    for (let line = 0; line < source_editor.lineCount(); line++) {
        const markers = source_editor.lineInfo(line).gutterMarkers;
        if (markers && markers.breakpoints) {
            BreakpointIOPreviewEditor.setGutterMarker(line, "breakpoints", markers.breakpoints.cloneNode(true));
        }
    }
    BreakpointIOPreviewEditor.refresh();
}
// Editors Definition - End

// Modal - Start
export let snapshotModal = document.getElementById("SnapshotMenuModal");
export let statisticsModal = document.getElementById("StatisticsMenuModal");
export let exportBreakpointsModal = document.getElementById("ExportBreakpointsModal");
export let remoteExecutionModal = document.getElementById("remoteExecutionModal");

let displaySnapshotMenuBtn = document.getElementById("SnapshotMenuButton");
displaySnapshotMenuBtn.onclick = function () {
    statisticsModal.style.display = "none";
    exportBreakpointsModal.style.display = "none";
    remoteExecutionModal.style.display = "none";
    snapshotModal.style.display = "block";
    let xml = Blockly.Xml.workspaceToDom(main_workspace);
    let xml_text = Blockly.Xml.domToPrettyText(xml);
    let input = document.getElementById("curr_program_XML");
    input.textContent = xml_text;
    // TODO: braekpoints
}

let displayStatisticsMenuBtn = document.getElementById("StatisticsMenuButton");
displayStatisticsMenuBtn.onclick = function () {
    exportBreakpointsModal.style.display = "none";
    snapshotModal.style.display = "none";
    remoteExecutionModal.style.display = "none";
    statisticsModal.style.display = "block";
    refreshStatisticsTable(); // lay the table out now that it has a measurable container
};

let exportBreakpointsButton = document.getElementById("ExportBreakpointsButton");
exportBreakpointsButton.onclick = function () {
    snapshotModal.style.display = "none";
    statisticsModal.style.display = "none";
    remoteExecutionModal.style.display = "none";
    exportBreakpointsModal.style.display = "block";
    BreakpointIOEditor.setCursor(0, 0); // focus on editor - otherwise it won't load content
    refreshExportBreakpointsPreview(); // fill the preview now the modal can measure it
};

let remoteExecutionModalBtn = document.getElementById("remoteExecutionModalBtn");
remoteExecutionModalBtn.onclick = function () {
    exportBreakpointsModal.style.display = "none";
    snapshotModal.style.display = "none";
    statisticsModal.style.display = "none";
    remoteExecutionModal.style.display = "block";
};


const LoadXMLtoBlocklyBtn = document.getElementById("LoadSnapshotButton");
LoadXMLtoBlocklyBtn.onclick = function () {
    try {
        if (Blockly_Debuggee.state.currPreviewSnapshotIndex === undefined) return;
        const curr_snapshot = Blockly_Debuggee.state.snapshots[Blockly_Debuggee.state.currPreviewSnapshotIndex];
        // set workspace blocks
        let curr_snapshot_xml = Blockly.Xml.textToDom(curr_snapshot.text);
        main_workspace.clear(); // clear curretnt workspace before importing 
        Blockly.Xml.domToWorkspace(curr_snapshot_xml, main_workspace);
       
        // clear all breakpoints from state
        Blockly_Debugger.actions["Breakpoint"].breakpoints = [];
        // add snapshot breakpoints to main workspace
        curr_snapshot.blockly_breakpoints.forEach(bp => {
            Blockly_Debugger.actions["Breakpoint"].breakpoints.push({
                "block_id": bp.block_id,
                "enable": bp.enable,
                "icon": new Breakpoint_Icon(main_workspace.getBlockById(bp.block_id)),
                "change": true
            });
            if(!bp.enable) // disable icon if breakpoint is disabled
                Blockly_Debugger.actions["Breakpoint"].disable(bp.block_id);
        });
        updateCodeFromBlockly(); // update code editors
        Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints(); // generate snapshot breakpoints
        snapshotModal.style.display = "none"; // close snapshot modal
    } catch (error) {
        alert('Error parsing XML\n' + error);
    }
}

let modalCloseButton = document.getElementsByClassName("snapshot-menu-close-button")[0];  // Get the <span> element that closes the modal
modalCloseButton.onclick = function () { // When the user clicks on <span> (x), close the modal
    snapshotModal.style.display = "none";
}
modalCloseButton = document.getElementsByClassName("statistics-menu-close-modal")[0];
modalCloseButton.onclick = function () {
    statisticsModal.style.display = "none";
}
modalCloseButton = document.getElementsByClassName("export-menu-close-modal")[0];
modalCloseButton.onclick = function () {
    exportBreakpointsModal.style.display = "none";
}
modalCloseButton = document.getElementsByClassName("remote-exec-menu-close-modal")[0];
modalCloseButton.onclick = function () {
    remoteExecutionModal.style.display = "none";
}

window.onclick = function (event) {  // When the user clicks anywhere outside of the modal, close it
    if (event.target == snapshotModal || event.target == statisticsModal || event.target == exportBreakpointsModal || event.target == remoteExecutionModal) {
        snapshotModal.style.display = "none";
        statisticsModal.style.display = "none";
        exportBreakpointsModal.style.display = "none";
        remoteExecutionModal.style.display = "none";
    }
}
// Modal - Finish

// Breakpoint gutter definition - Start

// Handle use code editor gutter mouse click (middle or left click)
const gutterClickHandler = (prog_lang, line, clickEvent, workspace) => {
    let editor;
    [editor, prog_lang] = PL_to_editor(prog_lang);
    let info = editor.lineInfo(line);
    let isMarked = info.gutterMarkers ? true : false;
    if (clickEvent.button === 1) { // Middle mouse click - highlight source line of code
        const line_was_highlighted = info.wrapClass && info.wrapClass.includes("highlight-line");
        removeGutterAndBlockHighlights(); // remove previous code highlights from every editor
        workspace.highlightBlock(""); // remove all block highlights
        if (!line_was_highlighted) { // line not highlighted, highlight the block it belongs to
            setBlockHighlightfromGutter(workspace, prog_lang, line);
        }
    } else if (clickEvent.button === 0) { // Left-click - set breakpoint
        if (setBlockBreakpointFromGutter(workspace, prog_lang, line, isMarked)) {
            Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints(); // re-generate bps
        } else {
            // the generator emits more than the blocks' own code - imports, variable
            // declarations and helper functions have no block to put a breakpoint on
            showTooltip(
                `No breakpoint on line ${line + 1}`,
                "The code generator writes this line (an import, a variable declaration or a helper function), so there is no block behind it.",
                clickEvent.clientX, clickEvent.clientY);
        }
    }
}

UneditedJavaScriptEditor.on("gutterClick",
    (editor, line, gutter, clickEvent) => {
        gutterClickHandler("JavaScript", line, clickEvent, main_workspace);
    });
PythonEditor.on("gutterClick",
    (editor, line, gutter, clickEvent) => {
        gutterClickHandler("Python", line, clickEvent, main_workspace);
    });
DartEditor.on("gutterClick",
    (editor, line, gutter, clickEvent) => {
        gutterClickHandler("Dart", line, clickEvent, main_workspace);
    });
PhpEditor.on("gutterClick",
    (editor, line, gutter, clickEvent) => {
        gutterClickHandler("PHP", line, clickEvent, main_workspace);
    });
LuaEditor.on("gutterClick",
    (editor, line, gutter, clickEvent) => {
        gutterClickHandler("Lua", line, clickEvent, main_workspace);
    });

// const getCodeToBlockMapping = (workspace, language) => {
//     let code_block_mapping = {};
//     Blockly[language].variableDB_.setVariableMap(workspace.getVariableMap());
//     workspace.getAllBlocks().forEach(function (block) {
//         let block_code = '';
//         if (block.type === 'procedures_defnoreturn' || block.type === 'procedures_callnoreturn') {
//             let func_name = Blockly[language].variableDB_.getName(block.getFieldValue('NAME'), Blockly.Procedures.NAME_TYPE);
//             block_code = (block.type === 'procedures_defnoreturn') ? 'def ' + func_name : func_name + '()';
//         } else {
//             block_code = Blockly[language].blockToCode(block);
//             if (Array.isArray(block_code)) {
//                 block_code = Blockly[language].blockToCode(block)[0]; // code string only
//             } else {
//                 block_code = Blockly[language].blockToCode(block).split('\n')[0]; // code string only w/o proceeding blocks
//                 block_code = block_code.replace(/count[0-9]/g, "count");
//             }
//         }
//         code_block_mapping[block_code] = {
//             "block_id": block.id,
//             "block": block,
//         };
//     });
//     return code_block_mapping;
// }

// function highlightHorizontalSubBlocksRecursively(workspace, block) {
//     // Base case: If the block is null, return
//     if (!block) return;
//     // Highlight the current block if it has no vertical connections
//     if (!block.previousConnection && !block.nextConnection) {
//         workspace.highlightBlock(block.id, true);
//     }
//     // Recursively highlight all children blocks
//     block.getChildren().forEach(childBlock => {
//         highlightHorizontalSubBlocksRecursively(workspace, childBlock);
//     });
// }

function setBlockHighlightfromGutter(workspace, programming_language, line) {
    // let code_block_mapping = getCodeToBlockMapping(workspace, programming_language);
    const block_groups_covering_line = getLineToBlockGroupsMapping(workspace)[programming_language][line];
    const arr_block_ids_matching_code_line = block_groups_covering_line && block_groups_covering_line[0].block_ids; // innermost block group on the line
    if (arr_block_ids_matching_code_line) { // found the line's blocks in mapping
        arr_block_ids_matching_code_line.forEach(block_id => { 
            workspace.highlightBlock(block_id, true); // highlight each block in the array
        });
        // highlight every code line the blocks generate, in each programming language
        const block_code = getBlockToCodeMapping(workspace)[arr_block_ids_matching_code_line[0]].code;
        Object.keys(ProgrammingLanguages).forEach((element) => {
            const [editor, prog_language] = PL_to_editor(element);
            highlightBlockCodeRange(editor, block_code[prog_language], "highlight-line");
        });
        return true;
    } else {
        console.log(`did not find corresponding block to highlight from code line #${line + 1}`);
        return false;
    }
}

function setBlockBreakpointFromGutter(workspace, programming_language, line, isHighlighted) {
    const hasBreakpoint = (group) => group.block_ids.some(
        (curr_id) => Blockly_Debugger.actions["Breakpoint"].breakpoints.some(bp => bp.block_id === curr_id)
    );
    const block_groups_covering_line = getLineToBlockGroupsMapping(workspace)[programming_language][line] || [];
    /* a line belongs to the innermost block whose code starts on it, so a nested block stays
       reachable while an enclosing block already carries a breakpoint. lines that only continue
       an enclosing block (a closing brace, a loop's generated preamble) fall back to the
       breakpoint drawn there, then to the innermost block covering the line */
    const target_group = block_groups_covering_line.find(group => group.first_line === line)
        || block_groups_covering_line.find(hasBreakpoint)
        || block_groups_covering_line[0];
    const arr_block_ids_matching_code_line = target_group && target_group.block_ids;
    if (arr_block_ids_matching_code_line) { // found the line's blocks in mapping
        const any_block_has_enabled_bp = arr_block_ids_matching_code_line.some( //check if any block in the array has an enabled breakpoint
            (curr_id) => {
                // check if current element in group has an enabled breakpoint 
                const curr_bp = Blockly_Debugger.actions["Breakpoint"].breakpoints.find(bp => bp.block_id === curr_id);
                return (curr_bp && curr_bp.enable);
            }
        )
        if (any_block_has_enabled_bp) { // // Input code has a block with enabled bp, disable all breakpoints in the array
            Blockly_Debugger.actions["Breakpoint"].breakpoints.forEach(bp => {
                if (arr_block_ids_matching_code_line.includes(bp.block_id)) {
                    bp.enable = false;
                    Blockly_Debugger.actions["Breakpoint"].disable(bp.block_id);
                }
            });
            return true;
        } else { // Input code has disabled blocks only, clear them for all blocks in array
            const any_block_has_disabled_bp = arr_block_ids_matching_code_line.some( // check if any of the ancestor array blocks has a disabled breakpoint
                (curr_id) => {
                    // check if current element in group has a disabled breakpoint
                    const curr_bp = Blockly_Debugger.actions["Breakpoint"].breakpoints.find(bp => bp.block_id === curr_id);
                    return (curr_bp && !curr_bp.enable);
                }
            )
            if (any_block_has_disabled_bp) { // clear all breakpoints of blocks in the array
                Blockly_Debugger.actions["Breakpoint"].breakpoints.forEach(bp => {
                    if (arr_block_ids_matching_code_line.includes(bp.block_id)) {
                        const block = workspace.getBlockById(bp.block_id);
                        let index = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { return obj.block_id; }).indexOf(block.id);
                        let icon = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { if (obj.block_id === block.id) return obj.icon })[index];
                        icon.myDisable();
                    }
                });
                // remove all bps from array
                Blockly_Debugger.actions["Breakpoint"].breakpoints =
                    Blockly_Debugger.actions["Breakpoint"].breakpoints.filter(bp => !arr_block_ids_matching_code_line.includes(bp.block_id));
                return true;
            } else { // No breakpoints for this code input, set a new bp on ancestor block
                const block_id = arr_block_ids_matching_code_line[0];
                const new_bp = {
                    "block_id": block_id,
                    "enable": true,
                    "icon": new Breakpoint_Icon(workspace.getBlockById(block_id)),
                    "change": false
                }
                Blockly_Debugger.actions["Breakpoint"].breakpoints.push(new_bp);
                return true;
            }
        }
    } else{
        console.log(`did not find corresponding block to breakpoint from code line #${line + 1}`);
        return false;
    }
}

// remove all breakpoint highlights from all code editors
export function removeCodeBreakpointHighlights() {
    Object.keys(ProgrammingLanguages).forEach((element) => {
        let [editor, ] = PL_to_editor(element);
        for (let i = 0; i < editor.lineCount(); i++) {
            const lineInfo = editor.lineInfo(i);
            if (lineInfo && lineInfo.gutterMarkers && lineInfo.gutterMarkers["breakpoints"]) {
                lineInfo.gutterMarkers["breakpoints"].classList.remove("hit");
            }
        }
        removeCodeLineHighlight(editor, "code-step-highlight");
    });
}
// Breakpoint gutter definition - End

// Add or remove new Blockly workspace - START
const newBlocklyWorkspaceButton = document.getElementById('new-blockly-workspace-btn');
newBlocklyWorkspaceButton.addEventListener("click", (event) => {
    window.numWorkSpacesCreated++;
    const workspace_div_name = `blocklyDiv${window.window.numWorkSpacesCreated}`;
    const workspace_name = `blockly${window.window.numWorkSpacesCreated}`;
    window.workspacesArr.push(workspace_name);
    const div = document.createElement('div');
    div.id = workspace_div_name;
    div.classList.add("blockly-workspace");
    div.style.paddingTop = "48px";
    document.getElementById('extraBlocklyWorkspaces').appendChild(div);

    // add a remove workspace button
    const workspace_remove_btn = document.createElement('button');
    workspace_remove_btn.id = `remove-workspace-${numWorkSpacesCreated}-btn`;
    workspace_remove_btn.classList.add("hybrid-debugger-remove-workbench-btn")
    workspace_remove_btn.innerHTML = `Remove Workspace #${window.numWorkSpacesCreated}`;
    workspace_remove_btn.addEventListener("click", () => {
        workspace_remove_btn.remove()
        if (div) {
            div.remove()
        }
        window.workspacesArr = window.workspacesArr.filter(e => e !== workspace_name);
        window.workspace[workspace_name].dispose(); 

    }); 
    document.getElementById(workspace_div_name).appendChild(workspace_remove_btn);

    // inject blockly workspace
    window.workspace[workspace_name] = Blockly.inject(
        workspace_div_name,
        {
            media: '../../media/',
            toolbox: document.getElementById('toolbox'),
            grid:
            {
                spacing: 20,
                length: 3,
                colour: '#ccc',
                snap: true
            },
            trashcan: true,
            zoom:
            {
                startScale: 1.2,
                controls: true,
                pinch: true
            }
        }
    );
    window.workspace[workspace_name].systemEditorId = workspace_name;   
});
// Add or remove new Blockly workspace - END

// Statistics table definiton - START
/* the logs table is one chronological record of every execution, however it was run: a debugger
   session stepping the blocks, or a multi-language run of the generated source. these are the
   columns every execution can answer. the variable columns are appended after them and only a
   debugger session, which is the only path that captures variable state, fills them in. */
/* a debugger session and a multi-language run can execute the same language, so a language name
   on its own does not say which produced the row. debugger rows are marked with the same bug
   glyph as the control that starts one. the mark is carried in the cell's own value rather than
   alongside it, so sorting or filtering the column can never separate a row from its mark, and
   the CSV export keeps the distinction in a form a reader (or a spreadsheet) can act on. */
const DEBUGGER_RUN_SUFFIX = " (debugger)";

// the bi-bug glyph the Start button wears, so the mark reads as "this came from that button"
const DEBUGGER_RUN_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"'
    + ' fill="currentColor" class="stats-run-icon" viewBox="0 0 16 16" aria-hidden="true">'
    + '<path d="M4.355.522a.5.5 0 0 1 .623.333l.291.956A5 5 0 0 1 8 1c1.007 0 1.946.298 2.731.811l.29-.956a.5.5'
    + ' 0 1 1 .957.29l-.41 1.352A5 5 0 0 1 13 6h.5a.5.5 0 0 0 .5-.5V5a.5.5 0 0 1 1 0v.5A1.5 1.5 0 0 1 13.5'
    + ' 7H13v1h1.5a.5.5 0 0 1 0 1H13v1h.5a1.5 1.5 0 0 1 1.5 1.5v.5a.5.5 0 1 1-1 0v-.5a.5.5 0 0 0-.5-.5H13a5 5'
    + ' 0 0 1-10 0h-.5a.5.5 0 0 0-.5.5v.5a.5.5 0 1 1-1 0v-.5A1.5 1.5 0 0 1 2.5 10H3V9H1.5a.5.5 0 0 1 0-1H3V7h-.5A1.5'
    + ' 1.5 0 0 1 1 5.5V5a.5.5 0 0 1 1 0v.5a.5.5 0 0 0 .5.5H3c0-1.364.547-2.601 1.432-3.503l-.41-1.352a.5.5 0 0 1'
    + ' .333-.623M4 7v4a4 4 0 0 0 3.5 3.97V7zm4.5 0v7.97A4 4 0 0 0 12 11V7zM12 6a4 4 0 0'
    + ' 0-1.334-2.982A3.98 3.98 0 0 0 8 2a3.98 3.98 0 0 0-2.667 1.018A4 4 0 0 0 4 6z"/></svg>';

/* draws the bug in place of the written marker. the base text renderer runs first so the cell
   keeps the classes handsontable gives it - read-only dimming, alignment - and only its content
   is replaced. */
const statisticsLanguageRenderer = function (instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);
    const text = String(value === null || value === undefined ? "" : value);
    if (!text.endsWith(DEBUGGER_RUN_SUFFIX)) return;
    td.innerHTML = DEBUGGER_RUN_ICON + " " + escapeHtml(text.slice(0, -DEBUGGER_RUN_SUFFIX.length));
    td.title = "Executed with the block debugger";
};

const STATISTICS_COLUMNS = [
    { title: '#Run', type: 'numeric' },
    { title: 'Date and Time', type: 'date', dateFormat: 'DD/MM/YY, HH:mm' },
    { title: 'Language', type: 'text', renderer: statisticsLanguageRenderer },
    { title: 'Status', type: 'text' },
    { title: '#Blocks', type: 'numeric' },
    { title: 'Runtime (ms)', type: 'numeric' },
    { title: 'Result / Output', type: 'text' },
];

const stats_table_div = document.getElementById("stats-runs");
export const stats_handsontable = new Handsontable(stats_table_div, {
    data: [],
    rowHeaders: true,
    columns: STATISTICS_COLUMNS,
    licenseKey: 'non-commercial-and-evaluation',
    filters: true, // Enable filtering
    dropdownMenu: true, // Enable dropdown menu for column options
    columnSorting: true, // Enable column sorting
    contextMenu: true, // Enable context menu
    manualColumnResize: true, // Enable manual column resizing
    manualRowResize: false, // disable row resizing
    className: 'htCenter', // center cell content
    columnSorting: true, // Enable column sorting
    height: 'auto',
    stretchH: 'all',
    autoWrapRow: true,
    autoWrapCol: true,  
    readOnly: true,
    hiddenColumns: {
      indicators: true,
      columns: []
    }
  });

/* handsontable measures itself against its container, and the stats table lives inside a modal
   that is display:none for most of the session. every render it attempts while hidden reads a
   zero-sized viewport, so it draws no rows and settles on a stale geometry that only corrects
   itself on some later async re-measure - the delay, the empty band and the misplaced row the
   table shows right after the modal opens. re-measuring the moment the modal is visible, and
   again whenever a run appends a row into an already open modal, keeps that state from existing. */
export function refreshStatisticsTable() {
    if (statisticsModal.style.display !== "block") return; // a hidden table cannot measure itself
    stats_handsontable.refreshDimensions();
    stats_handsontable.render();
}

/* variable columns are appended after the fixed ones in the order the variables were first seen,
   and every row addresses a variable by that column index rather than by its position in its own
   run's list - two runs that declare different variables would otherwise write their values under
   whichever header happened to sit at the same offset. */
const statistics_variable_columns = [];

// the format the logs table and its CSV export have always used for a run's timestamp
const statisticsTimestamp = () => new Date().toLocaleString("en-GB", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

/* an execution's captured output is written to the log verbatim so the CSV export stays a faithful
   record, but a program that prints in a loop can produce far more text than a grid cell can show
   without making the whole table unreadable, so a very long one is cut off in the open. */
const STATISTICS_OUTPUT_LIMIT = 2000;
const clampStatisticsOutput = (text) => {
    const trimmed = String(text == null ? "" : text).trim();
    return trimmed.length <= STATISTICS_OUTPUT_LIMIT
        ? trimmed
        : trimmed.slice(0, STATISTICS_OUTPUT_LIMIT)
            + `\n… (${trimmed.length - STATISTICS_OUTPUT_LIMIT} more characters, see the execution modal)`;
};

/* takes the next run number and updates the counter the logs modal shows in its heading. debugger
   sessions and multi-language executions draw from the same sequence, so a run number identifies
   one execution in the log no matter which way it was started. */
export function beginRun() {
    window.runCounter++;
    document.getElementById("run-counter").innerHTML = "Run Counter: " + window.runCounter;
    return window.runCounter;
}

/* appends one execution to the logs table. `variables` is the debugger's [{name, value}] capture
   and is empty for a multi-language run, which reports an output and a status instead.
   `viaDebugger` says which way the run was started; callers report what happened and this is the
   one place that decides how the log records it. */
export function appendStatisticsRow({ run, language, viaDebugger, status, blocks, runtimeMs, output, variables }) {
    const captured = variables || [];
    captured.forEach((variable) => {
        if (!statistics_variable_columns.includes(variable.name)) {
            statistics_variable_columns.push(variable.name);
        }
    });

    const row = [
        run,
        statisticsTimestamp(),
        viaDebugger ? language + DEBUGGER_RUN_SUFFIX : language,
        status,
        blocks,
        runtimeMs,
        clampStatisticsOutput(output),
    ];
    statistics_variable_columns.forEach((name) => {
        const variable = captured.find((v) => v.name === name);
        row.push(variable === undefined ? "" : `${variable.value}\n(${typeof variable.value})`);
    });

    stats_handsontable.updateSettings({
        columns: STATISTICS_COLUMNS.concat(
            statistics_variable_columns.map((name) => ({ title: name, type: 'text' }))),
        data: stats_handsontable.getData().concat([row]),
    });
    refreshStatisticsTable(); // only redraws when the logs modal is already open
}

const exportPlugin = stats_handsontable.getPlugin('exportFile');
const export_stats_CSV_btn = document.getElementById('exportStatsCSV');
export_stats_CSV_btn.addEventListener("click", (event) => {
    exportPlugin.downloadFile('csv', {
        bom: false,
        columnDelimiter: ',',
        columnHeaders: true,
        exportHiddenColumns: true,
        exportHiddenRows: true,
        fileExtension: 'csv',
        filename: 'Execution-Logs_[YYYY]-[MM]-[DD]',
        mimeType: 'text/csv',
        rowDelimiter: '\r\n',
        rowHeaders: true,
      });
});
// Statistics table definiton - END

// Multi-Language Execution (in-browser) - START
// Each toggle in the execution modal maps to a display name and the editor whose
// generated source is run. Dart is intentionally absent: no in-browser Dart runtime exists.
const multiLangTargets = [
    { checkboxClass: "JavaScriptExecution", language: "JavaScript" },
    { checkboxClass: "PythonExecution", language: "Python" },
    { checkboxClass: "PHPExecution", language: "PHP" },
    { checkboxClass: "LuaExecution", language: "Lua" },
];

const escapeHtml = (str) => String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// How each run outcome reads. The modal badges and the logs table are built from the same two
// maps so a run cannot be described one way in the results panel and another way in the log.
const executionStatusLabels = {
    ok: "Success",
    error: "Runtime Error",
    timeout: "Timed Out",
    unsupported: "Unsupported",
};
const executionStatusBadgeClass = {
    ok: "success",
    error: "danger",
    timeout: "warning",
    unsupported: "secondary",
};
const executionStatusLabel = (status) => executionStatusLabels[status] || executionStatusLabels.ok;
// what a run produced: its error when it failed, otherwise its output
const executionResultText = (result) => result.status !== "ok"
    ? result.error
    : (result.output !== "" ? result.output : "(no output)");

// Render the side-by-side comparison of execution results across languages.
const renderMultiLangResults = (results) => {
    const container = document.getElementById("multiLangResults");
    if (!results.length) {
        container.innerHTML = "";
        return;
    }
    const rows = results.map((r) => {
        const statusBadge = '<span class="badge badge-' + (executionStatusBadgeClass[r.status] || "success")
            + '">' + executionStatusLabel(r.status) + '</span>';
        const isProblem = r.status !== "ok";
        const body = executionResultText(r);
        const bodyClass = isProblem ? "text-danger" : "";
        return '<tr>'
            + '<td class="font-weight-bold align-middle">' + escapeHtml(r.language) + '</td>'
            + '<td class="align-middle text-center">' + statusBadge + '</td>'
            + '<td><pre class="mb-0 ' + bodyClass + '" style="white-space: pre-wrap; word-break: break-word;">'
            + escapeHtml(body) + '</pre></td>'
            + '<td class="align-middle text-right">' + r.durationMs + '</td>'
            + '</tr>';
    }).join("");
    container.innerHTML = '<table class="table table-bordered table-sm">'
        + '<thead class="thead-light"><tr>'
        + '<th>Language</th><th class="text-center">Status</th>'
        + '<th>Output / Result</th><th class="text-right">Time (ms)</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>';
};

const remoteExecuteBtn = document.getElementById('remoteExecuteBtn');
remoteExecuteBtn.addEventListener("click", async () => {
    const statusEl = document.getElementById("multiLangStatus");
    const resultsEl = document.getElementById("multiLangResults");

    const selected = multiLangTargets.filter((t) => {
        const checkbox = document.querySelector("." + t.checkboxClass);
        return checkbox && checkbox.checked;
    });
    if (!selected.length) {
        statusEl.textContent = "Select at least one programming language to execute.";
        resultsEl.innerHTML = "";
        return;
    }
    if (!window.GlancerRuntimes) {
        statusEl.textContent = "Language runtimes are still loading, please try again in a moment.";
        return;
    }

    // Read the per-language time limit (seconds) and the shared standard input.
    // Both controls are optional: fall back to a 10s limit and no input if absent.
    const timeoutEl = document.getElementById("execTimeoutInput");
    const stdinEl = document.getElementById("execStdinInput");
    const timeoutSeconds = Math.max(1, Number(timeoutEl && timeoutEl.value) || 10);
    const stdinRaw = stdinEl ? stdinEl.value : "";
    const inputs = stdinRaw === "" ? [] : stdinRaw.replace(/\r\n/g, "\n").split("\n");
    const runOpts = { timeoutMs: timeoutSeconds * 1000, inputs };

    remoteExecuteBtn.disabled = true;
    resultsEl.innerHTML = "";
    const results = [];
    // One click is one run, so every language in it shares a run number in the logs table and the
    // log reads as "run #4 was these four languages" rather than as four unrelated executions.
    const run = beginRun();
    // The block count is a property of the workspace the sources were generated from, so it is the
    // same for every language in the run, and it is what makes these rows comparable to a debugger
    // run's row - the same program, measured the same way, executed a different way.
    const blocks = main_workspace.getAllBlocks(false).length;
    // Run sequentially so per-run output capture does not interleave.
    for (const target of selected) {
        statusEl.textContent = "Running " + target.language
            + "… (the first run of a WebAssembly target may take a few seconds to download its runtime)";
        const code = PL_to_editor(target.language)[0].getValue();
        // Each language gets a fresh copy of the input lines.
        const result = await window.GlancerRuntimes.run(
            target.language, code, { timeoutMs: runOpts.timeoutMs, inputs: inputs.slice() });
        results.push(result);
        renderMultiLangResults(results);
        // record it in the logs table too, so the results outlive this modal and reach the CSV export
        appendStatisticsRow({
            run,
            language: result.language,
            status: executionStatusLabel(result.status),
            blocks,
            runtimeMs: result.durationMs,
            output: executionResultText(result),
            variables: [], // a multi-language run executes the source, it does not inspect state
        });
    }
    statusEl.textContent = "Finished executing " + results.length
        + (results.length > 1 ? " languages." : " language.");
    remoteExecuteBtn.disabled = false;
});
// Multi-Language Execution (in-browser) - END

// Demo loader - START
// Generic demo loader button handler
document.querySelectorAll('button[id^="loadDemo"]').forEach(button => {
    const button_title = !button.id.endsWith('Corrected') ? "Try Debugging! &#x1F4E4" : "Load Fixed Demo";
    button.innerHTML = `${button_title} 
        <div id="${button.id}Popup" class="position-absolute p-3 bg-success text-white rounded popupText" style="right: 10%; top: 0;"></div>`;
});

const num_demos = document.querySelectorAll('div[id^="headingDemo"]').length;
for (let i = 1; i <= num_demos; i++) {
    // starter demo load buttons
    const demo_path = `demo/demo${i}_starter_blocks.xml`;
    let load_demo_button = document.getElementById(`loadDemo${i}`);
    if (load_demo_button) {
        tempClickPopup(`loadDemo${i}`, `loadDemo${i}Popup`, undefined, () => { return `Demo ${i} Loaded!` });
        load_demo_button.addEventListener('click', function () {
            loadDemo("startBlocks2", i, demo_path);
            event.stopPropagation(); // Prevent the card collapse event from bubbling up to the card header
        });
    }
    // final demo load buttons
    const corrected_demo_path = `demo/demo${i}_final_blocks.xml`;
    load_demo_button = document.getElementById(`loadDemo${i}Corrected`);
    if (load_demo_button) {
        tempClickPopup(`loadDemo${i}Corrected`, `loadDemo${i}CorrectedPopup`, undefined, () => { return `Solved Demo ${i} Loaded!` });
        load_demo_button.addEventListener('click', function () {
            loadDemo("startBlocks2", i, corrected_demo_path);
            event.stopPropagation(); // Prevent the card collapse event from bubbling up to the card header
        });
    }
}
// Generic demo loader to Blockly
const loadDemo = (blocks_xml, demo_number, demo_path) => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                main_workspace.clear();
                document.getElementById(blocks_xml).innerHTML = xhttp.responseText;
                dispatchEvent(new CustomEvent("loadStartingBlocks_blockly2"));
            } else {
                window.alert(`Failed to load Demo ${demo_number}. Status: ${this.status}`);
            }
        }
    };
    xhttp.open("GET", demo_path, true);
    xhttp.send();
    
    Blockly_Debugger.actions["Breakpoint"].breakpoints = []; // clear all breakpoints from state
    Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints(); // generate breakpoints (to clear code gutter)
}
// Demo loader - END