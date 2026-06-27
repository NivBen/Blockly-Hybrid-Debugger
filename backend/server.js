// const express = require("express");
import express from "express";
import path from "path";

const app = express();
const port = process.env.PORT || 3000;

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

// Multi-Language Execution now runs entirely in the browser via WebAssembly
// runtimes (Pyodide / php-wasm / Fengari), so no server-side code execution
// endpoint is required.
