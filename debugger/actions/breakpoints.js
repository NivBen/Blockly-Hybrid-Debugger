import { Debuggee_Worker, Blockly_Debugger } from "../init.js";
import { PL_to_editor } from "../../dummy_IDE/index.js";

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
    // TODO: change to Blockly_Debuggee.state.currProgrammingLanguage
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

Blockly_Debugger.actions["Breakpoint"].menuOption = (block) => {
    var breakpointOption = {
        text: !Blockly_Debugger.actions["Breakpoint"].breakpoints
            .map((obj) => {
                return obj.block_id;
            })
            .includes(block.id)
            ? "Add Breakpoint"
            : "Remove Breakpoint",
        enabled: true,
        callback: function () {
            if (
                !Blockly_Debugger.actions["Breakpoint"].breakpoints
                    .map((obj) => {
                        return obj.block_id;
                    })
                    .includes(block.id)
            ) {
                var new_br = {
                    block_id: block.id,
                    enable: true,
                    icon: new Breakpoint_Icon(block),
                    change: false,
                };
                Blockly_Debugger.actions["Breakpoint"].breakpoints.push(new_br);
                block.setCollapsed(false); // gia na anoigei otan exw breakpoint
            } else {
                var icon = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
                    if (obj.block_id === block.id) return obj.icon;
                });
                icon[0].myDisable();
                var index = Blockly_Debugger.actions["Breakpoint"].breakpoints
                    .map((obj) => {
                        return obj.block_id;
                    })
                    .indexOf(block.id);
                if (index !== -1)
                    Blockly_Debugger.actions["Breakpoint"].breakpoints.splice(index, 1);
            }
            Blockly_Debugger.actions["Breakpoint"].handler();
        },
    };
    return breakpointOption;
};

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
