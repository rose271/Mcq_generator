let currentStep = 0;
const totalSteps = 4;
let selectedTypes = new Set();
let questionCounts = {};
let marksData = {};
 
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
 
function buildMarksLayout() {
  const layout = document.getElementById('marksLayout');
  layout.innerHTML = '';
  const types = [...selectedTypes];
  types.forEach(type => {
    const isWritten = type.startsWith('written');
    const isMCQ = type === 'mcq';
    const isTF = type === 'truefalse';
 
    let leftLabel = '', rightLabel = '', rightPlaceholder = '';
    if (type === 'written-no-layer') { leftLabel = 'How many Written\n(no layer)?'; rightLabel = 'Marks Distribution'; rightPlaceholder = '2+2+3+3'; }
    else if (type === 'written-layer') { leftLabel = 'How many Written\n(with layer)?'; rightLabel = 'Marks Distribution'; rightPlaceholder = '4+6'; }
    else if (isMCQ) { leftLabel = 'How many MCQs?'; rightLabel = 'Marks per each MCQ'; rightPlaceholder = '0.5'; }
    else if (isTF) { leftLabel = 'How many True/False?'; rightLabel = 'Marks per each T/F'; rightPlaceholder = '1'; }
 
    const row = document.createElement('div');
    row.className = 'pair-row';
    row.innerHTML = `
      <div class="define-box teal">
        <label>${leftLabel.replace('\n','<br>')}</label>
        <input class="define-input" type="text" value="" placeholder="e.g., 4"
          id="count_${type}" oninput="calcTotal()">
      </div>
      <div class="pair-arrow">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <path d="M10,40 Q50,0 92,40" fill="none" stroke="#7a9aaa" stroke-width="1.5" stroke-dasharray="4,3"/>
          <polygon points="82,38 92,32 92,42" fill="#7a9aaa"/>
        </svg>

      </div>
      <div class="define-box brown">
        <label style="color:var(--teal-dark)">${rightLabel}</label>
        <input class="define-input" type="text" value="" placeholder="${rightPlaceholder}"
          id="marks_${type}" oninput="calcTotal()">
      </div>
    `;
    layout.appendChild(row);
  });
}
 
function calcTotal() {
  let total = 0;
  selectedTypes.forEach(type => {
    const countEl = document.getElementById('count_'+type);
    const marksEl = document.getElementById('marks_'+type);
    if (!countEl || !marksEl) return;
    const count = parseInt(countEl.value) || 0;
    const marksVal = marksEl.value.trim();
    if (type === 'written-no-layer' || type === 'written-layer') {
      // sum of distribution like 2+2+3+3
      const parts = marksVal.split('+').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
      total += parts.reduce((a,b)=>a+b, 0);
    } else {
      // count * marks each
      const m = parseFloat(marksVal) || 0;
      total += count * m;
    }
  });
  const el = document.getElementById('totalMarksDisplay');
  if (el) el.textContent = total || 0;
  return total;
}
 
function buildPreview() {
  const inst = document.getElementById('instName').value;
  const exam = document.getElementById('examName').value;
  const code = document.getElementById('courseCode').value;
  const title = document.getElementById('courseTitle').value;
  const dur = document.getElementById('durationInput').value;
  const durUnit = document.getElementById('durationUnit').value;

  const total = calcTotal();
 
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
 
  const writtenTypes = [...selectedTypes].filter(t => t.startsWith('written'));
  if (writtenTypes.length > 0) {
    html += `<div class="section-head">Written Part:</div>`;
    writtenTypes.forEach(type => {
      const marksEl = document.getElementById('marks_'+type);
      const countEl = document.getElementById('count_'+type);
      if (!marksEl || !countEl) return;
      const parts = marksEl.value.split('+').map(v=>v.trim()).filter(Boolean);
      const count = parseInt(countEl.value) || parts.length || 3;
      for (let i = 0; i < Math.min(count, parts.length || count, 6); i++) {
        html += `<div class="q-line"><span>${i+1}. ${'─'.repeat(40)}</span><span>${parts[i]||''}</span></div>`;
      }
    });
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
 
function generate() {
  alert('Question set generated! 🎉\n(Connect your backend to produce the PDF.)');
}
 
// init
showStep(0);