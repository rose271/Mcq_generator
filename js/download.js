/* ─────────────────────────────────────────────
   ExamCraft — Download History  |  download.js
───────────────────────────────────────────── */

/* ══════════════════════════════════════════
   NAVBAR JS  (merged from navbar.html)
══════════════════════════════════════════ */

// ── Profile dropdown ──
// ── Navbar auto-theme based on scroll position ──
(function () {
  const nav    = document.querySelector('nav');
  const hero   = document.querySelector('.hero');

  function updateNavTheme() {
    if (!hero) {
      nav.setAttribute('data-nav', 'light');
      return;
    }
    // Switch to dark (white elements) while hero is still visible
    const heroBottom = hero.getBoundingClientRect().bottom;
    nav.setAttribute('data-nav', heroBottom > 0 ? 'dark' : 'light');
  }

  // Set immediately on load
  updateNavTheme();

  // Update on scroll
  window.addEventListener('scroll', updateNavTheme, { passive: true });
})();

const profileBtn = document.getElementById('profileBtn');
const dropdown   = document.getElementById('profileDropdown');   // ← matches download.html

profileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = dropdown.classList.toggle('show');
  profileBtn.classList.toggle('open', open);
  profileBtn.setAttribute('aria-expanded', open);
});

document.addEventListener('click', (e) => {
  if (!profileBtn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.remove('show');
    profileBtn.classList.remove('open');
    profileBtn.setAttribute('aria-expanded', 'false');
  }
});

// close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    dropdown.classList.remove('show');
    profileBtn.classList.remove('open');
  }
});

// ── Hamburger / mobile menu ──
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('show');
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    mobileMenu.classList.remove('show');
    hamburger.classList.remove('open');
  }
});

// ── Active nav link ──
const currentPage = window.location.pathname.split('/').pop() || 'index.html';

document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(link => {
  // auto-highlight based on current filename
  if (link.getAttribute('href') === currentPage) {
    link.classList.add('active');
  }
  // also allow click-based switching
  link.addEventListener('click', function () {
    const isMobile = !!this.closest('.mobile-menu');
    document.querySelectorAll(isMobile ? '.mobile-menu a' : '.nav-links a')
            .forEach(l => l.classList.remove('active'));
    this.classList.add('active');
  });
});

// signal navbar is ready so download logic below can safely query navbar elements
document.dispatchEvent(new CustomEvent('navbarReady'));


/* ══════════════════════════════════════════
   DOWNLOAD PAGE JS
══════════════════════════════════════════ */

const STORAGE_KEY  = 'examcraft_downloads';
const SEED_VERSION = 'v1';

const SEED_DATA = [
  { id: 'f1', name: 'Operating System Tutorial Question File',  type: 'pdf',  size: 2.2, date: '2026-10-24' },
  { id: 'f2', name: 'Data Structures — Mid-Term Exam Set A',    type: 'pdf',  size: 1.8, date: '2026-10-18' },
  { id: 'f3', name: 'Calculus II Final Examination Paper',      type: 'pdf',  size: 3.1, date: '2026-10-12' },
  { id: 'f4', name: 'English Literature Comprehension Test',    type: 'docx', size: 0.9, date: '2026-09-30' },
  { id: 'f5', name: 'Physics Lab Assessment Question Bank',     type: 'xlsx', size: 1.4, date: '2026-09-20' },
  { id: 'f6', name: 'Chemistry Practical Evaluation Sheet',     type: 'docx', size: 0.7, date: '2026-09-15' },
  { id: 'f7', name: 'Computer Networks Semester Exam Paper',    type: 'pdf',  size: 2.9, date: '2026-09-05' },
];

/* ── Persistence ── */
function loadFiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
      localStorage.setItem(STORAGE_KEY + '_version', SEED_VERSION);
      return [...SEED_DATA];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...SEED_DATA];
  } catch {
    return [...SEED_DATA];
  }
}

function saveFiles() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    localStorage.setItem(STORAGE_KEY + '_version', SEED_VERSION);
  } catch {}
}

/* ── State ── */
let files      = loadFiles();
let query      = '';
let activeType = 'all';

/* ── DOM refs ── */
const listEl    = document.getElementById('file-list');
const emptyEl   = document.getElementById('empty-state');
const badgeEl   = document.getElementById('badge-count');
const toastEl   = document.getElementById('toast');
const clearBtn  = document.getElementById('clear-all-btn');
const cardTpl   = document.getElementById('file-card-template');

const statTotal  = document.getElementById('stat-total');
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

    // Group files by date, sorted most recent first
    const groups = filtered.reduce((acc, f) => {
      acc[f.date] = acc[f.date] || [];
      acc[f.date].push(f);
      return acc;
    }, {});

    const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

    let cardIndex = 0;
    sortedDates.forEach(date => {
      // Date header
      const header = document.createElement('div');
      header.className = 'date-group-header';
      header.textContent = formatDate(date);
      listEl.appendChild(header);

      // Files under that date
      groups[date].forEach(f => {
        listEl.appendChild(buildCard(f, cardIndex++));
      });
    });
  }

  updateStats();
  updateBadge();
}
/* ── Card Builder ── */
function buildCard(f, idx) {
  const clone = cardTpl.content.cloneNode(true);
  const card  = clone.querySelector('.file-card');

  card.classList.add(`type-${f.type}`);
  card.style.animationDelay = `${idx * 55}ms`;
  card.dataset.id = f.id;

  const iconPaths = {
    pdf: `<path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/>
          <path d="M12 3v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M7 10h2a1 1 0 010 2H7v-2zM7 12v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
    docx:`<path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/>
          <path d="M12 3v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
    xlsx:`<path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/>
          <path d="M12 3v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M7 10h6M7 13h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
  };

  card.querySelector('.badge-svg').innerHTML     = iconPaths[f.type] || iconPaths.pdf;
  card.querySelector('.badge-label').textContent = f.type.toUpperCase();

  const nameEl = card.querySelector('.file-card__name');
  nameEl.textContent = f.name;
  nameEl.title       = f.name;

  card.querySelector('.meta-type').textContent = f.type.toUpperCase();
  card.querySelector('.meta-size').textContent = `${f.size} MB`;
  card.querySelector('.meta-date').textContent = formatDate(f.date);

  card.querySelector('.btn-download').addEventListener('click', () => reDownload(f.id));
  card.querySelector('.btn-open').addEventListener('click',     () => openFile(f.id));
  card.querySelector('.btn-remove').addEventListener('click',   () => removeFile(f.id));

  return card;
}

/* ── Actions ── */
function reDownload(id) {
  const f = files.find(x => x.id === id);
  if (f) showToast(`⬇ Re-downloading "${shortName(f.name)}"…`);
}

function openFile(id) {
  const f = files.find(x => x.id === id);
  if (!f) return;
  showToast(`📄 Opening "${shortName(f.name)}"…`);
}

function removeFile(id) {
  const card = listEl.querySelector(`.file-card[data-id="${id}"]`);
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

/* ── Search (wired after navbarReady) ── */
document.addEventListener('navbarReady', () => {
  updateBadge();
  const searchEl = document.getElementById('search-input1');
  if (searchEl) {
    searchEl.addEventListener('input', e => {
      query = e.target.value.trim();
      render();
    });
  }
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const searchEl = document.getElementById('search-input1');
    if (searchEl) { searchEl.focus(); searchEl.select(); }
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
  const dates = files.map(f => f.date).sort().reverse();
  if (statTotal)  statTotal.textContent  = total;
  if (statRecent) statRecent.textContent = dates.length ? formatDateShort(dates[0]) : '—';
}

function updateBadge() {
  if (badgeEl) badgeEl.textContent = files.length;
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
  return new Date(iso + 'T00:00:00')
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(iso) {
  return new Date(iso + 'T00:00:00')
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function shortName(name) {
  return name.length > 40 ? name.slice(0, 40) + '…' : name;
}

/* ── Init ── */
render();