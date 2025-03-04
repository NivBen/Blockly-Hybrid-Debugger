import { Debuggee_Worker, Blockly_Debugger } from "../init.js";
// import { PL_to_editor } from "../../dummy_IDE/index.js";
import { PL_to_editor, ProgrammingLanguages, copyToClipboard } from "../../dummy_IDE/index.js";
import { Blockly_Debuggee } from "../../debuggee/init.js";

Blockly_Debugger.actions["Highlight"] = {};
Blockly_Debugger.actions["Breakpoint"] = {};
Blockly_Debugger.actions["RunToCursor"] = {};

// Highlight block and corresponding code lines
Blockly_Debugger.actions["Highlight"].highlightedBlockID = undefined;

function getLineCodeFromXml(workspace, blockId, programming_language) {
    // Convert the workspace to XML
    const xmlDom = Blockly.Xml.workspaceToDom(workspace);
    const xmlText = Blockly.Xml.domToText(xmlDom);
    // Split the XML by <next> tags
    const xmlParts = xmlText.split(/<\/?next[^>]*>/g);
    // Find the part that contains the block ID
    let blockXml = "";
    for (const part of xmlParts) {
        if (part.includes(`id="${blockId}"`)) {
            blockXml = part;
            break;
        }
    }
    if (!blockXml) {
        return ""; // Block ID not found
    }
    blockXml = `${blockXml}</block>`;
    // Wrap the block XML in a <xml> root element
    if (!blockXml.includes("<xml")) {
        blockXml = `<xml>${blockXml}`;
    }
    blockXml = `${blockXml}</xml>`;

    // Create a temporary workspace to convert the XML back to blocks
    const tempWorkspace = new Blockly.Workspace();
    Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(blockXml), tempWorkspace);
    // Generate the code for the block
    const blockCode = Blockly[programming_language].workspaceToCode(tempWorkspace);
    // Clean up the temporary workspace
    tempWorkspace.dispose();

    // Split the code into lines
    const codeLines = blockCode.split("\n");
    // Remove variable definitions (lines starting with "var ")
    const filteredLines = codeLines.filter((line) => !line.trim().startsWith("var"));
    // Join the remaining lines to form the final code
    return filteredLines.join("\n").trim();
}

Blockly_Debugger.actions["Highlight"].handler = (block) => {
    // TODO: change to Blockly_Debuggee.state.mainProgrammingLanguage
    const language = "UneditedJavaScript"; // default language
    // search in which editor the block is
    const CurrentSystemEditorId = window.workspace["blockly1"].getBlockById(block.id)
        ? "blockly1"
        : "blockly2";
    let editor = "";
    let chosen_language = "";
    if (
        !Blockly_Debugger.actions["Highlight"].highlightedBlockID ||
        Blockly_Debugger.actions["Highlight"].highlightedBlockID !== block.id
    ) {
        // highlight new block and remove highlight from previous block
        Blockly_Debugger.actions["Highlight"].highlightedBlockID = block.id; // update highlighted block id
        window.workspace[CurrentSystemEditorId].highlightBlock(""); // remove previous highlight
        window.workspace[CurrentSystemEditorId].highlightBlock(block.id, true); // highlight chosen block only
        // Set the variable map for the language
        Blockly[language].variableDB_.setVariableMap(
            window.workspace[CurrentSystemEditorId].getVariableMap()
        );
        // Get the line of code containing the block generated code
        const fullCodeLine = getLineCodeFromXml(
            window.workspace[CurrentSystemEditorId],
            block.id,
            language
        );
        console.log(
            "Highlighting block ID: " +
                block.id +
                " with code " +
                fullCodeLine +
                " in editor: " +
                CurrentSystemEditorId
        );
        // Highlight corresponding code lines
        [editor, chosen_language] = PL_to_editor(language);
        // remove all highlights
        for (let i = 0; i < editor.lineCount(); i++) {
            editor.removeLineClass(i, "wrap", "highlight-line");
        }
        const lineCount = editor.lineCount();
        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            const lineContent = editor.getLine(lineNumber).trim();
            if (lineContent === fullCodeLine.trim()) {
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
    } else {
        // Remove highlight if block is already highlighted
        Blockly_Debugger.actions["Highlight"].highlightedBlockID = undefined;
        window.workspace[CurrentSystemEditorId].highlightBlock(""); // remove previous highlight
        [editor, chosen_language] = PL_to_editor(language);
        // remove code highlights
        for (let i = 0; i < editor.lineCount(); i++) {
            editor.removeLineClass(i, "wrap", "highlight-line");
        }
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
    document.getElementById(block_id).style.stroke = "yellow";
    document.getElementById(block_id).style.fill = "red";
    document.getElementById(block_id).style["stroke-width"] = "1px";
};

Blockly_Debugger.actions["Breakpoint"].disable = (block_id) => {
    var i = Blockly_Debugger.actions["Breakpoint"].breakpoints
        .map((obj) => {
            return obj.block_id;
        })
        .indexOf(block_id);
    if (i != -1) {
        document.getElementById(block_id).style.stroke = "yellow";
        document.getElementById(block_id).style.fill = "#FA8258";
        document.getElementById(block_id).style["stroke-width"] = "1px";
        Blockly_Debugger.actions["Breakpoint"].breakpoints[i].enable = false;
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

// Function to generate JSON object containing generated code and line number for each block in the workspace
function generate_block_to_code_mapping_for_workspace(workspace, language) {
  var block_to_code_mapping = {};
  // Generate code for the entire workspace
  var generatedCode = Blockly[language].workspaceToCode(workspace);
  Blockly[language].variableDB_.setVariableMap(workspace.getVariableMap());
  // Iterate over all blocks in the workspace
  workspace.getAllBlocks().forEach(function (block) {
    var block_code = "";
    if (block.type === "procedures_defnoreturn" || block.type === "procedures_callnoreturn") {
      let func_name = Blockly[language].variableDB_.getName(
        block.getFieldValue("NAME"),
        Blockly.Procedures.NAME_TYPE
      );
      block_code = block.type === "procedures_defnoreturn" ? "def " + func_name : func_name + "()";
    } else {
        block_code = Blockly[language].blockToCode(block);
        if (Array.isArray(block_code) /*isValueBlock(block)*/) {
          block_code = Blockly[language].blockToCode(block)[0]; // code string only
        } else {
          block_code = Blockly[language].blockToCode(block).split("\n")[0]; // code string only w/o proceeding blocks
          block_code = block_code.replace(/count[0-9]/g, "count");
        }
    }
    var lineNumber = 1; // Start line number at 1
    var lines = generatedCode.split("\n");
    var blockFound = false;
    // Iterate over lines to find the block
    for (var i = 0; i < lines.length; i++) {
      // Check if the current line contains the block's ID
      if (lines[i].includes(block_code)) {
        blockFound = true;
        break;
      }
      // Increment line number
      lineNumber++;
    }
    // Add block information to the block_to_code_mapping object
    block_to_code_mapping[block.id] = {
      code: block_code,
      lineNumber: blockFound ? lineNumber : null,
    };
  });

  return block_to_code_mapping;
}

function extract_breakpoints_line_numbers(breakpoints) {
  const lineNumbersSet = new Set();
  breakpoints.forEach((obj) => {
    if (!obj) return;
    const firstLine = obj.line[0];
    if (firstLine) {
      lineNumbersSet.add(firstLine.line);
    }
  });
  return Array.from(lineNumbersSet); // Convert Set back to array
}

// triggers breakpoint gutters on a given CodeMirror editor and language,
// returns a BreakpointIO JSON for importing breakpoints in VS code (using BreakpointIO Extention)
export function trigger_gutter_breakpoints_from_blockly(workspace, language, editor) {
  Blockly[language].init(workspace); // Initialize Blockly for the given language
  let block_to_code_mapping = generate_block_to_code_mapping_for_workspace(workspace, language); // Generate block to code mapping
  Blockly_Debuggee.state.currBlockToCodeMapping[language] = block_to_code_mapping;
  let breakpointIO = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
    if (!block_to_code_mapping[obj.block_id]) return;
    return {
      location: "<IDE-program-path>",
      block_id: obj.block_id,
      line: [
        { line: block_to_code_mapping[obj.block_id].lineNumber - 1, character: 0 },
        { line: block_to_code_mapping[obj.block_id].lineNumber - 1, character: 0 },
      ],
      enabled: obj.enable,
      code: block_to_code_mapping[obj.block_id].code,
    };
  });

  // set breakpoints gutters
  let breakpoints_line_numbers = extract_breakpoints_line_numbers(breakpointIO);
  breakpoints_line_numbers.forEach((lineNumber) => {
    try{
      var info = editor.lineInfo(lineNumber);
      if (!info.gutterMarkers)
        editor.setGutterMarker(lineNumber, "breakpoints", create_breakpoint_marker());
    } catch (err) {
      console.log(err);
    }
  });
  return breakpointIO; // return breakpointIO JSON
}

// returns a breakpoint marker icon to be used next to corresponding line of code in the text editor
function create_breakpoint_marker() {
  const marker = document.createElement("div");
  marker.style.color = "#822";
  marker.innerHTML = "●";
  return marker;
}

export let breakpointIO_export = [];

Blockly_Debugger.actions["Breakpoint"].generateCodeBreakpoints = () => {
    const workspace = Blockly.getMainWorkspace();
    Object.keys(ProgrammingLanguages).forEach((element) => {
        let [editor, chosen_language] = PL_to_editor(element);
        editor.clearGutter("breakpoints"); // remove all breakpoint gutters
        let breakpointIO_result = trigger_gutter_breakpoints_from_blockly(workspace, chosen_language, editor); // generate upadted breakpoint gutters
        breakpointIO_export[ProgrammingLanguages[element]] = breakpointIO_result;
    });
};

Blockly_Debugger.actions["ExportBreakpointsToClipboard"] = {};
Blockly_Debugger.actions["ExportBreakpointsToClipboard"].handler = () => {
    copyToClipboard(JSON.stringify(breakpointIO_export[ProgrammingLanguages[Blockly_Debuggee.state.exportedProgrammingLanguage]]));
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
