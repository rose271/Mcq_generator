// ============================================================
//  server.js  –  Question-Paper Generator Backend
//  Stack: Express · Multer · xlsx · PDFKit · cors
// ============================================================

const express  = require('express');
const multer   = require('multer');
const xlsx     = require('xlsx');
const cors     = require('cors');
const PDFDoc   = require('pdfkit');

const app  = express();
const PORT = 5000;

// ── Multer: keep uploaded file in memory (no temp files needed) ──
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ============================================================
//  UTILITY HELPERS
// ============================================================

/** Fisher-Yates shuffle – returns the same array, shuffled in-place */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Find a key in a row object regardless of letter-case or surrounding spaces.
 * e.g. findKey(row, 'clo', 'CLO') matches a column named "  CLO  " or "clo"
 */
function findKey(row, ...candidates) {
    const keys = Object.keys(row);
    for (const c of candidates) {
        const found = keys.find(k => k.trim().toLowerCase() === c.toLowerCase());
        if (found !== undefined) return found;
    }
    return null;
}

/**
 * Parse a mark-pattern string like "3+4+5" into [3, 4, 5].
 * Ignores anything that isn't a digit or "+".
 */
function parseMarkPattern(str) {
    return String(str)
        .split('+')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
}

// ============================================================
//  ROMAN NUMERALS  (for sub-question labels: i, ii, iii …)
// ============================================================
const ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];

// ============================================================
//  PDF BUILDER
//  Receives the full data for ONE set and streams a PDF buffer.
// ============================================================
function buildPDF(setData, header) {
    return new Promise((resolve, reject) => {

        const chunks = [];
        const doc = new PDFDoc({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 60, right: 60 }
        });

        doc.on('data',  chunk => chunks.push(chunk));
        doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
        doc.on('error', err   => reject(err));

        const W = doc.page.width  - 120;   // usable width
        const GOLD  = '#B8860B';
        const DARK  = '#1a1a2e';
        const MID   = '#444466';
        const LIGHT = '#888899';

        // ── HEADER ──────────────────────────────────────────────
        doc.rect(0, 0, doc.page.width, 110).fill('#1a1a2e');

        doc.fillColor('white')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text(header.institute.toUpperCase(), 60, 22, { width: W, align: 'center' });

        doc.fillColor(GOLD)
           .fontSize(11)
           .font('Helvetica')
           .text(header.exam.toUpperCase(), 60, 44, { width: W, align: 'center' });

        doc.fillColor('#cccccc')
           .fontSize(10)
           .text(header.course, 60, 62, { width: W, align: 'center' });

        // Set label badge (top-right corner of header)
        const badge = setData.setLabel;
        doc.roundedRect(doc.page.width - 90, 18, 48, 26, 4)
           .fill(GOLD);
        doc.fillColor(DARK)
           .font('Helvetica-Bold')
           .fontSize(13)
           .text(`Set ${badge}`, doc.page.width - 90, 25, { width: 48, align: 'center' });

        // Full marks line
        doc.fillColor('#aaaaaa')
           .font('Helvetica')
           .fontSize(9)
           .text(`Full Marks: ${header.fullMarks}   Time: ${header.time}`, 60, 84, { width: W, align: 'right' });

        // ── INSTRUCTION LINE ────────────────────────────────────
        doc.moveDown(0.5);
        doc.y = 118;

        doc.fillColor(DARK)
           .font('Helvetica-Oblique')
           .fontSize(9)
           .text('Answer all questions. Figures in brackets indicate marks. [CLO tags are for internal use only]',
                 60, doc.y, { width: W });

        doc.moveTo(60, doc.y + 6).lineTo(60 + W, doc.y + 6).stroke(GOLD);
        doc.y += 14;

        // ── QUESTION GROUPS ─────────────────────────────────────
        setData.groups.forEach((group, gi) => {
            const qNum = gi + 1;

            // Group header row  –  "Question 1  [12 marks]"
            doc.y += 10;

            doc.font('Helvetica-Bold')
               .fontSize(11)
               .fillColor(DARK)
               .text(`Question ${qNum}`, 60, doc.y, { continued: true });

            const totalMarks = group.subQuestions.reduce((s, q) => s + q.marks, 0);
            doc.font('Helvetica')
               .fillColor(MID)
               .fontSize(10)
               .text(`   [${totalMarks} marks]`, { continued: false });

            // Sub-questions
            group.subQuestions.forEach((sq, si) => {
                doc.y += 7;

                const label = `(${ROMAN[si]})`;
                const marksTag = `[${sq.marks}]`;
                const cloTag = sq.clo;

                const textX = 96;
                const labelX = 72;
                const textWidth = W - 36 - 30; // leave room for marks badge on right
                const marksX = 60 + W - 28;

                const rowStartY = doc.y;

                // Draw sub-question label
                doc.font('Helvetica')
                .fontSize(10)
                .fillColor(DARK)
                .text(label, labelX, rowStartY, { width: 22 });

                // Draw question text (main body)
                doc.font('Helvetica')
                .fontSize(10)
                .fillColor('#111122')
                .text(sq.text, textX, rowStartY, { width: textWidth });

                const afterTextY = doc.y;

                // Draw marks badge aligned to right, same row as question start
                doc.font('Helvetica-Bold')
                .fontSize(9)
                .fillColor(GOLD)
                .text(marksTag, marksX, rowStartY, { width: 28, align: 'right' });

                // CLO tag below question text
                doc.font('Helvetica-Oblique')
                .fontSize(8)
                .fillColor(LIGHT)
                .text(cloTag, textX, afterTextY + 2, { width: textWidth });

                doc.y = afterTextY + 14; // advance cursor past CLO tag
            });

            // Separator line between groups
            doc.y += 8;
            doc.moveTo(60, doc.y)
               .lineTo(60 + W, doc.y)
               .dash(3, { space: 4 })
               .strokeColor('#ccccdd')
               .stroke();
            doc.undash();
        });

        // ── FOOTER ──────────────────────────────────────────────
        const footerY = doc.page.height - 40;
        doc.moveTo(60, footerY - 4).lineTo(60 + W, footerY - 4).stroke('#ccccdd');

        doc.fillColor(LIGHT)
           .font('Helvetica')
           .fontSize(8)
           .text(`${header.course}  ·  ${header.exam}  ·  Set ${badge}  ·  Generated by Question Paper Generator`,
                 60, footerY, { width: W, align: 'center' });

        doc.end();
    });
}

// ============================================================
//  POST  /generate-questions
//
//  Expected FormData fields:
//    institute_name   – string
//    course_name      – string
//    exam_title       – string
//    full_marks       – string  e.g. "84"
//    exam_time        – string  e.g. "3 Hours"
//    set_number       – integer
//    set_start        – "A" | "B" | ... (first set label)
//    groups           – JSON string: Array of { markPattern: "3+4+5" }
//    question_file    – xlsx/xls file
// ============================================================
app.post('/generate-questions', upload.single('question_file'), async (req, res) => {
    try {
        // ── 1. Parse & validate inputs ───────────────────────────
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No Excel file uploaded.' });
        }

        const institute  = (req.body.institute_name || 'Institute of Information Technology').trim();
        const course     = (req.body.course_name    || '').trim();
        const exam       = (req.body.exam_title     || 'Semester Final Examination').trim();
        const fullMarks  = (req.body.full_marks     || '84').trim();
        const examTime   = (req.body.exam_time      || '3 Hours').trim();
        const numSets    = Math.max(1, parseInt(req.body.set_number) || 1);
        const startLabel = (req.body.set_start      || 'A').trim().toUpperCase().charCodeAt(0) - 65; // 0=A,1=B…

        // groups: array of { markPattern }
        let groups = [];
        try {
            groups = JSON.parse(req.body.groups || '[]');
        } catch {
            return res.status(400).json({ success: false, error: 'Invalid groups configuration.' });
        }

        if (!groups || groups.length === 0) {
            return res.status(400).json({ success: false, error: 'Please add at least one question group.' });
        }

        // Parse each group's mark pattern into an array of integers
        const parsedGroups = groups.map((g, i) => {
            const marks = parseMarkPattern(g.markPattern);
            if (marks.length === 0) {
                throw new Error(`Group ${i + 1} has an invalid mark pattern: "${g.markPattern}". Use format like 3+4+5`);
            }
            return { marks };   // e.g. { marks: [3,4,5] }
        });

        // ── 2. Read Excel ────────────────────────────────────────
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const data     = xlsx.utils.sheet_to_json(sheet);

        if (!data || data.length === 0) {
            return res.status(400).json({ success: false, error: 'The Excel file appears to be empty.' });
        }

        // ── 3. Build question pool keyed by CLO ─────────────────
        //
        // We support flexible column names:
        //   Question column: "Question", "Short_Question", "Short Question", "Q"
        //   CLO column:      "CLO", "clo"
        //   Marks column:    "Marks", "Mark", "marks", "mark"
        //
        // Each entry: { text, clo, marks }

        const pool = {};   // { "CLO1": [{text,clo,marks}, ...], "CLO2": [...], ... }

        data.forEach(row => {
            const qKey    = findKey(row, 'question', 'short_question', 'short question', 'q', 'questions');
            const cloKey  = findKey(row, 'clo');
            const mrkKey  = findKey(row, 'marks', 'mark');

            const text  = qKey   ? String(row[qKey]).trim()  : '';
            const rawClo = cloKey ? String(row[cloKey]).trim().replace(/\s+/g,'').toUpperCase() : 'CLO1';
            const marks  = mrkKey ? parseInt(row[mrkKey], 10) : null;   // may be null

            if (!text) return;   // skip blank rows

            if (!pool[rawClo]) pool[rawClo] = [];
            pool[rawClo].push({ text, clo: rawClo, marks });
        });

        const availableCLOs = Object.keys(pool);
        if (availableCLOs.length === 0) {
            return res.status(400).json({ success: false, error: 'No questions could be read. Check column names (Question, CLO, Marks).' });
        }

        // ── 4. Generate sets ─────────────────────────────────────
        //
        // Strategy:
        //   For each group in each set we need N sub-questions (one per mark value).
        //   We pick questions round-robin from available CLOs so CLO coverage
        //   is balanced across sub-questions.
        //   We track used questions globally to maximise uniqueness across sets.

        // Deep-copy pool into a "remaining" structure we can deplete
        const remaining = {};
        availableCLOs.forEach(clo => {
            remaining[clo] = shuffle([...pool[clo]]);
        });

        // used: archive for fallback recycling
        const used = {};
        availableCLOs.forEach(clo => { used[clo] = []; });

        /**
         * Pick ONE question from the pool for a given CLO.
         * Falls back: remaining → used (reshuffled) → any CLO → repeat
         */
        function pickQuestion(preferredClo, desiredMarks) {
            // Priority list: preferred CLO first, then others
            const cloOrder = [preferredClo, ...availableCLOs.filter(c => c !== preferredClo)];

            for (const clo of cloOrder) {
                if (!remaining[clo]) continue;

                // Try to find a question matching desired marks (if marks column exists)
                let idx = -1;
                if (desiredMarks !== null) {
                    idx = remaining[clo].findIndex(q => q.marks === desiredMarks);
                }
                if (idx === -1 && remaining[clo].length > 0) idx = 0;   // fallback: any question

                if (idx !== -1) {
                    const [q] = remaining[clo].splice(idx, 1);
                    used[clo].push(q);
                    return { ...q, marks: desiredMarks ?? q.marks };   // honour requested marks
                }
            }

            // Everything exhausted → recycle from used pool (reshuffled)
            for (const clo of cloOrder) {
                if (used[clo] && used[clo].length > 0) {
                    const recycled = shuffle([...used[clo]]);
                    const q = recycled[0];
                    return { ...q, marks: desiredMarks ?? q.marks };
                }
            }

            // Absolute last resort
            return { text: '[Question not available]', clo: preferredClo, marks: desiredMarks || 0 };
        }

        const allSets = [];

        for (let s = 0; s < numSets; s++) {
            const setLabel = String.fromCharCode(65 + startLabel + s);   // A, B, C…

            // Assign CLOs to sub-questions in round-robin order
            // CLO1 → first sub-question, CLO2 → second, etc.
            // We reset the CLO index at the start of each set for consistency.
            let cloIndex = 0;

            const groupResults = parsedGroups.map(group => {
                const subQuestions = group.marks.map(markValue => {
                    const clo = availableCLOs[cloIndex % availableCLOs.length];
                    cloIndex++;
                    return pickQuestion(clo, markValue);
                });
                return { subQuestions };
            });

            allSets.push({ setLabel, groups: groupResults });
        }

        // ── 5. Build PDFs and return as base64 strings ───────────
        const header = {
            institute: institute,
            course:    course,
            exam:      exam,
            fullMarks: fullMarks,
            time:      examTime
        };

        const pdfResults = [];

        for (const setData of allSets) {
            const pdfBuffer = await buildPDF(setData, header);
            pdfResults.push({
                setLabel:  setData.setLabel,
                pdfBase64: pdfBuffer.toString('base64')
            });
        }

        // ── 6. Respond ───────────────────────────────────────────
        res.json({ success: true, sets: pdfResults });

    } catch (err) {
        console.error('Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Health check ────────────────────────────────────────────
app.get('/', (req, res) => res.send('Question Paper Generator API is running.'));

app.listen(PORT, () => {
    console.log(`\n✅  Server running at http://localhost:${PORT}`);
    console.log(`   Upload Excel → POST /generate-questions\n`);
});