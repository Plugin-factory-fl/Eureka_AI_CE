/**
 * Login Menu Module
 * Handles all functionality related to the account login dialog with backend integration
 */

const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com'; // Update with your backend URL

/**
 * Stores authentication token in Chrome storage and sends to background script
 */
async function storeAuthToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ sumvid_auth_token: token }, () => {
      // Also send to background script
      chrome.runtime.sendMessage({ type: 'AUTH_TOKEN', token }, () => {
        resolve();
      });
    });
  });
}

/**
 * Gets authentication token from Chrome storage
 */
async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sumvid_auth_token'], (items) => {
      resolve(items?.sumvid_auth_token || null);
    });
  });
}

/**
 * Clears authentication token
 */
async function clearAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['sumvid_auth_token'], () => {
      // Also notify background script
      chrome.runtime.sendMessage({ type: 'AUTH_TOKEN', action: 'clear' }, () => {
        resolve();
      });
    });
  });
}

/**
 * Registers a new user account
 */
async function registerUser(name, email, password) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name || null,
        email: email,
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || 'Registration failed');
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Logs in an existing user
 */
async function loginUser(email, password) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Requests password reset token for an email
 */
async function requestPasswordReset(email) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to request password reset');
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Resets password using email and token
 */
async function resetPassword(email, token, newPassword) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, token, newPassword }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset password');
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Changes password (requires authentication)
 */
async function changePassword(currentPassword, newPassword) {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${BACKEND_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to change password');
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches user profile from backend
 */
async function getUserProfile() {
  try {
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token is invalid, clear it
        await clearAuthToken();
      }
      return null;
    }

    const data = await response.json();
    return data.user || data;
  } catch (error) {
    console.error('[LoginMenu] Error fetching user profile:', error);
    return null;
  }
}

/**
 * Fetches user usage stats from backend
 */
async function getUserUsage() {
  try {
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await clearAuthToken();
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[LoginMenu] Error fetching user usage:', error);
    return null;
  }
}

/**
 * Updates the logged-in view with user information
 */
async function updateLoggedInView() {
  const loggedInView = document.getElementById('account-logged-in-view');
  const loginView = document.getElementById('account-form');

  if (!loggedInView || !loginView) return;

  const userProfile = await getUserProfile();
  
  if (userProfile) {
    loggedInView.hidden = false;
    loggedInView.style.display = 'block';
    loginView.hidden = true;
    loginView.style.display = 'none';
    
    const userNameEl = document.getElementById('account-user-name');
    const planNameEl = document.getElementById('account-plan-name');
    const displayName = (userProfile.name && userProfile.name.trim()) 
      ? userProfile.name 
      : (userProfile.email || 'User');
    if (userNameEl) {
      userNameEl.textContent = displayName;
    }
    
    const subscriptionStatus = userProfile.subscription_status || 'freemium';
    if (planNameEl) {
      planNameEl.textContent = subscriptionStatus === 'premium' ? 'PRO' : 'Freemium';
    }

    // Show/hide crown icon
    const crownIcon = document.getElementById('account-crown-icon');
    if (crownIcon) {
      crownIcon.style.display = subscriptionStatus === 'premium' ? 'block' : 'none';
    }
  } else {
    loggedInView.hidden = true;
    loggedInView.style.display = 'none';
    loginView.hidden = false;
    loginView.style.display = 'block';
  }
}

/**
 * Updates status card with user info
 */
async function updateStatusCard() {
  const userProfile = await getUserProfile();
  const userStatusEl = document.getElementById('user-status');
  const userPlanEl = document.getElementById('user-plan');
  const crownIcon = document.getElementById('account-crown-icon');

  if (userProfile) {
    const displayName = (userProfile.name && userProfile.name.trim()) 
      ? userProfile.name 
      : (userProfile.email || 'User');
    if (userStatusEl) {
      userStatusEl.textContent = displayName;
    }
    const subscriptionStatus = userProfile.subscription_status || 'freemium';
    if (userPlanEl) {
      userPlanEl.textContent = subscriptionStatus === 'premium' ? 'PRO' : 'Freemium';
    }
    if (crownIcon) {
      crownIcon.style.display = subscriptionStatus === 'premium' ? 'block' : 'none';
    }
  } else {
    if (userStatusEl) {
      userStatusEl.textContent = 'Not Logged In';
    }
    if (userPlanEl) {
      userPlanEl.textContent = 'Freemium';
    }
    if (crownIcon) {
      crownIcon.style.display = 'none';
    }
  }
}

/**
 * Registers event handlers for the account login dialog
 */
function registerAccountHandlers() {
  const accountDialog = document.getElementById('account-dialog');
  const accountTrigger = document.getElementById('open-account');
  const accountForm = document.getElementById('account-form');
  const createAccountLink = document.getElementById('open-create-account');
  const createAccountDialog = document.getElementById('create-account-dialog');
  const createAccountForm = document.getElementById('create-account-form');
  const forgotPasswordButton = document.getElementById('forgot-password');
  const forgotPasswordEmailDialog = document.getElementById('forgot-password-email-dialog');
  const forgotPasswordEmailForm = document.getElementById('forgot-password-email-form');
  const resetPasswordDialog = document.getElementById('forgot-password-reset-dialog');
  const resetPasswordForm = document.getElementById('forgot-password-reset-form');

  if (!accountDialog || !accountTrigger || !accountForm) {
    console.warn('[LoginMenu] Missing required elements');
    return;
  }

  const loggedInView = document.getElementById('account-logged-in-view');
  const loginView = document.getElementById('account-form');
  const switchAccountButton = document.getElementById('switch-account');
  const upgradeButton = document.getElementById('upgrade-button');

  // Open account dialog
  accountTrigger.addEventListener('click', async () => {
    await updateLoggedInView();
    accountDialog.showModal();
  });

  // Handle switch account button
  if (switchAccountButton) {
    switchAccountButton.addEventListener('click', async () => {
      await clearAuthToken();
      await updateLoggedInView();
      await updateStatusCard();
      // Update usage cards if window.UsageTracker exists
      if (window.updateStatusCards) {
        await window.updateStatusCards();
      }
    });
  }

  // Handle upgrade button
  if (upgradeButton) {
    upgradeButton.addEventListener('click', async () => {
      const token = await getAuthToken();
      if (!token) {
        alert('Please log in to upgrade to Pro');
        return;
      }

      try {
        const response = await fetch(`${BACKEND_URL}/api/checkout/create-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
        });

        const data = await response.json();
        if (data.url) {
          window.open(data.url, '_blank');
        } else {
          alert('Upgrade feature coming soon!');
        }
      } catch (error) {
        console.error('Upgrade error:', error);
        alert('Failed to initiate upgrade. Please try again later.');
      }
    });
  }

  // Handle login form submission
  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(accountForm);
    const email = formData.get('email');
    const password = formData.get('password');

    const errorEl = document.getElementById('login-error-message');
    const submitButton = accountForm.querySelector('.account__submit');

    if (!email || !password) {
      if (errorEl) {
        errorEl.textContent = 'Please enter both email and password';
        errorEl.hidden = false;
      }
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Logging in...';
    }

    try {
      const result = await loginUser(email, password);
      await storeAuthToken(result.token);
      
      if (errorEl) {
        errorEl.hidden = true;
      }

      accountDialog.close();
      await updateLoggedInView();
      await updateStatusCard();
      // Update usage cards
      if (window.updateStatusCards) {
        await window.updateStatusCards();
      }
    } catch (error) {
      console.error('Login error:', error);
      if (errorEl) {
        errorEl.textContent = error.message || 'Login failed. Please check your credentials.';
        errorEl.hidden = false;
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Log In';
      }
    }
  });

  // Handle create account link
  if (createAccountLink && createAccountDialog) {
    createAccountLink.addEventListener('click', (e) => {
      e.preventDefault();
      accountDialog.close();
      createAccountDialog.showModal();
    });
  }

  // Handle create account form
  if (createAccountForm && createAccountDialog) {
    createAccountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(createAccountForm);
      const name = formData.get('name');
      const email = formData.get('email');
      const password = formData.get('password');
      const confirmPassword = formData.get('confirmPassword');

      const errorEl = document.getElementById('create-account-error-message');
      const submitButton = createAccountForm.querySelector('.create-account__submit');

      if (!email || !password) {
        if (errorEl) {
          errorEl.textContent = 'Please enter both email and password';
          errorEl.hidden = false;
        }
        return;
      }

      if (password !== confirmPassword) {
        if (errorEl) {
          errorEl.textContent = 'Passwords do not match';
          errorEl.hidden = false;
        }
        return;
      }

      if (password.length < 8) {
        if (errorEl) {
          errorEl.textContent = 'Password must be at least 8 characters long';
          errorEl.hidden = false;
        }
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Creating account...';
      }

      try {
        const result = await registerUser(name, email, password);
        await storeAuthToken(result.token);
        
        if (errorEl) {
          errorEl.hidden = true;
        }

        createAccountDialog.close();
        accountDialog.close();
        await updateLoggedInView();
        await updateStatusCard();
        // Update usage cards
        if (window.updateStatusCards) {
          await window.updateStatusCards();
        }
      } catch (error) {
        console.error('Registration error:', error);
        if (errorEl) {
          errorEl.textContent = error.message || 'Registration failed. Please try again.';
          errorEl.hidden = false;
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Create Account';
        }
      }
    });
  }

  // Handle forgot password
  if (forgotPasswordButton && forgotPasswordEmailDialog) {
    forgotPasswordButton.addEventListener('click', (e) => {
      e.preventDefault();
      accountDialog.close();
      forgotPasswordEmailDialog.showModal();
    });
  }

  // Handle password reset email form
  if (forgotPasswordEmailForm && forgotPasswordEmailDialog) {
    forgotPasswordEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(forgotPasswordEmailForm);
      const email = formData.get('email');
      const errorEl = document.getElementById('forgot-password-error-message');
      const submitButton = forgotPasswordEmailForm.querySelector('.forgot-password-email__submit');

      if (!email) {
        if (errorEl) {
          errorEl.textContent = 'Please enter your email address';
          errorEl.hidden = false;
        }
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
      }

      try {
        const result = await requestPasswordReset(email);
        // Show reset password dialog with token
        if (result.token && resetPasswordDialog && resetPasswordForm) {
          // Store email and token for reset form
          resetPasswordForm.dataset.email = email;
          resetPasswordForm.dataset.token = result.token;
          forgotPasswordEmailDialog.close();
          resetPasswordDialog.showModal();
        } else {
          alert('Password reset email sent! Please check your email for instructions.');
          forgotPasswordEmailDialog.close();
        }
      } catch (error) {
        console.error('Password reset error:', error);
        if (errorEl) {
          errorEl.textContent = error.message || 'Failed to send password reset. Please try again.';
          errorEl.hidden = false;
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Send Reset Link';
        }
      }
    });
  }

  // Handle reset password form
  if (resetPasswordForm && resetPasswordDialog) {
    resetPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(resetPasswordForm);
      const newPassword = formData.get('newPassword');
      const confirmPassword = formData.get('confirmPassword');
      const email = resetPasswordForm.dataset.email;
      const token = resetPasswordForm.dataset.token;
      const errorEl = document.getElementById('forgot-password-reset-error-message');
      const submitButton = resetPasswordForm.querySelector('.forgot-password-reset__submit');

      if (!newPassword || !confirmPassword) {
        if (errorEl) {
          errorEl.textContent = 'Please enter both password fields';
          errorEl.hidden = false;
        }
        return;
      }

      if (newPassword !== confirmPassword) {
        if (errorEl) {
          errorEl.textContent = 'Passwords do not match';
          errorEl.hidden = false;
        }
        return;
      }

      if (newPassword.length < 8) {
        if (errorEl) {
          errorEl.textContent = 'Password must be at least 8 characters long';
          errorEl.hidden = false;
        }
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Resetting...';
      }

      try {
        await resetPassword(email, token, newPassword);
        alert('Password reset successful! You can now log in with your new password.');
        resetPasswordDialog.close();
        accountDialog.showModal();
      } catch (error) {
        console.error('Reset password error:', error);
        if (errorEl) {
          errorEl.textContent = error.message || 'Failed to reset password. Please try again.';
          errorEl.hidden = false;
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Reset Password';
        }
      }
    });
  }

  // Note: Change password dialog not yet implemented in HTML - can be added later

  // Password toggle handlers (delegated to handle dynamic content)
  document.addEventListener('click', (e) => {
    if (e.target.matches('.account__password-toggle')) {
      e.preventDefault();
      const targetId = e.target.getAttribute('data-target');
      const passwordInput = document.getElementById(targetId);
      if (passwordInput) {
        if (passwordInput.type === 'password') {
          passwordInput.type = 'text';
          e.target.textContent = 'Hide';
        } else {
          passwordInput.type = 'password';
          e.target.textContent = 'Show';
        }
      }
    }
  });

  // Close button handlers
  const closeButtons = accountDialog.querySelectorAll('.modal__close, .account__cancel');
  closeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      accountDialog.close();
    });
  });

  if (createAccountDialog) {
    const createCloseButtons = createAccountDialog.querySelectorAll('.modal__close, .create-account__cancel');
    createCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        createAccountDialog.close();
      });
    });
  }

  if (forgotPasswordEmailDialog) {
    const forgotCloseButtons = forgotPasswordEmailDialog.querySelectorAll('.modal__close, .forgot-password-email__cancel');
    forgotCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        forgotPasswordEmailDialog.close();
      });
    });
  }

  if (resetPasswordDialog) {
    const resetCloseButtons = resetPasswordDialog.querySelectorAll('.modal__close, .forgot-password-reset__cancel');
    resetCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        resetPasswordDialog.close();
      });
    });
  }

  // Initialize status card on load
  updateStatusCard();
}

/**
 * Initialize login menu on page load
 */
async function initializeLoginMenu() {
  await updateLoggedInView();
  await updateStatusCard();
}

// Export to window for non-module usage
window.LoginMenu = {
  registerAccountHandlers,
  initializeLoginMenu,
  updateStatusCard,
  getUserProfile,
  getUserUsage
};
