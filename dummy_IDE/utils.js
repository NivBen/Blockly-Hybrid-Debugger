const removeEmptyLines = (str) => {
    return !str ? "" : str.split(/\r?\n/) // Split input text into an array of lines
    .filter(line => line.trim() !== "") // Filter out lines that are empty or contain only whitespace
    .join("\n"); // Join line array into a string
}

// execute remote code, using current editor content on given programming language
export const executeCodeRemotely = (prog_language, editor) => {
    const params = { prog_language: prog_language, code: editor.getValue() };
    fetch("/api/exec-remotely", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    })
        .then(async (response) => {
            if (!response.ok) {
                const err = await response.json();
                throw err;
            }
            return response.json();
        })
        .then((res_data) => {
            if (res_data.message) {
                console.log(res_data.message);
                alert(res_data.message);
            }
        })
        .catch((error) => {
            console.error("Error:", error);
            let errorMessage = `An error occurred while executing remote ${prog_language} script.`;
            if (error.error && error.details) {
                errorMessage = `${error.error}\n\nDetails: ${error.details}`;
            }
            alert(errorMessage);
        });
};