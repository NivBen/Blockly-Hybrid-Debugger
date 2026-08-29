import { Debuggee_Worker, Blockly_Debugger } from "../init.js";
import { Blockly_Debuggee } from "../../debuggee/init.js";
import { PL_to_editor, ProgrammingLanguages, BreakpointIOEditor } from "../../dummy_IDE/index.js";
import { copyToClipboard, highlightBlockCodeRange, removeCodeLineHighlight } from "../../dummy_IDE/utils.js";

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
                try {
                    // generators that emit helper functions (python's upRange, php's list helpers, ...)
                    // read definitions_ / functionNames_, which only exist after init() - without it
                    // blockToCode throws and the block gets no code mapping at all for that language
                    Blockly[prog_language].init(workspace);
                    Blockly[prog_language].variableDB_.setVariableMap(workspace.getVariableMap()); // Set the variable map for the language
                    let ancestor_block_code = Blockly[prog_language].blockToCode(ancestor_block).trim(); // horizontal ancestor block generated code
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
                        lineCount: ancestor_block_code.split("\n").length, // number of code lines the block spans
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
        const block_to_code_mapping = getBlockToCodeMapping(workspace);
        const block_code = block_to_code_mapping[block.id] && block_to_code_mapping[block.id].code;
        Object.keys(ProgrammingLanguages).forEach((element) => {
            let [editor, prog_language] = PL_to_editor(element);
            // remove code editor highlights
            removeCodeLineHighlight(editor, "highlight-line");
            // highlight every line the block generates, not only the one its code starts on
            highlightBlockCodeRange(editor, block_code && block_code[prog_language], "highlight-line");
        });
    } else { // Remove highlight if block is already highlighted
        Object.keys(ProgrammingLanguages).forEach((element) => {
            let [editor, ] = PL_to_editor(element);
            // remove code editor highlights
            removeCodeLineHighlight(editor, "highlight-line");
        });
        Blockly_Debugger.actions["Highlight"].highlightedBlockID = undefined;
    }
};

Blockly_Debugger.actions["Highlight"].menuOption = (block) => {
    const highlightOption = {
        text:
            !Blockly_Debugger.actions["Highlight"].highlightedBlockID ||
            block.id !== Blockly_Debugger.actions["Highlight"].highlightedBlockID
                ? "🔎 Highlight Block & Code"
                : "❌🔎Remove Highlight",
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
            ? "⚪ Disable Breakpoint"
            : "🔴 Enable Breakpoint",
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

// Returns, per language, a map of code line number (0 based) to the block groups whose
// generated code covers that line, ordered innermost first. A group holds every block
// sharing one horizontal ancestor, leads with that ancestor - the block a new breakpoint
// belongs on - and reports first_line, the line its generated code starts on.
export function getLineToBlockGroupsMapping(workspace) {
    const block_to_code_mapping = getBlockToCodeMapping(workspace);
    const grouped_ancestor_to_blocks = {};
    for (const [blockId, blockData] of Object.entries(block_to_code_mapping)) {
        const ancestorId = blockData.horizontal_ancestor_block_id;
        if (!grouped_ancestor_to_blocks[ancestorId]) grouped_ancestor_to_blocks[ancestorId] = [];
        if (blockId === ancestorId) grouped_ancestor_to_blocks[ancestorId].unshift(blockId);
        else grouped_ancestor_to_blocks[ancestorId].push(blockId);
    }
    const result = {};
    Object.keys(ProgrammingLanguages).forEach((element) => {
        const [, prog_language] = PL_to_editor(element);
        const groups_per_line = {};
        for (const block_ids of Object.values(grouped_ancestor_to_blocks)) {
            // every block of a group shares the ancestor's generated code
            const code = block_to_code_mapping[block_ids[0]].code[prog_language];
            if (!code || !code.lineNumber) continue; // block has no code in this language
            const first_line = code.lineNumber - 1;
            for (let line = first_line; line < first_line + code.lineCount; line++) {
                if (!groups_per_line[line]) groups_per_line[line] = [];
                groups_per_line[line].push({ first_line, line_count: code.lineCount, block_ids });
            }
        }
        result[prog_language] = {};
        for (const [line, groups] of Object.entries(groups_per_line)) {
            // innermost first: the group that starts latest, then the one spanning fewest lines
            groups.sort((a, b) => (b.first_line - a.first_line) || (a.line_count - b.line_count));
            result[prog_language][line] = groups;
        }
    });
    return result;
}

// triggers breakpoint gutters on a given CodeMirror editor and language,
// returns a BreakpointIO JSON for importing breakpoints in VS code (using BreakpointIO Extention)
export function triggerGutterBreakpointsFromBlockly(workspace, language, editor) {
    // Blockly[language].init(workspace); // Initialize Blockly for the given language
    const block_to_code_mapping = getBlockToCodeMapping(workspace); // Generate block to code mapping
    Blockly_Debuggee.state.currBlockToCodeMapping = block_to_code_mapping;
    const grouped_ancestor_to_blocks = groupBlocksByAncestor();
    const breakpoint_ranges = []; // one entry per breakpointed block, drawn together below
    let line_number;
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
            const generated_code_line = block_to_code_mapping[obj.block_id].code[language];
            line_number = (!generated_code_line) ? -1 : block_to_code_mapping[obj.block_id].code[language].lineNumber - 1; // -1 in case of error

            // the breakpointed block may generate several code lines, the whole range gets a bracket
            if(line_number != -1 && (code_line_has_enabled_bp || code_line_has_disabled_bp)) {
                breakpoint_ranges.push({
                    first_line: line_number,
                    last_line: Math.min(line_number + generated_code_line.lineCount - 1, editor.lineCount() - 1),
                    enabled: code_line_has_enabled_bp, // an enabled bp takes precedence over a disabled one
                });
            }
        } catch (err) {
            console.log(err);
        }

        return { // return BreakpointIO JSON
            location: "<IDE-program-path>",
            programming_language: (language === "UneditedJavaScript") ? "JavaScript" : language,
            block_id: obj.block_id,
            line: [
                { line: line_number, character: 0 },
                { line: line_number, character: 0 },
            ],
            enabled: obj.enable,
            code: (line_number === -1) ? "Error genereting code line" 
                : block_to_code_mapping[obj.block_id].code[language].ancestor_block_code,
        };
    });
    drawBreakpointGutter(editor, breakpoint_ranges); // draw the dots and their brackets
    return breakpointIO; // return breakpointIO JSON
}

const BRACKET_LANE_WIDTH = 8; // px reserved per nesting level of brackets

// draws every breakpoint's dot and the bracket spanning its block's code lines.
// a bracket nested inside another gets its own lane, so an inner block's bracket never
// interrupts the one drawn around it
function drawBreakpointGutter(editor, ranges) {
    // several breakpoints can sit on blocks sharing one horizontal ancestor - they are one bracket
    const ranges_by_first_line = new Map();
    ranges.forEach((range) => {
        const merged = ranges_by_first_line.get(range.first_line);
        if (!merged) ranges_by_first_line.set(range.first_line, Object.assign({}, range));
        else {
            merged.enabled = merged.enabled || range.enabled;
            merged.last_line = Math.max(merged.last_line, range.last_line);
        }
    });
    const unique_ranges = [...ranges_by_first_line.values()];
    // lane 0 is the outermost bracket, each enclosed bracket moves one lane towards the code
    unique_ranges.forEach((range) => {
        range.lane = unique_ranges.filter((other) => other !== range
            && other.first_line <= range.first_line && other.last_line >= range.last_line).length;
    });
    // reserve room for the deepest nesting so no bracket lands under the code
    const lanes = unique_ranges.reduce((deepest, range) => Math.max(deepest, range.lane + 1), 1);
    editor.getWrapperElement().style.setProperty("--breakpoint-lanes", lanes);

    const marker_per_line = new Map();
    const markerForLine = (line) => {
        if (!marker_per_line.has(line)) marker_per_line.set(line, createBreakpointMarker());
        return marker_per_line.get(line);
    };
    unique_ranges.forEach((range) => addBreakpointDot(markerForLine(range.first_line), range.enabled));
    unique_ranges.forEach((range) => {
        if (range.last_line === range.first_line) return; // single code line, the dot says it all
        for (let line = range.first_line; line <= range.last_line; line++) {
            const segment = line === range.first_line ? "start"
                : (line === range.last_line ? "end" : "middle");
            markerForLine(line).appendChild(createBracketSegment(range.enabled, segment, range.lane));
        }
    });
    marker_per_line.forEach((marker, line) => editor.setGutterMarker(line, "breakpoints", marker));
    editor.refresh(); // re-measure the gutter, its width follows the nesting depth
}

// returns an empty marker for a CodeMirror breakpoint gutter line, the container
// a breakpoint dot and any bracket segments crossing that line are drawn in
export function createBreakpointMarker() {
    const marker = document.createElement("div");
    marker.classList.add("breakpoint-marker");
    return marker;
}

// draws a breakpoint dot in a gutter marker
function addBreakpointDot(marker, isEnabled = true) {
    const dot = document.createElement("span");
    dot.innerHTML = "●";
    dot.classList.add("breakpoint-dot");
    dot.classList.add(isEnabled ? "enabled" : "disabled");
    marker.appendChild(dot);
    return marker;
}

// returns one line's piece of a bracket: its top arm, a straight run, or its closing arm
function createBracketSegment(isEnabled, segment, lane) {
    const bracket = document.createElement("span");
    bracket.classList.add("breakpoint-bracket");
    bracket.classList.add(segment);
    bracket.classList.add(isEnabled ? "enabled" : "disabled");
    bracket.style.left = `${18 + lane * BRACKET_LANE_WIDTH}px`;
    return bracket;
}

export let breakpointIO_export = [];

Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints = () => {
    const workspace = Blockly.getMainWorkspace();
    Object.keys(ProgrammingLanguages).forEach((element) => {
        let [editor, chosen_language] = PL_to_editor(element);
        editor.clearGutter("breakpoints"); // remove all breakpoint gutters
        let breakpointIO_result = triggerGutterBreakpointsFromBlockly(workspace, chosen_language, editor); // generate updated breakpoint gutters
        breakpointIO_export[ProgrammingLanguages[element]] = breakpointIO_result;
        if (Blockly_Debuggee.state.exportedProgrammingLanguage === element) { // update export editor to target langauge only
            BreakpointIOEditor.setValue(JSON.stringify(breakpointIO_export[ProgrammingLanguages[Blockly_Debuggee.state.exportedProgrammingLanguage]], null, 2)); // updated exported JSON display
        }
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
        text: "👆🏼 Run to cursor",
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
