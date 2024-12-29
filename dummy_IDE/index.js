import './init_blockly.js';
import '../debugger/debugger.js';
import '../generator/blockly/blockly.js';
import { Blockly_Debugger } from '../debugger/debugger.js';
import { Blockly_Debuggee } from '../debuggee/init.js';
import { Breakpoint_Icon } from '../generator/blockly/core/breakpoint.js';

document.getElementById("ContinueButton").onclick = Blockly_Debugger.actions["Continue"].handler;
document.getElementById("StepInButton").onclick = Blockly_Debugger.actions["StepIn"].handler;
document.getElementById("StepOverButton").onclick = Blockly_Debugger.actions["StepOver"].handler;
document.getElementById("StepParentButton").onclick = Blockly_Debugger.actions["StepParent"].handler;
document.getElementById("StepOutButton").onclick = Blockly_Debugger.actions["StepOut"].handler;
document.getElementById("StopButton").onclick = Blockly_Debugger.actions["Stop"].handler;
document.getElementById("StartButton").onclick = Blockly_Debugger.actions["Start"].handler;
document.getElementById("ExportBreakpointsButton").onclick = Blockly_Debugger.actions["ExportBreakpointsToClipboard"].handler;

document.addEventListener('DOMContentLoaded', () => {
    // Function to update the selected prgramming langauge state and display the selected option
    function updateSelectedOption(event) { 
        let selectedOption = event.target.value;
        Blockly_Debuggee.state.currProgrammingLanguage = selectedOption; // update state
        // Remove existing highlights
        document.querySelectorAll('.nav-link').forEach(link => { 
            link.classList.remove('highlightChosenLanguage');
            link.classList.remove('active');
        });
        // Highlight the specified selection
        const link = Array.from(document.querySelectorAll('.nav-link')) 
            .find(link => link.textContent.trim() === selectedOption);
        if (link) {
            link.classList.add('highlightChosenLanguage');
            link.classList.add('active');
        }
    }

    // Update selected programming language according to dropdown selection on button click
    const dropdown = document.getElementById('language_options');
    // select first option by default
    dropdown.selectedIndex = 0; 
    updateSelectedOption({target: dropdown});
    dropdown.addEventListener('change', updateSelectedOption); 
    const dartButton = document.getElementById("DartTab");
    const JSButton = document.getElementById("JSTab");
    JSButton.addEventListener("click", () => {
        updateSelectedOption({ target: JSButton });
        dropdown.selectedIndex = 0;
    });
    const pythonButton = document.getElementById("PythonTab");
    pythonButton.addEventListener("click", () => {
        updateSelectedOption({ target: pythonButton });
        dropdown.selectedIndex = 1;
    });
    dartButton.addEventListener("click", () => {
        updateSelectedOption({ target: dartButton });
        dropdown.selectedIndex = 2;

    });


    /* Display Blockly XML Modal and Snapshot logic */
    const textBox = document.getElementById('XML_paragraph');
    const saveSnapshotButton = document.getElementById('saveSnapshotButton');
    const logSnapshotsButton = document.getElementById('logSnapshotsButton');
    const savedButtonsContainer = document.getElementById('savedButtonsContainer');
    // Make savedSnapshots a global variable. // TODO: Maybe add to Debuggee state
    window.savedSnapshots = []; 

    // Function to format date and time
    function formatDateTime(timestamp) {
        const dd = String(timestamp.getDate()).padStart(2, '0');
        const mm = String(timestamp.getMonth() + 1).padStart(2, '0'); // January is 0!
        const hh = String(timestamp.getHours()).padStart(2, '0');
        const min = String(timestamp.getMinutes()).padStart(2, '0');
        return `${dd}/${mm} | ${hh}:${min}`;
    }

    // Function to create a snapshot button
    function createSnapshotButton(snapshot, index) { 
        const button = document.createElement('button');
        button.className = 'snapshot-button';
        button.innerHTML = `Snapshot ${formatDateTime(snapshot.time)} <span class="delete">&times;</span>`;
        button.addEventListener('click', (event) => {
            if (event.target.classList.contains('delete')) { // Handle delete action
                event.stopPropagation(); // Prevent triggering the button's click event
                window.savedSnapshots.splice(index, 1);
                renderSnapshotButtons();
            } else { // Handle load action
                textBox.textContent = snapshot.text;
            }
        });
        button.title = `Saved on: ${formatDateTime(snapshot.time)}`;
        return button;
    }

    // Function to render all snapshot buttons
    function renderSnapshotButtons() { 
        savedButtonsContainer.innerHTML = ''; // Clear the container
        window.savedSnapshots.forEach((snapshot, index) => {
            const button = createSnapshotButton(snapshot, index);
            savedButtonsContainer.appendChild(button);
        });
    }

    saveSnapshotButton.addEventListener('click', () => {
        const currentText = textBox.textContent.trim();
        if (currentText === '') {
            alert('Text box is empty. Please enter some text.');
            return;
        }
        const timestamp = new Date();
        const snapshot = {
            text: currentText,
            time: timestamp,
            blockly_brekpoints: Blockly_Debugger.actions["Breakpoint"].breakpoints
        };
        window.savedSnapshots.push(snapshot);
        renderSnapshotButtons();
    });

    logSnapshotsButton.addEventListener('click', () => {
        console.log(window.savedSnapshots);
    });
});

// Editors Definition - Start
export var PythonEditor = CodeMirror.fromTextArea(document.getElementById("python_code"), {
    mode: {
        name: "python",
        version: 3,
        singleLineStringErrors: false
    },
    lineNumbers: true,
    indentUnit: 4,
    matchBrackets: true,
    gutters: ["breakpoints"],
});
PythonEditor.setValue('Generated Python Block formula will be here...');

export const JavaScriptEditor = CodeMirror.fromTextArea(document.getElementById("javascript_code"), {
    lineNumbers: true,
    indentUnit: 4,
    matchBrackets: true,
    gutters: ["breakpoints"],
});
JavaScriptEditor.setValue('Generated JavaScript Block formula will be here...');

export const DartEditor = CodeMirror.fromTextArea(document.getElementById("dart_code"), {
    lineNumbers: true,
    indentUnit: 4,
    matchBrackets: true,
    gutters: ["breakpoints"],
});
DartEditor.setValue('Generated Python Block formula will be here...');

// set initial editor code according to "startBlocks"
var python_code = Blockly.Python.workspaceToCode(window.workspace["blockly2"]);
var javascript_code = Blockly.UneditedJavaScript.workspaceToCode(window.workspace["blockly2"]);
var dart_code = Blockly.Dart.workspaceToCode(window.workspace["blockly2"]);
PythonEditor.setValue(python_code);
JavaScriptEditor.setValue(javascript_code);
DartEditor.setValue(dart_code);

var isUpdating_py = false;
var debouncedB2TUpdate_py = debounce_py(blockToTextUpdate_py, 1000);
function debounce_py(func, wait) {
    var timeout_py;
    return function () {
        clearTimeout(timeout_py);
        timeout_py = setTimeout(() => {
            func.apply(this, arguments);
        }, wait);
    }
}
function blockToTextUpdate_py() {
    if (isUpdating_py) {
        isUpdating_py = false;
    } else {
        isUpdating_py = true;
        var updated_python_code = Blockly.Python.workspaceToCode(window.workspace["blockly2"]);
        PythonEditor.setValue(updated_python_code);
        var updated_javascript_code = Blockly.UneditedJavaScript.workspaceToCode(window.workspace["blockly2"]);
        JavaScriptEditor.setValue(updated_javascript_code);
        var updated_dart_code = Blockly.Dart.workspaceToCode(window.workspace["blockly2"]);
        DartEditor.setValue(updated_dart_code);
    }
}
window.workspace["blockly2"].addChangeListener(debouncedB2TUpdate_py);
// Editors Definition - End

// Blockly XML Load Modal - Start
let modal = document.getElementById("XMLModal");

let displayBlocklyBtn = document.getElementById("DisplayBlocklyButton");
displayBlocklyBtn.onclick = function () {
    modal.style.display = "block";
    let blocks_workspace = window.workspace["blockly2"];
    var xml = Blockly.Xml.workspaceToDom(blocks_workspace);
    var xml_text = Blockly.Xml.domToPrettyText(xml);
    let input = document.getElementById("XML_paragraph");
    input.textContent = xml_text;
}

let LoadXMLtoBlocklyBtn = document.getElementById("LoadXMLtoBlocklyButton");
LoadXMLtoBlocklyBtn.onclick = function () {
    let input = document.getElementById('XML_paragraph');
    try {
        var xml = Blockly.Xml.textToDom(input.textContent);
        let blocks_workspace = window.workspace["blockly2"];
        blocks_workspace.clear(); // clear workspace before importing 
        Blockly.Xml.domToWorkspace(xml, blocks_workspace);
    } catch (error) {
        alert('Error parsing XML\n' + error);
    }
}

let span = document.getElementsByClassName("close")[0];  // Get the <span> element that closes the modal
span.onclick = function () { // When the user clicks on <span> (x), close the modal
    modal.style.display = "none";
}
window.onclick = function (event) {  // When the user clicks anywhere outside of the modal, close it
    if (event.target == modal) {
        modal.style.display = "none";
    }
}
// Modal - Finish

// Breakpoint gutter definition
PythonEditor.on("gutterClick",
    function (editor, n) {
        if(!(Blockly_Debuggee.state.currProgrammingLanguage === "Python"))
            return;
        let info = editor.lineInfo(n);
        let workspace = Blockly.getMainWorkspace();
        let isMarked = info.gutterMarkers ? true : false;
        setBlockBreakpointFromGutter(workspace, "Python", editor.lineInfo(n).text, isMarked);
        editor.setGutterMarker(n, "breakpoints", info.gutterMarkers ? null : makeManualBreakpoint());
    });
JavaScriptEditor.on("gutterClick",
    function (editor, n) {
        if(!(Blockly_Debuggee.state.currProgrammingLanguage === "JavaScript"))
            return;
        let info = editor.lineInfo(n);
        let workspace = Blockly.getMainWorkspace();
        let isMarked = info.gutterMarkers ? true : false;
        setBlockBreakpointFromGutter(workspace, "UneditedJavaScript", editor.lineInfo(n).text, isMarked);
        editor.setGutterMarker(n, "breakpoints", info.gutterMarkers ? null : makeManualBreakpoint());
    });
DartEditor.on("gutterClick",
    function (editor, n) {
        if(!(Blockly_Debuggee.state.currProgrammingLanguage === "Dart"))
            return;
        let info = editor.lineInfo(n);
        let workspace = Blockly.getMainWorkspace();
        let isMarked = info.gutterMarkers ? true : false;
        setBlockBreakpointFromGutter(workspace, "Dart", editor.lineInfo(n).text, isMarked);
        editor.setGutterMarker(n, "breakpoints", info.gutterMarkers ? null : makeManualBreakpoint());
    });

function makeManualBreakpoint() {
    var marker = document.createElement("div");
    marker.style.color = "#822";
    marker.innerHTML = "●";
    return marker;
}

function setBlockBreakpointFromGutter(workspace, language, input_code, isHighlighted) {
    let code_block_mapping = {};
    Blockly[language].variableDB_.setVariableMap(workspace.getVariableMap());
    workspace.getAllBlocks().forEach(function (block) {
        var block_code = '';
        if (block.type === 'procedures_defnoreturn' || block.type === 'procedures_callnoreturn') {
            let func_name = Blockly[language].variableDB_.getName(block.getFieldValue('NAME'), Blockly.Procedures.NAME_TYPE);
            block_code = (block.type === 'procedures_defnoreturn') ? 'def ' + func_name : func_name + '()';
        } else {
            block_code = Blockly[language].blockToCode(block);
            if (Array.isArray(block_code)) {
                block_code = Blockly[language].blockToCode(block)[0]; // code string only
            } else {
                block_code = Blockly[language].blockToCode(block).split('\n')[0]; // code string only w/o proceeding blocks
                block_code = block_code.replace(/count[0-9]/g, "count");
            }
        }
        code_block_mapping[block_code] = {
            "block_id": block.id,
            "block": block,
        };
    });

    input_code = input_code.trimStart(); // remove initial whitespaces (common in python)
    if (code_block_mapping[input_code]) {

        let block = code_block_mapping[input_code].block
        // if (block.type === "text_print") 
        // TODO: special case where id is "print"
        // dispatchEvent(new CustomEvent("addBlocklyBreakpointFromGutter", { detail: eventData }));

        if (Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { return obj.block_id; }).includes(block.id)) { // matching block has breakpoint
            var index = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { return obj.block_id; }).indexOf(block.id);
            var icon = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { if (obj.block_id === block.id) return obj.icon })[index];
            icon.myDisable();
            if (index !== -1) Blockly_Debugger.actions["Breakpoint"].breakpoints.splice(index, 1);
        } else {
            var new_br = {
                "block_id": block.id,
                "enable": true,
                "icon": new Breakpoint_Icon(block),
                "change": false
            }
            Blockly_Debugger.actions["Breakpoint"].breakpoints.push(new_br);
            block.setCollapsed(false);
        }

        // highlight breakpointed block
        if (!isHighlighted) {
            console.log("breakpointing block with $id: " + code_block_mapping[input_code].block_id);
            window.workspace["blockly2"].highlightBlock(code_block_mapping[input_code].block_id);
        } else {
            window.workspace["blockly2"].highlightBlock("");
        }
    } else
        console.log("did not find corresponding block to this code:\n " + input_code);
}
