/* ═══════════════════════════════════════════════════════════
   settings_modal.js
   Requires: settings_modal.html fragment in the DOM,
             settings_modal.css linked in <head>,
             main_dashboard.js already loaded (for showToast).

   How it connects:
     • Watches for click on the sidebar nav item whose
       data-tooltip="Settings" (already in main_dashboard.html).
     • Opens the .sm-overlay modal.
     • Handles avatar upload, name → initials sync,
       dark-mode toggle, save + cancel + close + backdrop.
═══════════════════════════════════════════════════════════ */

(function initSettingsModal() {
  'use strict';

  /* ── DOM refs ─────────────────────────────────────────── */
  const overlay      = document.getElementById('settingsOverlay');
  const closeBtn     = document.getElementById('settingsClose');
  const cancelBtn    = document.getElementById('settingsCancel');
  const saveBtn      = document.getElementById('smSave');
  const deleteBtn    = document.getElementById('smDeleteAccount');

  const nameInput    = document.getElementById('sm-name');
  const emailInput   = document.getElementById('sm-email');

  const avatarRing   = document.getElementById('smAvatarRing');
  const avatarFile   = document.getElementById('smAvatarFile');
  const avatarImg    = document.getElementById('smAvatarImg');
  const avatarInit   = document.getElementById('smAvatarInitials');

  const darkToggle   = document.getElementById('smDarkMode');
  const notifToggle  = document.getElementById('smNotifs');

  /* ── Sidebar trigger ──────────────────────────────────── */
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.tooltip === 'Settings') {
      item.addEventListener('click', e => {
        e.preventDefault();
        openSettings();
      });
    }
  });

  /* ── Open / Close helpers ─────────────────────────────── */
  function openSettings() {
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
  const greetName = document.querySelector('.highlight');
  if (greetName && nameInput && !nameInput.value) {
    nameInput.value = greetName.textContent.trim();
  }
  updateInitials();
}

window.openSettingsModal = openSettings;   // ← add this line
function closeSettings() {
  overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

  closeBtn?.addEventListener('click', closeSettings);
  cancelBtn?.addEventListener('click', closeSettings);

  // Click outside modal body
  overlay?.addEventListener('click', e => {
    if (e.target === overlay) closeSettings();
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay?.classList.contains('visible')) {
      closeSettings();
    }
  });

  /* ── Avatar upload ────────────────────────────────────── */
  avatarRing?.addEventListener('click', () => avatarFile?.click());

  avatarFile?.addEventListener('change', () => {
    const file = avatarFile.files[0];
    if (!file) return;

    // 2 MB guard
    if (file.size > 2 * 1024 * 1024) {
      showToastSafe('Image too large — max 2 MB.', 'warn');
      return;
    }

    const reader = new FileReader();
    reader.onload = evt => {
      avatarImg.src = evt.target.result;
      avatarImg.classList.add('loaded');
      avatarInit.style.opacity = '0';
      showToastSafe('Photo updated!');
    };
    reader.readAsDataURL(file);
    avatarFile.value = ''; // reset so same file can be re-selected
  });

  /* ── Name → initials sync ─────────────────────────────── */
  nameInput?.addEventListener('input', updateInitials);

  function updateInitials() {
    if (!nameInput || !avatarInit) return;
    // Only update initials if no custom photo is set
    if (avatarImg?.classList.contains('loaded')) return;
    const parts = nameInput.value.trim().split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0]
        ? parts[0].slice(0, 2).toUpperCase()
        : 'AN';
    avatarInit.textContent = initials;

    // Also update the dashboard sidebar avatar live
    const sidebarAvatar = document.querySelector('.avatar');
    if (sidebarAvatar) sidebarAvatar.textContent = initials;
  }

  /* ── Dark-mode toggle (decorative stub) ──────────────── */
  darkToggle?.addEventListener('change', () => {
    const on = darkToggle.checked;
    showToastSafe(on ? 'Dark mode coming soon 🌙' : 'Light mode active ☀️', 'info');
  });

  /* ── Save ─────────────────────────────────────────────── */
  saveBtn?.addEventListener('click', () => {
    if (!validateForm()) return;

    // Update greeting name live
    const greetHighlight = document.querySelector('.highlight');
    if (greetHighlight && nameInput.value.trim()) {
      const firstName = nameInput.value.trim().split(' ')[0];
      greetHighlight.textContent = firstName;
    }

    // Update sidebar user name live
    const sidebarName = document.querySelector('.user-name');
    if (sidebarName && nameInput.value.trim()) {
      sidebarName.textContent = nameInput.value.trim().split(' ')[0];
    }

    // Animate save button
    
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
    saveBtn.classList.add('saved');
    setTimeout(() => {
      saveBtn.classList.remove('saved');
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
    }, 2200);

    showToastSafe('Profile updated successfully!');
    setTimeout(closeSettings, 1400);
  });

  /* ── Basic validation ─────────────────────────────────── */
  function validateForm() {
    if (!nameInput?.value.trim()) {
      shakeField(nameInput);
      showToastSafe('Please enter your name.', 'warn');
      return false;
    }
    if (emailInput?.value && !emailInput.value.includes('@')) {
      shakeField(emailInput);
      showToastSafe('Please enter a valid email.', 'warn');
      return false;
    }
    return true;
  }

  function shakeField(input) {
    if (!input) return;
    input.style.transition = 'transform 0.08s';
    const moves = [6, -6, 5, -5, 3, 0];
    let i = 0;
    const tick = setInterval(() => {
      input.style.transform = `translateX(${moves[i]}px)`;
      if (++i >= moves.length) {
        clearInterval(tick);
        input.style.transform = '';
      }
    }, 55);
    input.focus();
  }

  /* ── Delete account (stub) ────────────────────────────── */
  deleteBtn?.addEventListener('click', () => {
    const confirmed = confirm(
      'Are you sure you want to delete your account?\nThis action cannot be undone.'
    );
    if (confirmed) {
      showToastSafe('Account deletion requested. Contact support.', 'warn');
      closeSettings();
    }
  });

  /* ── Toast helper (uses dashboard's showToast if available) */
  function showToastSafe(msg, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      console.log('[Settings]', msg);
    }
  }

})();