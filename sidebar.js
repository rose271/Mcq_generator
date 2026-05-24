(function initSidebar() {
  'use strict';

  const sidebar     = document.getElementById('sidebar');
  const toggle      = document.getElementById('sidebarToggle');
  const backdrop    = document.getElementById('sidebarBackdrop');
  const STORAGE_KEY = 'eduvault_sidebar_collapsed';
  const MOBILE_BP   = 768;

  if (!sidebar || !toggle) return;

  /* ── Helpers ── */
  function isMobile() { return window.innerWidth <= MOBILE_BP; }

  function syncNavOffset() {
    const w = isMobile()
      ? '0px'
      : sidebar.classList.contains('collapsed')
        ? '64px'
        : '230px';
    document.documentElement.style.setProperty('--sidebar-w', w);
  }

  /* ── Restore desktop preference ── */
  if (!isMobile() && localStorage.getItem(STORAGE_KEY) === 'true') {
    sidebar.classList.add('collapsed');
  }

  /* ── Desktop collapse ── */
  function desktopToggle() {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem(STORAGE_KEY, isCollapsed);
    syncNavOffset();
  }

  /* ── Mobile open/close ── */
  function mobileOpen() {
    sidebar.classList.add('mobile-open');
    backdrop?.classList.add('visible');
    document.body.style.overflow = 'hidden';
    syncNavOffset();
  }

  function mobileClose() {
    sidebar.classList.remove('mobile-open');
    backdrop?.classList.remove('visible');
    document.body.style.overflow = '';
    syncNavOffset();
  }

  /* ── Toggle button ── */
  toggle.addEventListener('click', () => {
    if (isMobile()) {
      sidebar.classList.contains('mobile-open') ? mobileClose() : mobileOpen();
    } else {
      desktopToggle();
    }
  });

  backdrop?.addEventListener('click', mobileClose);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isMobile()) mobileClose();
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) {
      mobileClose();
      backdrop?.classList.remove('visible');
      if (localStorage.getItem(STORAGE_KEY) === 'true') {
        sidebar.classList.add('collapsed');
      } else {
        sidebar.classList.remove('collapsed');
      }
      syncNavOffset();
    }
  });

  syncNavOffset();

  
  /* ── Settings trigger ── */
document.querySelectorAll('.nav-item').forEach(item => {
  if (item.querySelector('.nav-text')?.textContent.trim() === 'Settings') {
    item.addEventListener('click', e => {
      e.preventDefault();
      const overlay = document.getElementById('settingsOverlay');
      if (overlay) {
        // Already loaded, just open it
        overlay.classList.add('visible');
        document.body.style.overflow = 'hidden';
      } else {
        // Fetch and load it first, then open
        fetch('settings_modal.html')
          .then(res => res.text())
          .then(html => {
            document.getElementById('settings-container').innerHTML = html;

            // Load settings JS
            const script = document.createElement('script');
            script.src = 'settings_modal.js';
            document.body.appendChild(script);

            // Open after a tiny delay for JS to initialize
            setTimeout(() => {
              const ov = document.getElementById('settingsOverlay');
              if (ov) {
                ov.classList.add('visible');
                document.body.style.overflow = 'hidden';
              }
            }, 50);
          });
      }
    });
  }
});

})();