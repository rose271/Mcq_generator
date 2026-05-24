
/* ══ 1. SIDEBAR EXPAND / COLLAPSE ═══════════════════════════ */



/* ══ 2. GREETING ════════════════════════════════════════════ */
(function setGreeting() {
  const el = document.getElementById('timeOfDay');
  if (!el) return;
  const h = new Date().getHours();
  el.textContent = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
})();


/* ══ 3. ANIMATED STAT COUNTERS ══════════════════════════════ */
(function animateCounters() {
  const els = document.querySelectorAll('.stat-value[data-target]');
  els.forEach(el => {
    const target = +el.dataset.target;
    const dur    = 1100;
    const step   = 16;
    const inc    = target / (dur / step);
    let cur      = 0;

    setTimeout(() => {
      const t = setInterval(() => {
        cur += inc;
        if (cur >= target) { cur = target; clearInterval(t); }
        el.textContent = Math.round(cur);
      }, step);
    }, 350);
  });
})();


/* ══ 4. FILES DRAWER ════════════════════════════════════════ */
(function initDrawers() {
  document.querySelectorAll('.show-files-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card   = btn.closest('.course-card');
      const drawer = card.querySelector('.files-drawer');
      const isOpen = drawer.classList.contains('open');

      // Close all open drawers first
      document.querySelectorAll('.files-drawer.open').forEach(d => {
        if (d !== drawer) {
          d.classList.remove('open');
          const otherBtn = d.previousElementSibling;
          otherBtn.classList.remove('open');
          otherBtn.querySelector('.btn-text').textContent = 'Show Files';
        }
      });

      if (isOpen) {
        drawer.classList.remove('open');
        btn.classList.remove('open');
        btn.querySelector('.btn-text').textContent = 'Show Files';
      } else {
        drawer.classList.add('open');
        btn.classList.add('open');
        btn.querySelector('.btn-text').textContent = 'Hide Files';

        // Stagger-animate items
        drawer.querySelectorAll('.file-item').forEach((item, i) => {
          item.style.animationDelay = `${i * 42}ms`;
        });

        // Scroll card into view
        setTimeout(() => {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 60);
      }
    });
  });
})();


/* ══ 5. FILTER TABS ═════════════════════════════════════════ */
(function initFilterTabs() {
  const tabs = document.querySelectorAll('.filter-btn[data-filter]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      // Wire real filter logic here once connected to data
    });
  });
})();


/* ══ 6. CREATE COURSE MODAL ═════════════════════════════════ */
(function initModal() {
  const overlay   = document.getElementById('modalOverlay');
  const openBtn   = document.getElementById('openCreateModal');
  const closeBtn  = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelModal');

  function openModal() {
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  // Click outside modal body
  overlay?.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
})();


/* ══ 7. SEARCH FILTER + ⌘K SHORTCUT ════════════════════════ */
(function initSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('.course-card').forEach(card => {
      const title = card.querySelector('.course-title')?.textContent.toLowerCase() || '';
      const code  = card.querySelector('.course-code')?.textContent.toLowerCase()  || '';
      const match = !q || title.includes(q) || code.includes(q);
      card.style.opacity   = match ? '1' : '0.3';
      card.style.transform = match ? '' : 'scale(0.97)';
      card.style.transition = 'opacity .2s, transform .2s';
    });
  });

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
})();


/* ══ 8. UPLOAD FILE (INLINE) ════════════════════════════════ */
document.querySelectorAll('.add-file-inline').forEach(btn => {
  btn.addEventListener('click', () => {
    const fi = document.createElement('input');
    fi.type     = 'file';
    fi.multiple = true;
    fi.accept   = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';
    fi.style.display = 'none';
    document.body.appendChild(fi);
    fi.click();
    fi.addEventListener('change', () => {
      if (fi.files.length) {
        const names = Array.from(fi.files).map(f => f.name).join(', ');
        showToast(`Uploading: ${names}`);
      }
      fi.remove();
    });
  });
});


/* ══ 9. DELETE FILE (WITH ANIMATION) ═══════════════════════ */
document.querySelectorAll('.fac-btn.danger').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const item = btn.closest('.file-item');
    const name = item.querySelector('.file-name')?.textContent || 'this file';
    if (confirm(`Delete "${name}"?`)) {
      item.style.transition = 'opacity .25s, transform .25s';
      item.style.opacity    = '0';
      item.style.transform  = 'translateX(14px)';
      setTimeout(() => item.remove(), 270);
      showToast('File deleted.');
    }
  });
});


/* ══ 10. DOWNLOAD PLACEHOLDER ═══════════════════════════════ */
document.querySelectorAll('.fac-btn:not(.danger)').forEach(btn => {
  if (btn.querySelector('.fa-download')) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.closest('.file-item')?.querySelector('.file-name')?.textContent || 'file';
      showToast(`Downloading: ${name}`);
    });
  }
});


/* ══ 11. TOAST NOTIFICATION ════════════════════════════════ */
function showToast(msg, type = 'success') {
  document.querySelectorAll('.ev-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'ev-toast';

  const iconMap = { success: '✓', info: 'i', warn: '!' };
  const colorMap = { success: '#c9872b', info: '#2d6a8a', warn: '#b84040' };

  toast.style.cssText = `
    position: fixed;
    bottom: 28px; right: 28px;
    background: #163d35;
    color: #fff;
    padding: 12px 18px;
    border-radius: 12px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 8px 30px rgba(0,0,0,.2);
    z-index: 9999;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity .22s, transform .22s;
    max-width: 320px;
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  const icon = document.createElement('span');
  icon.textContent = iconMap[type] || '✓';
  icon.style.cssText = `
    width: 20px; height: 20px;
    background: ${colorMap[type] || colorMap.success};
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; flex-shrink: 0;
  `;

  const text = document.createElement('span');
  text.textContent = msg;

  toast.append(icon, text);
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 260);
  }, 3000);
}

// Expose globally so other modules can call it if needed
window.showToast = showToast;


/* ══ 12. NAV ACTIVE STATE ══════════════════════════════════ */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
  });
});

//search animation
const input = document.getElementById('searchInput');
const phrases = [
  'Search courses names…',
  'Search files…',
  'Search questions…',
  'Use course code e.g."CSE 101"…',
  'Use "semester 4"…',
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typingTimer;

function type() {
  const current = phrases[phraseIndex];

  if (!isDeleting) {
    input.placeholder = current.slice(0, ++charIndex);
    if (charIndex === current.length) {
      isDeleting = true;
      typingTimer = setTimeout(type, 1800); // pause before deleting
      return;
    }
  } else {
    input.placeholder = current.slice(0, --charIndex);
    if (charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
    }
  }

  typingTimer = setTimeout(type, isDeleting ? 45 : 90);
}

// Only animate when input is empty and not focused
input.addEventListener('focus', () => clearTimeout(typingTimer));
input.addEventListener('blur', () => { if (!input.value) type(); });

type(); // kick off