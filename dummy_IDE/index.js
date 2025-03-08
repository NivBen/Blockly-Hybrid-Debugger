import './init_blockly.js';
import '../debugger/debugger.js';
import '../generator/blockly/blockly.js';
import { Blockly_Debugger } from '../debugger/debugger.js';
import { breakpointIO_export, createBreakpointMarker  } from '../debugger/actions/breakpoints.js'; 
import { Blockly_Debuggee } from '../debuggee/init.js';
import { Breakpoint_Icon } from '../generator/blockly/core/breakpoint.js';

document.getElementById("ContinueButton").onclick = Blockly_Debugger.actions["Continue"].handler;
document.getElementById("StepInButton").onclick = Blockly_Debugger.actions["StepIn"].handler;
document.getElementById("StepOverButton").onclick = Blockly_Debugger.actions["StepOver"].handler;
document.getElementById("StepParentButton").onclick = Blockly_Debugger.actions["StepParent"].handler;
document.getElementById("StepOutButton").onclick = Blockly_Debugger.actions["StepOut"].handler;
document.getElementById("StopButton").onclick = Blockly_Debugger.actions["Stop"].handler;
document.getElementById("StartButton").onclick = Blockly_Debugger.actions["Start"].handler;
document.getElementById("ExportBreakpointsSubmit").onclick = Blockly_Debugger.actions["ExportBreakpointsToClipboard"].handler;

// supported PL mapping
export const ProgrammingLanguages = {
    "JavaScript": 0,
    "Python": 1,
    "Dart": 2,
    "PHP": 3,
    "Lua": 4,
};

document.addEventListener('DOMContentLoaded', () => {
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

    // update the selected prgramming langauge for breakpoint export
    function updateExportSelectedPL(event) { 
        Blockly_Debuggee.state.exportedProgrammingLanguage = event.target.value; // update exported PL
        BreakpointIOEditor.setValue(JSON.stringify(breakpointIO_export[ProgrammingLanguages[Blockly_Debuggee.state.exportedProgrammingLanguage]], null, 2)); // updated exported JSON display
    }

    // Update selected programming languages according to dropdown selection
    const main_pl_dropdown = document.getElementById('main_language_options');
    const secondary_pl_dropdown = document.getElementById('secondary_language_options');
    const export_pl_dropdown = document.getElementById('export_language_options');
    main_pl_dropdown.addEventListener('change', () => updateSelectedPL(event, 'main')); 
    secondary_pl_dropdown.addEventListener('change', () => updateSelectedPL(event, 'secondary')); 
    export_pl_dropdown.addEventListener('change', () => updateExportSelectedPL(event)); 
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
        export_pl_dropdown.selectedIndex = ProgrammingLanguages["JavaScript"]; // JavaScript is the default
    });
    // wait a second for blockly to generate code for all PL before hiding all editors beside selected language
    delay(1000).then(() => updateSelectedPL({ target: main_pl_dropdown }, 'main'));
    delay(1000).then(() => updateSelectedPL({target: secondary_pl_dropdown}, 'secondary'));

    /* Display Blockly XML Modal and Snapshot logic */
    const snapshotXML = document.getElementById('XML_paragraph');
    const saveSnapshotButton = document.getElementById('saveSnapshotButton');
    const logSnapshotsButton = document.getElementById('logSnapshotsButton');
    const savedButtonsContainer = document.getElementById('savedButtonsContainer');
    // Make savedSnapshots a global variable. TODO: Maybe add to Debuggee state
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
        button.innerHTML = `Load ${snapshot.source} Snapshot ${formatDateTime(snapshot.time)} <span class="delete">&times;</span>`;
        button.addEventListener('click', (event) => {
            if (event.target.classList.contains('delete')) { // Handle delete action
                event.stopPropagation(); // Prevent triggering the button's click event
                window.savedSnapshots.splice(index, 1);
                renderSnapshotButtons();
            } else { // Handle load action
                snapshotXML.textContent = snapshot.text;
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
        const currentText = snapshotXML.textContent.trim();
        if (currentText === '') {
            alert('Text box is empty. Please enter some text.');
            return;
        }
        const timestamp = new Date();
        const snapshot = {
            source: "Manual",
            text: currentText,
            time: timestamp,
            blockly_brekpoints: Blockly_Debugger.actions["Breakpoint"].breakpoints
        };
        window.savedSnapshots.push(snapshot);
        renderSnapshotButtons();
    });

    logSnapshotsButton.addEventListener('click', () => {
        console.log(window.savedSnapshots);
        alert("Logged Snapshot Metadata");
    });
});

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
const python_code = Blockly.Python.workspaceToCode(window.workspace["blockly2"]);
const javascript_code = Blockly.UneditedJavaScript.workspaceToCode(window.workspace["blockly2"]);
const dart_code = Blockly.Dart.workspaceToCode(window.workspace["blockly2"]);
const php_code = Blockly.PHP.workspaceToCode(window.workspace["blockly2"]);
const lua_code = Blockly.Lua.workspaceToCode(window.workspace["blockly2"]);
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
            const updated_javascript_code = Blockly.UneditedJavaScript.workspaceToCode(window.workspace["blockly2"]);
            if (previousCode.JavaScript !== updated_javascript_code) {
                UneditedJavaScriptEditor.setValue(updated_javascript_code);
                previousCode.JavaScript = updated_javascript_code;
            }
        } catch (error) {
            UneditedJavaScriptEditor.setValue("// Error in JavaScript Code Generation");
        }
        try {
            const updated_python_code = Blockly.Python.workspaceToCode(window.workspace["blockly2"]);
            if (previousCode.Python !== updated_python_code) {
                PythonEditor.setValue(updated_python_code);
                previousCode.Python = updated_python_code;
            }
        } catch (error) {
            PythonEditor.setValue("# Error in Python Code Generation");
        }
        try {
            const updated_dart_code = Blockly.Dart.workspaceToCode(window.workspace["blockly2"]);
            if (previousCode.Dart !== updated_dart_code) {
                DartEditor.setValue(updated_dart_code);
                previousCode.Dart = updated_dart_code;
            }
        } catch (error) {
            DartEditor.setValue("// Error in Dart Code Generation");
        }
        try {
            const updated_php_code = Blockly.PHP.workspaceToCode(window.workspace["blockly2"]);
            if (previousCode.PHP !== updated_php_code) {
                PhpEditor.setValue(updated_php_code);
                previousCode.PHP = updated_php_code;
            }
        } catch (error) {
            PhpEditor.setValue("# Error in PHP Code Generation");
        }
        try {
            const updated_lua_code = Blockly.Lua.workspaceToCode(window.workspace["blockly2"]);
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
window.workspace["blockly2"].addChangeListener(updateCodeFromBlockly);  // Blockly workspace change detection
// Editors Definition - End

// Modal - Start
let snapshotModal = document.getElementById("SnapshotMenuModal");
export let statisticsModal = document.getElementById("StatisticsMenuModal");
export let exportBreakpointsModal = document.getElementById("ExportBreakpointsModal");

let displaySnapshotMenuBtn = document.getElementById("SnapshotMenuButton");
displaySnapshotMenuBtn.onclick = function () {
    snapshotModal.style.display = "block";
    let blocks_workspace = window.workspace["blockly2"];
    let xml = Blockly.Xml.workspaceToDom(blocks_workspace);
    let xml_text = Blockly.Xml.domToPrettyText(xml);
    let input = document.getElementById("XML_paragraph");
    input.textContent = xml_text;
}

let displayStatisticsMenuBtn = document.getElementById("StatisticsMenuButton");
displayStatisticsMenuBtn.onclick = function () {
  statisticsModal.style.display = "block";
};

let exportBreakpointsButton = document.getElementById("ExportBreakpointsButton");
exportBreakpointsButton.onclick = function () {
    exportBreakpointsModal.style.display = "block";
};

let LoadXMLtoBlocklyBtn = document.getElementById("LoadXMLtoBlocklyButton");
LoadXMLtoBlocklyBtn.onclick = function () {
    let input = document.getElementById('XML_paragraph');
    try {
        let xml = Blockly.Xml.textToDom(input.textContent);
        let blocks_workspace = window.workspace["blockly2"];
        blocks_workspace.clear(); // clear workspace before importing 
        Blockly.Xml.domToWorkspace(xml, blocks_workspace);
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
UneditedJavaScriptEditor.on("gutterClick",
    (editor, line, gutter, clickEvent) => {
        if(!(Blockly_Debuggee.state.mainProgrammingLanguage === "JavaScript"))
            return;
        let info = editor.lineInfo(line);
        let workspace = Blockly.getMainWorkspace();
        let isMarked = info.gutterMarkers ? true : false;
        for (let i = 0; i < editor.lineCount(); i++) {
                editor.removeLineClass(i, "wrap", "highlight-line");
        }
        if (clickEvent.button === 1) { // Middle mouse click - highlight source line of code
            if (!info.wrapClass || !info.wrapClass.includes("highlight-line")){ // line not highlighted
                window.workspace["blockly2"].highlightBlock(""); // remove block highlight
                if(Blockly_Debuggee.state.highlightedSLOC !== undefined) { // remove previous code highlights
                    for (let i = 0; i < editor.lineCount(); i++) {
                    editor.removeLineClass(i, "wrap", "highlight-line");
                    }
                }
                editor.addLineClass(line, "wrap", "highlight-line");
                setBlockHighlightfromGutter(workspace, "UneditedJavaScript", editor.lineInfo(line).text);
                Blockly_Debuggee.state.highlightedSLOC = [line + 1];
            } else { // already highlighted - remove all highlights
                Blockly_Debuggee.state.highlightedSLOC = undefined;
                for (let i = 0; i < editor.lineCount(); i++) {
                    editor.removeLineClass(i, "wrap", "highlight-line");
                }
                window.workspace["blockly2"].highlightBlock(""); // remove block highlight
            }
        }
        else if (clickEvent.button === 0) { // Left-click - set breakpoint
            if(setBlockBreakpointFromGutter(workspace, "UneditedJavaScript", editor.lineInfo(line).text, isMarked)){
                if(!info.gutterMarkers) { // no gutter marker, set breakpoint
                    editor.setGutterMarker(line, "breakpoints", info.gutterMarkers ? null : createBreakpointMarker(true));
                } else if(info.gutterMarkers.breakpoints.innerHTML === "●") { // breakpoint set, disable it
                    editor.setGutterMarker(line, "breakpoints", createBreakpointMarker(false));
                } else { // breakpoint disabled - remove it
                    editor.setGutterMarker(line, "breakpoints", null);
                }
                // editor.setGutterMarker(line, "breakpoints", info.gutterMarkers ? null : createBreakpointMarker());
                Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints();
            } else {
                alert(`Unable to set breakpoint on selected code line #${line+1}\nNo corresponding block found.`);
            }
        }
    });
PythonEditor.on("gutterClick",
    (editor, line) => {
        if(!(Blockly_Debuggee.state.mainProgrammingLanguage === "Python"))
            return;
        let info = editor.lineInfo(line);
        let workspace = Blockly.getMainWorkspace();
        let isMarked = info.gutterMarkers ? true : false;
        setBlockBreakpointFromGutter(workspace, "Python", editor.lineInfo(line).text, isMarked);
        editor.setGutterMarker(line, "breakpoints", info.gutterMarkers ? null : createBreakpointMarker());
    });
DartEditor.on("gutterClick",
    (editor, line) => {
        if(!(Blockly_Debuggee.state.mainProgrammingLanguage === "Dart"))
            return;
        let info = editor.lineInfo(line);
        let workspace = Blockly.getMainWorkspace();
        let isMarked = info.gutterMarkers ? true : false;
        setBlockBreakpointFromGutter(workspace, "Dart", editor.lineInfo(line).text, isMarked);
        editor.setGutterMarker(line, "breakpoints", info.gutterMarkers ? null : createBreakpointMarker());
    });
PhpEditor.on("gutterClick",
    (editor, line) => {
        if(!(Blockly_Debuggee.state.mainProgrammingLanguage === "PHP"))
            return;
        let info = editor.lineInfo(line);
        let workspace = Blockly.getMainWorkspace();
        let isMarked = info.gutterMarkers ? true : false;
        setBlockBreakpointFromGutter(workspace, "PHP", editor.lineInfo(line).text, isMarked);
        editor.setGutterMarker(line, "breakpoints", info.gutterMarkers ? null : createBreakpointMarker());
    });
LuaEditor.on("gutterClick",
    (editor, line) => {
        if(!(Blockly_Debuggee.state.mainProgrammingLanguage === "Lua"))
            return;
        let info = editor.lineInfo(line);
        let workspace = Blockly.getMainWorkspace();
        let isMarked = info.gutterMarkers ? true : false;
        setBlockBreakpointFromGutter(workspace, "Lua", editor.lineInfo(line).text, isMarked);
        editor.setGutterMarker(line, "breakpoints", info.gutterMarkers ? null : createBreakpointMarker());
    });

const getCodeToBlockMapping = (workspace, language) => {
    let code_block_mapping = {};
    Blockly[language].variableDB_.setVariableMap(workspace.getVariableMap());
    workspace.getAllBlocks().forEach(function (block) {
        let block_code = '';
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
    return code_block_mapping;
}

function highlightHorizontalSubBlocksRecursively(workspace, block) {
  // Base case: If the block is null, return
  if (!block) return;

  // Highlight the current block if it has no vertical connections
  if (!block.previousConnection && !block.nextConnection) {
    workspace.highlightBlock(block.id, true);
  }

  // Recursively highlight all children blocks
  block.getChildren().forEach(childBlock => {
    highlightHorizontalSubBlocksRecursively(workspace, childBlock);
  });
}

function setBlockHighlightfromGutter(workspace, programming_language, input_code) {
    let code_block_mapping = getCodeToBlockMapping(workspace, programming_language);
    input_code = input_code.trimStart(); // remove initial whitespaces (common in python)
    if (code_block_mapping[input_code]) { // found input_block in mapping
        // highlight block according to highlighted line of code selection
        const parentBlock = workspace.getBlockById(code_block_mapping[input_code].block_id);
        if (parentBlock) { // highlight all horizontal sub-blocks
            const childBlocks = parentBlock.getChildren();
            if (childBlocks.length === 1) { // no next blocks
                highlightHorizontalSubBlocksRecursively(workspace, parentBlock.getChildren()[0]);
            } else {
                // TODO: handle differently for complicated nodes such as loops
                parentBlock.getChildren().slice(0, -1).forEach(childBlock => {
                    highlightHorizontalSubBlocksRecursively(workspace, childBlock)
                });
            }
           
        }
        console.log(`Highlighting block ID=${code_block_mapping[input_code].block_id} and code:\n${input_code}`);
        window.workspace["blockly2"].highlightBlock(code_block_mapping[input_code].block_id, true);
        return false;
    } else {
        console.log(`did not find corresponding block to highlight from code line:\n${input_code}`);
        return false;
    }
}

function setBlockBreakpointFromGutter(workspace, programming_language, input_code, isHighlighted) {
    let code_block_mapping = getCodeToBlockMapping(workspace, programming_language);
    input_code = input_code.trimStart(); // remove initial whitespaces (common in python)
    if (code_block_mapping[input_code]) { // found input_block in mapping
        let block = code_block_mapping[input_code].block
        // if (block.type === "text_print") 
        // TODO: special case where id is "print"
        // dispatchEvent(new CustomEvent("addBlocklyBreakpointFromGutter", { detail: eventData }));

        if (Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { return obj.block_id; }).includes(block.id)) { // matching block has breakpoint
            let index = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { return obj.block_id; }).indexOf(block.id);
            let icon = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { if (obj.block_id === block.id) return obj.icon })[index];
            icon.myDisable();
            if (index !== -1) Blockly_Debugger.actions["Breakpoint"].breakpoints.splice(index, 1);
        } else {
            let new_br = {
                "block_id": block.id,
                "enable": true,
                "icon": new Breakpoint_Icon(block),
                "change": false
            }
            Blockly_Debugger.actions["Breakpoint"].breakpoints.push(new_br);
            block.setCollapsed(false);
        }
        if (!isHighlighted) {  // highlight breakpointed block
            console.log(`Setting breakpoint on block ID=${code_block_mapping[input_code].block_id} and code:\n${input_code}`);
            window.workspace["blockly2"].highlightBlock(code_block_mapping[input_code].block_id);
        } else { // remove block highlight
            console.log(`Removing breakpoint on block ID=${code_block_mapping[input_code].block_id} and code:\n${input_code}`);
            window.workspace["blockly2"].highlightBlock("");
        }
        return true;
    } else
        console.log("setBlockBreakpointFromGutter: did not find corresponding block to this code:\n" + input_code);
        return false;
}

// remove all breakpoint highlights from all code editors
export function removeCodeBreakpointHighlights() {
    for (let i = 0; i < UneditedJavaScriptEditor.lineCount(); i++) {
        UneditedJavaScriptEditor.removeLineClass(i, "wrap", "highlight-breakpoint");
      }
      for (let i = 0; i < PythonEditor.lineCount(); i++) {
        PythonEditor.removeLineClass(i, "wrap", "highlight-breakpoint");
      }
      for (let i = 0; i < DartEditor.lineCount(); i++) {
        DartEditor.removeLineClass(i, "wrap", "highlight-breakpoint");
      }
      for (let i = 0; i < PhpEditor.lineCount(); i++) {
        PhpEditor.removeLineClass(i, "wrap", "highlight-breakpoint");
      }
      for (let i = 0; i < LuaEditor.lineCount(); i++) {
        LuaEditor.removeLineClass(i, "wrap", "highlight-breakpoint");
      }
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

// Unit Test input and result form
const unit_test_form = document.getElementById("unit-test-input-form");
if (unit_test_form) {
    unit_test_form.addEventListener("submit", (event) => {
        event.preventDefault(); // prevent page refresh

        const num1 = document.getElementById("num1").value;
        const num2 = document.getElementById("num2").value;
        const res = document.getElementById("res").value;

        alert(`num1: ${num1}, num2: ${num2}, Expected Result: ${res}`);
    });
}

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

export function copyToClipboard(text) {
    var tempInput = document.createElement("input"); // Create a temporary input element
    tempInput.value = text; // Assign the text to be copied to the input element's value
    document.body.appendChild(tempInput); // Append the input element to the document
    tempInput.select(); // Select the text inside the input element
    document.execCommand("copy"); // Copy the selected text to the clipboard
    document.body.removeChild(tempInput); // Remove the temporary input element
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