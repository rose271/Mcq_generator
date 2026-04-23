const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function findKey(row, ...names) {
    return Object.keys(row).find(k =>
        names.includes(k.trim().toLowerCase())
    );
}

app.post('/generate-questions', upload.single('question_file'), (req, res) => {
    try {
        const numSets  = Math.max(1, parseInt(req.body.set_number)      || 1);
        const qsPerSet = Math.max(1, parseInt(req.body.question_number) || 10);
        const selectedDifficulty = (req.body.difficulty || '').trim().toLowerCase();

        if (!req.file) {
            return res.status(400).json({ error: 'No Excel file uploaded.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const data     = xlsx.utils.sheet_to_json(sheet);

        if (!data || data.length === 0) {
            return res.status(400).json({ error: 'The uploaded file appears to be empty.' });
        }

        const QUESTION_KEYS   = ['question', 'short_questions', 'short_question'];
        const CLO_KEYS        = ['clo'];
        const DIFFICULTY_KEYS = ['difficulty'];

        const allQuestions = [];
        const filteredPool = {};

        data.forEach((row) => {
            const qKey    = findKey(row, ...QUESTION_KEYS);
            const cloKey  = findKey(row, ...CLO_KEYS);
            const diffKey = findKey(row, ...DIFFICULTY_KEYS);

            const questionText = qKey   ? String(row[qKey]).trim()   : '';
            const rawClo       = cloKey ? String(row[cloKey]).trim() : 'General';
            const clo          = rawClo.replace(/\s+/g, '');
            const rowDiff      = diffKey ? String(row[diffKey]).trim().toLowerCase() : '';

            if (!questionText) return;

            allQuestions.push({ text: questionText, clo });

            if (!selectedDifficulty || rowDiff === selectedDifficulty) {
                if (!filteredPool[clo]) filteredPool[clo] = [];
                filteredPool[clo].push({ text: questionText, clo });
            }
        });

        const cloList = Object.keys(filteredPool);

        if (cloList.length === 0) {
            const diffLabel = selectedDifficulty || '(none)';
            return res.status(400).json({
                error: `No questions found for difficulty "${diffLabel}". ` +
                       `Check your Excel file – the Difficulty column values ` +
                       `should be Easy, Medium, or Hard.`
            });
        }

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

                while (picked.length < needed && masterPool[clo].length > 0) {
                    picked.push(masterPool[clo].pop());
                }
                if (picked.length < needed && exhausted[clo].length > 0) {
                    const recycled = shuffle([...exhausted[clo]]);
                    while (picked.length < needed && recycled.length > 0) {
                        picked.push(recycled.pop());
                    }
                }
                if (picked.length < needed && allQuestions.length > 0) {
                    const fallback = shuffle([...allQuestions]);
                    while (picked.length < needed) {
                        picked.push(fallback[picked.length % fallback.length]);
                    }
                }

                exhausted[clo].push(...picked);
                currentSet.push(...picked);
            });

            allSets.push({
                setName: `Set ${String.fromCharCode(65 + s)}`,
                header: {
                    institute: req.body.institute_name || '',
                    course:    req.body.course_name    || '',
                    exam:      req.body.exam_title     || ''
                },
                questions: shuffle(currentSet)
            });
        }

        // Generate PDF
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="question_sets.pdf"');

        doc.pipe(res);

        allSets.forEach((set, setIndex) => {
            if (setIndex > 0) doc.addPage();

            doc.fontSize(16).font('Helvetica-Bold')
               .text(set.header.institute || 'Institute Name', { align: 'center' });

            doc.fontSize(12).font('Helvetica')
               .text(`Course: ${set.header.course || 'N/A'}`, { align: 'center' })
               .text(`Exam: ${set.header.exam || 'N/A'}`, { align: 'center' });

            doc.moveDown(0.5);

            doc.fontSize(14).font('Helvetica-Bold')
               .text(`— ${set.setName} —`, { align: 'center' });

            doc.moveDown(0.5);

            doc.moveTo(50, doc.y)
               .lineTo(doc.page.width - 50, doc.y)
               .strokeColor('#000000')
               .stroke();

            doc.moveDown(0.5);

            doc.fontSize(11).font('Helvetica');

            set.questions.forEach((q, i) => {
                if (doc.y > doc.page.height - 100) doc.addPage();

                doc.font('Helvetica').fillColor('#000000')
                   .text(`${i + 1}. ${q.text}`, { width: doc.page.width - 100 });

                doc.moveDown(0.3);
        
                doc.fillColor('#000000');
                doc.moveDown(0.6);
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