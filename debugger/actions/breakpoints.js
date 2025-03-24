import { Debuggee_Worker, Blockly_Debugger } from "../init.js";
import { Blockly_Debuggee } from "../../debuggee/init.js";
import { PL_to_editor, ProgrammingLanguages, BreakpointIOEditor } from "../../dummy_IDE/index.js";
import { copyToClipboard } from "../../dummy_IDE/utils.js";

Blockly_Debugger.actions["Highlight"] = {};
Blockly_Debugger.actions["Breakpoint"] = {};
Blockly_Debugger.actions["RunToCursor"] = {};

// Highlight block and corresponding code lines
Blockly_Debugger.actions["Highlight"].highlightedBlockID = undefined;

// Find and return the block ID who is the horizontal ansector of the taget block
function findHorizontalAncestorBlockId(xmlString, target_block_ID) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const findParentBlock = (element) => {
        while (element && element.tagName !== 'block')
            element = element.parentNode;
        return element;
    }
    const findAncestorRecursivley = (block) => {
        let current = block;
        let parent = findParentBlock(current.parentNode);
        // If the block is directly under <xml>, it's a top-level block
        if (current.parentNode.tagName === 'xml') {
            return current.getAttribute('id');
        }
        while (parent) {
            // If we're inside a statement (e.g., loop body), return the current block
            if (current.parentNode.tagName === 'statement') {
                return current.getAttribute('id');
            }
            // If we're in a horizontal chain, return the current block
            if (current.parentNode.tagName === 'next') {
                return current.getAttribute('id');
            }
            // Move up to the next parent
            current = parent;
            parent = findParentBlock(current.parentNode);
        }
        // If no valid ancestor is found, return the current block's ID
        return current.getAttribute('id');
    }
    const targetBlock = xmlDoc.querySelector(`block[id="${target_block_ID}"]`);
    return targetBlock ? findAncestorRecursivley(targetBlock) : null;
}

/*
    Get workspace and returns the following map for each block ID:
    block_id: { 
     horizontal_ancestor_block_id, 
     generated_ancestor_code
    }
*/
export function getBlockToCodeMapping(workspace) {
    const xmlString = Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(workspace));
    const block_to_code_map = {};
    workspace.getAllBlocks(false).forEach(block => {
        if (block.isShadow()) return;// Skip shadow blocks

        const ancestor_block_ID = findHorizontalAncestorBlockId(xmlString, block.id);
        const ancestor_block = workspace.getBlockById(ancestor_block_ID);
        let code = {};

        if (ancestor_block) {
            const originalNextBlock = ancestor_block.nextConnection && ancestor_block.nextConnection.targetBlock();
            if (originalNextBlock) {
                ancestor_block.nextConnection.disconnect(); // Disconnect the next block
            }
            // generate code in all PLs
            Object.keys(ProgrammingLanguages).forEach((element) => {
                let [, prog_language] = PL_to_editor(element);
                Blockly[prog_language].variableDB_.setVariableMap(workspace.getVariableMap()); // Set the variable map for the language
                try {
                    let ancestor_block_code = Blockly[prog_language].blockToCode(ancestor_block); // horizontal ancestor block generated code
                    // find the starting line number of the horizontal ancestor block
                    const workspace_generated_code = Blockly[prog_language].workspaceToCode(workspace);
                    let lineNumber = 1; // Start line number at 1
                    let lines = workspace_generated_code.split("\n");
                    let blockFound = false;
                    // Iterate over lines to find the block
                    for (var i = 0; i < lines.length; i++) {
                        // Check if the current line contains the block's ID
                        if (lines[i].includes(ancestor_block_code.split('\n')[0])) {
                            blockFound = true;
                            break;
                        }
                        // Increment line number
                        lineNumber++;
                    }
                    // Add block information to the block_to_code_mapping object
                    code[prog_language] = {
                        ancestor_block_code: ancestor_block_code, // horizontal ancestor block generated code
                        lineNumber: blockFound ? lineNumber : null, // start line number
                    }
                } catch (error) { console.error(error) }
            });
            if (originalNextBlock) {
                ancestor_block.nextConnection.connect(originalNextBlock.previousConnection); // Reconnect the next block
            }
        }
        block_to_code_map[block.id] = {
            horizontal_ancestor_block_id: ancestor_block_ID,
            code: code,
        };
    });
    return block_to_code_map;
}

function getCodeFromBlockID(workspace, target_block_ID, programming_language) {
    const xmlString = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
    const ancestor_block = workspace.getBlockById(findHorizontalAncestorBlockId(xmlString, target_block_ID));
    const originalNextBlock = ancestor_block.nextConnection && ancestor_block.nextConnection.targetBlock();
    if (originalNextBlock) {
        ancestor_block.nextConnection.disconnect(); // Disconnect the next block
    }
    let code = Blockly[programming_language].blockToCode(ancestor_block); // Generate code for just this block (and its nested children)
    if (originalNextBlock) {
        ancestor_block.nextConnection.connect(originalNextBlock.previousConnection); // Reconnect the next block
    }
    return code;
}

Blockly_Debugger.actions["Highlight"].handler = (block) => {
    // Find the workspace the target block is in
    const CurrentSystemEditorId = window.workspace["blockly1"].getBlockById(block.id)
        ? "blockly1"
        : "blockly2";
    const workspace = window.workspace[CurrentSystemEditorId];
    workspace.highlightBlock(""); // remove all block highlights
    if(Blockly_Debugger.actions["Highlight"].highlightedBlockID !== block.id) {
        workspace.highlightBlock(block.id, true); // highlight target block only
        Blockly_Debugger.actions["Highlight"].highlightedBlockID = block.id; // update highlighted block id
        // Highlight text editor code lines for each PL
        Object.keys(ProgrammingLanguages).forEach((element) => {
            let [editor, prog_language] = PL_to_editor(element);
            Blockly[prog_language].variableDB_.setVariableMap(workspace.getVariableMap()); // Set the variable map for the language
            // remove code editor highlights
            for (let i = 0; i < editor.lineCount(); i++)
                editor.removeLineClass(i, "wrap", "highlight-line");
            // Get the line of code containing the block generated code
            const code = getCodeFromBlockID(
                workspace,
                block.id,
                prog_language
            );
            // Highlight corresponding code lines
            const lineCount = editor.lineCount();
            for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
                const lineContent = editor.getLine(lineNumber).trim();
                if (lineContent === code.trim()) {
                    let info = editor.lineInfo(lineNumber);
                    if (!info.wrapClass || !info.wrapClass.includes("highlight-line")) {
                        // line not highlighted
                        editor.addLineClass(lineNumber, "wrap", "highlight-line");
                    } else {
                        // line already highlighted
                        editor.removeLineClass(lineNumber, "wrap", "highlight-line");
                    }
                    break;
                }
            }
        });
    } else { // Remove highlight if block is already highlighted
        Object.keys(ProgrammingLanguages).forEach((element) => {
            let [editor, ] = PL_to_editor(element);
            // remove code editor highlights
            for (let i = 0; i < editor.lineCount(); i++)
                editor.removeLineClass(i, "wrap", "highlight-line");
        });
        Blockly_Debugger.actions["Highlight"].highlightedBlockID = undefined;
    }
};

Blockly_Debugger.actions["Highlight"].menuOption = (block) => {
    const highlightOption = {
        text:
            !Blockly_Debugger.actions["Highlight"].highlightedBlockID ||
            block.id !== Blockly_Debugger.actions["Highlight"].highlightedBlockID
                ? "Highlight Block & Code"
                : "Remove Highlight",
        enabled: true,
        callback: function () {
            Blockly_Debugger.actions["Highlight"].handler(block);
        },
    };
    return highlightOption;
};

// Breakpoints
Blockly_Debugger.actions["Breakpoint"].breakpoints = [];

Blockly_Debugger.actions["Breakpoint"].handler = () => {
    if (!Debuggee_Worker.hasInstance()) return;
    Debuggee_Worker.Instance().postMessage({
        type: "breakpoint",
        data: Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
            return { block_id: obj.block_id, enable: obj.enable };
        }),
    });
};

Blockly_Debugger.actions["Breakpoint"].wait_view = (block_id) => {
    var CurrentSystemEditorId = window.workspace["blockly1"].getBlockById(block_id)
        ? "blockly1"
        : "blockly2";
    var block = window.workspace[CurrentSystemEditorId].getBlockById(block_id);
    while (block != null) {
        block.setCollapsed(false);
        block = block.parentBlock_;
    }
    window.workspace[CurrentSystemEditorId].traceOn_ = true; // hilighting (gt den kanei an einai collapsed)
    window.workspace[CurrentSystemEditorId].highlightBlock(block_id);

    document.getElementById(block_id).style.stroke = "red";
    document.getElementById(block_id).style.fill = "yellow";
    document.getElementById(block_id).style["stroke-width"] = "5px";
};

Blockly_Debugger.actions["Breakpoint"].reset_view = (block_id) => {
    let block_breakpoint_index = Blockly_Debugger.actions["Breakpoint"].breakpoints
        .map((obj) => {
            return obj.block_id;
        })
        .indexOf(block_id);
    // keep breakpoint statuses according to their enable state when ereseting view
    if (block_breakpoint_index != -1) {
        const isEnabled = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => { return obj.enable });
        if(!isEnabled[block_breakpoint_index]) {
            document.getElementById(block_id).style.stroke = "yellow";
            document.getElementById(block_id).style.fill = "grey";
            document.getElementById(block_id).style["stroke-width"] = "1px";
        } else {
            document.getElementById(block_id).style.stroke = "yellow";
            document.getElementById(block_id).style.fill = "red";
            document.getElementById(block_id).style["stroke-width"] = "1px";
        }
    }
};

Blockly_Debugger.actions["Breakpoint"].disable = (block_id) => {
    var i = Blockly_Debugger.actions["Breakpoint"].breakpoints
        .map((obj) => {
            return obj.block_id;
        })
        .indexOf(block_id);
    if (i != -1) {
        document.getElementById(block_id).style.stroke = "yellow";
        document.getElementById(block_id).style.fill = "grey";
        document.getElementById(block_id).style["stroke-width"] = "1px";
        Blockly_Debugger.actions["Breakpoint"].breakpoints[i].enable = false;
        Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints(); // update breakpoint gutters when disabling a block
        if (Debuggee_Worker.hasInstance())
            Debuggee_Worker.Instance().postMessage({
                type: "breakpoint",
                data: Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
                    return { block_id: obj.block_id, enable: obj.enable };
                }),
            });
    }
};

Blockly_Debugger.actions["Breakpoint"].enable = (block_id) => {
    var i = Blockly_Debugger.actions["Breakpoint"].breakpoints
        .map((obj) => {
            return obj.block_id;
        })
        .indexOf(block_id);
    if (i != -1) {
        document.getElementById(block_id).style.fill = "red";
        Blockly_Debugger.actions["Breakpoint"].breakpoints[i].enable = true;
        Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints(); // update breakpoint gutters when enabling a block
        if (Debuggee_Worker.hasInstance())
            Debuggee_Worker.Instance().postMessage({
                type: "breakpoint",
                data: Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
                    return { block_id: obj.block_id, enable: obj.enable };
                }),
            });
    }
};

// Blockly_Debugger.actions["Breakpoint"].menuOption = (block) => {
//     var breakpointOption = {
//         text: !Blockly_Debugger.actions["Breakpoint"].breakpoints
//             .map((obj) => {
//                 return obj.block_id;
//             })
//             .includes(block.id)
//             ? "Add Breakpoint"
//             : "Remove Breakpoint",
//         enabled: true,
//         callback: function () {
//             if (
//                 !Blockly_Debugger.actions["Breakpoint"].breakpoints
//                     .map((obj) => {
//                         return obj.block_id;
//                     })
//                     .includes(block.id)
//             ) {
//                 var new_br = {
//                     block_id: block.id,
//                     enable: true,
//                     icon: new Breakpoint_Icon(block),
//                     change: false,
//                 };
//                 Blockly_Debugger.actions["Breakpoint"].breakpoints.push(new_br);
//                 block.setCollapsed(false); // gia na anoigei otan exw breakpoint
//             } else {
//                 var icon = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
//                     if (obj.block_id === block.id) return obj.icon;
//                 });
//                 icon[0].myDisable();
//                 var index = Blockly_Debugger.actions["Breakpoint"].breakpoints
//                     .map((obj) => {
//                         return obj.block_id;
//                     })
//                     .indexOf(block.id);
//                 if (index !== -1)
//                     Blockly_Debugger.actions["Breakpoint"].breakpoints.splice(index, 1);
//             }
//             Blockly_Debugger.actions["Breakpoint"].handler();            
//         },
//     };
//     return breakpointOption;
// };

Blockly_Debugger.actions["Breakpoint"].disableMenuOption = (block) => {
    var DisableBreakpointOption = {
        text: Blockly_Debugger.actions["Breakpoint"].breakpoints
            .map((obj) => {
                if (obj.enable) return obj.block_id;
            })
            .includes(block.id)
            ? "Disable Breakpoint"
            : "Enable Breakpoint",
        enabled: Blockly_Debugger.actions["Breakpoint"].breakpoints
            .map((obj) => {
                return obj.block_id;
            })
            .includes(block.id)
            ? true
            : false,
        callback: function () {
            if (
                Blockly_Debugger.actions["Breakpoint"].breakpoints
                    .map((obj) => {
                        if (obj.enable) return obj.block_id;
                    })
                    .includes(block.id)
            )
                Blockly_Debugger.actions["Breakpoint"].disable(block.id);
            else Blockly_Debugger.actions["Breakpoint"].enable(block.id);
        },
    };
    return DisableBreakpointOption;
};

// // Function to generate JSON object containing generated code and line number for each block in the workspace
// function generate_block_to_code_mapping_for_workspace(workspace, language) {
//   var block_to_code_mapping = {};
//   // Generate code for the entire workspace
//   var generatedCode = Blockly[language].workspaceToCode(workspace);
//   Blockly[language].variableDB_.setVariableMap(workspace.getVariableMap());
//   // Iterate over all blocks in the workspace
//   workspace.getAllBlocks().forEach(function (block) {
//     var block_code = "";
//     if (block.type === "procedures_defnoreturn" || block.type === "procedures_callnoreturn") {
//       let func_name = Blockly[language].variableDB_.getName(
//         block.getFieldValue("NAME"),
//         Blockly.Procedures.NAME_TYPE
//       );
//       block_code = block.type === "procedures_defnoreturn" ? "def " + func_name : func_name + "()";
//     } else {
//         block_code = Blockly[language].blockToCode(block);
//         if (Array.isArray(block_code) /*isValueBlock(block)*/) {
//           block_code = Blockly[language].blockToCode(block)[0]; // code string only
//         } else {
//           block_code = Blockly[language].blockToCode(block).split("\n")[0]; // code string only w/o proceeding blocks
//           block_code = block_code.replace(/count[0-9]/g, "count");
//         }
//     }
//     let lineNumber = 1; // Start line number at 1
//     let lines = generatedCode.split("\n");
//     let blockFound = false;
//     // Iterate over lines to find the block
//     for (var i = 0; i < lines.length; i++) {
//       // Check if the current line contains the block's ID
//       if (lines[i].includes(block_code)) {
//         blockFound = true;
//         break;
//       }
//       // Increment line number
//       lineNumber++;
//     }
//     // Add block information to the block_to_code_mapping object
//     block_to_code_mapping[block.id] = {
//       code: block_code,
//       lineNumber: blockFound ? lineNumber : null,
//     };
//   });

//   return block_to_code_mapping;
// }

// Returns a map of all ancestor blocks to an array of blocks that are its' offspring
export function groupBlocksByAncestor() {
    const result = {};
    // Process each block
    for (const [blockId, blockData] of Object.entries(Blockly_Debuggee.state.currBlockToCodeMapping)) {
      const ancestorId = blockData.horizontal_ancestor_block_id;
      // Initialize the array for this ancestor if it doesn't exist
      if (!result[ancestorId]) {
        result[ancestorId] = [];
      }
      // Add the current block ID to the ancestor's array
      result[ancestorId].push(blockId);
    }
    return result;
  }

// triggers breakpoint gutters on a given CodeMirror editor and language,
// returns a BreakpointIO JSON for importing breakpoints in VS code (using BreakpointIO Extention)
export function triggerGutterBreakpointsFromBlockly(workspace, language, editor) {
    // Blockly[language].init(workspace); // Initialize Blockly for the given language
    const block_to_code_mapping = getBlockToCodeMapping(workspace); // Generate block to code mapping
    Blockly_Debuggee.state.currBlockToCodeMapping = block_to_code_mapping;
    const grouped_ancestor_to_blocks = groupBlocksByAncestor();

    const breakpointIO = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
        if (!block_to_code_mapping[obj.block_id]) return; // current block has no breakpoint, skip
        let code_line_has_enabled_bp = false;
        let code_line_has_disabled_bp = false;
        try { // set code breakpoint gutters for each block id with a brekapoint
            let horizontal_ancestor_block_id = block_to_code_mapping[obj.block_id].horizontal_ancestor_block_id;
            let ancestor_array = grouped_ancestor_to_blocks[horizontal_ancestor_block_id];
            code_line_has_enabled_bp = ancestor_array.some( // check any of the ancestor array blocks has an enabled breakpoint
                (curr_id) => {
                    // check if current element in group has an enabled breakpoint
                    let breakpointed_ancestor_array_element = Blockly_Debugger.actions["Breakpoint"].breakpoints.find(bp => bp.block_id === curr_id);
                    return (breakpointed_ancestor_array_element && breakpointed_ancestor_array_element.enable);
                }
            )
            code_line_has_disabled_bp = ancestor_array.some( // check if any of the ancestor array blocks has a disabled breakpoint
                (curr_id) => {
                    // check if current element in group has a disabled breakpoint
                    let breakpointed_ancestor_array_element = Blockly_Debugger.actions["Breakpoint"].breakpoints.find(bp => bp.block_id === curr_id);
                    return (breakpointed_ancestor_array_element && !breakpointed_ancestor_array_element.enable);
                }
            )
            let line_number = block_to_code_mapping[obj.block_id].code[language].lineNumber - 1;
            // let info = editor.lineInfo(line_number);
            // if (!info.gutterMarkers) // line has no breakpoint, add one 
            if(code_line_has_enabled_bp){ // enabled bp
                editor.setGutterMarker(line_number, "breakpoints", createBreakpointMarker(true));
            } else if(code_line_has_disabled_bp) { // disabled bp
                editor.setGutterMarker(line_number, "breakpoints", createBreakpointMarker(false));
            }
        } catch (err) {
            console.log(err);
        }
        return { // return BreakpointIO JSON
            location: "<IDE-program-path>",
            block_id: obj.block_id,
            line: [
                { line: block_to_code_mapping[obj.block_id].code[language].lineNumber - 1, character: 0 },
                { line: block_to_code_mapping[obj.block_id].code[language].lineNumber - 1, character: 0 },
            ],
            enabled: obj.enable,
            code: block_to_code_mapping[obj.block_id].code[language].ancestor_block_code,
        };
    });
    return breakpointIO; // return breakpointIO JSON
}

// returns a breakpoint marker icon for a CodeMirror breakpoint gutter
export function createBreakpointMarker(isEnabled = true) {
    const marker = document.createElement("div");
    marker.innerHTML = "●";
    marker.classList.add("breakpoint-marker");
    if(isEnabled){
        marker.classList.remove("disabled")
        marker.classList.add("enabled");
    } else {
        marker.classList.remove("enabled");
        marker.classList.add("disabled");
    }
    return marker;
}

export let breakpointIO_export = [];

Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints = () => {
    const workspace = Blockly.getMainWorkspace();
    Object.keys(ProgrammingLanguages).forEach((element) => {
        let [editor, chosen_language] = PL_to_editor(element);
        editor.clearGutter("breakpoints"); // remove all breakpoint gutters
        let breakpointIO_result = triggerGutterBreakpointsFromBlockly(workspace, chosen_language, editor); // generate updated breakpoint gutters
        breakpointIO_export[ProgrammingLanguages[element]] = breakpointIO_result;
        BreakpointIOEditor.setValue(JSON.stringify(breakpointIO_export[ProgrammingLanguages[Blockly_Debuggee.state.exportedProgrammingLanguage]], null, 2));
    });
};

Blockly_Debugger.actions["DownloadExportBreakpoints"] = {};
Blockly_Debugger.actions["DownloadExportBreakpoints"].handler = () => {
    const res = JSON.stringify(
    breakpointIO_export[ProgrammingLanguages[Blockly_Debuggee.state.exportedProgrammingLanguage]],
    null,
    2
    );
    // download breakpoints.JSON
    const content = !res ? "[]" : res;
    const fileName = "breakpoints.JSON";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const temp_a_element = document.createElement("a");
    temp_a_element.setAttribute("href", url);
    temp_a_element.setAttribute("download", fileName);
    temp_a_element.click();
    temp_a_element.remove();
};

Blockly_Debugger.actions["CopyBreakpointsToClipboard"] = {};
Blockly_Debugger.actions["CopyBreakpointsToClipboard"].handler = () => {
    const res = JSON.stringify(
        breakpointIO_export[ProgrammingLanguages[Blockly_Debuggee.state.exportedProgrammingLanguage]],
        null,
        2
    );
    !res ? copyToClipboard("[]") : copyToClipboard(res);
};

// Run to Cursor
Blockly_Debugger.actions["RunToCursor"].handler = (block_id) => {
    if (!Debuggee_Worker.hasInstance()) {
        Blockly_Debugger.actions["Start"].handler(block_id);
        return;
    }
    Debuggee_Worker.Instance().postMessage({ type: "runToCursor", data: block_id });
};

Blockly_Debugger.actions["RunToCursor"].menuOption = (block) => {
    var runToCursorOption = {
        text: "Run to cursor",
        enabled: true,
        callback: function () {
            Blockly_Debugger.actions["RunToCursor"].handler(block.id);
        },
    };
    return runToCursorOption;
};

Debuggee_Worker.AddOnDispacher(
    "breakpoint_wait_view",
    Blockly_Debugger.actions["Breakpoint"].wait_view
);
Debuggee_Worker.AddOnDispacher(
    "breakpoint_reset_view",
    Blockly_Debugger.actions["Breakpoint"].reset_view
);
