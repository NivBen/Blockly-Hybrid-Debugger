import { Debuggee_Worker, Blockly_Debugger } from "../init.js";
import { Blockly_Debuggee } from "../../debuggee/init.js";
import "./watches.js";
import {
  PythonEditor,
  JavaScriptEditor,
  DartEditor,
  statisticsModal,
} from "../../dummy_IDE/index.js";

// Function to generate JSON object containing generated code and line number for each block in the workspace
function generate_code_line_mapping_for_workspace(workspace, language) {
  var code_line_mapping = {};
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
    // Add block information to the code_line_mapping object
    code_line_mapping[block.id] = {
      code: block_code,
      lineNumber: blockFound ? lineNumber : null,
    };
  });

  return code_line_mapping;
}

function extract_breakpoints_line_numbers(breakpoints) {
  const lineNumbersSet = new Set();
  breakpoints.forEach((obj) => {
    const firstLine = obj.line[0];
    if (firstLine) {
      lineNumbersSet.add(firstLine.line);
    }
  });
  return Array.from(lineNumbersSet); // Convert Set back to array
}

function triggerGutterBreakpointsFromBlockly(cm, lineNumbersSet) {
  lineNumbersSet.forEach((lineNumber) => {
    var info = cm.lineInfo(lineNumber);
    if (!info.gutterMarkers)
      cm.setGutterMarker(lineNumber, "breakpoints", create_breakpoint_marker());
  });
}

// triggers breakpoint gutters on a given CodeMirror editor and language,
// returns a BreakpointIO JSON for importing breakpoints in VS code (using BreakpointIO Extention)
function trigger_gutter_breakpoints_from_blockly(workspace, language, editor) {
  Blockly[language].init(workspace);
  let code_line_mapping = generate_code_line_mapping_for_workspace(workspace, language);
  let breakpointIO = Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
    return {
      location: "/dummy_IDE/sample_code.py",
      block_id: obj.block_id,
      line: [
        { line: code_line_mapping[obj.block_id].lineNumber - 1, character: 0 },
        { line: code_line_mapping[obj.block_id].lineNumber - 1, character: 0 },
      ],
      enabled: obj.enable,
      code: code_line_mapping[obj.block_id].code,
    };
  });

  // set breakpoints gutters
  let breakpoints_line_numbers = extract_breakpoints_line_numbers(breakpointIO);
  breakpoints_line_numbers.forEach((lineNumber) => {
    var info = editor.lineInfo(lineNumber);
    if (!info.gutterMarkers)
      editor.setGutterMarker(lineNumber, "breakpoints", create_breakpoint_marker());
  });

  return breakpointIO;
}

// returns a breakpoint marker icon to be used next to corresponding line of code in the text editor
function create_breakpoint_marker() {
  const marker = document.createElement("div");
  marker.style.color = "#822";
  marker.innerHTML = "●";
  return marker;
}

let breakpointIO_output = {};

Blockly_Debugger.actions["Start"] = {};
Blockly_Debugger.actions["Start"].handler = (cursorBreakpoint) => {
  if (Debuggee_Worker.hasInstance()) return;
  Blockly.JavaScript.STATEMENT_PREFIX = "await $id(%1, 0);\n";

  // Generate JS runtime code for all workspaces
  var code1 = Blockly.JavaScript.workspaceToCode(window.workspace["blockly1"]);
  var code2 = Blockly.JavaScript.workspaceToCode(window.workspace["blockly2"]);
  // append generated code for all workspaces to be run iterativley
  var code = code1 + code2;

  // Define Usage metrics instance
  const blocklyAnalyzer = new CodeMetricsAnalyzer();

  // define the currently used programming langauge for the breakpoint synchronisation
  let workspace = Blockly.getMainWorkspace();
  let editor = "";
  let chosen_language = "";
  switch (Blockly_Debuggee.state.currProgrammingLanguage) {
    case "Python":
      editor = PythonEditor;
      chosen_language = "Python";
      break;
    case "JavaScript":
      editor = JavaScriptEditor;
      chosen_language = "UneditedJavaScript";
      break;
    case "Dart":
      editor = DartEditor;
      chosen_language = "Dart";
      break;
  }
  breakpointIO_output = trigger_gutter_breakpoints_from_blockly(workspace, chosen_language, editor);

  code.replace(/__DOLLAR__/g, "$");
  Blockly_Debugger.actions["Variables"].init();
  Blockly_Debugger.actions["Watch"].init();

  // define variable table skeleton during debugger runtime
  document.getElementById("val_table").innerHTML = `  <div class="watch">
                                                            <div class="title">&nbsp;Variables  
                                                            <!--i class="fa fa-bars"></i-->
                                                            </div>
                                                            <div class="watch-content">
                                                            <table style="width:100%">
                                                            <tr>
                                                                <th>Name</th>
                                                                <th>Value</th> 
                                                                <th>Type</th>
                                                            </tr>     

                                                            </table>
                                                            <table id="variables" style="width:100%"></table>
                                                        </div>
                                                        </div>

                                                        <div class="watch">
                                                            <div class="title">&nbsp;Watches</div>
                                                            <div class="watch-content">
                                                            <table style="width:100%">
                                                            <tr>
                                                                <th>Name</th>
                                                                <th>Code</th> 
                                                                <th>Value</th>
                                                                <th>Type</th>
                                                            </tr>     
                                                            </table>
                                                            <table id="watches" style="width:100%"></table>
                                                        </div>
                                                        </div>`;

  if (cursorBreakpoint instanceof MouseEvent) cursorBreakpoint = "";
  Debuggee_Worker.Instance().postMessage({
    type: "start_debugging",
    data: {
      code: code,
      breakpoints: Blockly_Debugger.actions["Breakpoint"].breakpoints.map((obj) => {
        return {
          block_id: obj.block_id,
          enable: obj.enable,
        };
      }),
      cursorBreakpoint: cursorBreakpoint,
      watches: Blockly_Debugger.actions["Watch"].getWatches(),
      variables: Blockly_Debugger.actions["Variables"].getVariables(),
    },
  });

  // print metrics report
  blocklyAnalyzer.analyzeBlocklyWorkspace(workspace);
  blocklyAnalyzer.printReport();
};

function copyToClipboard(text) {
  // Create a temporary input element
  var tempInput = document.createElement("input");
  // Assign the text to be copied to the input element's value
  tempInput.value = text;
  // Append the input element to the document
  document.body.appendChild(tempInput);
  // Select the text inside the input element
  tempInput.select();
  // Copy the selected text to the clipboard
  document.execCommand("copy");
  // Remove the temporary input element
  document.body.removeChild(tempInput);
}

Blockly_Debugger.actions["ExportBreakpointsToClipboard"] = {};
Blockly_Debugger.actions["ExportBreakpointsToClipboard"].handler = () => {
  copyToClipboard(JSON.stringify(breakpointIO_output));
};

class CodeMetricsAnalyzer {
  constructor() {
    this.startTime = null;
    this.startMemory = null;
    this.blockMetrics = {
      totalBlocks: 0,
      loopBlocks: 0,
      conditionBlocks: 0,
      variableBlocks: 0,
      printBlocks: 0,
      variables: new Set(),
      functionBlocks: 0,
      arrayOperations: 0,
    };
    this.performanceMetrics = {
      runtime: 0,
      memoryUsage: 0,
      executionCount: 0,
      peakMemory: 0,
    };
  }

  // startAnalysis() {
  //   this.startTime = performance.now();
  //   this.startMemory = window.performance.memory.usedJSHeapSize || 0;
  // }

  // endAnalysis() {
  //   this.performanceMetrics.runtime = performance.now() - this.startTime;
  //   const endMemory = window.performance.memory.usedJSHeapSize || 0;
  //   this.performanceMetrics.memoryUsage = endMemory - this.startMemory;
  //   this.performanceMetrics.executionCount++;
  //   this.performanceMetrics.peakMemory = Math.max(this.performanceMetrics.peakMemory, endMemory);
  // }

  // For Blockly code analysis
  analyzeBlocklyWorkspace(workspace) {
    const allBlocks = workspace.getAllBlocks(false);
    this.blockMetrics.totalBlocks = allBlocks.length;

    allBlocks.forEach((block) => {
      switch (block.type) {
        case "controls_repeat":
        case "controls_repeat_ext":
        case "controls_forEach":
        case "controls_for":
        case "controls_whileUntil":
          this.blockMetrics.loopBlocks++;
          break;

        case "controls_if":
        case "logic_compare":
        case "logic_operation":
          this.blockMetrics.conditionBlocks++;
          break;

        case "variables_get":
        case "variables_set":
          this.blockMetrics.variableBlocks++;
          const varName = block.getFieldValue("VAR");
          if (varName) this.blockMetrics.variables.add(varName);
          break;

        case "text_print":
        case "console_log":
          this.blockMetrics.printBlocks++;
          break;

        case "procedures_defnoreturn":
        case "procedures_defreturn":
          this.blockMetrics.functionBlocks++;
          break;

        case "lists_create_with":
        case "lists_getIndex":
        case "lists_setIndex":
          this.blockMetrics.arrayOperations++;
          break;
      }
    });
  }

  generateReport() {
    return {
      "Block Statistics": {
        "Total Blocks": this.blockMetrics.totalBlocks,
        "Loop Blocks": this.blockMetrics.loopBlocks,
        "Condition Blocks": this.blockMetrics.conditionBlocks,
        "Variable Operations": this.blockMetrics.variableBlocks,
        "Print Operations": this.blockMetrics.printBlocks,
        "Function Definitions": this.blockMetrics.functionBlocks,
        "Array Operations": this.blockMetrics.arrayOperations,
        "Unique Variables": Array.from(this.blockMetrics.variables),
      },
      // "Performance Metrics": {
      //   "Runtime (ms)": this.performanceMetrics.runtime.toFixed(2),
      //   "Memory Usage (MB)": (this.performanceMetrics.memoryUsage / (1024 * 1024)).toFixed(2),
      //   "Peak Memory (MB)": (this.performanceMetrics.peakMemory / (1024 * 1024)).toFixed(2),
      //   "Execution Count": this.performanceMetrics.executionCount,
      // },
    };
  }

  printReport() {
    console.group("Code Analysis Report");
    console.log("Block Statistics:");
    console.table({
      "Total Blocks": this.blockMetrics.totalBlocks,
      "Loop Blocks": this.blockMetrics.loopBlocks,
      "Condition Blocks": this.blockMetrics.conditionBlocks,
      "Variable Operations": this.blockMetrics.variableBlocks,
      "Print Operations": this.blockMetrics.printBlocks,
      "Function Definitions": this.blockMetrics.functionBlocks,
      "Array Operations": this.blockMetrics.arrayOperations,
    });

    console.log("\nVariable Usage:");
    // TODO: shows variables state of the begining of execution, before triggered breakpoints
    console.log(Array.from(Blockly_Debugger.actions["Variables"].getVariables()));
    // last workspace blockMetrics ids
    console.log(Array.from(this.blockMetrics.variables));

    // console.log('\nPerformance Metrics:');
    // console.table({
    //     "Runtime (ms)": this.performanceMetrics.runtime.toFixed(2),
    //     "Memory Usage (MB)": (this.performanceMetrics.memoryUsage / (1024 * 1024)).toFixed(2),
    //     "Peak Memory (MB)": (this.performanceMetrics.peakMemory / (1024 * 1024)).toFixed(2),
    //     "Execution Count": this.performanceMetrics.executionCount
    // });
    console.groupEnd();
  }

  printReportHTML() {
    const tableHTML = `
        <div style="font-family: Arial, sans-serif; margin: 20px;">
            <h2 style="color: #333;">Code Analysis Report</h2>
            
            <h3 style="color: #444; margin-top: 20px;">Block Statistics</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                    <tr style="background-color: #f3f4f6;">
                        <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Metric</th>
                        <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 12px;">Total Blocks</td>
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${
                          this.blockMetrics.totalBlocks
                        }</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 12px;">Loop Blocks</td>
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${
                          this.blockMetrics.loopBlocks
                        }</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 12px;">Condition Blocks</td>
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${
                          this.blockMetrics.conditionBlocks
                        }</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 12px;">Variable Operations</td>
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${
                          this.blockMetrics.variableBlocks
                        }</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 12px;">Print Operations</td>
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${
                          this.blockMetrics.printBlocks
                        }</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 12px;">Function Definitions</td>
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${
                          this.blockMetrics.functionBlocks
                        }</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 12px;">Array Operations</td>
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${
                          this.blockMetrics.arrayOperations
                        }</td>
                    </tr>
                </tbody>
            </table>

            <h3 style="color: #444; margin-top: 20px;">Variable Usage</h3>
            <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 20px; background-color: #f8f9fa;">
                <div><strong>Current Variables:</strong> ${
                  Array.from(Blockly_Debugger.actions["Variables"].getVariables()).join(", ") ||
                  "None"
                }</div>
                <div style="margin-top: 8px;"><strong>Block Variables:</strong> ${
                  Array.from(this.blockMetrics.variables).join(", ") || "None"
                }</div>
            </div>
        </div>
    `;

    return tableHTML;
  }
}

let displayStatisticsMenuBtn = document.getElementById("StatisticsMenuButton");
displayStatisticsMenuBtn.onclick = function () {
  statisticsModal.style.display = "block";
  let testStats = document.getElementById("testStats");
  // testStats.innerHTML = blocklyAnalyzer.printReportHTML();
};
