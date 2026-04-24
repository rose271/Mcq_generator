// ============================================================
//  script.js  –  Question Paper Generator  (Frontend Logic)
// ============================================================
//
//  Responsibilities:
//  1. Populate the "Set Start" dropdown (A–Z)
//  2. Render "Sets that will be created" preview badges
//  3. Allow teacher to dynamically add/remove question groups
//     and enter a mark pattern like "3+4+5" per group
//  4. Compute and display per-row mark totals & grand total
//  5. Handle drag-and-drop / click file upload
//  6. On submit: POST to server, receive base64 PDFs,
//     render download links so teacher can save each set
//
// ============================================================

// ── DOM references ─────────────────────────────────────────
const form            = document.getElementById('mainForm');
const fileInput       = document.getElementById('question_file');
const uploadZone      = document.getElementById('uploadZone');
const uploadText      = document.getElementById('uploadText');
const setNumberInput  = document.getElementById('setNumber');
const setStartSelect  = document.getElementById('setStart');
const setPreview      = document.getElementById('setPreview');
const groupsContainer = document.getElementById('groupsContainer');
const addGroupBtn     = document.getElementById('addGroupBtn');
const grandTotalEl    = document.getElementById('grandTotal');
const submitBtn       = document.getElementById('submitBtn');
const downloadArea    = document.getElementById('downloadArea');

// ── State ───────────────────────────────────────────────────
let groupCount = 0;   // tracks number of group rows rendered

// ============================================================
//  1.  POPULATE "Set Start" DROPDOWN  (A–Z)
// ============================================================
function populateSetStartDropdown() {
    setStartSelect.innerHTML = '';
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        const opt = document.createElement('option');
        opt.value = letter;
        opt.textContent = `Set ${letter}`;
        setStartSelect.appendChild(opt);
    }
}

// ============================================================
//  2.  UPDATE SET PREVIEW BADGES
//      Called whenever set_number or set_start changes.
// ============================================================
function updateSetPreview() {
    const num   = Math.max(1, parseInt(setNumberInput.value) || 1);
    const start = setStartSelect.value.charCodeAt(0) - 65;   // 0=A, 1=B…

    setPreview.innerHTML = '';
    for (let i = 0; i < num; i++) {
        const letter = String.fromCharCode(65 + start + i);
        if (letter > 'Z') break;   // cap at Z
        const badge = document.createElement('div');
        badge.className = 'set-badge';
        badge.textContent = letter;
        badge.title = `Set ${letter}`;
        setPreview.appendChild(badge);
    }
}

// ============================================================
//  3.  GROUP ROWS – add / remove / update totals
// ============================================================

/**
 * Parse "3+4+5" into [3, 4, 5], returns [] for invalid input.
 */
function parsePattern(str) {
    return String(str)
        .split('+')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
}

/**
 * Add a new group row with an optional initial mark pattern.
 * Default pattern for a typical 12-mark group: "3+4+5"
 */
function addGroupRow(pattern = '') {
    groupCount++;
    const rowIdx = groupCount;

    const row = document.createElement('div');
    row.className = 'group-row';
    row.dataset.id = rowIdx;

    // Number cell
    const numCell = document.createElement('div');
    numCell.className = 'row-num';
    numCell.textContent = rowIdx;

    // Pattern input
    const patternInput = document.createElement('input');
    patternInput.type = 'text';
    patternInput.className = 'pattern-input';
    patternInput.placeholder = 'e.g. 3+4+5   or   2+2+4+4';
    patternInput.value = pattern;
    patternInput.title = 'Enter marks for each sub-question separated by +';

    // Per-row total display
    const totalCell = document.createElement('div');
    totalCell.className = 'row-total';
    totalCell.textContent = '0';

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove this group';
    removeBtn.addEventListener('click', () => {
        row.remove();
        renumberRows();
        updateGrandTotal();
    });

    // Update total cell whenever pattern changes
    patternInput.addEventListener('input', () => {
        const marks = parsePattern(patternInput.value);
        const sum   = marks.reduce((a, b) => a + b, 0);
        totalCell.textContent = sum > 0 ? sum : '0';
        updateGrandTotal();
    });

    // Trigger on load for pre-filled value
    if (pattern) {
        const marks = parsePattern(pattern);
        totalCell.textContent = marks.reduce((a,b) => a+b, 0) || '0';
    }

    row.appendChild(numCell);
    row.appendChild(patternInput);
    row.appendChild(totalCell);
    row.appendChild(removeBtn);
    groupsContainer.appendChild(row);

    updateGrandTotal();
}

/** Renumber the leftmost "#" cell after a row is deleted */
function renumberRows() {
    const rows = groupsContainer.querySelectorAll('.group-row');
    rows.forEach((row, i) => {
        row.querySelector('.row-num').textContent = i + 1;
    });
}

/** Sum up all per-row totals and update the grand total display */
function updateGrandTotal() {
    const totals = [...groupsContainer.querySelectorAll('.row-total')]
        .map(el => parseInt(el.textContent, 10) || 0);
    const grand = totals.reduce((a, b) => a + b, 0);
    grandTotalEl.textContent = grand;
}

/** Collect current group rows into an array of { markPattern } objects */
function collectGroups() {
    return [...groupsContainer.querySelectorAll('.group-row')].map(row => ({
        markPattern: row.querySelector('.pattern-input').value.trim()
    }));
}

// ============================================================
//  4.  FILE UPLOAD  (click + drag-and-drop)
// ============================================================

// Click on upload zone → trigger hidden file input
uploadZone.addEventListener('click', () => fileInput.click());

// Show chosen file name
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        showUploadFile(fileInput.files[0].name);
    }
});

// Drag events
uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
});
uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && /\.(xlsx|xls)$/i.test(file.name)) {
        // Assign to hidden input via DataTransfer
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        showUploadFile(file.name);
    } else {
        showToast('Please drop an Excel file (.xlsx or .xls)', 'error');
    }
});

function showUploadFile(name) {
    uploadZone.classList.add('has-file');
    uploadZone.querySelector('.upload-icon').textContent = '✅';
    uploadText.innerHTML = `<span class="upload-filename">${name}</span>`;
}

// ============================================================
//  5.  TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'error') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 4500);
}

// ============================================================
//  6.  FORM SUBMIT → POST TO SERVER → RECEIVE BASE64 PDFS
// ============================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // ── Validate: file ──────────────────────────────────────
    if (!fileInput.files[0] || !/\.(xlsx|xls)$/i.test(fileInput.files[0].name)) {
        showToast('Please upload a valid Excel file (.xlsx or .xls)', 'error');
        return;
    }

    // ── Validate: groups ────────────────────────────────────
    const groups = collectGroups();
    if (groups.length === 0) {
        showToast('Add at least one question group before generating.', 'error');
        return;
    }

    const badGroup = groups.findIndex(g => parsePattern(g.markPattern).length === 0);
    if (badGroup !== -1) {
        showToast(`Group ${badGroup + 1} has an invalid mark pattern. Use format like 3+4+5`, 'error');
        return;
    }

    // ── Build FormData ──────────────────────────────────────
    //
    // Why FormData?  Because we're sending a binary file (Excel)
    // alongside text fields.  FormData handles multipart encoding
    // automatically so we don't have to base64-encode the file.
    //
    const formData = new FormData(form);

    // Attach groups as a JSON string in the same FormData
    formData.set('groups', JSON.stringify(groups));

    // ── UI: loading state ───────────────────────────────────
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div><span class="btn-text">Generating PDFs…</span>';
    downloadArea.style.display = 'none';
    downloadArea.innerHTML = '';

    try {
        const response = await fetch('http://localhost:5000/generate-questions', {
            method: 'POST',
            body: formData
            // Do NOT set Content-Type header manually — the browser sets it
            // automatically with the correct multipart boundary.
        });

        const result = await response.json();

        if (!result.success) {
            showToast('Server error: ' + result.error, 'error');
            return;
        }

        // ── Render download buttons ─────────────────────────
        //
        // The server returns an array of { setLabel, pdfBase64 }.
        // We convert each base64 string back into a Blob URL
        // so the browser can download it as a real file.
        //
        showDownloadLinks(result.sets, formData.get('course_name') || 'QuestionPaper');

    } catch (err) {
        console.error('Fetch error:', err);
        showToast('Cannot connect to server. Make sure server.js is running on port 5000.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="btn-icon">⬇</span><span class="btn-text">Generate &amp; Download PDFs</span>';
    }
});

// ============================================================
//  7.  RENDER DOWNLOAD LINKS
// ============================================================
function showDownloadLinks(sets, courseName) {
    downloadArea.style.display = 'flex';

    downloadArea.innerHTML = `
        <h3>✅ ${sets.length} Set${sets.length > 1 ? 's' : ''} Generated Successfully!</h3>
        <p style="font-size:13px;color:var(--text-muted)">
            Click each button to download the question paper PDF for that set.
        </p>
        <div class="download-links" id="dlLinks"></div>
        <button class="dl-all-btn" id="dlAllBtn">⬇ Download All Sets</button>
    `;

    const dlLinks = document.getElementById('dlLinks');

    // Store Blob URLs so "Download All" can trigger them
    const blobUrls = [];

    sets.forEach(({ setLabel, pdfBase64 }) => {
        // Convert base64 → Uint8Array → Blob → Object URL
        const binary  = atob(pdfBase64);
        const bytes   = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob    = new Blob([bytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.push({ url: blobUrl, label: setLabel, courseName });

        const btn = document.createElement('a');
        btn.href     = blobUrl;
        btn.download = `${courseName.replace(/[^a-zA-Z0-9]/g,'_')}_Set_${setLabel}.pdf`;
        btn.className = 'dl-btn';
        btn.innerHTML = `📄 Set ${setLabel}`;
        dlLinks.appendChild(btn);
    });

    // Download All: trigger each link with a small delay so browser
    // doesn't block multiple simultaneous downloads
    document.getElementById('dlAllBtn').addEventListener('click', () => {
        blobUrls.forEach(({ url, label, courseName }, i) => {
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = url;
                a.download = `${courseName.replace(/[^a-zA-Z0-9]/g,'_')}_Set_${label}.pdf`;
                a.click();
            }, i * 400);
        });
    });

    // Scroll the download area into view so teacher sees it
    downloadArea.scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast(`${sets.length} PDF${sets.length > 1 ? 's' : ''} ready to download!`, 'success');
}

// ============================================================
//  8.  WIRE UP EVENT LISTENERS & INITIALISE
// ============================================================

// Set number / start label → update preview badges
setNumberInput.addEventListener('input', updateSetPreview);
setStartSelect.addEventListener('change', updateSetPreview);

// Add Group button
addGroupBtn.addEventListener('click', () => addGroupRow());

// ── Initialise ───────────────────────────────────────────────
populateSetStartDropdown();
updateSetPreview();

// Pre-load 7 default groups matching a typical 84-mark semester paper:
// 7 questions × 12 marks each = 84.  Default pattern 4+4+4 per group.
const defaultPattern = '4+4+4';
for (let i = 0; i < 7; i++) {
    addGroupRow(defaultPattern);
}