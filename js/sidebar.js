(function initSidebar() {
  'use strict';

  const sidebar     = document.getElementById('sidebar');
  const toggle      = document.getElementById('sidebarToggle');
  const backdrop    = document.getElementById('sidebarBackdrop');

  const STORAGE_KEY = 'eduvault_sidebar_collapsed';
  const MOBILE_BP   = 768;

  if (!sidebar || !toggle) return;

  /* ═══════════════════════════════════════
     Helpers
  ═══════════════════════════════════════ */
  function isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

  function syncNavOffset() {
    const w = isMobile()
      ? '0px'
      : sidebar.classList.contains('collapsed')
        ? '64px'
        : '230px';

    document.documentElement.style.setProperty('--sidebar-w', w);
  }

  /* ═══════════════════════════════════════
     Restore Desktop Collapse State
  ═══════════════════════════════════════ */
  if (!isMobile() && localStorage.getItem(STORAGE_KEY) === 'true') {
    sidebar.classList.add('collapsed');
  }

  /* ═══════════════════════════════════════
     Desktop Collapse Toggle
  ═══════════════════════════════════════ */
  function desktopToggle() {

    const isCollapsed = sidebar.classList.toggle('collapsed');

    localStorage.setItem(STORAGE_KEY, isCollapsed);

    syncNavOffset();
  }

  /* ═══════════════════════════════════════
     Mobile Open / Close
  ═══════════════════════════════════════ */
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

  /* ═══════════════════════════════════════
     Sidebar Toggle Button
  ═══════════════════════════════════════ */
  toggle.addEventListener('click', () => {

    if (isMobile()) {

      sidebar.classList.contains('mobile-open')
        ? mobileClose()
        : mobileOpen();

    } else {

      desktopToggle();

    }

  });

  /* ═══════════════════════════════════════
     Backdrop Close
  ═══════════════════════════════════════ */
  backdrop?.addEventListener('click', mobileClose);

  /* ═══════════════════════════════════════
     ESC Close
  ═══════════════════════════════════════ */
  document.addEventListener('keydown', e => {

    if (e.key === 'Escape' && isMobile()) {
      mobileClose();
    }

  });

  /* ═══════════════════════════════════════
     Window Resize
  ═══════════════════════════════════════ */
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

  /* ═══════════════════════════════════════
     Active Navigation Highlight
  ═══════════════════════════════════════ */
  (function setActiveNav() {

    const currentPage =
      window.location.pathname.split('/').pop();

    document.querySelectorAll('.nav-item').forEach(item => {

      const href = item.getAttribute('href');

      if (!href) return;

      item.classList.remove('active');

      if (href === currentPage) {
        item.classList.add('active');
      }

    });

  })();

  /* ═══════════════════════════════════════
     Settings Modal Trigger
  ═══════════════════════════════════════ */
  document.querySelectorAll('.nav-item').forEach(item => {

    const navText =
      item.querySelector('.nav-text')?.textContent.trim();

    if (navText === 'Settings') {

      item.addEventListener('click', e => {

        e.preventDefault();

        const overlay =
          document.getElementById('settingsOverlay');

        /* Already loaded */
        if (overlay) {

          overlay.classList.add('visible');

          document.body.style.overflow = 'hidden';

        }

        /* Load dynamically */
        else {

          fetch('settings_modal.html')

            .then(res => res.text())

            .then(html => {

              const container =
                document.getElementById('settings-container');

              if (!container) return;

              container.innerHTML = html;

              /* Load JS */
              const script =
                document.createElement('script');

              script.src = '../js/settings_modal.js';

              document.body.appendChild(script);

              /* Open modal after load */
              setTimeout(() => {

                const ov =
                  document.getElementById('settingsOverlay');

                if (ov) {

                  ov.classList.add('visible');

                  document.body.style.overflow = 'hidden';

                }

              }, 50);

            })

            .catch(err => {
              console.error(
                'Failed to load settings modal:',
                err
              );
            });

        }

      });

    }

  });

})();