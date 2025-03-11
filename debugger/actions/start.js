import { Debuggee_Worker, Blockly_Debugger } from "../init.js";
import "./watches.js";
import { removeGutterAndBlockHighlights } from '../../dummy_IDE/utils.js'

Blockly_Debugger.actions["Start"] = {};
Blockly_Debugger.actions["Start"].handler = (cursorBreakpoint) => {
  if (Debuggee_Worker.hasInstance()) return;

  // remove block and code highlights before execution
  removeGutterAndBlockHighlights();
  
  Blockly.JavaScript.STATEMENT_PREFIX = "await $id(%1, 0);\n";

  // Generate JS runtime code for all workspaces
  var code1 = Blockly.JavaScript.workspaceToCode(window.workspace["blockly1"]);
  var code2 = Blockly.JavaScript.workspaceToCode(window.workspace["blockly2"]);
  // append generated code for all workspaces to be run iterativley
  var code = code1 + code2;

  code.replace(/__DOLLAR__/g, "$");
  Blockly_Debugger.actions["Variables"].init();
  Blockly_Debugger.actions["Watch"].init();

  // define variable table skeleton during debugger runtime
  document.getElementById("val_table").innerHTML = `  <div class="watch-variables">
      <div class="title">&nbsp;Variables
      </div>
      <div class="watch-content">
      <table id="variables-headers" style="width:100%">
      <tr>
          <th>Name</th>
          <th>Value</th> 
          <th>Type</th>
      </tr>     

      </table>
      <table id="variables" style="width:100%"></table>
    </div>
  </div>

  <div class="watch-watches">
      <div class="title">&nbsp;Watches</div>
      <div class="watch-content">
      <table id="watches-headers" style="width:100%">
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

};
