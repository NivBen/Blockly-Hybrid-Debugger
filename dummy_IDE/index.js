import './init_blockly.js';
import '../debugger/debugger.js';
import '../generator/blockly/blockly.js';
import { Blockly_Debugger } from '../debugger/debugger.js';
import { breakpointIO_export, getBlockToCodeMapping } from '../debugger/actions/breakpoints.js'; 
import { Blockly_Debuggee } from '../debuggee/init.js';
import { Breakpoint_Icon } from '../generator/blockly/core/breakpoint.js';
import { 
    executeCodeRemotely, 
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
});

const export_pl_dropdown = document.getElementById('export_language_options');
// update the selected prgramming langauge for breakpoint export
export_pl_dropdown.addEventListener('change', (event) => {
    Blockly_Debuggee.state.exportedProgrammingLanguage = event.target.value; // update exported PL
    BreakpointIOEditor.setValue(JSON.stringify(breakpointIO_export[ProgrammingLanguages[Blockly_Debuggee.state.exportedProgrammingLanguage]], null, 2)); // updated exported JSON display
}); 

// Snapshot Definition - Start
// Display Blockly XML Modal and Snapshot dropdown and logic
const currProgramXML = document.getElementById('curr_program_XML');
const currSnapshotXML = document.getElementById('curr_snapshot_XML');
const saveSnapshotButton = document.getElementById('saveSnapshotButton');
const logSnapshotsButton = document.getElementById('logSnapshotsButton');
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
    renderSnapshotButtons();
});

logSnapshotsButton.addEventListener('click', () => {
    console.log(Blockly_Debuggee.state.snapshots);
    alert("Logged Snapshot Metadata");
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
    button.innerHTML = `Preview ${snapshot.source} Snapshot ${formatDateTime(snapshot.time)} <span class="delete">&times;</span>`;
    button.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete')) { // Handle delete action
            event.stopPropagation(); // Prevent triggering the button's click event
            Blockly_Debuggee.state.snapshots.splice(index, 1);
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
            snapshotDropdownToggleButton.innerHTML = "▽ Snapshot List";
        }
    });
    button.title = `Saved on: ${formatDateTime(snapshot.time)}`;
    return button;
}

// Toggle visibility of snapshot list
snapshotDropdownToggleButton.addEventListener('click', () => {
    if (!snapshotList.style.display || snapshotList.style.display === 'none') {
        snapshotList.style.display = 'block';
        snapshotDropdownToggleButton.innerHTML = "△ Snapshot List";
    } else {
        snapshotList.style.display = 'none';
        snapshotDropdownToggleButton.innerHTML = "▽ Snapshot List";
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
    (PL_to_editor(language)[0]).setValue(`Generated ${language} code will be here...`); 
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
  }
}

// Start the update interval
setInterval(updateCodeFromBlockly, 2000); // Update every 2 seconds
main_workspace.addChangeListener(updateCodeFromBlockly);  // Blockly workspace change detection
// Editors Definition - End

// Modal - Start
export let snapshotModal = document.getElementById("SnapshotMenuModal");
export let statisticsModal = document.getElementById("StatisticsMenuModal");
export let exportBreakpointsModal = document.getElementById("ExportBreakpointsModal");

let displaySnapshotMenuBtn = document.getElementById("SnapshotMenuButton");
displaySnapshotMenuBtn.onclick = function () {
    statisticsModal.style.display = "none";
    exportBreakpointsModal.style.display = "none";
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
    statisticsModal.style.display = "block";
};

let exportBreakpointsButton = document.getElementById("ExportBreakpointsButton");
exportBreakpointsButton.onclick = function () {
    snapshotModal.style.display = "none";
    statisticsModal.style.display = "none";
    exportBreakpointsModal.style.display = "block";
    BreakpointIOEditor.setCursor(0, 0); // focus on editor - otherwise it won't load content
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
window.onclick = function (event) {  // When the user clicks anywhere outside of the modal, close it
    if (event.target == snapshotModal || event.target == statisticsModal || event.target == exportBreakpointsModal) {
        snapshotModal.style.display = "none";
        statisticsModal.style.display = "none";
        exportBreakpointsModal.style.display = "none";
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
    for (let i = 0; i < editor.lineCount(); i++) {
            editor.removeLineClass(i, "wrap", "highlight-line");
    }
    if (clickEvent.button === 1) { // Middle mouse click - highlight source line of code
        if (!info.wrapClass || !info.wrapClass.includes("highlight-line")) { // line not highlighted
            workspace.highlightBlock(""); // remove all block highlights
            for (let i = 0; i < editor.lineCount(); i++) { // remove previous code highlights
                editor.removeLineClass(i, "wrap", "highlight-line");
            }
            editor.addLineClass(line, "wrap", "highlight-line");
            setBlockHighlightfromGutter(workspace, prog_lang, editor.lineInfo(line).text);
        } else { // already highlighted - remove all highlights
            removeGutterAndBlockHighlights();
            workspace.highlightBlock(""); // remove block highlight
        }
    } else if (clickEvent.button === 0) { // Left-click - set breakpoint
        if (setBlockBreakpointFromGutter(workspace, prog_lang, editor.lineInfo(line).text, isMarked)) {
            Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints(); // re-generate bps
        } else {
            alert(`Unable to set breakpoint on selected code line #${line + 1}\nNo corresponding blocks found.`);
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

/* returns a JSON where the keys are the programming languages and the keys are JSON with the following structure:
  { <codeLine>: <array of blocks that genereate this code line>
*/
function getCodeToBlocksMapping(workspace) {
    const result = {};
    // Initialize the result object with languages as keys
    Object.keys(ProgrammingLanguages).forEach(language => {
        let [, fixed_language] = PL_to_editor(language);
        result[fixed_language] = {};
    });
    // Process each block in the currBlockToCodeMapping
    for (const [blockId, blockData] of Object.entries(getBlockToCodeMapping(workspace))) {
        const ancestorId = blockData.horizontal_ancestor_block_id;
        // Iterate over each language and populate the mapping
        for (const [language, codeData] of Object.entries(blockData.code)) {
            const code = codeData.ancestor_block_code.trim();
            // Initialize the code key if not already present
            if (!result[language][code]) {
                result[language][code] = [];
            }
            // Add the current block ID to the array
            result[language][code].push(blockId);
        }
    }
    return result;
}

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

function setBlockHighlightfromGutter(workspace, programming_language, input_code) {
    // let code_block_mapping = getCodeToBlockMapping(workspace, programming_language);
    let code_block_mapping = getCodeToBlocksMapping(workspace);
    input_code = input_code.trimStart(); // remove initial whitespaces (common in python)
    const arr_block_ids_matching_code_line = code_block_mapping[programming_language][input_code]; // array of blocks that match given input code
    if (arr_block_ids_matching_code_line) { // found input_block in mapping
        arr_block_ids_matching_code_line.forEach(block_id => { 
            workspace.highlightBlock(block_id, true); // highlight each block in the array
        });
        return true;
    } else {
        console.log(`did not find corresponding block to highlight from code line:\n${input_code}`);
        return false;
    }
}

function setBlockBreakpointFromGutter(workspace, programming_language, input_code, isHighlighted) {
    let code_block_mapping = getCodeToBlocksMapping(workspace);
    input_code = input_code.trimStart(); // remove initial whitespaces (common in python)
    const arr_block_ids_matching_code_line = code_block_mapping[programming_language][input_code]; // array of blocks that match given input code
    if (arr_block_ids_matching_code_line) { // found input_block in mapping
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
        console.log(`did not find corresponding block to breakpoint from code line:\n${input_code}`);
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
            editor.removeLineClass(i, "wrap", "code-step-highlight");
        }
    });
}
// Breakpoint gutter definition - End

// tooltip definition
const elements = [...document.querySelectorAll('[tip]')]
for (const el of elements) {
  const tip = document.createElement('div')
  tip.classList.add('tooltip')
  tip.textContent = el.getAttribute('tip')
  el.appendChild(tip)
}

// // Unit Test input and result form
// const unit_test_form = document.getElementById("unit-test-input-form");
// if (unit_test_form) {
//     unit_test_form.addEventListener("submit", (event) => {
//         event.preventDefault(); // prevent page refresh

//         const num1 = document.getElementById("num1").value;
//         const num2 = document.getElementById("num2").value;
//         const res = document.getElementById("res").value;

//         alert(`num1: ${num1}, num2: ${num2}, Expected Result: ${res}`);
//     });
// }

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
                controls: true,
                pinch: true
            }
        }
    );
    window.workspace[workspace_name].systemEditorId = workspace_name;   
});
// Add or remove new Blockly workspace - END

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

// define statistics table
const stats_table_div = document.getElementById("stats-runs");
export const stats_handsontable = new Handsontable(stats_table_div, {
    data: [],
    rowHeaders: true,
    columns: [
      { title: '#Run / Var', type: 'text' },
      {
        title: 'Date',
        type: 'date',
        dateFormat: 'DD/MM/YY, HH:mm',
        correctFormat: true,
      },
      { title: '#Blocks Used', type: 'numeric' },
      { title: 'Runtime (ms)', type: 'numeric' },
    ],
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

const executePythonRemotley = document.getElementById('executePythonRemotley');
executePythonRemotley.addEventListener("click", () => {
    console.log(PL_to_editor("Python")[0]);
    executeCodeRemotely("Python", PL_to_editor("Python")[0]);
});
