import './events.js';
import '../generator/blockly/blockly.js';
import { Blockly_Debugger } from '../debugger/debugger.js';

window.workspace = {};

window.workspace["blockly1"] = Blockly.inject(
    'blocklyDiv',
    {
        media: '../../media/',
        toolbox: document.getElementById('toolbox')
    }
);
window.workspace["blockly1"].systemEditorId = 'blockly1';

window.workspace["blockly2"] = Blockly.inject(
    'blocklyDiv2',
    {
        media: '../../media/',
        toolbox: document.getElementById('toolbox')
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
        document.getElementById('startBlocks_sample_1'),
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

//Blockly_Debugger.actions["Variables"].init();
window.runCounter = 0;
window.variables = [];
window.runtime = [];
window.totalBlocks = [];