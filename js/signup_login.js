// ===== Tab Switching =====
function switchTab(tab) {
  const signupForm = document.getElementById('form-signup');
  const loginForm  = document.getElementById('form-login');
  const tabSignup  = document.getElementById('tab-signup');
  const tabLogin   = document.getElementById('tab-login');

  if (tab === 'signup') {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
  } else {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
  }
}   

// ===== Register Handler =====
function handleRegister(event) {
  event.preventDefault();

  const form      = document.getElementById('form-signup');
  const inputs    = form.querySelectorAll('input');
  const firstName = inputs[0].value.trim();
  const lastName  = inputs[1].value.trim();
  const email     = inputs[2].value.trim();
  const password  = inputs[3].value;

  // Basic validation
  if (!firstName || !lastName || !email || !password) {
    showToast('Please fill in all fields.', 'error');
    return;
  }

  if (!isValidEmail(email)) {
    showToast('Please enter a valid email address.', 'error');
    return;
  }

  if (password.length < 8) {
    showToast('Password must be at least 8 characters.', 'error');
    return;
  }

  // Simulate success
  showToast(`Welcome, ${firstName}! Account created successfully.`, 'success');
  form.reset();
}

// ===== Login Handler =====
function handleLogin(event) {
  event.preventDefault();

  const form     = document.getElementById('form-login');
  const inputs   = form.querySelectorAll('input');
  const email    = inputs[0].value.trim();
  const password = inputs[1].value;

  if (!email || !password) {
    showToast('Please fill in all fields.', 'error');
    return;
  }

  if (!isValidEmail(email)) {
    showToast('Please enter a valid email address.', 'error');
    return;
  }

  // Simulate login
  showToast('Logged in successfully!', 'success');
  form.reset();
}

// ===== Email Validator =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===== Toast Notification =====
function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Inline styles so no extra CSS dependency
  Object.assign(toast.style, {
    position:      'fixed',
    bottom:        '28px',
    left:          '50%',
    transform:     'translateX(-50%) translateY(20px)',
    background:    type === 'success' ? '#1e5f74' : '#c0392b',
    color:         '#fff',
    padding:       '12px 24px',
    borderRadius:  '10px',
    fontSize:      '0.875rem',
    fontFamily:    "'DM Sans', sans-serif",
    boxShadow:     '0 8px 24px rgba(0,0,0,0.2)',
    opacity:       '0',
    transition:    'opacity 0.3s ease, transform 0.3s ease',
    zIndex:        '9999',
    whiteSpace:    'nowrap',
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Animate out after 3s
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}