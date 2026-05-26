/**
 * generate_paper.js  — with full diagnostics
 *
 * Required CDN scripts in HTML (order matters):
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
 *   <script src="https://unpkg.com/docx@8.5.0/build/index.js"></script>
 *   <script src="generate_paper.js"></script>
 *
 * In create_que.js replace generate() body with:  generateDocx();
 */

// ─── Column names must match your Excel header row exactly ───────────────────
const COL_MARKS = ['1 Marks','2 Marks','3 Marks','4 Marks','5 Marks','6 Marks','7 Marks'];
const COL_MCQ   = 'MCQ';
const COL_TF    = 'T/F';
let cachedRows = [];

// ─── tiny diagnostic popup ───────────────────────────────────────────────────
function err(msg) { alert('❌ ERROR:\n\n' + msg); }
function info(msg){ alert('ℹ️  ' + msg); }

// ─── Seeded shuffle (different order per set) ─────────────────────────────────
function shuffled(arr, seed) {
  const a = [...arr];
  let s = Math.abs(seed) || 1;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Pick N items (rotating through pool) ────────────────────────────────────
function pick(pool, n, seed) {
  if (!pool || !pool.length) return Array(n).fill('(No question available)');
  const rot = shuffled(pool, seed);
  return Array.from({ length: n }, (_, i) => rot[i % rot.length]);
}

// ─── Distribute total marks evenly across n sub-questions ────────────────────
function distributeEvenly(total, n) {
  if (n <= 0) return [];
  const base = Math.floor(total / n), extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// ─── Read Excel file → array of row-objects ───────────────────────────────────
function readExcelRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(rows);
      } catch (ex) { reject(ex); }
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsArrayBuffer(file);
  });
}

async function preparePaperContent() {

  if(!window.generatedPDFHTML){

    await generateDocx(true);

  }

  return {
    pdfHTML: window.generatedPDFHTML || ''
  };

}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function generateDocx(skipHistory = false) {  console.log('[generate] starting…');
  window.generatedPDFHTML = '';

  // 1. Check dependencies
  if (typeof XLSX === 'undefined')    { err('XLSX library not loaded.\nAdd the SheetJS CDN <script> before generate_paper.js.'); return; }
  if (typeof saveAs === 'undefined')  { err('FileSaver not loaded.\nAdd the FileSaver CDN <script> before generate_paper.js.'); return; }
  if (typeof docx === 'undefined')    { err('docx library not loaded.\nAdd the docx CDN <script> (unpkg.com/docx@8.5.0) before generate_paper.js.'); return; }

// 2. Check file upload OR cached data
const fileInput = document.getElementById('fileInput');

if (
  (!fileInput || !fileInput.files || !fileInput.files.length)
  &&
  !cachedRows.length
) {

  err(
    'No Excel file uploaded.\nPlease click "Upload" and choose your question-bank .xlsx file.'
  );

  return;

}

  // 3. Collect UI values (with fallbacks so nothing crashes)
  const g = id => (document.getElementById(id) || {}).value || '';
  const inst       = g('instName');
  const examName   = g('examName');
  const courseCode = g('courseCode');
  const courseTitle= g('courseTitle');
  const examYear   = g('examYear');
  const dur        = g('durationInput') || '30';
  const durUnit    = g('durationUnit')  || 'min';
  const numSets    = Math.max(1, parseInt(g('numSets')) || 1);

  // totalMarks from existing calcTotal()
  let totalMarks = 0;
  try { totalMarks = calcTotal(); } catch(e) { console.warn('calcTotal() failed', e); }

  // 4. Parse the written mark distribution from the UI
  const writtenSections = [];
  const getWritten = (type) => {
    if (!selectedTypes.has(type)) return;
    const cnt  = parseInt((document.getElementById('count_' + type) || {}).value) || 0;
    const dist = ((document.getElementById('marks_' + type) || {}).value || '')
                   .split('+').map(v => parseFloat(v.trim())).filter(v => !isNaN(v) && v > 0);
    if (cnt > 0 && dist.length > 0) writtenSections.push({ type, count: cnt, dist });
  };
  getWritten('written-no-layer');
  getWritten('written-layer');

  const mcqCount  = selectedTypes.has('mcq')       ? (parseInt((document.getElementById('count_mcq')       ||{}).value)||0) : 0;
  const mcqMarks  = selectedTypes.has('mcq')       ? (parseFloat((document.getElementById('marks_mcq')     ||{}).value)||0) : 0;
  const tfCount   = selectedTypes.has('truefalse') ? (parseInt((document.getElementById('count_truefalse') ||{}).value)||0) : 0;
  const tfMarks   = selectedTypes.has('truefalse') ? (parseFloat((document.getElementById('marks_truefalse')||{}).value)||0) : 0;

  console.log('[generate] writtenSections', writtenSections, 'mcq', mcqCount, 'tf', tfCount);

// 5. Read Excel (or reuse cached rows)
let rows = cachedRows;

if(!rows.length){

  try {

    rows = await readExcelRows(fileInput.files[0]);

    cachedRows = rows;

  } catch(ex) {

    err('Could not read the Excel file:\n' + ex.message);

    return;

  }

}

if (!rows.length) {

  err('Excel file appears empty.');

  return;

}

  console.log('[generate] Excel rows:', rows.length, '| columns:', Object.keys(rows[0]));

  // Build question pools
  const writtenPool = {};
  COL_MARKS.forEach(col => {
    const mark = parseInt(col);
    writtenPool[mark] = rows.map(r => (r[col]||'').toString().trim()).filter(Boolean);
    console.log(`[pool] ${col}: ${writtenPool[mark].length} questions`);
  });

  const mcqPool = rows.map(r => ({
    q: (r[COL_MCQ]||'').toString().trim(),
    a: (r['A']||'').toString().trim(),
    b: (r['B']||'').toString().trim(),
    c: (r['C']||'').toString().trim(),
    d: (r['D']||'').toString().trim(),
  })).filter(r => r.q);
  console.log('[pool] MCQ:', mcqPool.length);

  const tfPool = rows.map(r => {
    const raw = (r[COL_TF]||'').toString().trim();
    if (!raw) return null;
    const isTrue = /^true/i.test(raw);
    const stmt   = raw.replace(/^(true|false):\s*/i,'');
    return { stmt, answer: isTrue ? 'True' : 'False' };
  }).filter(Boolean);
  console.log('[pool] T/F:', tfPool.length);

  // 6. Build docx
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, PageBreak,
  } = docx;

  const W = 9360; // content width in DXA (Letter, 0.75 in margins each side)
  const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const NONE_BORDERS = { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER };

  // ── paragraph factories ────────────────────────────────────────────────────
  const TR = (text, opts={}) => new TextRun({
    text, font:'Times New Roman', size: opts.size||22,
    bold: opts.bold||false, italics: opts.italic||false, color: opts.color||'000000'
  });

  const P = (runs, opts={}) => new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before||40, after: opts.after||40 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    border: opts.borderBottom ? {
      bottom: { style: BorderStyle.SINGLE, size: opts.borderSize||4, color: opts.borderColor||'000000', space: opts.borderSpace||2 }
    } : undefined,
    children: Array.isArray(runs) ? runs : [TR(runs, opts)]
  });

  const rule = () => P([], { borderBottom: true, borderSize: 6, borderColor:'222222', borderSpace:4, before:60, after:60 });

  const sectionHead = (text) => P(
    [TR(text, { bold:true, size:23 })],
    { align: AlignmentType.CENTER, borderBottom:true, borderSize:4, borderColor:'444444', borderSpace:6, before:140, after:80 }
  );

  const noCell = (children, width) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: NONE_BORDERS,
    children
  });

  const metaTable = (rows2col) => new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W/2, W/2],
    borders: { top:NONE_BORDER, bottom:NONE_BORDER, left:NONE_BORDER, right:NONE_BORDER, insideH:NONE_BORDER, insideV:NONE_BORDER },
    rows: rows2col.map(([left, right]) => new TableRow({ children: [
      noCell([P([TR(left)], { before:20, after:20 })], W/2),
      noCell([P([TR(right)], { align: AlignmentType.RIGHT, before:20, after:20 })], W/2),
    ]}))
  });

  // ── Assemble all sets ──────────────────────────────────────────────────────
  const SEC = ['A','B','C','D','E','F'];
  const docSections = [];

  for (let si = 0; si < numSets; si++) {
    let pdfHTML = '';
    const children = [];

pdfHTML += `
  <div style="text-align:center; margin-bottom:20px;">

    <h1 style="margin:0;">
      ${inst}
    </h1>

    <h2 style="margin:6px 0 14px;">
      ${examName}
    </h2>

    <div>
      <strong>Duration:</strong>
      ${dur} ${durUnit}

      &nbsp;&nbsp;&nbsp;&nbsp;

      <strong>Full Marks:</strong>
      ${totalMarks}
    </div>

    <div style="margin-top:6px;">
      <strong>Course Code:</strong>
      ${courseCode}

      &nbsp;&nbsp;&nbsp;&nbsp;

      <strong>Course Title:</strong>
      ${courseTitle}
    </div>

    <div style="margin-top:6px;">
      <strong>Year:</strong>
      ${examYear}
    </div>

    <hr style="margin-top:18px;">
  </div>
`;

    let secIdx = 0;

    // Header
    children.push(P([TR(inst,      { bold:true, size:28 })], { align:AlignmentType.CENTER, before:40, after:20 }));
    children.push(P([TR(examName,  { bold:true, size:24 })], { align:AlignmentType.CENTER, before:0,  after:40 }));
    children.push(rule());

    const setLabel = numSets > 1 ? `Set: ${String.fromCharCode(65+si)}` : '';
    children.push(metaTable([
      [`Duration: ${dur} ${durUnit}`,         `Full Marks: ${totalMarks}`],
      [`Course Code: ${courseCode}`,           `Course Title: ${courseTitle}`],
      [`Year: ${examYear}`,                    setLabel],
    ]));
    children.push(rule());

    // ── Written sections ────────────────────────────────────────────────────
for (const ws of writtenSections) {

  const lbl = SEC[secIdx++] || '?';

  let secTotal = 0;

  // ── NON-LAYER TOTAL ─────────────────────────────────────────────
  if (ws.type === 'written-no-layer') {

    for (let i = 0; i < ws.count; i++) {
      secTotal += ws.dist[i % ws.dist.length];
    }

  }

  // ── LAYER TOTAL ─────────────────────────────────────────────────
  else {

    const perQuestionMarks =
      ws.dist.reduce((a,b)=>a+b, 0);

    secTotal =
      perQuestionMarks * ws.count;

  }

  children.push(
    sectionHead(
      `Section ${lbl} — Written Questions   [Total: ${secTotal} Marks]`
    )
  );
pdfHTML += `
  <h2 style="
    margin-top:28px;
    border-bottom:1px solid #444;
    padding-bottom:6px;
  ">
    Section ${lbl} — Written Questions
    [Total: ${secTotal} Marks]
  </h2>

  <div style="
    font-style:italic;
    margin-bottom:16px;
  ">
    Answer all questions.
    Marks are indicated beside each question.
  </div>
`;
  children.push(P([
    TR(
      'Answer all questions. Marks are indicated beside each question.',
      { italic:true }
    )
  ], {
    align:AlignmentType.LEFT,
    before:30,
    after:80
  }));

  // ────────────────────────────────────────────────────────────────
  // QUESTION GENERATION
  // ────────────────────────────────────────────────────────────────

  for (let qi = 0; qi < ws.count; qi++) {

    /* ============================================================
       WRITTEN NO LAYER
    ============================================================ */
    if (ws.type === 'written-no-layer') {

      const currentMark =
        ws.dist[qi % ws.dist.length];

      const pool =
        writtenPool[currentMark] || [];

      const qText =
        pick(pool, 1, si*997 + qi*31)[0];

      children.push(P([
        TR(`${qi + 1}. `, { bold:true }),
        TR(qText),
        TR(`   [${currentMark}]`, {
          bold:true,
          color:'555555'
        }),
      ], {
        before:100,
        after:10
      }));

      pdfHTML += `
  <div style="margin-bottom:14px;">
    <strong>${qi + 1}.</strong>
    ${qText}
    <strong>[${currentMark}]</strong>
  </div>
`;

      // answer lines
  children.push(P([], {
  before:4,
  after:8
}));

    }

    /* ============================================================
       WRITTEN WITH LAYER
    ============================================================ */
    else {

      const firstMark =
        ws.dist[0];

      const pool =
        writtenPool[firstMark] || [];

      const qText =
        pick(pool, 1, si*997 + qi*31)[0];

      const matchedRow = rows.find(r =>
        (
          r[
            `${firstMark} Mark${firstMark > 1 ? 's' : ''}`
          ] || ''
        )
        .toString()
        .trim() === qText
      );

      if (!matchedRow) continue;

      const stimulus =
        matchedRow['Stimulus (Case/Diagram/Table)']
        || 'Case / Diagram';

      const totalLayerMarks =
        ws.dist.reduce((a,b)=>a+b, 0);

      // Main stimulus
      children.push(P([
        TR(`${qi + 1}. `, { bold:true }),
        TR(stimulus),
        TR(`   [${totalLayerMarks}]`, {
          bold:true,
          color:'555555'
        }),
      ], {
        before:100,
        after:20
      }));

      pdfHTML += `
  <div style="margin-top:18px;">
    <strong>${qi + 1}.</strong>
    ${stimulus}
    <strong>[${totalLayerMarks}]</strong>
  </div>
`;

      // layered subquestions
      ws.dist.forEach((neededMark, subIndex) => {

        const key =
          `${neededMark} Mark${neededMark > 1 ? 's' : ''}`;

        const subQ =
          (matchedRow[key] || '')
            .toString()
            .trim();

        if (!subQ) return;

        const letter =
          String.fromCharCode(97 + subIndex);

        children.push(P([
          TR(`${letter}) `, { bold:true }),
          TR(subQ),
          TR(`   [${neededMark}]`, {
            bold:true,
            color:'555555'
          }),
        ], {
          indent:360,
          before:50,
          after:8
        }));
      pdfHTML += `
  <div style="margin-left:30px;">
    <strong>${letter})</strong>
    ${subQ}
    <strong>[${neededMark}]</strong>
  </div>
`;

      });

      children.push(P([], {
        before:10,
        after:16
      }));

    }

  }

}
// ── MCQ section ─────────────────────────────────────────────────────────
    if (mcqCount > 0) {
      if (!mcqPool.length) {
        children.push(P([TR('(MCQ pool empty — check Excel MCQ column)')], { before:80 }));
      } else {
        const lbl      = SEC[secIdx++] || '?';
        const secTotal = (mcqMarks * mcqCount).toFixed(1);
        children.push(sectionHead(`Section ${lbl} — Multiple Choice   [${mcqMarks} × ${mcqCount} = ${secTotal} Marks]`));
        pdfHTML += `
  <h2 style="
    margin-top:28px;
    border-bottom:1px solid #444;
    padding-bottom:6px;
  ">
    Section ${lbl} — Multiple Choice
    [${mcqMarks} × ${mcqCount} = ${secTotal} Marks]
  </h2>

  <div style="
    font-style:italic;
    margin-bottom:16px;
  ">
    Circle the letter of the best answer.
  </div>
`;
        children.push(P([TR('Circle the letter of the best answer.', {italic:true})], { before:30, after:80 }));

        const chosen = pick(mcqPool, mcqCount, si*53);
        const half = Math.floor((W - 720) / 2);

        chosen.forEach((item, qi) => {
          children.push(P([TR(`${qi+1}. `, {bold:true}), TR(item.q)], { before:100, after:8 }));

          // 2×2 option table
          const optRow = (pairs) => new TableRow({ children: pairs.map(([ltr, val]) =>
            noCell([P([TR(`${ltr}. `, {bold:true}), TR(val||'')], { before:10, after:10 })], half)
          )});
          children.push(new Table({
            width: { size: W-720, type: WidthType.DXA },
            columnWidths: [half, half],
            indent: { size:360, type:WidthType.DXA },
            borders: { top:NONE_BORDER, bottom:NONE_BORDER, left:NONE_BORDER, right:NONE_BORDER, insideH:NONE_BORDER, insideV:NONE_BORDER },
            rows: [
              optRow([['A', item.a], ['B', item.b]]),
              optRow([['C', item.c], ['D', item.d]]),
            ]
          }));

          pdfHTML += `
  <div style="margin-top:14px;">
    <strong>${qi+1}.</strong>
    ${item.q}

    <div style="margin-left:20px; margin-top:6px;">
      A. ${item.a}<br>
      B. ${item.b}<br>
      C. ${item.c}<br>
      D. ${item.d}
    </div>
  </div>
`;

          children.push(P([], { before:4, after:4 }));
        });
      }
    }

    // ── True/False section ───────────────────────────────────────────────────
    if (tfCount > 0) {
      if (!tfPool.length) {
        children.push(P([TR('(T/F pool empty — check Excel T/F column)')], { before:80 }));
      } else {
        const lbl      = SEC[secIdx++] || '?';
        const secTotal = (tfMarks * tfCount).toFixed(1);
        children.push(sectionHead(`Section ${lbl} — True / False   [${tfMarks} × ${tfCount} = ${secTotal} Marks]`));
        pdfHTML += `
  <h2 style="
    margin-top:28px;
    border-bottom:1px solid #444;
    padding-bottom:6px;
  ">
    Section ${lbl} — True / False
    [${tfMarks} × ${tfCount} = ${secTotal} Marks]
  </h2>

  <div style="
    font-style:italic;
    margin-bottom:16px;
  ">
    Write "True" or "False" in the space provided.
  </div>
`;
        children.push(P([TR('Write "True" or "False" in the space provided.', {italic:true})], { before:30, after:80 }));

        pick(tfPool, tfCount, si*79).forEach((item, qi) => {
          children.push(P([
            TR(`${qi+1}. `, {bold:true}),
            TR(item.stmt),
            TR('    Answer: ___________', {color:'777777'}),
          ], { before:70, after:10 }));

          pdfHTML += `
  <div style="margin-top:10px;">
    <strong>${qi+1}.</strong>
    ${item.stmt}

    <span style="color:#777;">
      Answer: ___________
    </span>
  </div>
`;
        });
      }
    }

    // Page break between sets
    if (si < numSets - 1) {
      children.push(new Paragraph({ children:[new PageBreak()], spacing:{before:0,after:0} }));
    }

window.generatedPDFHTML += `
  <div style="
    ${si < numSets - 1 ? 'page-break-after:always;' : ''}
  ">
    ${pdfHTML}
  </div>
`;

docSections.push({
      properties: {
        page: {
          size: { width:12240, height:15840 },
          margin: { top:1080, right:1080, bottom:1080, left:1080 }
        }
      },
      children
    });
  }

  // 7. Pack and save
  let blob;
  try {
    const doc2 = new Document({
      styles: { default: { document: { run: { font:'Times New Roman', size:22 } } } },
      sections: docSections
    });
    blob = await Packer.toBlob(doc2);
  } catch(ex) {
    err('docx build failed:\n' + ex.message + '\n\nCheck console for details.');
    console.error('[generate] docx error:', ex);
    return;
  }

  try {
const fname = `${courseCode || 'QuestionPaper'}_${examYear || new Date().getFullYear()}.docx`;

if(!skipHistory){

  saveAs(blob, fname);

}

console.log('[generate] done →', fname);

    if(!skipHistory){

  addToDownloadHistory({
    name: fname.replace('.docx', ''),
    type: 'docx',
    size: parseFloat((blob.size / (1024 * 1024)).toFixed(2)),
    date: new Date().toISOString().split('T')[0],
  });

}
    // ─────────────────────────────────────────────────────────────────────────

  } catch(ex) {
    err('File save failed:\n' + ex.message);
  }
}

// ── Download History helper ────────────────────────────────────────────────────
// Writes a new entry into the same localStorage key that download.js reads.
// Safe to call from any page — download.js will pick it up when the user visits.
function addToDownloadHistory(entry) {
  const STORAGE_KEY  = 'examcraft_downloads';
  const SEED_VERSION = 'v1';

  try {
    // Load existing list (ignore seed-version lock so we keep user's list)
    let existing = [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    }

    // Build new record
    const newRecord = {
      id:   'gen_' + Date.now(),          // unique id (won't clash with seed f1–f7)
      name: entry.name,
      type: entry.type,
      size: entry.size,
      date: entry.date,
    };

    // Prepend so newest appears first
    existing.unshift(newRecord);

    // Save back (also update version so download.js doesn't wipe with seed data)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    localStorage.setItem(STORAGE_KEY + '_version', SEED_VERSION);

    console.log('[history] saved →', newRecord);
  } catch(ex) {
    console.warn('[history] could not save to localStorage:', ex);
  }

}

async function generatePDF(){

  const {
    pdfHTML
  } = await preparePaperContent();

  const g = id =>
    (document.getElementById(id) || {}).value || '';

  const courseCode = g('courseCode');

  const examYear = g('examYear');

  // Create hidden printable container
  const container =
    document.createElement('div');

  container.innerHTML = `
    <div style="
      padding:40px;
      font-family:'Times New Roman';
      color:#000;
      line-height:1.8;
      font-size:16px;
    ">
      ${pdfHTML}
    </div>
  `;

  html2pdf()
    .from(container)
    .set({

      margin:10,

      filename:
        `${courseCode || 'QuestionPaper'}_${examYear || new Date().getFullYear()}.pdf`,

      html2canvas:{
        scale:2
      },

      jsPDF:{
        unit:'mm',
        format:'a4',
        orientation:'portrait'
      }

    })
    .save()
    .then(() => {

      addToDownloadHistory({
        name:
          `${courseCode || 'QuestionPaper'}_${examYear || new Date().getFullYear()}`,
        type:'pdf',
        size:0,
        date:new Date().toISOString().split('T')[0],
      });

    });

}

