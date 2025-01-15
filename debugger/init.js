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
      // document.getElementById("val_table").innerHTML = '';

      // increament run counter
      window.runCounter++;
      document.getElementById("run-counter").innerHTML = "Run Counter: " + window.runCounter;
      window.variables.push(data);

      const testStatsDiv = document.getElementById("testStats");
      testStatsDiv.innerHTML = "";
      const table = createStatisticsTable(window.variables);
      table.classList.add("statistics-table"); // Add the class to the table
      testStatsDiv.appendChild(table);
    };
  }

  function createStatisticsTable(data) {
    const table = document.createElement("table");
    table.classList.add("table-striped"); // Add Bootstrap class for basic styling
    const headerRow = table.insertRow();

    // Create header row with unique variable names
    const headerCell = document.createElement("th");
    headerCell.textContent = "Run";
    headerRow.appendChild(headerCell);
    const variable_set = new Set();
    // add all variable names to the set
    data.forEach((run_elements) => {
      run_elements.forEach((variable) => {
        variable_set.add(variable.name);
      });
    });
    // add table headers for all variable names
    variable_set.forEach((variable) => {
      const th = document.createElement("th");
      th.textContent = variable;
      headerRow.appendChild(th);
    });

    // Create data rows
    for (let i = 0; i < data.length; i++) {
      const row = table.insertRow();
      const runNumberCell = row.insertCell();
      runNumberCell.textContent = `Run ${i + 1}`;

      for (let j = 0; j < data[i].length; j++) {
        const cell = row.insertCell();
        cell.textContent = data[i][j].value;
      }
    }

    const tableContainer = document.createElement("div");
    tableContainer.classList.add("table-responsive"); // Add Bootstrap class for responsive behavior
    tableContainer.appendChild(table);

    return tableContainer;
  }

  return {
    Instance: getInstance,
    Stop: Stop,
    AddOnDispacher: AddOnDispacher,
    hasInstance: hasInstance,
  };
})();

export var Blockly_Debugger = {};
Blockly_Debugger.actions = {};
