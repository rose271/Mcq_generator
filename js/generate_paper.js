/**
 * Required CDN scripts in HTML (order matters):
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
 *   <script src="https://unpkg.com/docx@8.5.0/build/index.js"></script>
 *   <script src="generate_paper.js"></script>
 */

// ─── Column names — must match your Excel header row exactly ─────────────────
const COL_MARKS = ['1 Mark','2 Marks','3 Marks','4 Marks','5 Marks','6 Marks','7 Marks'];
const COL_MCQ   = 'MCQ';
const COL_TF    = 'T/F';
let cachedRows  = [];
const writtenPool = {};

// ─── tiny diagnostic popup ───────────────────────────────────────────────────
function err(msg)  { alert('❌ ERROR:\n\n' + msg); }
function info(msg) { alert('ℹ️  ' + msg); }

// ─── Seeded shuffle (different order per set) ────────────────────────────────
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Pick N unique items from pool (no repeats, with used-set awareness) ─────
// usedSet: Set of already-used question strings (mutated in place)
function pickUnique(mark, n, usedSet) {
    let pool;
    if(Array.isArray(mark)) {pool = [...mark];}
    else {pool = writtenPool[mark] || [];}

    if (!pool.length) return Array(n).fill('(No questions there)');
    const unused = pool.filter(q => !usedSet.has(q));
    if (!unused.length) return Array(n).fill('(No unused questions available)');
    const shuffledPool = shuffled(unused);
    const result = [];
    for (let i = 0; i < n; i++) {
      if(i < shuffledPool.length)
      {
        const q = shuffledPool[i];
        result.push(q);
        usedSet.add(q);
        // Only removing from writtenPool if we're in the numeric mark case
        if (!Array.isArray(mark)) {
          const idx = writtenPool[mark].indexOf(q);
          if (idx !== -1) writtenPool[mark].splice(idx, 1);
        }
      } else {
        result.push('(Not enough questions)');
      }
    }
    console.log("writtenPool: ", writtenPool);
    return result;
  }

// ─── Read Excel file → array of row-objects ──────────────────────────────────
function readExcelRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        // Fill merged cells
        if (ws['!merges']) {
          ws['!merges'].forEach(range => {
            const startCell = XLSX.utils.encode_cell(range.s);
            const value = ws[startCell] ? ws[startCell].v : '';
            for (let r = range.s.r; r <= range.e.r; r++) {
              let c = range.s.c;
              const cellAddr = XLSX.utils.encode_cell({ r, c });
              if (!ws[cellAddr]) ws[cellAddr] = { t: 's', v: value };
              
            }
          });
        }
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(rows);
      } catch (ex) { reject(ex); }
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Group Excel rows by stimulus (handles merged cells) ─────────────────────
function buildLayeredGroups(rows) {
  console.log(rows);
  let subGroups  = {};

  rows.forEach(row => {
    const stim = (row['Stimulus (Case/Diagram/Table)'] || '').toString().trim();
    if(stim){
        if(!subGroups[stim])
            subGroups[stim]=[];
        subGroups[stim].push(row);
    }
  });

   const groups = Object.entries(subGroups).map(([stimulus, rows]) => ({
    stimulus,
    rows
  }));
  console.log('[groups] total layered groups:', groups.length);
  return groups;
}

// ─── Build sub-question pool from a group of rows ────────────────────────────
function buildSubPool(groupRows) {
  const pool = {};
  groupRows.forEach(row => {
    COL_MARKS.forEach((col, idx) => {
      const mark = idx + 1;
      const q    = (row[col] || '').toString().trim();
      if (q) {
        if (!pool[mark]) pool[mark] = [];
        pool[mark].push(q);
      }
    });
  });
  return pool;
}

// ─── Check if a group satisfies a needed distribution ────────────────────────
function groupSatisfiesDist(groupRows, dist) {
  const pool   = buildSubPool(groupRows);
  const needed = {};
  dist.forEach(m => { needed[m] = (needed[m] || 0) + 1; });
  return Object.entries(needed).every(([m, count]) => (pool[m] || []).length >= count);
}

// ─── PDF helper — FIXED: always regenerate so spec changes are picked up ─────
async function preparePaperContent() {
  // Always regenerate — do NOT cache the old HTML
  await generateDocx(true);
  return { pdfHTML: window.generatedPDFHTML || '' };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function generateDocx(skipSave = false) {
  console.log('[generate] starting…');
  window.generatedPDFHTML = '';

  // 1. Check dependencies
  if (typeof XLSX === 'undefined')   { err('XLSX library not loaded.\nAdd the SheetJS CDN <script> before generate_paper.js.'); return; }
  if (typeof saveAs === 'undefined') { err('FileSaver not loaded.\nAdd the FileSaver CDN <script> before generate_paper.js.'); return; }
  if (typeof docx === 'undefined')   { err('docx library not loaded.\nAdd the docx CDN <script> (unpkg.com/docx@8.4.0) before generate_paper.js.'); return; }

  // 2. Check file upload OR cached data
  const fileInput = document.getElementById('fileInput');
  if ((!fileInput || !fileInput.files || !fileInput.files.length) && !cachedRows.length) {
    err('No Excel file uploaded.\nPlease click "Upload" and choose your question-bank .xlsx file.');
    return;
  }

  // 3. Collect UI values
  const g           = id => (document.getElementById(id) || {}).value || '';
  const inst        = g('instName');
  const examName    = g('examName');
  const courseCode  = g('courseCode');
  const courseTitle = g('courseTitle');
  const examYear    = g('examYear');
  const dur         = g('durationInput') || '30';
  const durUnit     = g('durationUnit')  || 'min';
  const numSets     = Math.max(1, parseInt(g('numSets')) || 1);

  let totalMarks = 0;
  try { totalMarks = calcTotal(); } catch(e) { console.warn('calcTotal() failed', e); }

  // 4. Parse question counts/marks from UI
  // ── Written no-layer ─────────────────────────────────────────────────────
  const writtenSections = [];

  if (selectedTypes.has('written-no-layer')) {
    const cnt  = parseInt((document.getElementById('count_written-no-layer') || {}).value
                 || savedStep2['count_written-no-layer'] || '0') || 0;
    const dist = ((document.getElementById('marks_written-no-layer') || {}).value
                 || savedStep2['marks_written-no-layer'] || '')
                   .split('+').map(v => parseFloat(v.trim())).filter(v => !isNaN(v) && v > 0);

    if (cnt > 0 && dist.length > 0) {
      writtenSections.push({ type: 'written-no-layer', count: cnt, dist });
    }
  }

  // ── Written layered ───────────────────────────────────────────────────────
  if (selectedTypes.has('written-layer')) {
    const cnt = parseInt((document.getElementById('count_written-layer') || {}).value
                || savedStep2['count_written-layer'] || '0') || 0;

    if (cnt > 0) {
      const layerEntries = [];

      for (let qi = 0; qi < cnt; qi++) {
        const distStr = layeredSameOrDiff === 'same'
          ? (layeredDistributions['shared'] || '')
          : (layeredDistributions[qi]       || layeredDistributions['shared'] || '');

        let dist = distStr.split('+').map(v => parseFloat(v.trim())).filter(v => !isNaN(v) && v > 0);
        layerEntries.push({ qi, dist, totalMarks: layeredTotalMarks });
      }

      writtenSections.push({
        type:         'written-layer',
        count:        cnt,
        layerEntries,
        totalMarks:   layeredTotalMarks,
        sameOrDiff:   layeredSameOrDiff,
      });
    }
  }

  // ── MCQ / T/F ─────────────────────────────────────────────────────────────
  const mcqCount = selectedTypes.has('mcq')
    ? (parseInt((document.getElementById('count_mcq')    || {}).value) || 0) : 0;
  const mcqMarks = selectedTypes.has('mcq')
    ? (parseFloat((document.getElementById('marks_mcq')  || {}).value) || 0) : 0;
  const tfCount  = selectedTypes.has('truefalse')
    ? (parseInt((document.getElementById('count_truefalse')   || {}).value) || 0) : 0;
  const tfMarks  = selectedTypes.has('truefalse')
    ? (parseFloat((document.getElementById('marks_truefalse') || {}).value) || 0) : 0;

  console.log('[generate] writtenSections', writtenSections, 'mcq', mcqCount, 'tf', tfCount);

  // 5. Read Excel (or reuse cached rows)
  let rows = cachedRows;

  if (!rows.length) {
    try {
      rows       = await readExcelRows(fileInput.files[0]);
      cachedRows = rows;
    } catch(ex) {
      err('Could not read the Excel file:\n' + ex.message);
      return;
    }
  }

  if (!rows.length) { err('Excel file appears empty.'); return; }

  console.log('[generate] Excel rows:', rows.length, '| columns:', Object.keys(rows[0]));

  // ── Build question pools ─────────────────────────────────────────────────
  // FIXED: Reset writtenPool before rebuilding so repeated calls don't drain it
  Object.keys(writtenPool).forEach(k => delete writtenPool[k]);

  COL_MARKS.forEach((col, idx) => {
    const mark = idx + 1;
    writtenPool[mark] = rows.map(r => {
      if(r['Stimulus (Case/Diagram/Table)']==='')
      {
        return  (r[col] || '').toString().trim();
      }
      return '';
    }).filter(Boolean);
    console.log(`[pool] "${col}" → mark ${mark}: ${writtenPool[mark].length} questions`);
  });

  const mcqPool = rows.map(r => ({
    q: (r[COL_MCQ] || '').toString().trim(),
    a: (r['A']     || '').toString().trim(),
    b: (r['B']     || '').toString().trim(),
    c: (r['C']     || '').toString().trim(),
    d: (r['D']     || '').toString().trim(),
  })).filter(r => r.q);
  console.log('[pool] MCQ:', mcqPool.length);

  const tfPool = rows.map(r => {
    const raw = (r[COL_TF] || '').toString().trim();
    if (!raw) return null;
    const isTrue = /^true/i.test(raw);
    const stmt   = raw.replace(/^(true|false):\s*/i, '');
    return { stmt, answer: isTrue ? 'True' : 'False' };
  }).filter(Boolean);
  console.log('[pool] T/F:', tfPool.length);

  const layeredGroups = buildLayeredGroups(rows);

  // 6. Build docx
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, PageBreak,
  } = docx;

  const W            = 9360;  // content width in DXA (US Letter, 0.75" margins each side)
  const NONE_BORDER  = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const NONE_BORDERS = { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER };

  // ── Text run factory ─────────────────────────────────────────────────────
  const TR = (text, opts = {}) => new TextRun({
    text, font: 'Times New Roman', size: opts.size || 22,
    bold: opts.bold || false, italics: opts.italic || false, color: opts.color || '000000'
  });

  // ── Base paragraph factory ───────────────────────────────────────────────
  const P = (runs, opts = {}) => new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing:   { before: opts.before || 40, after: opts.after || 40 },
    indent:    opts.indent ? { left: opts.indent } : undefined,
    border:    opts.borderBottom ? {
      bottom: { style: BorderStyle.SINGLE, size: opts.borderSize || 4, color: opts.borderColor || '000000', space: opts.borderSpace || 2 }
    } : undefined,
    children: Array.isArray(runs) ? runs : [TR(runs, opts)]
  });

  // ── Column widths for the 3-column question layout ───────────────────────
  // [  NUM  ] [        SUB-QUESTION TEXT         ] [ MARKS ]
  const NUM_COL_W   = 400;   // ~0.28" — holds "10." comfortably
  const MARKS_COL_W = 540;   // ~0.375" — holds "[10]"
  const TEXT_COL_W  = W - NUM_COL_W - MARKS_COL_W;

  /**
   * MQ — 3-column table row for a question or sub-question.
   *
   * opts.numText   : string shown in the left number cell  (e.g. "6."  or "" for sub-questions)
   * opts.subRuns   : TextRun[] for the sub-letter prefix   (e.g. [TR("a) ",{bold})])
   * opts.marksRuns : TextRun[] for the right marks cell    (e.g. [TR("[4]",{bold})])  — pass [] to hide
   * opts.before / opts.after : spacing in twips
   */
  const MQ = (numText, subRuns, bodyRuns, marksRuns, opts = {}) => {
    const sp = { before: opts.before || 40, after: opts.after || 40 };

    const numPara = new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing:   sp,
      children:  [TR(numText || '', { bold: true })]
    });

    const textPara = new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing:   sp,
      children:  [
        ...(Array.isArray(subRuns)  ? subRuns  : []),
        ...(Array.isArray(bodyRuns) ? bodyRuns : [TR(bodyRuns || '')])
      ]
    });

    const marksPara = new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   sp,
      children:  Array.isArray(marksRuns) ? marksRuns : []
    });

    return new Table({
      width:        { size: W, type: WidthType.DXA },
      columnWidths: [NUM_COL_W, TEXT_COL_W, MARKS_COL_W],
      borders:      { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER, insideH: NONE_BORDER, insideV: NONE_BORDER },
      rows: [new TableRow({ children: [
        noCell([numPara],   NUM_COL_W),
        noCell([textPara],  TEXT_COL_W),
        noCell([marksPara], MARKS_COL_W),
      ]})]
    });
  };

  const rule = () => P([], { borderBottom: true, borderSize: 6, borderColor: '222222', borderSpace: 4, before: 60, after: 60 });

  const sectionHead = (text) => P(
    [TR(text, { bold: true, size: 23 })],
    { align: AlignmentType.CENTER, borderBottom: true, borderSize: 4, borderColor: '444444', borderSpace: 6, before: 140, after: 80 }
  );

  const noCell = (children, width) => new TableCell({
    width:    { size: width, type: WidthType.DXA },
    borders:  NONE_BORDERS,
    children
  });

  const metaTable = (rows2col) => new Table({
    width:        { size: W, type: WidthType.DXA },
    columnWidths: [W / 2, W / 2],
    borders:      { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER, insideH: NONE_BORDER, insideV: NONE_BORDER },
    rows: rows2col.map(([left, right]) => new TableRow({ children: [
      noCell([P([TR(left)],  { before: 20, after: 20 })], W / 2),
      noCell([P([TR(right)], { align: AlignmentType.RIGHT, before: 20, after: 20 })], W / 2),
    ]}))
  });

  // 7. Assemble sets
  const SEC         = ['A', 'B', 'C', 'D', 'E', 'F'];
  const docSections = [];

  for (let si = 0; si < numSets; si++) {
    let pdfHTML    = '';
    const children = [];
    let secIdx     = 0;

    // Header
    pdfHTML += `
  <div style="text-align:center; margin-bottom:20px;">
    <div style="font-size:18pt; font-weight:bold; margin:0; font-family:'Times New Roman';">${inst}</div>
    <div style="font-size:14pt; font-weight:bold; margin:6px 0 14px; font-family:'Times New Roman';">${examName}</div>
    <div style="font-family:'Times New Roman';"><strong>Duration:</strong> ${dur} ${durUnit} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Full Marks:</strong> ${totalMarks}</div>
    <div style="margin-top:6px; font-family:'Times New Roman';"><strong>Course Code:</strong> ${courseCode} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Course Title:</strong> ${courseTitle}</div>
    <div style="margin-top:6px; font-family:'Times New Roman';"><strong>Year:</strong> ${examYear}</div>
    <hr style="margin-top:18px;">
  </div>`;

    children.push(P([TR(inst,     { bold: true, size: 28 })], { align: AlignmentType.CENTER, before: 40, after: 20 }));
    children.push(P([TR(examName, { bold: true, size: 24 })], { align: AlignmentType.CENTER, before: 0,  after: 40 }));
    children.push(rule());

    const setLabel = numSets > 1 ? `Set: ${String.fromCharCode(65 + si)}` : '';
    children.push(metaTable([
      [`Duration: ${dur} ${durUnit}`,  `Full Marks: ${totalMarks}`],
      [`Course Code: ${courseCode}`,   `Course Title: ${courseTitle}`],
      [`Year: ${examYear}`,            setLabel],
    ]));
    children.push(rule());

    // ── Written sections ─────────────────────────────────────────────────
    for (const ws of writtenSections) {

      // Expand dist to exactly ws.count entries by cycling
      const expandedDist = ws.type === 'written-no-layer'
        ? Array.from({ length: ws.count }, (_, i) => ws.dist[i % ws.dist.length])
        : null;

      let secTotal = 0;
      if (ws.type === 'written-no-layer') {
        secTotal = expandedDist.reduce((a, b) => a + b, 0);
      } else {
        secTotal = ws.count * (ws.totalMarks || 0);
      }

      const lbl = SEC[secIdx++] || '?';
      children.push(sectionHead(`Section ${lbl} — Written Questions   [Total: ${secTotal} Marks]`));

      // FIXED: use styled <div> instead of <h2> to match docx font size (≈11.5pt / size:23)
      pdfHTML += `
      <div style="margin-top:28px; border-bottom:1px solid #444; padding-bottom:6px; font-size:11.5pt; font-weight:bold; text-align:center; font-family:'Times New Roman';">
        Section ${lbl} — Written Questions [Total: ${secTotal} Marks]
      </div>
      <div style="font-style:italic; margin-bottom:16px; font-family:'Times New Roman';">Answer all questions. Marks are indicated beside each question.</div>`;

      children.push(P([TR('Answer all questions. Marks are indicated beside each question.', { italic: true })], { before: 30, after: 80 }));

      const usedQByMark      = {};
      const usedGroupStimuli = new Set();
      const usedInThisQ = {};

      for (let qi = 0; qi < ws.count; qi++) {

        /* ================================================================
           WRITTEN — NO LAYER
        ================================================================ */
        if (ws.type === 'written-no-layer') {
          const currentMark = expandedDist[qi];

          if (!usedQByMark[currentMark]) usedQByMark[currentMark] = new Set();
          const qText = pickUnique(currentMark, 1, usedQByMark[currentMark])[0];
          console.log(`written-no-layer Question-${qi}:`,qText);

          children.push(MQ(
            `${qi + 1}.`,
            [],
            [TR(qText)],
            [TR(`[${currentMark}]`, { bold: true, color: '555555' })],
            { before: 100, after: 10 }
          ));

          pdfHTML += `<div style="display:table;width:100%;margin-bottom:14px;font-family:'Times New Roman';">
  <span style="display:table-cell;width:28px;font-weight:bold;vertical-align:top;white-space:nowrap;">${qi + 1}.</span>
  <span style="display:table-cell;vertical-align:top;">${qText}</span>
  <strong style="display:table-cell;white-space:nowrap;text-align:right;padding-left:12px;vertical-align:top;">[${currentMark}]</strong>
</div>`;
          children.push(P([], { before: 4, after: 8 }));
        }

        /* ================================================================
           WRITTEN — WITH LAYER
        ================================================================ */
        else {
          const entry  = ws.layerEntries[qi];
          let   qDist  = entry.dist;

          // ── Auto-build dist if blank ──────────────────────────────────
          if (!qDist.length && ws.totalMarks > 0) {

            // ── Max occurrences per mark value within one layered question ──
            // Keeps low-mark questions from flooding a single parent question.
            // Tweak these values to taste.
            const MAX_OCCURRENCES = { 1: 1, 2: 2 };  // mark 1 → max 1 time, mark 2 → max 2 times
            const DEFAULT_MAX     = 4;                // marks 3+ → max 4 times

            // ── Check that writtenPool (non-layered bank) can satisfy a dist ──
            // Used as a guard so we never accept a distribution we can't fill.
            function poolCanSatisfy(dist) {
              const needed = {};
              dist.forEach(m => { needed[m] = (needed[m] || 0) + 1; });
              return Object.entries(needed).every(
                ([m, cnt]) => (writtenPool[Number(m)] || []).length >= cnt
              );
            }

            // ── Recursive combination finder with per-mark occurrence cap ──
            function findGoodDists(remaining, minMark, current, results, marksAvail) {
              if (remaining === 0 && current.length >= 2) {
                // Only accept if writtenPool can cover this distribution as fallback
                if (poolCanSatisfy(current)) {
                  const key = [...current].sort((a, b) => a - b).join('+');
                  if (!results.find(d => [...d].sort((a, b) => a - b).join('+') === key))
                    results.push([...current]);
                }
                return;
              }
              if (current.length >= 6) return;  // cap sub-questions per layered Q

              for (const m of marksAvail) {
                if (m < minMark || m > remaining) continue;
                const maxAllowed = MAX_OCCURRENCES[m] !== undefined ? MAX_OCCURRENCES[m] : DEFAULT_MAX;
                const usedCount  = current.filter(x => x === m).length;
                if (usedCount >= maxAllowed) continue;
                current.push(m);
                findGoodDists(remaining - m, m, current, results, marksAvail);
                current.pop();
              }
            }

            // ── Gather marks available across all layered sub-pools ──
            const availableMarksSet = new Set();
            layeredGroups.forEach(grp => {
              Object.keys(buildSubPool(grp.rows)).forEach(m => availableMarksSet.add(Number(m)));
            });
            const marksSorted = [...availableMarksSet].sort((a, b) => a - b);

            const goodDists = [];

            if (ws.sameOrDiff === 'different') {
              // In 'different' mode, also restrict to marks each group actually has
              layeredGroups.forEach(grp => {
                const subPool    = buildSubPool(grp.rows);
                const marksAvail = Object.keys(subPool).map(Number).sort((a, b) => a - b);
                findGoodDists(ws.totalMarks, 1, [], goodDists, marksAvail);
              });
            } else {
              // 'same' mode: use union of all available marks
              findGoodDists(ws.totalMarks, 1, [], goodDists, marksSorted);
            }

            console.log('[auto-dist] goodDists found:', goodDists);

            if (goodDists.length) {
              // Prefer distributions with a higher average mark value —
              // this naturally avoids too many 1- or 2-mark sub-questions.
              // goodDists.sort((a, b) => {
              //   const avgA = a.reduce((s, v) => s + v, 0) / a.length;
              //   const avgB = b.reduce((s, v) => s + v, 0) / b.length;
              //   return avgB - avgA;  // descending: prefer larger sub-marks
              // });
              // Pick from the top candidates at random for variety
              // const topCandidates = shuffled(goodDists.slice(0, Math.min(goodDists.length, 10)));
              const topCandidates = shuffled(goodDists);
              qDist = topCandidates[qi % topCandidates.length];
              console.log('[auto-dist] chosen qDist:', qDist);
            }

            // ── Fallback: greedy from highest marks if no good dist found ──
            if (!qDist || !qDist.length) {
              let rem = ws.totalMarks;
              const fallback = [];
              for (const m of [...marksSorted].reverse()) {
                const maxAllowed = MAX_OCCURRENCES[m] !== undefined ? MAX_OCCURRENCES[m] : DEFAULT_MAX;
                while (rem >= m && fallback.filter(x => x === m).length < maxAllowed) {
                  fallback.push(m); rem -= m;
                }
              }
              // If still can't reach target with caps, relax caps as last resort
              if (rem !== 0) {
                for (const m of [...marksSorted].reverse()) {
                  while (rem >= m) { fallback.push(m); rem -= m; }
                }
              }
              if (rem === 0 && fallback.length) qDist = fallback;
            }
          }

          if (!qDist || !qDist.length) {
            children.push(P([TR(`${qi + 1}. (Cannot build sub-questions: no distribution defined and auto-resolve failed)`)], { before: 100, after: 10 }));
            pdfHTML += `<div style="margin-bottom:14px;font-family:'Times New Roman';"><strong>${qi + 1}.</strong> (No distribution — skipped)</div>`;
            continue;
          }

          const totalQMarks = qDist.reduce((a, b) => a + b, 0);

          // Find eligible groups, excluding already-used stimuli
          const eligible = layeredGroups.filter(g =>
            groupSatisfiesDist(g.rows, qDist) &&
            !usedGroupStimuli.has(g.stimulus || '__nostim__' + layeredGroups.indexOf(g))
          );

          if (!eligible.length) {
            // Fallback: independent questions per mark, 3-column layout
            // Number shows only on first row; subsequent sub-questions leave number col empty
            qDist.forEach((neededMark, subIndex) => {
              if (!usedQByMark[neededMark]) usedQByMark[neededMark] = new Set();
              const subQ   = pickUnique(neededMark, 1, usedQByMark[neededMark])[0];
              console.log(`written-with-layer (${neededMark}-mark) Question-${qi}:`,subQ);
              const letter = String.fromCharCode(97 + subIndex);
              const numStr = subIndex === 0 ? `${qi + 1}.` : '';
              const bef    = subIndex === 0 ? 100 : 30;
              children.push(MQ(
                numStr,
                [TR(`${letter}) `, { bold: true })],
                [TR(subQ)],
                [TR(`[${neededMark}]`, { bold: true, color: '555555' })],
                { before: bef, after: 8 }
              ));
              const numHtml = subIndex === 0
                ? `<span style="display:table-cell;width:28px;font-weight:bold;vertical-align:top;white-space:nowrap;">${qi + 1}.</span>`
                : `<span style="display:table-cell;width:28px;vertical-align:top;"></span>`;
              pdfHTML += `<div style="display:table;width:100%;margin-top:${subIndex === 0 ? 18 : 4}px;font-family:'Times New Roman';">
  ${numHtml}
  <span style="display:table-cell;vertical-align:top;"><strong>${letter})</strong> ${subQ}</span>
  <strong style="display:table-cell;white-space:nowrap;text-align:right;padding-left:12px;vertical-align:top;">[${neededMark}]</strong>
</div>`;
            });

            children.push(P([], { before: 10, after: 16 }));
            continue;
          }
          console.log("eligible: ", eligible);
          const group    = shuffled(eligible)[0];
          const stimulus = (group.stimulus || '').trim();

          usedGroupStimuli.add(group.stimulus || '__nostim__' + layeredGroups.indexOf(group));
          console.log("usedGroupStimuli: ", usedGroupStimuli);

          // Parent question line — stimulus text sits in the text column, number in num col, no marks
          if (stimulus) {
            children.push(MQ(
              `${qi + 1}.`,
              [],
              [TR(stimulus)],
              [],
              { before: 100, after: 20 }
            ));
            pdfHTML += `<div style="display:table;width:100%;margin-top:18px;font-family:'Times New Roman';">
  <span style="display:table-cell;width:28px;font-weight:bold;vertical-align:top;white-space:nowrap;">${qi + 1}.</span>
  <span style="display:table-cell;vertical-align:top;">${stimulus}</span>
  <span style="display:table-cell;width:50px;"></span>
</div>`;
          }

          const subPool = buildSubPool(group.rows);

          qDist.forEach((neededMark, subIndex) => {
            if (!usedInThisQ[neededMark]) usedInThisQ[neededMark] = new Set();
            const pool = [...(subPool[neededMark] || [])];
            const subQ = pool.length
              ? pickUnique(pool, 1, usedInThisQ[neededMark])[0]
              : `(No ${neededMark}-mark sub-question in this group)`;
            const letter = String.fromCharCode(97 + subIndex);
            console.log(`written-with-layer (subPool) Question-${qi}:`,subQ);

            // When no stimulus: number appears only on the first sub-question row
            // When stimulus exists: number col is always empty (already shown above)
            const numStr = (!stimulus && subIndex === 0) ? `${qi + 1}.` : '';
            const bef    = (!stimulus && subIndex === 0) ? 100 : 30;

            children.push(MQ(
              numStr,
              [TR(`${letter}) `, { bold: true })],
              [TR(subQ)],
              [TR(`[${neededMark}]`, { bold: true, color: '555555' })],
              { before: bef, after: 8 }
            ));

            const numHtml = (!stimulus && subIndex === 0)
              ? `<span style="display:table-cell;width:28px;font-weight:bold;vertical-align:top;white-space:nowrap;">${qi + 1}.</span>`
              : `<span style="display:table-cell;width:28px;vertical-align:top;"></span>`;
            const topMargin = (!stimulus && subIndex === 0) ? 18 : 4;
            pdfHTML += `<div style="display:table;width:100%;margin-top:${topMargin}px;font-family:'Times New Roman';">
  ${numHtml}
  <span style="display:table-cell;vertical-align:top;"><strong>${letter})</strong> ${subQ}</span>
  <strong style="display:table-cell;white-space:nowrap;text-align:right;padding-left:12px;vertical-align:top;">[${neededMark}]</strong>
</div>`;
          });

          children.push(P([], { before: 10, after: 16 }));
        }
      } // end for qi
    } // end for ws

    // ── MCQ section ──────────────────────────────────────────────────────
    if (mcqCount > 0) {
      if (!mcqPool.length) {
        children.push(P([TR('(MCQ pool empty — check Excel MCQ column)')], { before: 80 }));
      } else {
        const lbl      = SEC[secIdx++] || '?';
        const secTotal = (mcqMarks * mcqCount).toFixed(1);
        children.push(sectionHead(`Section ${lbl} — Multiple Choice   [${mcqMarks} × ${mcqCount} = ${secTotal} Marks]`));

        // FIXED: styled <div> instead of <h2> to match docx section header size
        pdfHTML += `
  <div style="margin-top:28px; border-bottom:1px solid #444; padding-bottom:6px; font-size:11.5pt; font-weight:bold; text-align:center; font-family:'Times New Roman';">
    Section ${lbl} — Multiple Choice [${mcqMarks} × ${mcqCount} = ${secTotal} Marks]
  </div>
  <div style="font-style:italic; margin-bottom:16px; font-family:'Times New Roman';">Circle the letter of the best answer.</div>`;
        children.push(P([TR('Circle the letter of the best answer.', { italic: true })], { before: 30, after: 80 }));

        const usedMCQ  = new Set();
        const mcqItems = shuffled(mcqPool);
        const chosen   = [];
        for (const item of mcqItems) {
          if (!usedMCQ.has(item.q)) { usedMCQ.add(item.q); chosen.push(item); }
          if (chosen.length === mcqCount) break;
        }
        while (chosen.length < mcqCount) {
          chosen.push(mcqItems[chosen.length % mcqItems.length]);
        }

        const half = Math.floor((W - 720) / 2);

        chosen.forEach((item, qi) => {
          children.push(P([TR(`${qi + 1}. `, { bold: true }), TR(item.q)], { before: 100, after: 8 }));

          const optRow = (pairs) => new TableRow({ children: pairs.map(([ltr, val]) =>
            noCell([P([TR(`${ltr}. `, { bold: true }), TR(val || '')], { before: 10, after: 10 })], half)
          )});
          children.push(new Table({
            width:        { size: W - 720, type: WidthType.DXA },
            columnWidths: [half, half],
            indent:       { size: 360, type: WidthType.DXA },
            borders:      { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER, insideH: NONE_BORDER, insideV: NONE_BORDER },
            rows: [
              optRow([['A', item.a], ['B', item.b]]),
              optRow([['C', item.c], ['D', item.d]]),
            ]
          }));

          pdfHTML += `
  <div style="margin-top:14px; font-family:'Times New Roman';">
    <strong>${qi + 1}.</strong> ${item.q}
    <div style="margin-left:20px; margin-top:6px;">
      A. ${item.a}<br>B. ${item.b}<br>C. ${item.c}<br>D. ${item.d}
    </div>
  </div>`;
          children.push(P([], { before: 4, after: 4 }));
        });
      }
    }

    // ── True/False section ────────────────────────────────────────────────
    if (tfCount > 0) {
      if (!tfPool.length) {
        children.push(P([TR('(T/F pool empty — check Excel T/F column)')], { before: 80 }));
      } else {
        const lbl      = SEC[secIdx++] || '?';
        const secTotal = (tfMarks * tfCount).toFixed(1);
        children.push(sectionHead(`Section ${lbl} — True / False   [${tfMarks} × ${tfCount} = ${secTotal} Marks]`));

        // FIXED: styled <div> instead of <h2> to match docx section header size
        pdfHTML += `
  <div style="margin-top:28px; border-bottom:1px solid #444; padding-bottom:6px; font-size:11.5pt; font-weight:bold; text-align:center; font-family:'Times New Roman';">
    Section ${lbl} — True / False [${tfMarks} × ${tfCount} = ${secTotal} Marks]
  </div>
  <div style="font-style:italic; margin-bottom:16px; font-family:'Times New Roman';">Write "True" or "False" in the space provided.</div>`;
        children.push(P([TR('Write "True" or "False" in the space provided.', { italic: true })], { before: 30, after: 80 }));

        const usedTF   = new Set();
        const tfItems  = shuffled(tfPool);
        const chosenTF = [];
        for (const item of tfItems) {
          if (!usedTF.has(item.stmt)) { usedTF.add(item.stmt); chosenTF.push(item); }
          if (chosenTF.length === tfCount) break;
        }
        while (chosenTF.length < tfCount) {
          chosenTF.push(tfItems[chosenTF.length % tfItems.length]);
        }

        chosenTF.forEach((item, qi) => {
          children.push(P([
            TR(`${qi + 1}. `, { bold: true }),
            TR(item.stmt),
            TR('    Answer: ___________', { color: '777777' }),
          ], { before: 70, after: 10 }));
          pdfHTML += `<div style="margin-top:10px; font-family:'Times New Roman';"><strong>${qi + 1}.</strong> ${item.stmt} <span style="color:#777;">Answer: ___________</span></div>`;
        });
      }
    }

    // Page break between sets
    if (si < numSets - 1) {
      children.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }));
    }

    window.generatedPDFHTML += `<div style="${si < numSets - 1 ? 'page-break-after:always;' : ''}">${pdfHTML}</div>`;

    docSections.push({
      properties: {
        page: {
          size:   { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
        }
      },
      children
    });
  } // end for si (sets)

  // 8. Pack and save
  let blob;
  try {
    const doc2 = new Document({
      styles:   { default: { document: { run: { font: 'Times New Roman', size: 22 } } } },
      sections: docSections
    });
    blob = await Packer.toBlob(doc2);
  } catch(ex) {
    err('docx build failed:\n' + ex.message + '\n\nCheck console for details.');
    console.error('[generate] docx error:', ex);
    return;
  }

  if (!skipSave) {
    try {
      const safePart = (s) => (s || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const codeStr  = safePart(courseCode)  || safePart(courseTitle) || 'QuestionPaper';
      const yearStr  = safePart(examYear)    || String(new Date().getFullYear());
      const fname    = `${codeStr}_${yearStr}.docx`;
      saveAs(blob, fname);
      console.log('[generate] done →', fname);
      addToDownloadHistory({
        name: fname.replace('.docx', ''),
        type: 'docx',
        size: parseFloat((blob.size / (1024 * 1024)).toFixed(2)),
        date: new Date().toISOString().split('T')[0],
      });
    } catch(ex) {
      err('File save failed:\n' + ex.message);
    }
  }
}

// ─── Download History ─────────────────────────────────────────────────────────
function addToDownloadHistory(entry) {
  const STORAGE_KEY = 'examcraft_downloads';
  try {
    let existing = [];
    const raw    = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    }
    existing.unshift({
      id:   'gen_' + Date.now(),
      name: entry.name,
      type: entry.type,
      size: entry.size,
      date: entry.date,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    localStorage.setItem(STORAGE_KEY + '_version', 'v1');
    console.log('[history] saved →', entry.name);
  } catch(ex) {
    console.warn('[history] could not save:', ex);
  }
}

// ─── PDF export ───────────────────────────────────────────────────────────────
async function generatePDF() {
  const { pdfHTML } = await preparePaperContent();
  const g           = id => (document.getElementById(id) || {}).value || '';
  const courseCode  = g('courseCode');
  const courseTitle = g('courseTitle');
  const examYear    = g('examYear');

  const safePart  = (s) => (s || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const codeStr   = safePart(courseCode) || safePart(courseTitle) || 'QuestionPaper';
  const yearStr   = safePart(examYear)   || String(new Date().getFullYear());

  const container = document.createElement('div');
  container.innerHTML = `
    <div style="padding:40px; font-family:'Times New Roman'; color:#000; line-height:1.8; font-size:11pt;">
      ${pdfHTML}
    </div>`;

  html2pdf()
    .from(container)
    .set({
      margin:      10,
      filename:    `${codeStr}_${yearStr}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .save()
    .then(() => {
      addToDownloadHistory({
        name: `${codeStr}_${yearStr}`,
        type: 'pdf', size: 0,
        date: new Date().toISOString().split('T')[0],
      });
    });
}