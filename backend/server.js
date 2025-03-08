// const express = require("express");
import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import os from "os";

const app = express();
const port = 3000;

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// Serve static files from the 'dummy_IDE' directory
app.use(express.static("dummy_IDE"));

// Define a route for the home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "dummy_IDE", "index.html"));
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.post("/api/exec-remotely", (req, res) => {
    const { prog_language, code } = req.body;
    const tempDir = os.tmpdir(); // Create a temporary file to store the Python script
    let tempFile, process;
    try {
        switch (prog_language) {
            case "UneditedJavaScript":
                tempFile = path.join(tempDir, "temp_script.js");
                fs.writeFileSync(tempFile, code);
                process = spawn("node", [tempFile]);
                break;
            case "Python":
                tempFile = path.join(tempDir, "temp_script.py");
                fs.writeFileSync(tempFile, code);
                process = spawn("python", [tempFile]);
                break;
            case "Dart":
                tempFile = path.join(tempDir, "temp_script.dart");
                fs.writeFileSync(tempFile, code);
                process = spawn("dart", ["run", tempFile]);
                break;
            case "PHP":
                tempFile = path.join(tempDir, "temp_script.php");
                fs.writeFileSync(tempFile, code);
                process = spawn("php", [tempFile]);
                break;
            case "Lua":
                tempFile = path.join(tempDir, "temp_script.lua");
                fs.writeFileSync(tempFile, code);
                process = spawn("lua", [tempFile]);
                break;
            default:
                return res.status(400).json({ error: "Unsupported programming language" });
        }

        let output = "",
            errorOutput = "";
        process.stdout.on("data", (data) => {
            output += data.toString();
        });
        process.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });
        process.on("error", (error) => {
             if (fs.existsSync(tempFile)) {
                 fs.unlinkSync(tempFile);
             }
            res.status(500).json({
                error: `Failed to start ${prog_language} process`,
                details: error.message,
            });
        });
        process.on("close", (code) => {
            fs.unlink(tempFile, (err) => {
                if (err && err.code !== "ENOENT") {
                    console.error(`Error deleting file: ${err}`);
                }
            });
            if (code !== 0) {
                res.status(500).json({
                    error: `${prog_language} script execution failed`,
                    details: errorOutput,
                    exitCode: code,
                });
            } else {
                res.json({ message: `${prog_language} script output:\n\n ${output}` });
            }
        });
    } catch (error) {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        //  if (tempFile) fs.unlinkSync(tempFile); // Clean up the temporary file in case of an exception
         res.status(500).json({
             error: `Failed to execute ${prog_language} script`,
             details: error.message,
         });
    }
});

