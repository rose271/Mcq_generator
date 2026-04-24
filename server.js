const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');
const PDFDocument = require('pdfkit');

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
// Helper: normalize difficulty values (robust)
// ---------------------------------------------------------------------------
function normalizeDifficulty(val) {
    if (!val) return '';
    return String(val)
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, '');
}

function mapDifficulty(val) {
    const norm = normalizeDifficulty(val);
    if (norm.startsWith('e')) return 'easy';
    if (norm.startsWith('m')) return 'medium';
    if (norm.startsWith('h')) return 'hard';
    return '';
}

// ---------------------------------------------------------------------------
// POST /generate-questions
// ---------------------------------------------------------------------------
app.post('/generate-questions', upload.single('question_file'), (req, res) => {
    try {
        const numSets  = Math.max(1, parseInt(req.body.set_number)      || 1);
        const qsPerSet = Math.max(1, parseInt(req.body.question_number) || 10);
        const selectedDifficulty = mapDifficulty(req.body.difficulty);

        if (!req.file) {
            return res.status(400).json({ error: 'No Excel file uploaded.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];

        // FIX: Use defval so empty cells become '' instead of being skipped,
        // and raw:false so numbers/dates become strings automatically.
        const data = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });

        if (!data || data.length === 0) {
            return res.status(400).json({ error: 'The uploaded file appears to be empty.' });
        }

        // ── FIX: Detect column keys ONCE from the first row ──────────────────
        // This prevents findKey from returning different results per row and
        // also catches headers with invisible unicode/whitespace characters.
        const firstRow = data[0];

        const QUESTION_KEYS   = ['question', 'short_questions', 'short_question', 'short questions', 'questions'];
        const CLO_KEYS        = ['clo'];
        const DIFFICULTY_KEYS = ['difficulty'];

        const qKeyGlobal    = findKey(firstRow, ...QUESTION_KEYS);
        const cloKeyGlobal  = findKey(firstRow, ...CLO_KEYS);
        const diffKeyGlobal = findKey(firstRow, ...DIFFICULTY_KEYS);

        // Debug: log detected column names
        console.log('Detected columns → question:', qKeyGlobal, '| clo:', cloKeyGlobal, '| difficulty:', diffKeyGlobal);
        console.log('All headers in file:', Object.keys(firstRow));

        if (!diffKeyGlobal) {
            return res.status(400).json({
                error: `Could not find a "Difficulty" column. ` +
                       `Headers found: ${Object.keys(firstRow).join(', ')}`
            });
        }

        const allQuestions = [];
        const filteredPool = {};

        data.forEach((row, idx) => {
            // ── FIX: Use the globally detected keys, not per-row detection ──
            const questionText = qKeyGlobal    ? String(row[qKeyGlobal]).trim()    : '';
            const rawClo       = cloKeyGlobal  ? String(row[cloKeyGlobal]).trim()  : 'General';
            const cloDisplay   = rawClo;
            const cloKey2      = rawClo.replace(/\s+/g, '');

            // ── FIX: Read difficulty using the globally detected key ─────────
            const rawDiff  = row[diffKeyGlobal];
            const rowDiff  = mapDifficulty(rawDiff);

            // Debug log
            console.log(`Row ${idx + 1}: rawDiff="${rawDiff}", mapped="${rowDiff}", selectedDifficulty="${selectedDifficulty}"`);

            if (!questionText) return;

            allQuestions.push({ text: questionText, clo: cloKey2, cloDisplay });

            // ── FIX: When no difficulty is selected, include ALL questions ───
            const diffMatches = !selectedDifficulty || rowDiff === selectedDifficulty;

            if (diffMatches) {
                if (!filteredPool[cloKey2]) filteredPool[cloKey2] = [];
                filteredPool[cloKey2].push({ text: questionText, clo: cloKey2, cloDisplay });
            }
        });

        const cloList = Object.keys(filteredPool).sort();

        if (cloList.length === 0) {
            const diffLabel = selectedDifficulty || '(none)';
            return res.status(400).json({
                error: `No questions found for difficulty "${diffLabel}". ` +
                       `Check your Excel file – the Difficulty column values ` +
                       `should be Easy, Medium, or Hard.`
            });
        }

        // Build master + exhausted pools
        const masterPool = {};
        const exhausted  = {};
        cloList.forEach(clo => {
            masterPool[clo] = shuffle([...filteredPool[clo]]);
            exhausted[clo]  = [];
        });

        const allSets = [];

        for (let s = 0; s < numSets; s++) {
            const currentSet = [];
            const base       = Math.floor(qsPerSet / cloList.length);
            const remainder  = qsPerSet % cloList.length;

            cloList.forEach((clo, idx) => {
                const needed = base + (idx < remainder ? 1 : 0);
                const picked = [];

                // Phase 1: unique pool
                while (picked.length < needed && masterPool[clo].length > 0) {
                    picked.push(masterPool[clo].pop());
                }
                // Phase 2: recycled (reshuffled exhausted)
                if (picked.length < needed && exhausted[clo].length > 0) {
                    const recycled = shuffle([...exhausted[clo]]);
                    while (picked.length < needed && recycled.length > 0) {
                        picked.push(recycled.pop());
                    }
                }
                // Phase 3: random fallback from entire file
                if (picked.length < needed && allQuestions.length > 0) {
                    const fallback = shuffle([...allQuestions]);
                    while (picked.length < needed) {
                        picked.push(fallback[picked.length % fallback.length]);
                    }
                }

                exhausted[clo].push(...picked);
                currentSet.push(...picked);
            });

            // Sort questions by CLO so they appear CLO1, CLO2, CLO3... in the PDF
            const sortedSet = [...currentSet].sort((a, b) => a.clo.localeCompare(b.clo));

            allSets.push({
                setName: `Set ${String.fromCharCode(65 + s)}`,
                header: {
                    institute: req.body.institute_name || '',
                    course:    req.body.course_name    || '',
                    exam:      req.body.exam_title     || ''
                },
                questions: sortedSet
            });
        }

        // ── PDF Generation ───────────────────────────────────────────────────
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="question_sets.pdf"');
        doc.pipe(res);

        const PAGE_W    = doc.page.width;
        const MARGIN    = 50;
        const CONTENT_W = PAGE_W - MARGIN * 2;
        const CLO_W     = 50;
        const Q_W       = CONTENT_W - CLO_W - 15;

        allSets.forEach((set, setIndex) => {
            if (setIndex > 0) doc.addPage();

            // ── Header ───────────────────────────────────────────────────────
            doc.fontSize(16).font('Helvetica-Bold')
               .text(set.header.institute || 'Institute Name', { align: 'center' });

            doc.fontSize(12).font('Helvetica')
               .text(`Course: ${set.header.course || 'N/A'}`, { align: 'center' })
               .text(`Exam:   ${set.header.exam   || 'N/A'}`, { align: 'center' });

            doc.moveDown(0.5);

            doc.fontSize(14).font('Helvetica-Bold')
               .text(`— ${set.setName} —`, { align: 'center' });

            doc.moveDown(0.5);

            // Horizontal rule
            doc.moveTo(MARGIN, doc.y)
               .lineTo(PAGE_W - MARGIN, doc.y)
               .strokeColor('#000000').stroke();

            doc.moveDown(0.6);
            doc.moveDown(0.2);

            // ── Questions ─────────────────────────────────────────────────────
            set.questions.forEach((q, i) => {
                if (doc.y > doc.page.height - 100) {
                    doc.addPage();
                    doc.moveDown(0.5);
                }

                const rowY = doc.y;
                const questionStr = `${i + 1}.  ${q.text}`;

                doc.fontSize(11).font('Helvetica');
                const textHeight = doc.heightOfString(questionStr, { width: Q_W, lineGap: 2 });

                doc.fillColor('#000000')
                   .text(questionStr, MARGIN, rowY, { width: Q_W, lineGap: 2 });

                doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
                   .text(`[${q.cloDisplay}]`, MARGIN + Q_W + 15, rowY, {
                       width: CLO_W,
                       align: 'right'
                   });

                doc.y = rowY + textHeight + 10;
            });
        });

        doc.end();

    } catch (err) {
        console.error('Backend Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

app.listen(5000, () => console.log('✅  Server running on http://localhost:5000'));