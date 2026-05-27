/**
 * generate_paper.js  — fixed & complete
 *
 * Fixes applied:
 *  1. COL_MARKS[0] corrected to '1 Mark' (was '1 Marks') — fixes missing 1-mark questions
 *  2. Pool keys now use index-based mark numbers (robust against singular/plural)
 *  3. Written-layer section now reads from layeredDistributions / layeredTotalMarks (not a missing DOM input)
 *  4. buildLayeredGroups() placed AFTER rows is declared — fixes TDZ crash
 *  5. Layered generation rewrites to handle merged-stimulus rows properly
 *  6. Blank distribution auto-resolves when user leaves it empty
 *  7. ★ NO-DUPLICATE fix: usedQByMark tracks used questions per mark across ALL qi in a section
 *  8. ★ NO-DUPLICATE fix: usedLayeredGroups tracks used stimulus groups across qi
 *  9. ★ QUALITY fix: consecutive same-mark questions are avoided via shuffledDist per set
 * 10. ★ QUALITY fix: dist shorter than count is allowed — values cycle then shuffle randomly per set
 * 11. ★ BALANCE fix: auto-dist no longer greedy-largest; builds varied mix from actual layered pools
 * 12. ★ FILENAME fix: sanitised filename uses courseCode+year; falls back to courseTitle, never empty
 *
 * Required CDN scripts in HTML (order matters):
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
 *   <script src="https://unpkg.com/docx@8.5.0/build/index.js"></script>
 *   <script src="generate_paper.js"></script>
 */

// ─── Column names — must match your Excel header row exactly ─────────────────
// NOTE: first column is '1 Mark' (singular), rest are plural
const COL_MARKS = ['1 Mark','2 Marks','3 Marks','4 Marks','5 Marks','6 Marks','7 Marks'];
const COL_MCQ   = 'MCQ';
const COL_TF    = 'T/F';
let cachedRows  = [];

// ─── tiny diagnostic popup ───────────────────────────────────────────────────
function err(msg)  { alert('❌ ERROR:\n\n' + msg); }
function info(msg) { alert('ℹ️  ' + msg); }

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

// ─── Pick N unique items from pool (no repeats, with used-set awareness) ─────
// usedSet: Set of already-used question strings (mutated in place)
// Falls back to full pool only if pool is exhausted
function pickUnique(pool, n, seed, usedSet) {
  if (!pool || !pool.length) return Array(n).fill('(No question available)');

  // Prefer unused questions first
  const unused = pool.filter(q => !usedSet.has(q));
  const src    = unused.length >= n ? unused : pool; // fallback to full pool if exhausted

  const rot    = shuffled(src, seed);
  const result = [];
  for (let i = 0; i < n; i++) {
    const q = rot[i % rot.length];
    result.push(q);
    usedSet.add(q);
  }
  return result;
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

// ─── Group Excel rows by stimulus (handles merged cells) ─────────────────────
// IMPORTANT: called only after `rows` is loaded, never before.
function buildLayeredGroups(rows) {
  const groups = [];
  let currentStimulus = null;
  let currentGroup    = [];

  rows.forEach(row => {
    const stim = (row['Stimulus (Case/Diagram/Table)'] || '').toString().trim();
    if (stim) {
      // flush previous group first
      if (currentGroup.length) {
        groups.push({ stimulus: currentStimulus, rows: currentGroup });
      }
      currentStimulus = stim;
      currentGroup    = [row];
    } else {
      if (currentGroup.length && currentStimulus) {
        // continuation row belonging to current stimulus
        currentGroup.push(row);
      } else {
        // standalone row (no stimulus)
        groups.push({ stimulus: '', rows: [row] });
        currentStimulus = null;
        currentGroup    = [];
      }
    }
  });
  // flush final group
  if (currentGroup.length) {
    groups.push({ stimulus: currentStimulus, rows: currentGroup });
  }

  console.log('[groups] total layered groups:', groups.length);
  return groups;
}

// ─── Build sub-question pool from a group of rows ────────────────────────────
function buildSubPool(groupRows) {
  // Returns { markNumber: [questionStrings, ...], ... }
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

// ─── PDF helper ───────────────────────────────────────────────────────────────
async function preparePaperContent() {
  if (!window.generatedPDFHTML) {
    await generateDocx(true);
  }
  return { pdfHTML: window.generatedPDFHTML || '' };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function generateDocx(skipSave = false) {
  console.log('[generate] starting…');
  window.generatedPDFHTML = '';

  // 1. Check dependencies
  if (typeof XLSX === 'undefined')   { err('XLSX library not loaded.\nAdd the SheetJS CDN <script> before generate_paper.js.'); return; }
  if (typeof saveAs === 'undefined') { err('FileSaver not loaded.\nAdd the FileSaver CDN <script> before generate_paper.js.'); return; }
  if (typeof docx === 'undefined')   { err('docx library not loaded.\nAdd the docx CDN <script> (unpkg.com/docx@8.5.0) before generate_paper.js.'); return; }

  // 2. Check file upload OR cached data
  const fileInput = document.getElementById('fileInput');
  if ((!fileInput || !fileInput.files || !fileInput.files.length) && !cachedRows.length) {
    err('No Excel file uploaded.\nPlease click "Upload" and choose your question-bank .xlsx file.');
    return;
  }

  // 3. Collect UI values
  const g          = id => (document.getElementById(id) || {}).value || '';
  const inst       = g('instName');
  const examName   = g('examName');
  const courseCode = g('courseCode');
  const courseTitle= g('courseTitle');
  const examYear   = g('examYear');
  const dur        = g('durationInput') || '30';
  const durUnit    = g('durationUnit')  || 'min';
  const numSets    = Math.max(1, parseInt(g('numSets')) || 1);

  let totalMarks = 0;
  try { totalMarks = calcTotal(); } catch(e) { console.warn('calcTotal() failed', e); }

  // 4. Parse question counts/marks from UI
  // ── Written no-layer ──────────────────────────────────────────────────────
  const writtenSections = [];

  if (selectedTypes.has('written-no-layer')) {
    const cnt  = parseInt((document.getElementById('count_written-no-layer') || {}).value
                 || savedStep2['count_written-no-layer'] || '0') || 0;
    const dist = ((document.getElementById('marks_written-no-layer') || {}).value
                 || savedStep2['marks_written-no-layer'] || '')
                   .split('+').map(v => parseFloat(v.trim())).filter(v => !isNaN(v) && v > 0);

    if (cnt > 0 && dist.length > 0) {
      // dist can have fewer entries than cnt — values are randomly sampled (with replacement).
      // e.g. dist [1, 3] for 4 questions → randomly picks 4 values from [1, 3] per set.
      // e.g. dist [1, 1, 3, 3] for 4 questions → shuffled each set → [3,1,3,1] etc.
      writtenSections.push({ type: 'written-no-layer', count: cnt, dist });
    }
  }

  // ── Written layered — read from module-level vars (NOT a DOM input) ────────
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
    ? (parseInt((document.getElementById('count_mcq')   || {}).value) || 0) : 0;
  const mcqMarks = selectedTypes.has('mcq')
    ? (parseFloat((document.getElementById('marks_mcq') || {}).value) || 0) : 0;
  const tfCount  = selectedTypes.has('truefalse')
    ? (parseInt((document.getElementById('count_truefalse')  || {}).value) || 0) : 0;
  const tfMarks  = selectedTypes.has('truefalse')
    ? (parseFloat((document.getElementById('marks_truefalse')|| {}).value) || 0) : 0;

  console.log('[generate] writtenSections', writtenSections, 'mcq', mcqCount, 'tf', tfCount);

  // 5. Read Excel (or reuse cached rows) — ROWS DECLARED HERE
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

  // ── Build question pools ──────────────────────────────────────────────────
  // writtenPool[markNumber] = [questionString, ...]
  const writtenPool = {};
  COL_MARKS.forEach((col, idx) => {
    const mark = idx + 1;
    writtenPool[mark] = rows.map(r => (r[col] || '').toString().trim()).filter(Boolean);
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

  // ── Build layered groups AFTER rows is loaded ──────────────────────────────
  const layeredGroups = buildLayeredGroups(rows);

  // 6. Build docx
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, PageBreak,
  } = docx;

  const W            = 9360;
  const NONE_BORDER  = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const NONE_BORDERS = { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER };

  // paragraph/run factories (TR = TextRun factory, not TableRow)
  const TR = (text, opts = {}) => new TextRun({
    text, font: 'Times New Roman', size: opts.size || 22,
    bold: opts.bold || false, italics: opts.italic || false, color: opts.color || '000000'
  });

  const P = (runs, opts = {}) => new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing:   { before: opts.before || 40, after: opts.after || 40 },
    indent:    opts.indent ? { left: opts.indent } : undefined,
    border:    opts.borderBottom ? {
      bottom: { style: BorderStyle.SINGLE, size: opts.borderSize || 4, color: opts.borderColor || '000000', space: opts.borderSpace || 2 }
    } : undefined,
    children: Array.isArray(runs) ? runs : [TR(runs, opts)]
  });

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
    <h1 style="margin:0;">${inst}</h1>
    <h2 style="margin:6px 0 14px;">${examName}</h2>
    <div><strong>Duration:</strong> ${dur} ${durUnit} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Full Marks:</strong> ${totalMarks}</div>
    <div style="margin-top:6px;"><strong>Course Code:</strong> ${courseCode} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Course Title:</strong> ${courseTitle}</div>
    <div style="margin-top:6px;"><strong>Year:</strong> ${examYear}</div>
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

    // ── Written sections ──────────────────────────────────────────────────
    for (const ws of writtenSections) {

      // ── Expand dist to exactly ws.count entries by cycling
      // e.g. user enters [1,3] for 4 questions → expandedDist = [1,3,1,3]
      // e.g. user enters [1,1,3,3] for 4 questions → expandedDist = [1,1,3,3]
      // shuffledDist (below) then randomises the order per set
      const expandedDist = ws.type === 'written-no-layer'
        ? Array.from({ length: ws.count }, (_, i) => ws.dist[i % ws.dist.length])
        : null;

      // ── Compute section total ──────────────────────────────────────────
      let secTotal = 0;
      if (ws.type === 'written-no-layer') {
        secTotal = expandedDist.reduce((a, b) => a + b, 0);
      } else {
        secTotal = ws.count * (ws.totalMarks || 0);
      }

      const lbl = SEC[secIdx++] || '?';
      children.push(sectionHead(`Section ${lbl} — Written Questions   [Total: ${secTotal} Marks]`));

      pdfHTML += `
  <h2 style="margin-top:28px; border-bottom:1px solid #444; padding-bottom:6px;">
    Section ${lbl} — Written Questions [Total: ${secTotal} Marks]
  </h2>
  <div style="font-style:italic; margin-bottom:16px;">Answer all questions. Marks are indicated beside each question.</div>`;

      children.push(P([TR('Answer all questions. Marks are indicated beside each question.', { italic: true })], { before: 30, after: 80 }));

      // ★ PER-SECTION used-question tracker (keyed by mark value)
      // Ensures no question text repeats within this section for this set
      const usedQByMark = {}; // { markNumber: Set<string> }

      // ★ For layered: track which stimulus groups have already been used
      const usedGroupStimuli = new Set();

      // ★ Shuffle the expanded dist once per set — randomises mark order across questions
      // e.g. expandedDist [1,1,3,3] → shuffledDist might be [3,1,3,1] or [1,3,1,3]
      // This prevents same-mark questions always clustering together
      const shuffledDist = ws.type === 'written-no-layer'
        ? shuffled([...expandedDist], si * 137 + 29)
        : null;

      // ── Individual questions ───────────────────────────────────────────
      for (let qi = 0; qi < ws.count; qi++) {

        /* ================================================================
           WRITTEN — NO LAYER
        ================================================================ */
        if (ws.type === 'written-no-layer') {
          // ★ Use shuffledDist instead of ws.dist[qi] — avoids mark clustering
          const currentMark = shuffledDist[qi];
          const pool        = writtenPool[currentMark] || [];

          // ★ Initialise used-set for this mark if not yet done
          if (!usedQByMark[currentMark]) usedQByMark[currentMark] = new Set();

          // ★ pickUnique: will not repeat a question already used in this section
          const qText = pickUnique(pool, 1, si * 997 + qi * 31, usedQByMark[currentMark])[0];

          children.push(P([
            TR(`${qi + 1}. `, { bold: true }),
            TR(qText),
            TR(`   [${currentMark}]`, { bold: true, color: '555555' }),
          ], { before: 100, after: 10 }));

          pdfHTML += `<div style="margin-bottom:14px;"><strong>${qi + 1}.</strong> ${qText} <strong>[${currentMark}]</strong></div>`;
          children.push(P([], { before: 4, after: 8 }));
        }

        /* ================================================================
           WRITTEN — WITH LAYER
        ================================================================ */
        else {
          const entry   = ws.layerEntries[qi];
          let   qDist   = entry.dist;

          // If user left distribution blank → auto-build from available pool
          if (!qDist.length && ws.totalMarks > 0) {

            if (ws.sameOrDiff === 'different') {
              const validDists = [];
              layeredGroups.forEach(grp => {
                const subPool = buildSubPool(grp.rows);
                const marksAvail = Object.keys(subPool).map(Number).sort((a,b)=>a-b);
                const find = (remaining, minMark, current) => {
                  if (remaining === 0 && current.length) {
                    const key = current.join('+');
                    if (!validDists.find(d => d.join('+') === key)) {
                      validDists.push([...current]);
                    }
                    return;
                  }
                  if (current.length >= 6) return;
                  for (const m of marksAvail) {
                    if (m < minMark || m > remaining) continue;
                    current.push(m);
                    find(remaining - m, m, current);
                    current.pop();
                  }
                };
                find(ws.totalMarks, 1, []);
              });

              if (validDists.length) {
                const pool = shuffled(validDists, si * 997 + 1);
                qDist = pool[qi % pool.length];
              }
            }

            // SAME mode (or fallback): build a BALANCED dist from actual layered sub-pools
            // Strategy: collect all mark values available across all eligible groups,
            // then build a mix that sums to totalMarks — preferring variety over same marks.
            if (!qDist.length) {
              // Gather all mark values that actually exist in any layered group
              const availableMarks = new Set();
              layeredGroups.forEach(grp => {
                Object.keys(buildSubPool(grp.rows)).forEach(m => availableMarks.add(Number(m)));
              });
              const marksSorted = [...availableMarks].sort((a, b) => b - a); // largest first

              // Try to build a varied combination summing to totalMarks
              // Prefer at most 2 of the same mark in a row
              let remaining = ws.totalMarks;
              const autoDist = [];
              const markUsageCount = {};

              // Pass 1: use each available mark at most twice, largest first
              for (const m of marksSorted) {
                let usedCount = 0;
                while (remaining >= m && usedCount < 2) {
                  autoDist.push(m);
                  remaining -= m;
                  usedCount++;
                }
              }
              // Pass 2: if still remaining, fill with whatever fits
              for (const m of marksSorted) {
                while (remaining >= m) { autoDist.push(m); remaining -= m; }
              }

              if (remaining === 0 && autoDist.length) {
                // Shuffle the auto dist so each question gets a different order
                qDist = shuffled(autoDist, si * 997 + qi * 53);
              } else {
                // Last resort: fall back to greedy largest-first
                let rem2 = ws.totalMarks;
                const fallback = [];
                for (const m of marksSorted) {
                  while (rem2 >= m) { fallback.push(m); rem2 -= m; }
                }
                if (rem2 === 0) qDist = fallback;
              }
            }
          }

          if (!qDist.length) {
            children.push(P([TR(`${qi + 1}. (Cannot build sub-questions: no distribution defined and auto-resolve failed)`)], { before: 100, after: 10 }));
            pdfHTML += `<div style="margin-bottom:14px;"><strong>${qi + 1}.</strong> (No distribution — skipped)</div>`;
            continue;
          }

          const totalQMarks = qDist.reduce((a, b) => a + b, 0);

          // ★ Find eligible groups — also exclude already-used stimulus groups
          const eligible = layeredGroups.filter(g =>
            groupSatisfiesDist(g.rows, qDist) &&
            !usedGroupStimuli.has(g.stimulus || '__nostim__' + layeredGroups.indexOf(g))
          );

          // If all eligible groups are exhausted, allow reuse (better than blank)
          const eligibleFinal = eligible.length
            ? eligible
            : layeredGroups.filter(g => groupSatisfiesDist(g.rows, qDist));

          if (!eligibleFinal.length) {
            // Full fallback: pick independent questions per mark using global usedQByMark
            children.push(P([
              TR(`${qi + 1}. `, { bold: true }),
              TR(`[${totalQMarks}]`, { bold: true, color: '555555' }),
            ], { before: 100, after: 10 }));
            pdfHTML += `<div style="margin-top:18px;"><strong>${qi + 1}.</strong> <strong>[${totalQMarks}]</strong></div>`;

            qDist.forEach((neededMark, subIndex) => {
              const pool = writtenPool[neededMark] || [];
              if (!usedQByMark[neededMark]) usedQByMark[neededMark] = new Set();

              // ★ pickUnique across qi — no repeat sub-questions in fallback path
              const subQ   = pickUnique(pool, 1, si * 997 + qi * 31 + subIndex, usedQByMark[neededMark])[0];
              const letter = String.fromCharCode(97 + subIndex);
              children.push(P([
                TR(`${letter}) `, { bold: true }),
                TR(subQ),
                TR(`   [${neededMark}]`, { bold: true, color: '555555' }),
              ], { indent: 360, before: 50, after: 8 }));
              pdfHTML += `<div style="margin-left:30px;"><strong>${letter})</strong> ${subQ} <strong>[${neededMark}]</strong></div>`;
            });

            children.push(P([], { before: 10, after: 16 }));
            continue;
          }

          // ★ Pick group (seeded, different per set) — from unused-stimuli pool
          const group    = shuffled(eligibleFinal, si * 997 + qi * 31)[0];
          const stimulus = (group.stimulus || '').trim();

          // ★ Mark this stimulus as used so it won't appear again in this section
          usedGroupStimuli.add(group.stimulus || '__nostim__' + layeredGroups.indexOf(group));

          // Render stimulus / parent question line
          if (stimulus) {
            children.push(P([
              TR(`${qi + 1}. `, { bold: true }),
              TR(stimulus),
              TR(`   [${totalQMarks}]`, { bold: true, color: '555555' }),
            ], { before: 100, after: 20 }));
            pdfHTML += `<div style="margin-top:18px;"><strong>${qi + 1}.</strong> ${stimulus} <strong>[${totalQMarks}]</strong></div>`;
          } else {
            children.push(P([
              TR(`${qi + 1}. `, { bold: true }),
              TR(`   [${totalQMarks}]`, { bold: true, color: '555555' }),
            ], { before: 100, after: 10 }));
            pdfHTML += `<div style="margin-top:18px;"><strong>${qi + 1}.</strong> <strong>[${totalQMarks}]</strong></div>`;
          }

          // Build sub-question pool from this group's rows
          const subPool = buildSubPool(group.rows);

          // ★ Per-sub-question used set (scoped to this parent question only)
          // Prevents a-b-c having the same sub-question text within ONE parent
          const usedInThisQ = {};

          qDist.forEach((neededMark, subIndex) => {
            if (!usedInThisQ[neededMark]) usedInThisQ[neededMark] = new Set();

            const pool = [...(subPool[neededMark] || [])];
            const subQ = pool.length
              ? pickUnique(pool, 1, si * 997 + qi * 31 + subIndex * 7, usedInThisQ[neededMark])[0]
              : `(No ${neededMark}-mark sub-question in this group)`;

            const letter = String.fromCharCode(97 + subIndex);
            children.push(P([
              TR(`${letter}) `, { bold: true }),
              TR(subQ),
              TR(`   [${neededMark}]`, { bold: true, color: '555555' }),
            ], { indent: 360, before: 50, after: 8 }));
            pdfHTML += `<div style="margin-left:30px;"><strong>${letter})</strong> ${subQ} <strong>[${neededMark}]</strong></div>`;
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
        pdfHTML += `
  <h2 style="margin-top:28px; border-bottom:1px solid #444; padding-bottom:6px;">
    Section ${lbl} — Multiple Choice [${mcqMarks} × ${mcqCount} = ${secTotal} Marks]
  </h2>
  <div style="font-style:italic; margin-bottom:16px;">Circle the letter of the best answer.</div>`;
        children.push(P([TR('Circle the letter of the best answer.', { italic: true })], { before: 30, after: 80 }));

        // ★ MCQ also uses unique picking — no repeat MCQ in same set
        const usedMCQ  = new Set();
        const mcqItems = shuffled(mcqPool, si * 53);
        const chosen   = [];
        for (const item of mcqItems) {
          if (!usedMCQ.has(item.q)) {
            usedMCQ.add(item.q);
            chosen.push(item);
          }
          if (chosen.length === mcqCount) break;
        }
        // fallback if not enough unique
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
  <div style="margin-top:14px;">
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
        pdfHTML += `
  <h2 style="margin-top:28px; border-bottom:1px solid #444; padding-bottom:6px;">
    Section ${lbl} — True / False [${tfMarks} × ${tfCount} = ${secTotal} Marks]
  </h2>
  <div style="font-style:italic; margin-bottom:16px;">Write "True" or "False" in the space provided.</div>`;
        children.push(P([TR('Write "True" or "False" in the space provided.', { italic: true })], { before: 30, after: 80 }));

        // ★ T/F also deduped
        const usedTF  = new Set();
        const tfItems = shuffled(tfPool, si * 79);
        const chosenTF = [];
        for (const item of tfItems) {
          if (!usedTF.has(item.stmt)) {
            usedTF.add(item.stmt);
            chosenTF.push(item);
          }
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
          pdfHTML += `<div style="margin-top:10px;"><strong>${qi + 1}.</strong> ${item.stmt} <span style="color:#777;">Answer: ___________</span></div>`;
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
      // Build a clean filename — sanitise whitespace/special chars so it's safe on all OS
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
  const examYear    = g('examYear');

  const container   = document.createElement('div');
  container.innerHTML = `
    <div style="padding:40px; font-family:'Times New Roman'; color:#000; line-height:1.8; font-size:16px;">
      ${pdfHTML}
    </div>`;

  html2pdf()
    .from(container)
    .set({
      margin:      10,
      filename:    `${safePart(courseCode) || safePart(courseTitle) || 'QuestionPaper'}_${safePart(examYear) || new Date().getFullYear()}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .save()
    .then(() => {
      addToDownloadHistory({
        name: `${(courseCode || courseTitle || 'QuestionPaper').trim().replace(/[^a-zA-Z0-9_\-]/g,'_')}_${examYear || new Date().getFullYear()}`,
        type: 'pdf', size: 0,
        date: new Date().toISOString().split('T')[0],
      });
    });
}