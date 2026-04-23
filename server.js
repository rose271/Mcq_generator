const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.post('/generate-questions', upload.single('question_file'), (req, res) => {
    try {
        const numSets = parseInt(req.body.set_number) || 1;
        const qsPerSet = parseInt(req.body.question_number) || 10;
        
        // We define it as selectedDifficulty here
        const selectedDifficulty = req.body.difficulty ? req.body.difficulty.toLowerCase() : '';

        if (!req.file) return res.status(400).json({ error: "No Excel file uploaded." });

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const data = xlsx.utils.sheet_to_json(workbook[workbook.SheetNames[0]]);

        let globalUniquePools = {};
        let backupPools = {};
data.forEach((row, index) => {
    // 1. Find the Difficulty value regardless of header name (difficulty, Difficulty, difficulty )
    const diffKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'difficulty');
    const rowDifficulty = diffKey ? String(row[diffKey]).trim().toLowerCase() : '';

    // 2. Find the Question text
    const qKey = Object.keys(row).find(k => 
        ['question', 'short_questions', 'short_question'].includes(k.trim().toLowerCase())
    );
    const questionText = qKey ? String(row[qKey]).trim() : '';

    // 3. Find the CLO
    const cloKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'clo');
    const clo = cloKey ? String(row[cloKey]).trim() : 'General';

    // DEBUG LOG: This will show in your VS Code Terminal exactly what is happening
    console.log(`Row ${index + 1}: Found Difficulty '${rowDifficulty}', looking for '${selectedDifficulty}'`);

    if (questionText && rowDifficulty === selectedDifficulty) {
        if (!globalUniquePools[clo]) {
            globalUniquePools[clo] = [];
            backupPools[clo] = [];
        }
        globalUniquePools[clo].push({ text: questionText, clo: clo });
        backupPools[clo].push({ text: questionText, clo: clo });
    }
});

        const cloList = Object.keys(globalUniquePools);
        if (cloList.length === 0) {
            return res.status(400).json({ error: `No questions found matching difficulty: ${req.body.difficulty}` });
        }

        const allSets = [];
        for (let s = 0; s < numSets; s++) {
            let currentSet = [];
            const base = Math.floor(qsPerSet / cloList.length);
            const remainder = qsPerSet % cloList.length;

            cloList.forEach((clo, idx) => {
                const needed = base + (idx < remainder ? 1 : 0);
                let selected = [];

                while (selected.length < needed && globalUniquePools[clo].length > 0) {
                    const rIdx = Math.floor(Math.random() * globalUniquePools[clo].length);
                    selected.push(globalUniquePools[clo].splice(rIdx, 1)[0]);
                }
              // Change this line in the second while loop:
while (selected.length < needed && backupPools[clo].length > 0) { 
    const rIdx = Math.floor(Math.random() * backupPools[clo].length);
    selected.push(backupPools[clo][rIdx]);
}
                currentSet.push(...selected);
            });

            allSets.push({
                setName: `Set ${String.fromCharCode(65 + s)}`,
                header: {
                    institute: req.body.institute_name || '',
                    course: req.body.course_name || '',
                    exam: req.body.exam_title || ''
                },
                questions: currentSet.sort(() => Math.random() - 0.5)
            });
        }

        res.json({ success: true, sets: allSets });
    } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(5000, () => console.log('Server running on http://localhost:5000'));