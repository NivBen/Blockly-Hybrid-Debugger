import { Blockly_Debuggee } from "../debuggee/init.js";
import {
  removeCodeBreakpointHighlights,
  PL_to_editor,
  appendStatisticsRow,
  beginRun,
  ProgrammingLanguages,
  renderSnapshotButtons,
} from "../dummy_IDE/index.js";
import { enableDebuggerControls, enableValTableCloseButton, highlightBlockCodeRange } from "../dummy_IDE/utils.js";

export var Debuggee_Worker = (function () {
  var instance;
  var dispatcher = {};

  function getInstance() {
    if (instance === undefined) {
      instance = new Worker("./dist/debuggee.js"); // to path apo to localhost kai oxi apo edw
      initDispacher();
      instance.onmessage = function (msg) {
        let obj = msg.data;
        let data = obj.data;
        dispatcher[obj.type](data);
      };
    }
    return instance;
  }

  function Stop() {
    if (!hasInstance()) return;
    instance.terminate();
    instance = undefined;
  }

  function AddOnDispacher(event, callback) {
    dispatcher[event] = callback;
  }

  function hasInstance() {
    if (instance === undefined) return false;
    else return true;
  }

  function initDispacher() {
    dispatcher["alert"] = (msg) => {
      window.alert(msg);
      Debuggee_Worker.Instance().postMessage({ type: "alert", data: "" });
    };
    dispatcher["prompt"] = (msg) => {
      Debuggee_Worker.Instance().postMessage({ type: "prompt", data: window.prompt(msg) });
    };
    dispatcher["highlightBlock"] = (data) => {
      const target_block_id = data.id;
      const target_block_has_bp = data.hasBreakpoint;

      window.workspace[data.CurrentSystemEditorId].traceOn_ = true;
      window.workspace[data.CurrentSystemEditorId].highlightBlock(target_block_id);

      removeCodeBreakpointHighlights(); // remove previous highlighting

      Object.keys(ProgrammingLanguages).forEach((element) => {
        let [editor, prog_language] = PL_to_editor(element);
        let line_number = -1;
        try {
          if(JSON.stringify(Blockly_Debuggee.state.currBlockToCodeMapping) !== '{}') {
            // highlight every line the stepped block generates, not only the one it starts on
            line_number = highlightBlockCodeRange(editor,
              Blockly_Debuggee.state.currBlockToCodeMapping[target_block_id].code[prog_language],
              "code-step-highlight");
          }
        } catch (event) { console.error(`Error in code step highlighting for line number ${line_number}`) }
        
        if(target_block_has_bp) { // update gutter breakpoint marker to hit
          let lineInfo = editor.lineInfo(line_number);
          if (lineInfo && lineInfo.gutterMarkers && lineInfo.gutterMarkers["breakpoints"]) {
              lineInfo.gutterMarkers["breakpoints"].classList.add("hit");
          }
        }
      });
    };
    dispatcher["execution_finished"] = (data) => {
      enableDebuggerControls(false);
      enableValTableCloseButton(); // only clear variables value and watches table when the user presses the close button
      instance = undefined;

      // Define Usage metrics instance
      const blocklyAnalyzer = new CodeMetricsAnalyzer();
      // analyse blockls usage
      blocklyAnalyzer.analyzeBlocklyWorkspace(Blockly.getMainWorkspace());
      // print analyser report
      blocklyAnalyzer.printReport();

      // take the next run number, shared with multi-language executions, and update it's elemnt
      beginRun();
      window.variables.push(data[0]); // variables array
      window.runtime.push(data[1]); // current runtime in ms
      window.totalBlocks.push(blocklyAnalyzer.blockMetrics.totalBlocks); // total blocks used

      udpateStatisticsTable(window.variables, window.totalBlocks, window.runtime); // update stats table

      // create snapshot
      var xmlDom = Blockly.Xml.workspaceToDom(window.workspace["blockly2"]);
      var xmlText = Blockly.Xml.domToPrettyText(xmlDom);
      const timestamp = new Date();
      const snapshot = {
        source: `Run#${window.runCounter}`,
        text: xmlText,
        time: timestamp,
        blockly_breakpoints: Blockly_Debugger.actions["Breakpoint"].breakpoints,
      };
      Blockly_Debuggee.state.snapshots.push(snapshot);
      removeCodeBreakpointHighlights(); // clear all breakpoint code line highlights
      renderSnapshotButtons(); // render automatic snapshot buttons
    };
  }

  // insert new stats row in the stats table
  const udpateStatisticsTable = (variablesRuns, totalBlocks, runtimeArr) => {
    const curr_run_num = variablesRuns.length - 1;
    appendStatisticsRow({
      run: window.runCounter,
      // the debuggee evaluates the generated JavaScript, whichever language is on display
      language: Blockly_Debuggee.state.mainProgrammingLanguage,
      viaDebugger: true, // marks the row with the bug glyph of the control that started it
      status: "Success", // this handler only runs once the debuggee reports it finished
      blocks: totalBlocks[curr_run_num],
      runtimeMs: runtimeArr[curr_run_num],
      output: "", // a debugger session reports variable state, not captured output
      variables: variablesRuns[curr_run_num],
    });
  };

  return {
    Instance: getInstance,
    Stop: Stop,
    AddOnDispacher: AddOnDispacher,
    hasInstance: hasInstance,
  };
})();

class CodeMetricsAnalyzer {
  constructor() {
    this.startTime = null;
    this.startMemory = null;
    this.runCounter = 0;
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

  // Blockly code analysis
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
}

export var Blockly_Debugger = {};
Blockly_Debugger.actions = {};
