import { Blockly_Debuggee } from "../debuggee/init.js";
import {
  removeCodeBreakpointHighlights,
  PL_to_editor,
  stats_handsontable,
} from "../dummy_IDE/index.js";

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
      window.workspace[data.CurrentSystemEditorId].traceOn_ = true;
      window.workspace[data.CurrentSystemEditorId].highlightBlock(data.id);
      const [main_editor, main_prog_lang] = PL_to_editor(Blockly_Debuggee.state.mainProgrammingLanguage);
      const [sec_editor, sec_prog_lang] = PL_to_editor(
          Blockly_Debuggee.state.secondaryProgrammingLanguage
      );
      removeCodeBreakpointHighlights(); // remove previous highlighting
      // trigger breakpoint gutter on the main editor
      if (
          data.hasBreakpoint &&
          Blockly_Debuggee.state.currBlockToCodeMapping[main_prog_lang][`${data.id}`] !== undefined
      ) {
          const line_number =
              Blockly_Debuggee.state.currBlockToCodeMapping[main_prog_lang][`${data.id}`]
                  .lineNumber - 1;
          main_editor.addLineClass(line_number, "wrap", "highlight-breakpoint");
      }
      // trigger breakpoint gutter on the secondary editor
      if (
          data.hasBreakpoint &&
          Blockly_Debuggee.state.currBlockToCodeMapping[sec_prog_lang][`${data.id}`] !== undefined
      ) {
          // TODO: trigger breakpoint gutter on the editor, relavent for breakpoints added after starting the debugger
          const line_number =
              Blockly_Debuggee.state.currBlockToCodeMapping[sec_prog_lang][`${data.id}`]
                  .lineNumber - 1;
          sec_editor.addLineClass(line_number, "wrap", "highlight-breakpoint");
      }
    };
    dispatcher["execution_finished"] = (data) => {
      instance = undefined;
      // only clear variables value table when the user "stops" the debugger execution
      // document.getElementById("val_table").innerHTML = "";

      // Define Usage metrics instance
      const blocklyAnalyzer = new CodeMetricsAnalyzer();
      // analyse blockls usage
      blocklyAnalyzer.analyzeBlocklyWorkspace(Blockly.getMainWorkspace());
      // print analyser report
      blocklyAnalyzer.printReport();

      // increament run counter and update it's elemnt
      window.runCounter++;
      document.getElementById("run-counter").innerHTML = "Run Counter: " + window.runCounter;
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
        blockly_brekpoints: Blockly_Debugger.actions["Breakpoint"].breakpoints,
      };
      window.savedSnapshots.push(snapshot);
      removeCodeBreakpointHighlights(); // clear all breakpoint code line highlights
    };
  }

  // insert new stats row in the stats table
  const udpateStatisticsTable = (variablesRuns, totalBlocks, runtimeArr) => {
    let updated_columns = [{ title: '#Run', type: 'numeric' },
      { title: 'Date and Time', type: 'date', dateFormat: 'DD/MM/YY, HH:mm', },
      { title: '#Blocks', type: 'numeric' },
      { title: 'Runtime (ms)', type: 'numeric' }, ];

    // find all variable names (using set to ignore repetitions)
    const variable_set = new Set();
    variablesRuns.forEach((run_elements) => {
      run_elements.forEach((variable) => { variable_set.add(variable.name); });
    });
    variable_set.forEach((variable) => { updated_columns.push({ title: variable, type: 'text' }); });  // add table headers for all unique variable names

    // insert new row data
    let newRowData = [];
    const curr_run_num = variablesRuns.length - 1;
    newRowData.push(`${curr_run_num + 1}`); // run number cell
    newRowData.push(new Date().toLocaleString('en-GB', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\//g, '/').replace(',', ',')); // date and time cell
    newRowData.push(totalBlocks[curr_run_num]); // blocks used cell
    newRowData.push(runtimeArr[curr_run_num]); // runtime cell
    // create variables values cells
    for (let j = 0; j < variablesRuns[curr_run_num].length; j++) { // variable cells
      newRowData.push(`${variablesRuns[curr_run_num][j].value}\n(${typeof(variablesRuns[curr_run_num][j].value)})`);
    }

    // update table headers and data cells
    stats_handsontable.updateSettings({
      columns: updated_columns,
      data: stats_handsontable.getData().concat([newRowData])
      // colHeaders: updated_columns.map(col => col.title)
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
