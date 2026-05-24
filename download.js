/* ─────────────────────────────────────────────
   ExamCraft — Download History  |  download.js
───────────────────────────────────────────── */

const STORAGE_KEY = 'examcraft_downloads';

const SEED_DATA = [
  { id: 'f1', name: 'Operating System Tutorial Question File',   type: 'pdf',  size: 2.2, date: '2026-10-24' },
  { id: 'f2', name: 'Operating System Tutorial Question File',   type: 'pdf',  size: 2.2, date: '2026-10-24' },
  { id: 'f3', name: 'Data Structures — Mid-Term Exam Set A',     type: 'pdf',  size: 1.8, date: '2026-10-18' },
  { id: 'f4', name: 'Calculus II Final Examination Paper',       type: 'pdf',  size: 3.1, date: '2026-10-12' },
  { id: 'f5', name: 'English Literature Comprehension Test',     type: 'docx', size: 0.9, date: '2026-09-30' },
  { id: 'f6', name: 'Physics Lab Assessment Question Bank',      type: 'xlsx', size: 1.4, date: '2026-09-20' },
  { id: 'f7', name: 'Chemistry Practical Evaluation Sheet',      type: 'docx', size: 0.7, date: '2026-09-15' },
  { id: 'f8', name: 'Computer Networks Semester Exam Paper',     type: 'pdf',  size: 2.9, date: '2026-09-05' },
];

/* ── State ── */
let files      = loadFiles();
let query      = '';
let activeType = 'all';

/* ── Persistence ── */
function loadFiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [...SEED_DATA];
  } catch {
    return [...SEED_DATA];
  }
}

function saveFiles() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(files)); } catch {}
}

/* ── DOM refs ── */
const listEl   = document.getElementById('file-list');
const emptyEl  = document.getElementById('empty-state');
const searchEl = document.getElementById('search-input');
const badgeEl  = document.getElementById('badge-count');
const toastEl  = document.getElementById('toast');
const clearBtn = document.getElementById('clear-all-btn');

const statTotal  = document.getElementById('stat-total');
const statSize   = document.getElementById('stat-size');
const statRecent = document.getElementById('stat-recent');

let toastTimer = null;

/* ── Render ── */
function render() {
  const filtered = files.filter(f => {
    const matchType = activeType === 'all' || f.type === activeType;
    const matchQ    = f.name.toLowerCase().includes(query.toLowerCase());
    return matchType && matchQ;
  });

  listEl.innerHTML = '';

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
    filtered.forEach((f, i) => listEl.appendChild(buildCard(f, i)));
  }

  updateStats();
  updateBadge();
}

/* ── Card Builder ── */
function buildCard(f, idx) {
  const card = document.createElement('div');
  card.className = `file-card type-${f.type}`;
  card.style.animationDelay = `${idx * 55}ms`;
  card.dataset.id = f.id;

  card.innerHTML = `
    <div class="file-card__strip"></div>

    <div class="file-card__icon">
      <div class="file-type-badge">
        ${fileIcon(f.type)}
        <span class="badge-label">${f.type.toUpperCase()}</span>
      </div>
    </div>

    <div class="file-card__body">
      <div class="file-card__name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
      <div class="file-card__meta">
        <span>${f.type.toUpperCase()}</span>
        <span class="meta-dot"></span>
        <span>${f.size} MB</span>
        <span class="meta-dot"></span>
        <span>${formatDate(f.date)}</span>
      </div>
    </div>

    <div class="file-card__actions">
      <button class="action-btn" title="Re-download" onclick="reDownload('${f.id}')">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="M10 3v9m0 0L6.5 8.5M10 12l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 15h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="action-btn" title="Copy name" onclick="copyName('${f.id}')">
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="7" y="7" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M7 13H5a1.5 1.5 0 01-1.5-1.5V5A1.5 1.5 0 015 3.5h6.5A1.5 1.5 0 0113 5v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="action-btn danger" title="Remove" onclick="removeFile('${f.id}')">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="M5 7h10M8 7V5h4v2M9 10v4M11 10v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="5" y="7" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
    </div>`;

  return card;
}

/* ── File Icons ── */
function fileIcon(type) {
  if (type === 'pdf') return `
    <svg viewBox="0 0 20 20" fill="none">
      <path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/>
      <path d="M12 3v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M7 10h2a1 1 0 010 2H7v-2zM7 12v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`;

  if (type === 'docx') return `
    <svg viewBox="0 0 20 20" fill="none">
      <path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/>
      <path d="M12 3v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`;

  return `
    <svg viewBox="0 0 20 20" fill="none">
      <path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/>
      <path d="M12 3v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M7 10h6M7 13h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`;
}

/* ── Actions ── */
function reDownload(id) {
  const f = files.find(x => x.id === id);
  if (f) showToast(`⬇ Re-downloading "${shortName(f.name)}"…`);
}

function copyName(id) {
  const f = files.find(x => x.id === id);
  if (!f) return;
  navigator.clipboard.writeText(f.name)
    .then(() => showToast('✓ Name copied to clipboard'))
    .catch(() => showToast('Could not copy — try manually'));
}

function removeFile(id) {
  const card = document.querySelector(`.file-card[data-id="${id}"]`);
  if (card) {
    card.style.transition = 'opacity 0.22s, transform 0.22s';
    card.style.opacity    = '0';
    card.style.transform  = 'translateX(20px)';
    setTimeout(() => {
      files = files.filter(f => f.id !== id);
      saveFiles();
      render();
      showToast('🗑 File removed from history');
    }, 220);
  }
}

/* ── Clear All ── */
clearBtn.addEventListener('click', () => {
  if (files.length === 0) { showToast('Nothing to clear'); return; }
  if (!confirm(`Remove all ${files.length} file(s) from history?`)) return;
  files = [];
  saveFiles();
  render();
  showToast('History cleared');
});

/* ── Search ── */
searchEl.addEventListener('input', e => {
  query = e.target.value.trim();
  render();
});

/* ⌘K / Ctrl+K shortcut */
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
});

/* ── Filter Buttons ── */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeType = btn.dataset.filter;
    render();
  });
});

/* ── Stats ── */
function updateStats() {
  const total = files.length;
  const size  = files.reduce((s, f) => s + f.size, 0);
  const dates = files.map(f => f.date).sort().reverse();

  statTotal.textContent  = total;
  statSize.textContent   = size > 0 ? `${size.toFixed(1)} MB` : '0 MB';
  statRecent.textContent = dates.length ? formatDateShort(dates[0]) : '—';
}

function updateBadge() {
  if (badgeEl) badgeEl.textContent = files.length;
  /* also update sidebar badge if it exists */
  if (typeof updateSidebarBadge === 'function') updateSidebarBadge(files.length);
}

/* ── Toast ── */
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2800);
}

/* ── Helpers ── */
function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function shortName(name) {
  return name.length > 40 ? name.slice(0, 40) + '…' : name;
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ── Init ── */
render();