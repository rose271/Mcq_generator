const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Helper: shuffle an array in place (Fisher-Yates)
// ---------------------------------------------------------------------------
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ---------------------------------------------------------------------------
// Helper: find a column key case-insensitively (also trims whitespace)
// ---------------------------------------------------------------------------
function findKey(row, ...names) {
    return Object.keys(row).find(k =>
        names.includes(k.trim().toLowerCase())
    );
}

// ---------------------------------------------------------------------------
// POST /generate-questions
// ---------------------------------------------------------------------------
app.post('/generate-questions', upload.single('question_file'), (req, res) => {
    try {
        // ── 1. Parse inputs ──────────────────────────────────────────────────
        const numSets  = Math.max(1, parseInt(req.body.set_number)      || 1);
        const qsPerSet = Math.max(1, parseInt(req.body.question_number) || 10);

        // Normalise difficulty: frontend sends "Easy" / "Medium" / "Hard"
        // We lowercase both sides so capitalisation never matters.
        const selectedDifficulty = (req.body.difficulty || '').trim().toLowerCase();

        if (!req.file) {
            return res.status(400).json({ error: 'No Excel file uploaded.' });
        }

        // ── 2. Read the workbook ─────────────────────────────────────────────
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const data     = xlsx.utils.sheet_to_json(sheet);

        if (!data || data.length === 0) {
            return res.status(400).json({ error: 'The uploaded file appears to be empty.' });
        }

        // ── 3. Build the question pool ───────────────────────────────────────
        // Keys accepted for each logical column (all lowercase after trim)
        const QUESTION_KEYS   = ['question', 'short_questions', 'short_question'];
        const CLO_KEYS        = ['clo'];
        const DIFFICULTY_KEYS = ['difficulty'];

        // allQuestions: every question in the file regardless of difficulty
        // (used as random fallback when the filtered pool is exhausted)
        const allQuestions = [];   // { text, clo }
        const filteredPool = {};   // { [clo]: [ {text, clo}, ... ] }

        data.forEach((row, idx) => {
            const qKey    = findKey(row, ...QUESTION_KEYS);
            const cloKey  = findKey(row, ...CLO_KEYS);
            const diffKey = findKey(row, ...DIFFICULTY_KEYS);

            const questionText = qKey    ? String(row[qKey]).trim()    : '';
            // Normalise CLO: strip spaces so "CLO 1", "CLO1" both become "CLO1"
            const rawClo       = cloKey  ? String(row[cloKey]).trim()  : 'General';
            const clo          = rawClo.replace(/\s+/g, '');           // "CLO 1" → "CLO1"
            const rowDiff      = diffKey ? String(row[diffKey]).trim().toLowerCase() : '';

            if (!questionText) return; // skip empty rows

            allQuestions.push({ text: questionText, clo });

            // Only add to the filtered pool if difficulty matches
            if (!selectedDifficulty || rowDiff === selectedDifficulty) {
                if (!filteredPool[clo]) filteredPool[clo] = [];
                filteredPool[clo].push({ text: questionText, clo });
            }
        });

        // ── 4. Validate ──────────────────────────────────────────────────────
        const cloList = Object.keys(filteredPool);

        if (cloList.length === 0) {
            // Friendly message: tell them what difficulty was searched
            const diffLabel = selectedDifficulty || '(none)';
            return res.status(400).json({
                error: `No questions found for difficulty "${diffLabel}". ` +
                       `Check your Excel file – the Difficulty column values ` +
                       `should be Easy, Medium, or Hard.`
            });
        }

        // ── 5. Generate sets ─────────────────────────────────────────────────
        // Deep-copy the filtered pool so we can splice without destroying it
        // across sets.  We maintain a "used" set per CLO to enforce uniqueness
        // across ALL sets before falling back to random repeats.
        const masterPool   = {};   // remaining unique questions per CLO
        const exhausted    = {};   // questions already used, per CLO (for fallback)

        cloList.forEach(clo => {
            masterPool[clo] = shuffle([...filteredPool[clo]]);
            exhausted[clo]  = [];
        });

        const allSets = [];

        for (let s = 0; s < numSets; s++) {
            const currentSet = [];

            // Distribute questions evenly across CLOs
            const base      = Math.floor(qsPerSet / cloList.length);
            const remainder = qsPerSet % cloList.length;

            cloList.forEach((clo, idx) => {
                const needed = base + (idx < remainder ? 1 : 0);
                const picked = [];

                // ── Phase 1: draw from unique pool ───────────────────────────
                while (picked.length < needed && masterPool[clo].length > 0) {
                    picked.push(masterPool[clo].pop());
                }

                // ── Phase 2: not enough unique questions → use exhausted ones
                //            (reshuffled so order differs between sets)
                if (picked.length < needed && exhausted[clo].length > 0) {
                    const recycled = shuffle([...exhausted[clo]]);
                    while (picked.length < needed && recycled.length > 0) {
                        picked.push(recycled.pop());
                    }
                }

                // ── Phase 3: still not enough → pull random from entire file
                //            (AI-style random generation fallback)
                if (picked.length < needed && allQuestions.length > 0) {
                    const fallback = shuffle([...allQuestions]);
                    while (picked.length < needed) {
                        // cycle through fallback list if needed
                        picked.push(fallback[picked.length % fallback.length]);
                    }
                }

                // Move picked questions to exhausted for this CLO
                exhausted[clo].push(...picked);
                currentSet.push(...picked);
            });

            allSets.push({
                setName: `Set ${String.fromCharCode(65 + s)}`,   // A, B, C…
                header: {
                    institute: req.body.institute_name || '',
                    course:    req.body.course_name    || '',
                    exam:      req.body.exam_title     || ''
                },
                questions: shuffle(currentSet)   // shuffle question order within set
            });
        }

        // ── 6. Respond ───────────────────────────────────────────────────────
        res.json({ success: true, sets: allSets });

    } catch (err) {
        console.error('Backend Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(5000, () => console.log('✅  Server running on http://localhost:5000'));