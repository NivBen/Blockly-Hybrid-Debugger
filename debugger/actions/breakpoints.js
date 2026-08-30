import { Debuggee_Worker, Blockly_Debugger } from "../init.js";
import { Blockly_Debuggee } from "../../debuggee/init.js";
import { PL_to_editor, ProgrammingLanguages, BreakpointIOEditor, refreshExportBreakpointsPreview } from "../../dummy_IDE/index.js";
import { copyToClipboard, highlightBlockCodeRange, removeCodeLineHighlight } from "../../dummy_IDE/utils.js";

Blockly_Debugger.actions["Highlight"] = {};
Blockly_Debugger.actions["Breakpoint"] = {};
Blockly_Debugger.actions["RunToCursor"] = {};

// Highlight block and corresponding code lines
Blockly_Debugger.actions["Highlight"].highlightedBlockID = undefined;

// Find and return the block ID who is the horizontal ansector of the taget block
function findHorizontalAncestorBlockId(blockElement) {
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
    return blockElement ? findAncestorRecursivley(blockElement) : null;
}

// Returns every line of the workspace code the block's own code could start on. Lines are
// compared whole and trimmed: whole, so `x = 1` no longer matches the line `x = 10`, and
// trimmed, so a block indented deeper in the workspace than when generated on its own
// (dart wraps the program in main(), a loop body is indented) still matches its own text.
function findCandidateStartLines(workspace_lines, block_code_lines) {
    const candidates = [];
    if (!block_code_lines.length) return candidates;
    for (let line = 0; line + block_code_lines.length <= workspace_lines.length; line++) {
        const matches = block_code_lines.every(
            (block_code_line, offset) => workspace_lines[line + offset] === block_code_line);
        if (matches) candidates.push(line);
    }
    return candidates;
}

/*
    Resolves each horizontal ancestor to the line its generated code starts on, returning a
    map of ancestor block id to a 1 based line number.

    The ancestors arrive in document order, the order the generator walks them, so their
    code appears in the output in that same order - each block starts below the one before
    it, and the scan only has to look forward from the last match. That is what tells two
    identical statements apart: the second one can no longer resolve to the first one's line.
    Nesting keeps the order, a block's body is emitted right below its first line, so the
    cursor advances one line past a match rather than past the block's whole span.

    The generator hoists definitions - procedures, helper functions, imports - to the top of
    the output, ahead of the blocks that come before them in the workspace. A block whose
    code is not found ahead of the cursor therefore falls back to the first line no other
    block has claimed, and the cursor follows it there.
*/
function resolveAncestorLineNumbers(workspace_code, ancestor_ids, own_code_per_ancestor) {
    const workspace_lines = workspace_code.split("\n").map((line) => line.trim());
    const claimed_start_lines = new Set();
    const line_number_per_ancestor = {};
    let cursor = 0;
    ancestor_ids.forEach((ancestor_id) => {
        const own_code = own_code_per_ancestor[ancestor_id];
        if (!own_code) return; // block generates no code in this language
        const candidates = findCandidateStartLines(
            workspace_lines, own_code.split("\n").map((line) => line.trim()))
            .filter((candidate) => !claimed_start_lines.has(candidate));
        const start_line = candidates.find((candidate) => candidate >= cursor);
        const resolved_line = (start_line !== undefined) ? start_line : candidates[0];
        if (resolved_line === undefined) return; // no match, the block keeps a null line number
        claimed_start_lines.add(resolved_line);
        cursor = resolved_line + 1;
        line_number_per_ancestor[ancestor_id] = resolved_line + 1; // stored 1 based
    });
    return line_number_per_ancestor;
}

// Generates each horizontal ancestor's own code, in every language, as a map of language to
// ancestor block id to code. The block is generated on its own with its next connection
// detached, the chain below it belongs to the following blocks. Events stay off around that
// detour: the workspace is put back exactly as it was, and a measurement has no business
// landing on the user's undo stack or waking the workspace change listeners.
function generateAncestorCode(workspace, ancestor_ids) {
    const own_code_per_language = {};
    Object.keys(ProgrammingLanguages).forEach((element) => {
        own_code_per_language[PL_to_editor(element)[1]] = {};
    });
    ancestor_ids.forEach((ancestor_id) => {
        const ancestor_block = workspace.getBlockById(ancestor_id);
        if (!ancestor_block) return;
        const originalNextBlock = ancestor_block.nextConnection && ancestor_block.nextConnection.targetBlock();
        Blockly.Events.disable();
        try {
            if (originalNextBlock) ancestor_block.nextConnection.disconnect(); // Disconnect the next block
            // generate code in all PLs
            Object.keys(ProgrammingLanguages).forEach((element) => {
                const [, prog_language] = PL_to_editor(element);
                try {
                    // generators that emit helper functions (python's upRange, php's list helpers, ...)
                    // read definitions_ / functionNames_, which only exist after init() - without it
                    // blockToCode throws and the block gets no code mapping at all for that language
                    Blockly[prog_language].init(workspace);
                    Blockly[prog_language].variableDB_.setVariableMap(workspace.getVariableMap()); // Set the variable map for the language
                    const generated_code = Blockly[prog_language].blockToCode(ancestor_block);
                    // value blocks return a [code, precedence] tuple, statement blocks a string
                    const own_code = (Array.isArray(generated_code) ? generated_code[0] : generated_code).trim();
                    if (own_code) own_code_per_language[prog_language][ancestor_id] = own_code;
                } catch (error) { console.error(error) }
            });
        } finally {
            if (originalNextBlock) {
                ancestor_block.nextConnection.connect(originalNextBlock.previousConnection); // Reconnect the next block
            }
            Blockly.Events.enable();
        }
    });
    return own_code_per_language;
}

/*
    Get workspace and returns the following map for each block ID:
    block_id: { 
     horizontal_ancestor_block_id, 
     code: { <language>: { ancestor_block_code, lineNumber, lineCount } }
    }
*/
export function getBlockToCodeMapping(workspace) {
    const xmlString = Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(workspace));
    // the workspace xml is parsed once for every block. its <block> elements come in the
    // order the generator emits them - both workspaceToDom and workspaceToCode walk
    // getTopBlocks(true) and descend depth first - which is what lets a line number be
    // resolved by position rather than by searching the whole file for matching text
    const xmlDoc = new DOMParser().parseFromString(xmlString, "text/xml");
    const ancestor_of_block = {};
    const ancestor_ids_in_generation_order = [];
    xmlDoc.querySelectorAll("block").forEach((blockElement) => { // <shadow> elements are not blocks
        const ancestor_block_ID = findHorizontalAncestorBlockId(blockElement);
        ancestor_of_block[blockElement.getAttribute("id")] = ancestor_block_ID;
        if (ancestor_block_ID && !ancestor_ids_in_generation_order.includes(ancestor_block_ID)) {
            ancestor_ids_in_generation_order.push(ancestor_block_ID);
        }
    });

    const block_to_code_map = {};
    workspace.getAllBlocks(false).forEach(block => {
        if (block.isShadow()) return;// Skip shadow blocks
        block_to_code_map[block.id] = {
            horizontal_ancestor_block_id: ancestor_of_block[block.id] || null,
            code: {},
        };
    });

    const own_code_per_language = generateAncestorCode(workspace, ancestor_ids_in_generation_order);
    Object.keys(ProgrammingLanguages).forEach((element) => {
        const [, prog_language] = PL_to_editor(element);
        const own_code_per_ancestor = own_code_per_language[prog_language];
        let workspace_generated_code;
        try {
            // the haystack is generated once per language, and generated the same way the
            // code editors are, so a resolved line number always points at the line the user
            // is looking at
            workspace_generated_code = Blockly[prog_language].workspaceToCode(workspace);
        } catch (error) { console.error(error); return; } // language failed to generate, no mapping
        const line_number_per_ancestor = resolveAncestorLineNumbers(
            workspace_generated_code, ancestor_ids_in_generation_order, own_code_per_ancestor);
        Object.values(block_to_code_map).forEach((block_data) => {
            const own_code = own_code_per_ancestor[block_data.horizontal_ancestor_block_id];
            if (!own_code) return; // the ancestor generates no code in this language
            const lineNumber = line_number_per_ancestor[block_data.horizontal_ancestor_block_id];
            block_data.code[prog_language] = {
                ancestor_block_code: own_code, // horizontal ancestor block generated code
                lineNumber: (lineNumber === undefined) ? null : lineNumber, // start line number
                lineCount: own_code.split("\n").length, // number of code lines the block spans
            };
        });
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
    refreshExportBreakpointsPreview(); // mirror the redrawn gutter into the export modal
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
