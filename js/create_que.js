let currentStep = 0;
const totalSteps = 4;
let selectedTypes = new Set();
let questionCounts = {};
let marksData = {};


let layeredSameOrDiff    = 'same'; // 'same' | 'different'
let layeredTotalMarks    = 0;     // total marks per layered question
let layeredDistributions = {};   // { 0: '1+2+3+4', 1: '2+3+5', ... }
let layeredCurrentQIndex = 0;   // which question is shown in the carousel
 
function toggleType(card) {
  const type = card.dataset.type;
  if (selectedTypes.has(type)) {
    selectedTypes.delete(type);
    card.classList.remove('selected');
  } else {
    selectedTypes.add(type);
    card.classList.add('selected');
  }
  updateNextBtn();
}
 
function updateNextBtn() {
  const nb = document.getElementById('nextBtn');
  if (currentStep === 0) {
    nb.classList.toggle('hidden', selectedTypes.size === 0);
  }
}

/* ── Saved state for step-2 inputs (persists across Back navigation) ── */
let savedStep2 = {};  // { count_mcq: '10', marks_mcq: '0.5', ... }
 
function buildMarksLayout() {
  const layout = document.getElementById('marksLayout');
  layout.innerHTML = '';
 
  const types = [...selectedTypes];
 
  types.forEach(type => {
    if (type === 'written-layer') {
      layout.appendChild(buildLayeredRow());
      /* Restore layered state: toggle reflects current mode */
      document.querySelectorAll('#layered-toggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === layeredSameOrDiff);
      });
      /* Restore count input */
      const countEl = document.getElementById('count_written-layer');
      if (countEl && savedStep2['count_written-layer']) {
        countEl.value = savedStep2['count_written-layer'];
      }
      /* Re-render sub-rows if we already have a count */
      const count = parseInt((countEl || {}).value) || 0;
      if (count > 0) renderLayeredSecondRow();
      return;
    }
 
    /* ── unchanged rows for all other types ─────────────────────────── */
    let leftLabel = '', rightLabel = '', rightPlaceholder = '';
    if (type === 'written-no-layer') {
      leftLabel = 'How many Written\n(no layer)?';
      rightLabel = 'Marks Distribution';
      rightPlaceholder = '0+0+0+...';
    } else if (type === 'mcq') {
      leftLabel = 'How many MCQs?';
      rightLabel = 'Marks per each MCQ';
      rightPlaceholder = '0';
    } else if (type === 'truefalse') {
      leftLabel = 'How many True/False?';
      rightLabel = 'Marks per each T/F';
      rightPlaceholder = '0';
    }

    const savedCount = savedStep2['count_' + type] || '';
    const savedMarks = savedStep2['marks_' + type] || '';
 
    const row = document.createElement('div');
    row.className = 'pair-row';
    row.innerHTML = `
      <div class="define-box teal">
        <label>${leftLabel.replace('\n','<br>')}</label>
        <input class="define-input" type="text" value="" placeholder="0"
          id="count_${type}" oninput="calcTotal()">
      </div>
      <div class="pair-arrow">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <path d="M10,40 Q50,0 92,40" fill="none" stroke="#7a9aaa"
                stroke-width="1.5" stroke-dasharray="4,3"/>
          <polygon points="82,38 92,32 92,42" fill="#7a9aaa"/>
        </svg>
      </div>
      <div class="define-box brown">
        <label style="color:var(--text-dark)">${rightLabel}</label>
        <input class="define-input" type="text" value="" placeholder="${rightPlaceholder}"
          id="marks_${type}" oninput="calcTotal()">
      </div>
    `;
    layout.appendChild(row);
  });
  calcTotal();
}

/* Call this before leaving step 2 so values survive Back navigation */
function saveStep2State() {
  selectedTypes.forEach(type => {
    if (type === 'written-layer') {
      const el = document.getElementById('count_written-layer');
      if (el) savedStep2['count_written-layer'] = el.value;
      /* layered-specific state is already kept in module-level vars */
      return;
    }
    const cEl = document.getElementById('count_' + type);
    const mEl = document.getElementById('marks_' + type);
    if (cEl) savedStep2['count_' + type] = cEl.value;
    if (mEl) savedStep2['marks_' + type] = mEl.value;
  });
}

/* ══════════════════════════════════════════════════════════════════════
   buildLayeredRow()
   Builds the full interactive block for written-layer questions.
   Returns a <div> ready to be appended into #marksLayout.
   ══════════════════════════════════════════════════════════════════════ */
function buildLayeredRow() {
  const wrapper = document.createElement('div');
  wrapper.id = 'layered-block';
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:20px;';
 
  /* ── Row 1: count  ←→  Same / Different toggle ──────────────────── */
  const row1 = document.createElement('div');
  row1.className = 'pair-row';
  row1.innerHTML = `
    <div class="define-box teal">
      <label>How many Written<br>(with layer)?</label>
      <div style="display:flex;align-items:center;gap:6px;">
        <input class="define-input" type="text" value="" placeholder="0"
          id="count_written-layer"
          oninput="onLayeredCountChange()"
          style="flex:1;">
        <button class="layered-icon-btn" onclick="onLayeredCountConfirm()" title="Confirm count">&#x2192;</button>
      </div>
    </div>
 
    <div class="pair-arrow">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <path d="M10,40 Q50,0 92,40" fill="none" stroke="#7a9aaa"
              stroke-width="1.5" stroke-dasharray="4,3"/>
        <polygon points="82,38 92,32 92,42" fill="#7a9aaa"/>
      </svg>
    </div>
 
    <div class="define-box brown" style="display:flex;flex-direction:column;justify-content:center;gap:10px;">
      <label style="color:var(--text-dark);">
        Will the marks for each layered question be same?
      </label>
      <div class="toggle-group" id="layered-toggle">
        <button class="toggle-btn active" onclick="setLayeredMode('same')">Same</button>
        <button class="toggle-btn"        onclick="setLayeredMode('different')">Different</button>
      </div>
    </div>
  `;
  wrapper.appendChild(row1);
 
  /* ── Row 2 (dynamic): appears after count is confirmed ──────────── */
  /* rendered by renderLayeredSecondRow() */
  const row2holder = document.createElement('div');
  row2holder.id = 'layered-second-row';
  wrapper.appendChild(row2holder);
 
  return wrapper;
}
 
 
/* ══════════════════════════════════════════════════════════════════════
   renderLayeredSecondRow()
   Called whenever count or same/diff changes.
   ══════════════════════════════════════════════════════════════════════ */
function renderLayeredSecondRow() {
  const holder = document.getElementById('layered-second-row');
  if (!holder) return;
 
  const countEl = document.getElementById('count_written-layer');
  const count = parseInt(countEl ? countEl.value : 0) || 0;
  if (count < 1) { holder.innerHTML = ''; return; }
 
  /* ── SAME mode ─────────────────────────────────────────────────── */
  if (layeredSameOrDiff === 'same') {
    holder.innerHTML = `
      <div style="display:flex;justify-content:left;">
        <svg width="100" height="60" viewBox="0 0 100 60" style="display:block;">
          <path d="M40,0 Q50,34 100,58" fill="none" stroke="#7a9aaa"
                stroke-width="1.5" stroke-dasharray="4,3"/>
          <polygon points="90,59 97,50 100,60" fill="#7a9aaa"/>
        </svg>
      </div>
      <div style="display:flex;justify-content:center;">
        <div class="layered-card brown" id="layered-same-card">
          <div class="layered-card-title">Total Marks for<br>each layered Question</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
            <input class="define-input" type="text" value="${layeredTotalMarks || ''}"
              id="layered-total-input" placeholder="0"
              oninput="onLayeredTotalChange()"
              style="flex:1;">
            <button class="layered-icon-btn dark" onclick="onLayeredTotalConfirm()" title="Confirm total">&#x2192;</button>
          </div>
        </div>
      </div>
      <div id="layered-dist-area"></div>
    `;
    /* re-render dist area if total already set */
    if (layeredTotalMarks > 0) renderLayeredDistArea();
    return;
  }
 
  /* ── DIFFERENT mode ──────────────────────────────────────────────── */
  /* First we still ask total marks (same UX), then show per-Q carousel */
  holder.innerHTML = `
    <div style="display:flex;justify-content:left;">
        <svg width="100" height="60" viewBox="0 0 100 60" style="display:block;">
          <path d="M40,0 Q50,34 100,58" fill="none" stroke="#7a9aaa"
                stroke-width="1.5" stroke-dasharray="4,3"/>
          <polygon points="90,59 97,50 100,60" fill="#7a9aaa"/>
        </svg>
    </div>
    <div style="display:flex;justify-content:center;">
      <div class="layered-card brown">
        <div class="layered-card-title">Total Marks for<br>each layered Question</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
          <input class="define-input" type="text" value="${layeredTotalMarks || ''}"
            id="layered-total-input" placeholder="0"
            oninput="onLayeredTotalChange()"
            style="flex:1;">
          <button class="layered-icon-btn dark" onclick="onLayeredTotalConfirm()" title="Confirm total">&#x2192;</button>
        </div>
      </div>
    </div>
    <div id="layered-dist-area"></div>
  `;
  if (layeredTotalMarks > 0) renderLayeredDistArea();
}
 
 
/* ══════════════════════════════════════════════════════════════════════
   renderLayeredDistArea()
   Below the total-marks card. Shows ONE shared dist box (same mode)
   or a carousel of per-question boxes (different mode).
   ══════════════════════════════════════════════════════════════════════ */
function renderLayeredDistArea() {
  const area = document.getElementById('layered-dist-area');
  if (!area) return;
 
  const countEl = document.getElementById('count_written-layer');
  const count   = parseInt(countEl ? countEl.value : 0) || 0;
 
  /* ── SAME: one distribution box, no carousel ─────────────────────── */
  if (layeredSameOrDiff === 'same') {
    const dist = layeredDistributions['shared'] || '';
    area.innerHTML = `
      <div style="display:flex;justify-content:center;">
        <svg width="100" height="60" viewBox="0 0 100 60" style="display:block;">
          <path d="M50,2 Q20,30 50,58" fill="none" stroke="#7a9aaa"
                stroke-width="1.5" stroke-dasharray="4,3"/>
          <polygon points="42,55 50,58 52,50" fill="#7a9aaa"/>
        </svg>
      </div>
      <div style="display:flex;justify-content:center;">
        <div class="layered-card brown">
          <div class="layered-card-title">Marks Distribution</div>
          <div class="layered-card-sub">Total marks: ${layeredTotalMarks}</div>
          <input class="define-input" type="text" value="${dist}"
            placeholder="e.g., 1+2+3+4"
            id="layered-dist-shared"
            oninput="layeredDistributions['shared']=this.value; calcTotal();"
            style="margin-top:8px;">
        </div>
      </div>
    `;
    return;
  }
 
  /* ── DIFFERENT: per-question carousel ───────────────────────────── */
  /* initialise missing entries */
  for (let i = 0; i < count; i++) {
    if (layeredDistributions[i] === undefined) layeredDistributions[i] = '';
  }
 
  const idx  = layeredCurrentQIndex;
  const dist = layeredDistributions[idx] || '';
  const hasPrev = idx > 0;
  const hasNext = idx < count - 1;
 
  area.innerHTML = `
    <div style="display:flex;justify-content:center;">
      <svg width="100" height="60" viewBox="0 0 100 60" style="display:block;">
        <path d="M50,2 Q20,30 50,58" fill="none" stroke="#7a9aaa"
              stroke-width="1.5" stroke-dasharray="4,3"/>
        <polygon points="42,55 50,58 52,50" fill="#7a9aaa"/>
      </svg>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
      <button class="carousel-arrow" onclick="layeredCarouselPrev()"
        ${hasPrev ? '' : 'disabled'} title="Previous question">&#8249;</button>
 
      <div class="layered-card brown">
        <div class="layered-card-title">Marks Distribution of Q-${idx + 1}</div>
        <div class="layered-card-sub">Total marks: ${layeredTotalMarks}</div>
        <input class="define-input" type="text" value="${dist}"
          placeholder="e.g., 1+2+3+4"
          id="layered-dist-q${idx}"
          oninput="layeredDistributions[${idx}]=this.value; calcTotal();"
          style="margin-top:8px;">
      </div>
 
      <button class="carousel-arrow" onclick="layeredCarouselNext()"
        ${hasNext ? '' : 'disabled'} title="Next question">&#8250;</button>
    </div>
  `;
}
 
 
/* ══════════════════════════════════════════════════════════════════════
   Event handlers
   ══════════════════════════════════════════════════════════════════════ */
 
function onLayeredCountChange() {
  /* persist count into savedStep2 immediately */
  const el = document.getElementById('count_written-layer');
  if (el) savedStep2['count_written-layer'] = el.value;
  /* reset distributions when count changes */
  layeredDistributions = {};
  layeredCurrentQIndex = 0;
  layeredTotalMarks    = 0;
  renderLayeredSecondRow();
  calcTotal();
}
 
function onLayeredCountConfirm() {
  renderLayeredSecondRow();
}
 
function setLayeredMode(mode) {
  layeredSameOrDiff    = mode;
  layeredDistributions = {};
  layeredCurrentQIndex = 0;
 
  /* update toggle button styles */
  document.querySelectorAll('#layered-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === mode);
  });
 
  renderLayeredSecondRow();
  calcTotal();
}
 
function onLayeredTotalChange() {
  const el = document.getElementById('layered-total-input');
  layeredTotalMarks = parseFloat(el ? el.value : 0) || 0;
  calcTotal();
}
 
function onLayeredTotalConfirm() {
  const el = document.getElementById('layered-total-input');
  layeredTotalMarks = parseFloat(el ? el.value : 0) || 0;
  renderLayeredDistArea();
  calcTotal();
}
 
function layeredCarouselPrev() {
  /* save current before navigating */
  const curInput = document.getElementById(`layered-dist-q${layeredCurrentQIndex}`);
  if (curInput) layeredDistributions[layeredCurrentQIndex] = curInput.value;
  if (layeredCurrentQIndex > 0) {
    layeredCurrentQIndex--;
    renderLayeredDistArea();
  }
}
 
function layeredCarouselNext() {
  const curInput = document.getElementById(`layered-dist-q${layeredCurrentQIndex}`);
  if (curInput) layeredDistributions[layeredCurrentQIndex] = curInput.value;
 
  const countEl = document.getElementById('count_written-layer');
  const count = parseInt(countEl ? countEl.value : 0) || 0;
  if (layeredCurrentQIndex < count - 1) {
    layeredCurrentQIndex++;
    renderLayeredDistArea();
  }
}
 

function calcTotal() {
  let total = 0;
 
  selectedTypes.forEach(type => {
    if (type === 'written-layer') {
      /* ── layered: count × totalMarks ──────────────────────────────── */
      const countEl = document.getElementById('count_written-layer');
      const count   = parseInt(countEl ? countEl.value : 0) || 0;
      total += count * (layeredTotalMarks || 0);
      return;
    }
 
    const countEl = document.getElementById('count_' + type);
    const marksEl = document.getElementById('marks_' + type);
    if (!countEl || !marksEl) return;
    const count    = parseInt(countEl.value) || 0;
    const marksVal = marksEl.value.trim();
 
    if (type === 'written-no-layer') {
      const parts = marksVal.split('+').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
      total += parts.reduce((a, b) => a + b, 0);
    } else {
      const m = parseFloat(marksVal) || 0;
      total += count * m;
    }
  });
 
  const el = document.getElementById('totalMarksDisplay');
  if (el) el.textContent = total || 0;
  return total;
}
 
function buildPreview() {
    const inst    = document.getElementById('instName').value;
    const exam    = document.getElementById('examName').value;
    const year    = document.getElementById('examYear').value;
    const code    = document.getElementById('courseCode').value;
    const title   = document.getElementById('courseTitle').value;
    const dur     = document.getElementById('durationInput').value;
    const durUnit = document.getElementById('durationUnit').value;
    const total   = calcTotal();

  let html = `
    <div class="inst">${inst}</div>
    <div class="exam-name">${exam}</div>
    <div class="meta-row">
      <span>Duration: ${dur} ${durUnit}</span><span>Full Marks: ${total}</span>
    </div>
    <div class="meta-row">
      <span>Course Code: ${code}</span><span>Course Title: ${title}</span>
    </div>
  `;
 
  /* ── Written (no layer) ── */
  if (selectedTypes.has('written-no-layer')) {
    const marksEl = document.getElementById('marks_written-no-layer') ||
                    { value: savedStep2['marks_written-no-layer'] || '' };
    const countEl = document.getElementById('count_written-no-layer') ||
                    { value: savedStep2['count_written-no-layer'] || '0' };
    const parts = (marksEl.value || '').split('+').map(v => v.trim()).filter(Boolean);
    const count = parseInt(countEl.value) || parts.length || 0;
    if (count > 0) {
      const noLayerTotal = parts.reduce((a,b) => a + parseFloat(b||0), 0);
      html += `<div class="section-head">Written Part: <span style="float:right;font-weight:400">${noLayerTotal} Marks</span></div>`;
      for (let i = 0; i < count; i++) {
        const mark = parts[i] || '';
        html += `<div class="q-line">
          <span>${i+1}. ${'─'.repeat(40)}</span>
          <span>${mark}</span>
        </div>`;
      }
    }
  }

  /* ── Written (with layer) ── */
  if (selectedTypes.has('written-layer')) {
    const countEl = document.getElementById('count_written-layer') ||
                    { value: savedStep2['count_written-layer'] || '0' };
    const count = parseInt(countEl.value) || 0;
    if (count > 0) {
      const layerTotal = count * (layeredTotalMarks || 0);
      html += `<div class="section-head">Written Part (Layered): <span style="float:right;font-weight:400">${layerTotal} Marks</span></div>`;
      for (let i = 0; i < count; i++) {
        const dist = layeredSameOrDiff === 'same'
          ? (layeredDistributions['shared'] || '')
          : (layeredDistributions[i] || '');
        const parts = dist.split('+').map(v => v.trim()).filter(Boolean);
        html += `<div class="layer-main-q">${i+1}. ${'─'.repeat(36)} <span class="layer-mark">[${layeredTotalMarks}]</span></div>`;
        if (parts.length) {
          parts.forEach((mark, j) => {
            html += `<div class="layer-sub-q">
              <span>${String.fromCharCode(97+j)}. ${'─'.repeat(32)}</span>
              <span class="layer-mark">${mark}</span>
            </div>`;
          });
        } else {
          html += `<div class="layer-sub-q"><span>a. ${'─'.repeat(32)+'?'}</span></div>`;
        }
      }
    }
  }

 
  if (selectedTypes.has('mcq')) {
    const mEl = document.getElementById('marks_mcq');
    const cEl = document.getElementById('count_mcq');
    const m = mEl ? mEl.value : '0.5';
    const c = cEl ? (parseInt(cEl.value)||10) : 10;
    html += `<div class="section-head">MCQ Part: <span style="float:right;font-weight:400">${m} x ${c} = ${(parseFloat(m)||0)*c}</span></div>`;
    for (let i = 0; i < Math.min(c, 4); i++) {
      html += `<div class="q-line">${i+1}. ──────────────────────────────────────────</div>`;
      html += `<div class="mcq-opts">a.──────  b.──────  c.──────  d.──────</div>`;
    }
    if (c > 4) html += `<div class="mcq-opts" style="margin-top:4px">... (${c} total)</div>`;
  }
 
  if (selectedTypes.has('truefalse')) {
    const mEl = document.getElementById('marks_truefalse');
    const cEl = document.getElementById('count_truefalse');
    const m = mEl ? mEl.value : '1';
    const c = cEl ? (parseInt(cEl.value)||5) : 5;
    html += `<div class="section-head">True/False Part: <span style="float:right;font-weight:400">${m} x ${c} = ${(parseFloat(m)||0)*c}</span></div>`;
    for (let i = 0; i < Math.min(c, 4); i++) {
      html += `<div class="q-line">${i+1}. ────────────────────────────── T / F</div>`;
    }
  }
 
  document.getElementById('previewPaper').innerHTML = html;
}
 
function goNext() {
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn.dataset.action === 'generate') {
    generate();
    return;
  }
  if (currentStep < totalSteps - 1) {
    showStep(currentStep + 1);
  }
}
 
function goBack() {
  if (currentStep > 0) {
    showStep(currentStep - 1);
  }
}
 
function showStep(n) {
  document.querySelectorAll('.step').forEach((s,i) => {
    s.classList.toggle('active', i === n);
  });
  document.querySelectorAll('.dot').forEach((d,i) => {
    d.classList.toggle('active', i === n);
  });
  currentStep = n;
 
  if (n === 1) buildMarksLayout();
  if (n === 3) buildPreview();
 
  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
 
  backBtn.classList.toggle('hidden', n === 0);
  nextBtn.classList.remove('hidden');
 
  if(n===totalSteps-1){
    nextBtn.innerHTML = 'Generate &#10003;';
    nextBtn.dataset.action = 'generate';
  } else{
    nextBtn.innerHTML = 'Next &#8250;';
    nextBtn.dataset.action = 'next';
  }

  if (n === 0) updateNextBtn();
}
 
function handleFile(input) {
  if (input.files && input.files[0]) {
    document.getElementById('fileNameDisplay').textContent = input.files[0].name;
  }
}
 
// function generate() {
//   generateDocx();
// }
let selectedExportType = 'docx';

function generate() {

  document
    .getElementById('exportOverlay')
    .classList.remove('hidden');

}
document.addEventListener('click', e => {

  const card = e.target.closest('.export-card');

  if (!card) return;

  document
    .querySelectorAll('.export-card')
    .forEach(c => c.classList.remove('active'));

  card.classList.add('active');

  selectedExportType =
    card.dataset.type;

});

function closeExportModal(){

  document
    .getElementById('exportOverlay')
    .classList.add('hidden');

}

function startExport(){

  closeExportModal();

  if(selectedExportType === 'docx'){
    generateDocx();
  }

  else if(selectedExportType === 'pdf'){
    generatePDF();
  }

 
}
 
// init
showStep(0);