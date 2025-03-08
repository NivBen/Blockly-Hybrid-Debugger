"use strict";
import { generation } from "../blockly_init.js";

Blockly.JavaScript["lists_length"] = function (block) {
  // String or array length.
  // old blockly
  // var argument0 = Blockly.JavaScript.valueToCode(block, 'VALUE',
  //     Blockly.JavaScript.ORDER_FUNCTION_CALL) || '[]';
  var list =
    Blockly.JavaScript.valueToCode(block, "VALUE", Blockly.JavaScript.ORDER_MEMBER) || "[]";
  return ["(" + list + ")" + ".length", Blockly.JavaScript.ORDER_MEMBER];
};

Blockly.JavaScript["lists_isEmpty"] = function (block) {
  // Is the string null or array empty?
  var argument0 =
    Blockly.JavaScript.valueToCode(block, "VALUE", Blockly.JavaScript.ORDER_MEMBER) || "[]";
  //return ['var ' + my_list + ' = ' + argument0 + ';\n' + '!' + my_list + '.length', Blockly.JavaScript.ORDER_LOGICAL_NOT];
  return ["!" + "(" + argument0 + ")" + ".length", Blockly.JavaScript.ORDER_LOGICAL_NOT];
};

Blockly.JavaScript["lists_indexOf"] = function (block) {
  // Find an item in the list.
  var operator = block.getFieldValue("END") == "FIRST" ? "indexOf" : "lastIndexOf";
  var item = Blockly.JavaScript.valueToCode(block, "FIND", Blockly.JavaScript.ORDER_NONE) || "''";
  var list =
    Blockly.JavaScript.valueToCode(block, "VALUE", Blockly.JavaScript.ORDER_MEMBER) || "[]";
  // var code = '(' + list  + ')' + '.' + operator + '(' + item + ') + 1';
  // return [code, Blockly.JavaScript.ORDER_MEMBER];
  var code = "(" + list + ")" + "." + operator + "(" + item + ")";
  if (block.workspace.options.oneBasedIndex) {
    return [code + " + 1", Blockly.JavaScript.ORDER_ADDITION];
  }
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

Blockly.JavaScript["lists_getIndex"] = function (block) {
  // Get element at index.
  // Note: Until January 2013 this block did not have MODE or WHERE inputs.
  var mode = block.getFieldValue("MODE") || "GET";
  var where = block.getFieldValue("WHERE") || "FROM_START";
  var listOrder =
    where == "RANDOM" ? Blockly.JavaScript.ORDER_COMMA : Blockly.JavaScript.ORDER_MEMBER;
  var list = Blockly.JavaScript.valueToCode(block, "VALUE", listOrder) || "[]";
  list = "(" + list + ")";
  switch (where) {
    case "FIRST":
      if (mode == "GET") {
        var code = list + "[0]";
        return [code, Blockly.JavaScript.ORDER_MEMBER];
      } else if (mode == "GET_REMOVE") {
        var code = list + ".shift()";
        return [code, Blockly.JavaScript.ORDER_MEMBER];
      } else if (mode == "REMOVE") {
        return list + ".shift();\n";
      }
      break;
    case "LAST":
      if (mode == "GET") {
        var code = list + ".slice(-1)[0]";
        return [code, Blockly.JavaScript.ORDER_MEMBER];
      } else if (mode == "GET_REMOVE") {
        var code = list + ".pop()";
        return [code, Blockly.JavaScript.ORDER_MEMBER];
      } else if (mode == "REMOVE") {
        return list + ".pop();\n";
      }
      break;
    case "FROM_START":
      var at = Blockly.JavaScript.getAdjusted(block, "AT");
      if (mode == "GET") {
        var code = list + "[" + at + "]";
        return [code, Blockly.JavaScript.ORDER_MEMBER];
      } else if (mode == "GET_REMOVE") {
        var code = list + ".splice(" + at + ", 1)[0]";
        return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
      } else if (mode == "REMOVE") {
        return list + ".splice(" + at + ", 1);\n";
      }
      break;
    case "FROM_END":
      var at = Blockly.JavaScript.getAdjusted(block, "AT", 1, true);
      if (mode == "GET") {
        var code = list + ".slice(" + at + ")[0]";
        return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
      } else if (mode == "GET_REMOVE") {
        var code = list + ".splice(" + at + ", 1)[0]";
        return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
      } else if (mode == "REMOVE") {
        return list + ".splice(" + at + ", 1);";
      }
      break;
    case "RANDOM":
      var functionName = Blockly.JavaScript.provideFunction_("listsGetRandomItem", [
        "function " + Blockly.JavaScript.FUNCTION_NAME_PLACEHOLDER_ + "(list, remove) {",
        "  var x = Math.floor(Math.random() * list.length);",
        "  if (remove) {",
        "    return list.splice(x, 1)[0];",
        "  } else {",
        "    return list[x];",
        "  }",
        "}",
      ]);
      code = functionName + "(" + list + ", " + (mode != "GET") + ")";
      if (mode == "GET" || mode == "GET_REMOVE") {
        return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
      } else if (mode == "REMOVE") {
        return code + ";\n";
      }
      break;
  }
  throw "Unhandled combination (lists_getIndex).";
};

Blockly.JavaScript["lists_setIndex"] = function (block) {
  // Set element at index.
  // Note: Until February 2013 this block did not have MODE or WHERE inputs.
  var list = Blockly.JavaScript.valueToCode(block, "LIST", Blockly.JavaScript.ORDER_MEMBER) || "[]";
  var mode = block.getFieldValue("MODE") || "GET";
  var where = block.getFieldValue("WHERE") || "FROM_START";
  var value =
    Blockly.JavaScript.valueToCode(block, "TO", Blockly.JavaScript.ORDER_ASSIGNMENT) || "null";
  // Cache non-trivial values to variables to prevent repeated look-ups.
  // Closure, which accesses and modifies 'list'.

  list = "(" + list + ")";
  function cacheList() {
    if (list.match(/^\w+$/)) {
      return "";
    }
    var listVar = Blockly.JavaScript.variableDB_.getDistinctName(
      "tmpList",
      Blockly.Variables.NAME_TYPE
    );
    var code = "var " + listVar + " = " + list + ";\n";
    list = listVar;
    return code;
  }
  switch (where) {
    case "FIRST":
      if (mode == "SET") {
        return list + "[0] = " + value + ";\n";
      } else if (mode == "INSERT") {
        return list + ".unshift(" + value + ");\n";
      }
      break;
    case "LAST":
      if (mode == "SET") {
        var code = cacheList();
        code += list + "[" + list + ".length - 1] = " + value + ";\n";
        return code;
      } else if (mode == "INSERT") {
        return list + ".push(" + value + ");\n";
      }
      break;
    case "FROM_START":
      var at = Blockly.JavaScript.getAdjusted(block, "AT");
      if (mode == "SET") {
        return list + "[" + at + "] = " + value + ";\n";
      } else if (mode == "INSERT") {
        return list + ".splice(" + at + ", 0, " + value + ");\n";
      }
      break;
    case "FROM_END":
      var at = Blockly.JavaScript.getAdjusted(
        block,
        "AT",
        1,
        false,
        Blockly.JavaScript.ORDER_SUBTRACTION
      );
      var code = cacheList();
      if (mode == "SET") {
        code += list + "[" + list + ".length - " + at + "] = " + value + ";\n";
        return code;
      } else if (mode == "INSERT") {
        code += list + ".splice(" + list + ".length - " + at + ", 0, " + value + ");\n";
        return code;
      }
      break;
    case "RANDOM":
      var code = cacheList();
      var xVar = Blockly.JavaScript.variableDB_.getDistinctName(
        "tmpX",
        Blockly.Variables.NAME_TYPE
      );
      code += "var " + xVar + " = Math.floor(Math.random() * " + list + ".length);\n";
      if (mode == "SET") {
        code += list + "[" + xVar + "] = " + value + ";\n";
        return code;
      } else if (mode == "INSERT") {
        code += list + ".splice(" + xVar + ", 0, " + value + ");\n";
        return code;
      }
      break;
  }
  throw "Unhandled combination (lists_setIndex).";
};

Blockly.JavaScript["lists_split"] = function (block) {
  // Block for splitting text into a list, or joining a list into text.
  var input = Blockly.JavaScript.valueToCode(block, "INPUT", Blockly.JavaScript.ORDER_MEMBER);
  var delimiter =
    Blockly.JavaScript.valueToCode(block, "DELIM", Blockly.JavaScript.ORDER_NONE) || "''";
  var mode = block.getFieldValue("MODE");
  if (mode == "SPLIT") {
    if (!input) {
      input = "''";
    }
    var functionName = "split";
  } else if (mode == "JOIN") {
    if (!input) {
      input = "[]";
    }
    var functionName = "join";
  } else {
    throw "Unknown mode: " + mode;
  }
  var code = "(" + input + ")" + "." + functionName + "(" + delimiter + ")";
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

Blockly.JavaScript["lists_reverse"] = function (block) {
  // Block for reversing a list.
  var list =
    Blockly.JavaScript.valueToCode(block, "LIST", Blockly.JavaScript.ORDER_FUNCTION_CALL) || "[]";
  var code = "(" + list + ")" + ".slice().reverse()";
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

Blockly.JavaScript["lists_sort"] = function (block) {
  // Block for sorting a list.
  var list =
    Blockly.JavaScript.valueToCode(block, "LIST", Blockly.JavaScript.ORDER_FUNCTION_CALL) || "[]";
  var direction = block.getFieldValue("DIRECTION") === "1" ? 1 : -1;
  var type = block.getFieldValue("TYPE");
  var getCompareFunctionName = Blockly.JavaScript.provideFunction_("listsGetSortCompare", [
    "function " + Blockly.JavaScript.FUNCTION_NAME_PLACEHOLDER_ + "(type, direction) {",
    "  var compareFuncs = {",
    '    "NUMERIC": function(a, b) {',
    "        return parseFloat(a) - parseFloat(b); },",
    '    "TEXT": function(a, b) {',
    "        return a.toString() > b.toString() ? 1 : -1; },",
    '    "IGNORE_CASE": function(a, b) {',
    "        return a.toString().toLowerCase() > " + "b.toString().toLowerCase() ? 1 : -1; },",
    "  };",
    "  var compare = compareFuncs[type];",
    "  return function(a, b) { return compare(a, b) * direction; }",
    "}",
  ]);
  return [
    "(" +
      list +
      ")" +
      ".slice().sort(" +
      getCompareFunctionName +
      '("' +
      type +
      '", ' +
      direction +
      "))",
    Blockly.JavaScript.ORDER_FUNCTION_CALL,
  ];
};

Blockly.JavaScript["list_range"] = function (block) {
  const first = Number(this.getFieldValue("FIRST"));
  const last = Number(this.getFieldValue("LAST"));
  const numbers = [];
  for (let i = first; i <= last; i++) {
    numbers.push(i);
  }
  const code = "[" + numbers.join(", ") + "]";
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

Blockly.Python["list_range"] = function (a) {
  const first = Number(this.getFieldValue("FIRST"));
  const last = Number(this.getFieldValue("LAST"));
  const numbers = [];
  for (let i = first; i <= last; i++) {
    numbers.push(i);
  }
  const code = "[" + numbers.join(", ") + "]";
  return [code, Blockly.Python.ORDER_NONE];
};

// TODO: create list_range translation for Dart

Blockly.UneditedJavaScript["assert_block"] = function (block) {
  const condition =
    Blockly.UneditedJavaScript.valueToCode(block, "CONDITION", Blockly.JavaScript.ORDER_NONE) || "false";
  const message =
    Blockly.UneditedJavaScript.valueToCode(block, "MESSAGE", Blockly.JavaScript.ORDER_NONE) ||
    '"Assertion failed"';
  const code = `if (!(${condition})) { throw new Error(${message}); }\n`;
  return code;
};

Blockly.Python["assert_block"] = function (block) {
  const condition =
    Blockly.Python.valueToCode(block, "CONDITION", Blockly.Python.ORDER_NONE) || "False";
  const message =
    Blockly.Python.valueToCode(block, "MESSAGE", Blockly.Python.ORDER_NONE) || '"Assertion failed"';
  const code = `assert ${condition}, ${message}\n`;
  return code;
};

Blockly.Dart["assert_block"] = function (block) {
  const condition =
    Blockly.Dart.valueToCode(block, "CONDITION", Blockly.Dart.ORDER_NONE) || "false";
  const message =
    Blockly.Dart.valueToCode(block, "MESSAGE", Blockly.Dart.ORDER_NONE) || '"Assertion failed"';
  const code = `assert(${condition}, ${message});\n`;
  return code;
};


// Blockly.UneditedJavaScript['unit_test_assert_block'] = function(block) {
//   var value_input = Blockly.UneditedJavaScript.valueToCode(block, 'INPUT', Blockly.UneditedJavaScript.ORDER_ATOMIC);
//   var value_expected = Blockly.UneditedJavaScript.valueToCode(block, 'EXPECTED', Blockly.UneditedJavaScript.ORDER_ATOMIC);
//   // Get variable value from 'OUTPUT' input
//   var variable_output = Blockly.UneditedJavaScript.valueToCode(block, 'OUTPUT', Blockly.UneditedJavaScript.ORDER_ATOMIC); 
//   var statements_statements = Blockly.UneditedJavaScript.statementToCode(block, 'STATEMENTS');

//   // Assemble UneditedJavaScript code with assertions (same as before)
//   var code = `
// try {
//   ${statements_statements}
//   if (${variable_output} !== ${value_expected}) {
//     throw new Error('Test failed: Expected ' + ${value_expected} + ', but got ' + ${variable_output});
//   }
//   console.log('Test passed for input: ' + ${value_input});
// } catch (error) {
//   console.error(error);
// }
// `;
//   return code;
// };

Blockly.JavaScript['unit_test_assert_block'] = function(block) {
  var input_var = Blockly.JavaScript.variableDB_.getName(block.getFieldValue('INPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var output_var = Blockly.JavaScript.variableDB_.getName(block.getFieldValue('OUTPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var input_value = Blockly.JavaScript.valueToCode(block, 'INPUT', Blockly.JavaScript.ORDER_ASSIGNMENT) || 'null';
  var output_value = Blockly.Python.valueToCode(block, 'OUTPUT', Blockly.Python.ORDER_NONE) || 'None';
  var expected_value = Blockly.JavaScript.valueToCode(block, 'EXPECTED', Blockly.JavaScript.ORDER_NONE) || 'null';
  var statements = Blockly.JavaScript.statementToCode(block, 'STATEMENTS');
  statements = statements.replace(/^\s+/gm, '');
  var code = `${input_var} = ${input_value};\n`;
  code += `${output_var} = ${output_value};\n`;
  code += statements;
  code += `console.assert(${output_var} === ${expected_value}, "Test failed: Expected " + ${expected_value} + ", but got " + ${output_var});\n`;
  
  return code;
};

Blockly.UneditedJavaScript['unit_test_assert_block'] = function(block) {
  var input_var = Blockly.UneditedJavaScript.variableDB_.getName(block.getFieldValue('INPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var output_var = Blockly.UneditedJavaScript.variableDB_.getName(block.getFieldValue('OUTPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var input_value = Blockly.UneditedJavaScript.valueToCode(block, 'INPUT', Blockly.UneditedJavaScript.ORDER_ASSIGNMENT) || 'null';
  var output_value = Blockly.Python.valueToCode(block, 'OUTPUT', Blockly.Python.ORDER_NONE) || 'None';
  var expected_value = Blockly.UneditedJavaScript.valueToCode(block, 'EXPECTED', Blockly.UneditedJavaScript.ORDER_NONE) || 'null';
  var statements = Blockly.UneditedJavaScript.statementToCode(block, 'STATEMENTS');
  statements = statements.replace(/^\s+/gm, '');
  var code = `${input_var} = ${input_value};\n`;
  code += `${output_var} = ${output_value};\n`;
  code += statements;
  code += `console.assert(${output_var} === ${expected_value}, "Test failed: Expected " + ${expected_value} + ", but got " + ${output_var});\n`;
  
  return code;
};


Blockly.Python['unit_test_assert_block'] = function(block) {
  var input_var = Blockly.Python.variableDB_.getName(block.getFieldValue('INPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var output_var = Blockly.Python.variableDB_.getName(block.getFieldValue('OUTPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var input_value = Blockly.Python.valueToCode(block, 'INPUT', Blockly.Python.ORDER_NONE) || 'None';
  var output_value = Blockly.Python.valueToCode(block, 'OUTPUT', Blockly.Python.ORDER_NONE) || 'None';
  var expected_value = Blockly.Python.valueToCode(block, 'EXPECTED', Blockly.Python.ORDER_NONE) || 'None';
  var statements = Blockly.Python.statementToCode(block, 'STATEMENTS');
  statements = statements.replace(/^\s+/gm, '');
  var code = `${input_var} = ${input_value}\n`;
  code += `${output_var} = ${output_value}\n`;
  code += statements;
  code += `assert ${output_var} == ${expected_value}, f"Test failed: Expected {${expected_value}}, but got {${output_var}}"\n`;
  
  return code;
};

Blockly.PHP['unit_test_assert_block'] = function(block) {
  var input_var = Blockly.PHP.variableDB_.getName(block.getFieldValue('INPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var output_var = Blockly.PHP.variableDB_.getName(block.getFieldValue('OUTPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var input_value = Blockly.PHP.valueToCode(block, 'INPUT', Blockly.PHP.ORDER_ASSIGNMENT) || 'null';
  var output_value = Blockly.Python.valueToCode(block, 'OUTPUT', Blockly.Python.ORDER_NONE) || 'None';
  var expected_value = Blockly.PHP.valueToCode(block, 'EXPECTED', Blockly.PHP.ORDER_NONE) || 'null';
  var statements = Blockly.PHP.statementToCode(block, 'STATEMENTS');
  statements = statements.replace(/^\s+/gm, '');
  
  var code = `${input_var} = ${input_value};\n`;
  code += `${output_var} = ${output_value};\n`;
  code += statements;
  code += `assert(${output_var} === ${expected_value}, "Test failed: Expected " . ${expected_value} . ", but got " . $${output_var});\n`;
  
  return code;
};


Blockly.Lua['unit_test_assert_block'] = function(block) {
  var input_var = Blockly.Lua.variableDB_.getName(block.getFieldValue('INPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var output_var = Blockly.Lua.variableDB_.getName(block.getFieldValue('OUTPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var input_value = Blockly.Lua.valueToCode(block, 'INPUT', Blockly.Lua.ORDER_NONE) || 'nil';
  var output_value = Blockly.Python.valueToCode(block, 'OUTPUT', Blockly.Python.ORDER_NONE) || 'None';
  var expected_value = Blockly.Lua.valueToCode(block, 'EXPECTED', Blockly.Lua.ORDER_NONE) || 'nil';
  var statements = Blockly.Lua.statementToCode(block, 'STATEMENTS');
  statements = statements.replace(/^\s+/gm, '');
  
  var code = `local ${input_var} = ${input_value}\n`;
  code += `local ${output_var} = ${output_value}\n`;
  code += statements;
  code += `assert(${output_var} == ${expected_value}, "Test failed: Expected " .. tostring(${expected_value}) .. ", but got " .. tostring(${output_var}))\n`;
  
  return code;
};


Blockly.Dart['unit_test_assert_block'] = function(block) {
  var input_var = Blockly.Dart.variableDB_.getName(block.getFieldValue('INPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var output_var = Blockly.Dart.variableDB_.getName(block.getFieldValue('OUTPUT_VAR'), Blockly.Variables.NAME_TYPE);
  var input_value = Blockly.Dart.valueToCode(block, 'INPUT', Blockly.Dart.ORDER_ASSIGNMENT) || 'null';
  var output_value = Blockly.Python.valueToCode(block, 'OUTPUT', Blockly.Python.ORDER_NONE) || 'None';
  var expected_value = Blockly.Dart.valueToCode(block, 'EXPECTED', Blockly.Dart.ORDER_NONE) || 'null';
  var statements = Blockly.Dart.statementToCode(block, 'STATEMENTS');
  
  var code = `${input_var} = ${input_value};\n`;
  code += `${output_var} = ${output_value};\n`;
  code += statements;
  code += `assert(${output_var} == ${expected_value}, "Test failed: Expected $${expected_value}, but got $${output_var}");\n`;
  
  return code;
};
