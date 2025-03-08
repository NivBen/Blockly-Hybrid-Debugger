import './events.js';
import '../generator/blockly/blockly.js';
import { Blockly_Debugger } from '../debugger/debugger.js';

window.workspace = {};
window.numWorkSpacesCreated = 2;
window.workspacesArr = ["blockly1", "blockly2"]; // array to host all workspace names

window.workspace["blockly1"] = Blockly.inject(
    'blocklyDiv',
    {
        media: '../../media/',
        toolbox: document.getElementById('toolbox'),
        grid:
            {
                spacing: 20,
                length: 3,
                colour: '#ccc',
                snap: true
            },
        trashcan: true,
        zoom:
        {
            controls: true,
            pinch: true
        }
    }
);
window.workspace["blockly1"].systemEditorId = 'blockly1';

window.workspace["blockly2"] = Blockly.inject(
    'blocklyDiv2',
    {
        media: '../../media/',
        toolbox: document.getElementById('toolbox'),
        grid:
            {
                spacing: 20,
                length: 3,
                colour: '#ccc',
                snap: true
            },
        trashcan: true,
        zoom:
        {
            controls: true,
            pinch: true
        }
    }
);

window.workspace["blockly2"].systemEditorId = 'blockly2';

addEventListener("loadStartingBlocks_blockly1", function () {
    // Blockly.Xml.domToText(document.getElementById('startBlocks'));
    Blockly.Xml.domToWorkspace(
        document.getElementById('startBlocks'),
        window.workspace["blockly1"]
    );
});

addEventListener("loadStartingBlocks_blockly2", function () {
    // Blockly.Xml.domToText(document.getElementById('startBlocks2'));
    Blockly.Xml.domToWorkspace(
        document.getElementById('startBlocks2'),
        window.workspace["blockly2"]
    );
});

Blockly.Blocks['list_range'] = {
    init: function () {
        this.jsonInit(
            {
                "type": "list_range",
                "message0": "create list of numbers from %1 up to %2",
                "args0": [
                    {
                        "type": "field_number",
                        "name": "FIRST",
                        "value": 0,
                        "min": 0,
                        "precision": 1,
                    },
                    {
                        "type": "field_number",
                        "name": "LAST",
                        "value": 5,
                        "min": 0,
                        "precision": 1,
                    },
                ],
                "colour": 10,
                "output": "Array",
                "style": "list_blocks",
                "tooltip": "Create a list of non negative numbers, final number must be odd",
                "extensions": ["list_range_validation"],
            }
        );
    }
}
Blockly.Extensions.register('list_range_validation', function () {
    // Add custom validation.
    this.getField('LAST').setValidator(function (newValue) {
        // Force an odd number.
        return Math.round((newValue - 1) / 2) * 2 + 1;
    });

    // Validate the entire block whenever any part of it changes,
    // and display a warning if the block cannot be made valid.
    this.setOnChange(function (event) {
        const first = this.getFieldValue('FIRST');
        const last = this.getFieldValue('LAST');
        const valid = Number(first) < Number(last);
        this.setWarningText(
            valid
                ? null
                : `The first number (${first}) must be smaller than the last number (${last}).`,
        );

        // Disable invalid blocks (unless it's in a toolbox flyout,
        // since you can't drag disabled blocks to your workspace).
        if (!this.isInFlyout) {
            const initialGroup = Blockly.Events.getGroup();
            // Make it so the move and the disable event get undone together.
            Blockly.Events.setGroup(event.group);
            this.setDisabled(!valid);
            Blockly.Events.setGroup(initialGroup);
        }
    });
});

Blockly.Blocks['assert_block'] = {
    init: function () {
        this.jsonInit({
            "type": "assert_block",
            "message0": "assert %1 with message %2",
            "args0": [
                {
                    "type": "input_value",
                    "name": "CONDITION",
                    "check": "Boolean",
                },
                {
                    "type": "input_value",
                    "name": "MESSAGE",
                    "check": "String",
                }
            ],
            "colour": 230,
            "previousStatement": null,
            "nextStatement": null,
            "tooltip": "Assert that a condition is true; if false, display the message",
            // "helpUrl": "https://example.com/assert-block"
        });
    }
};

// Blockly.Blocks['unit_test_assert_block'] = {
//     init: function () {
//         this.appendValueInput('INPUT')
//             .setCheck(null)
//             .appendField('assert test with input')
//         this.appendValueInput('EXPECTED')
//             .setCheck(null)
//             .appendField('expecting output');
//         this.appendValueInput('OUTPUT')
//             .setCheck(null)
//             .appendField('set output to')
//         this.appendStatementInput('STATEMENTS')
//             .setCheck(null)
//             .appendField('do');
//         this.setPreviousStatement(true, null);
//         this.setNextStatement(true, null);
//         this.setColour(140);
//         this.setTooltip('A wrapper for unit test.');
//         this.setHelpUrl('');
//     }
// };
Blockly.Blocks['unit_test_assert_block'] = {
    init: function () {
        this.appendDummyInput()
            .appendField("Unit Test Assert");
        this.appendValueInput("INPUT")
            .appendField("set input to")
            .appendField(new Blockly.FieldVariable("input"), "INPUT_VAR");
        this.appendValueInput("OUTPUT")
            .appendField("set output to")
            .appendField(new Blockly.FieldVariable("output"), "OUTPUT_VAR");
        this.appendValueInput("EXPECTED")
            .appendField("expecting output")
            .setCheck(null)
            .setAlign(Blockly.ALIGN_RIGHT);
        
        this.appendStatementInput("STATEMENTS")
            .setCheck(null)
            .appendField("do");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(140);
        this.setTooltip("A wrapper for unit test with variable inputs.");
        this.setHelpUrl("");

        // Add shadow blocks
        var inputShadow = this.workspace.newBlock('math_number');
        inputShadow.setShadow(true);
        inputShadow.setFieldValue('0', 'NUM');
        this.getInput('INPUT').connection.connect(inputShadow.outputConnection);

        var outputShadow = this.workspace.newBlock('math_number');
        outputShadow.setShadow(true);
        outputShadow.setFieldValue('0', 'NUM');
        this.getInput('OUTPUT').connection.connect(outputShadow.outputConnection);

        var expectedShadow = this.workspace.newBlock('math_number');
        expectedShadow.setShadow(true);
        expectedShadow.setFieldValue('0', 'NUM');
        this.getInput('EXPECTED').connection.connect(expectedShadow.outputConnection);
    }
};





//Blockly_Debugger.actions["Variables"].init();
//Blockly_Debugger.actions["Variables"].init();
window.runCounter = 0;
window.variables = [];
window.runtime = [];
window.totalBlocks = [];
