const form = document.querySelector('.main_form');
const fileInput = document.getElementById('question_file');
const fileLabelText = document.getElementById('file-label-text');

// Handle file name display
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        fileLabelText.innerText = `Selected: ${fileInput.files[0].name}`;
        fileLabelText.style.color = "#f4c017";
    }
});

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!fileInput.files[0] || !fileInput.files[0].name.match(/\.(xlsx|xls)$/)) {
        alert("Please upload a valid Excel file (.xlsx or .xls)");
        return;
    }

    const formData = new FormData(form);
    const submitBtn = form.querySelector('button');

    submitBtn.innerText = "Generating...";
    submitBtn.disabled = true;

    try {
        const response = await fetch('http://localhost:5000/generate-questions', {
            method: 'POST',
            body: formData
        });

        const contentType = response.headers.get('Content-Type') || '';

        if (!response.ok || contentType.includes('application/json')) {
            const errorResult = await response.json();
            alert("Error: " + errorResult.error);
            return;
        }

        // It's a PDF — trigger automatic download
        const blob = await response.blob();
        const url  = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href     = url;
        a.download = 'question_sets.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Fetch Error:", error);
        alert("Could not connect to server. Ensure server.js is running on port 5000.");
    } finally {
        submitBtn.innerText = "Create PDF";
        submitBtn.disabled = false;
    }
});