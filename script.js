const form = document.querySelector('.main_form');
const fileInput = document.getElementById('question_file');
const fileLabelText = document.getElementById('file-label-text');

// 1. Handle file name display (Standalone listener)
// This updates the UI as soon as the user selects a file
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        fileLabelText.innerText = `Selected: ${fileInput.files[0].name}`;
        fileLabelText.style.color = "#f4c017"; 
    }
});

// 2. Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Safety check: Ensure a file is selected and it is an Excel file
    if (!fileInput.files[0] || !fileInput.files[0].name.match(/\.(xlsx|xls)$/)) {
        alert("Please upload a valid Excel file (.xlsx or .xls)");
        return;
    }

    const formData = new FormData(form);
    const submitBtn = form.querySelector('button');
    
    // UI Feedback: Disable button while waiting for the server
    submitBtn.innerText = "Generating...";
    submitBtn.disabled = true;

    try {
        const response = await fetch('http://localhost:5000/generate-questions', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // Logs the first set's header to verify inputs
            console.log("Header Info:", result.sets[0].header);
            
            alert(`Generated ${result.sets.length} sets successfully! Check console for questions.`);
            
            // Loop through each set and display questions in the console
            result.sets.forEach(set => {
                console.log(`%c --- ${set.setName} --- `, 'background: #222; color: #bada55; font-size: 1.2em;');
                console.log("Institute:", set.header.institute);
                console.log("Course:", set.header.course);
                console.log("Exam:", set.header.exam);
                
                set.questions.forEach((q, i) => {
                    console.log(`${i+1}. ${q.text} [${q.clo}]`); 
                });
            });

        } else {
            // Displays error message from the backend (e.g., "No questions found")
            alert("Error: " + result.error);
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        alert("Could not connect to server. Ensure server.js is running on port 5000.");
    } finally {
        // Reset button state regardless of success or failure
        submitBtn.innerText = "Create PDF";
        submitBtn.disabled = false;
    }
});