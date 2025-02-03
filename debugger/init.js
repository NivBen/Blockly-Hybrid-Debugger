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

      // create statistics table
      const statsDiv = document.getElementById("stats-runs");
      statsDiv.innerHTML = "";
      const table = createStatisticsTable(window.variables, window.totalBlocks, window.runtime);
      table.classList.add("statistics-table"); // Add the class to the table
      statsDiv.appendChild(table);

      // create snapshot
      var xmlDom = Blockly.Xml.workspaceToDom(window.workspace["blockly2"]);
      var xmlText = Blockly.Xml.domToPrettyText(xmlDom);
      const timestamp = new Date();
      const snapshot = {
          source: `Run#${window.runCounter}`,
          text: xmlText,
          time: timestamp,
          blockly_brekpoints: Blockly_Debugger.actions["Breakpoint"].breakpoints
      };
      window.savedSnapshots.push(snapshot);
  };
}

const createStatisticsTable = (variablesRuns, totalBlocks, runtimeArr) => {
  const table = document.createElement("table");
  table.classList.add("table-striped"); // Add Bootstrap class for basic styling
  const headerRow = table.insertRow();

  // Create header row with unique variable names and some metrics
  const runNumberheaderCell = document.createElement("th");
  runNumberheaderCell.textContent = "#Run / Var";
  headerRow.appendChild(runNumberheaderCell);
  const blockCountereHeaderCell = document.createElement("th");
  blockCountereHeaderCell.textContent = "#Blocks Used";
  headerRow.appendChild(blockCountereHeaderCell);
  const runtimeHeaderCell = document.createElement("th");
  runtimeHeaderCell.textContent = "Runtime (ms)";
  headerRow.appendChild(runtimeHeaderCell);
  // add all variable names to the set
  const variable_set = new Set();
  variablesRuns.forEach((run_elements) => {
    run_elements.forEach((variable) => {
      variable_set.add(variable.name);
    });
  });
  // add table headers for all variable names
  variable_set.forEach((variable) => {
    const variable_th = document.createElement("th");
    variable_th.textContent = variable;
    variable_th.style = "text-align: center;";
    headerRow.appendChild(variable_th);
  });

  // Create run variables values rows
  for (let i = 0; i < variablesRuns.length; i++) {
    const row = table.insertRow();
    // row number cell
    const runNumberCell = row.insertCell();
    runNumberCell.textContent = `Run #${i + 1}`;
    runNumberCell.style = "background: green; font-weight: bold;";
    // blocks used cell
    const blocksCounterCell = row.insertCell();
    blocksCounterCell.style = "text-align: center;";
    blocksCounterCell.textContent = totalBlocks[i];
    // runtime cell
    const runtimeCell = row.insertCell();
    runtimeCell.style = "text-align: center;";
    runtimeCell.textContent = runtimeArr[i];

      for (let j = 0; j < variablesRuns[i].length; j++) {
        const cell = row.insertCell();
        cell.textContent = variablesRuns[i][j].value;
        cell.style = "text-align: center;";
      }
    }

    const tableContainer = document.createElement("div");
    tableContainer.classList.add("table-responsive"); // Add Bootstrap class for responsive behavior
    tableContainer.appendChild(table);

    return tableContainer;
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
