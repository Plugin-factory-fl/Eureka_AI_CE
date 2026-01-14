/**
 * Settings Panel Module
 * Handles settings dialog functionality for Eureka AI
 */

let settingsInitialized = false;

function registerSettingsHandlers() {
  if (settingsInitialized) return;
  settingsInitialized = true;

  let settingsDialog = document.getElementById('settings-dialog');
  const settingsTrigger = document.getElementById('open-settings');
  
  if (!settingsDialog || !settingsTrigger) return;
  
  // Move dialog to body immediately to escape all containers
  if (settingsDialog.parentElement !== document.body) {
    document.body.appendChild(settingsDialog);
  }

  function loadSettings() {
    chrome.storage.local.get(['darkMode', 'highlightToClarifyEnabled', 'stickyButtonEnabled'], (result) => {
      const darkMode = result.darkMode || false;
      const highlightToClarifyEnabled = result.highlightToClarifyEnabled !== undefined ? result.highlightToClarifyEnabled : true;
      const stickyButtonEnabled = result.stickyButtonEnabled !== undefined ? result.stickyButtonEnabled : true;

      const darkModeToggle = document.getElementById('setting-dark-mode');
      const highlightClarifyToggle = document.getElementById('setting-highlight-clarify');
      const stickyButtonToggle = document.getElementById('setting-sticky-button');

      if (darkModeToggle) darkModeToggle.checked = darkMode;
      if (highlightClarifyToggle) highlightClarifyToggle.checked = highlightToClarifyEnabled;
      if (stickyButtonToggle) stickyButtonToggle.checked = stickyButtonEnabled;
    });
  }

  // Open dialog
  settingsTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (settingsDialog.open) {
      settingsDialog.close();
      return;
    }

    // Ensure dialog is at body level to escape all stacking contexts
    if (settingsDialog.parentElement !== document.body) {
      document.body.appendChild(settingsDialog);
    }

    loadSettings();
    
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      settingsDialog.showModal();
    }, 0);
  });

  // Dark mode toggle
  const darkModeToggle = document.getElementById('setting-dark-mode');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('change', (e) => {
      const isDark = e.target.checked;
      if (isDark) {
        document.body.setAttribute('data-theme', 'dark');
      } else {
        document.body.removeAttribute('data-theme');
      }
      chrome.storage.local.set({ darkMode: isDark });
    });
  }

  // Save on close
  settingsDialog.addEventListener('close', () => {
    if (settingsDialog.returnValue === 'confirm') {
      const darkModeToggle = document.getElementById('setting-dark-mode');
      const highlightClarifyToggle = document.getElementById('setting-highlight-clarify');
      const stickyButtonToggle = document.getElementById('setting-sticky-button');

      const darkMode = darkModeToggle ? darkModeToggle.checked : false;
      const highlightToClarifyEnabled = highlightClarifyToggle ? highlightClarifyToggle.checked : true;
      const stickyButtonEnabled = stickyButtonToggle ? stickyButtonToggle.checked : true;

      chrome.storage.local.set({
        darkMode,
        highlightToClarifyEnabled,
        stickyButtonEnabled
      }, () => {
        if (darkMode) {
          document.body.setAttribute('data-theme', 'dark');
        } else {
          document.body.removeAttribute('data-theme');
        }
        window.dispatchEvent(new CustomEvent('settingsUpdated', {
          detail: { darkMode, highlightToClarifyEnabled, stickyButtonEnabled }
        }));
      });
    } else {
      loadSettings();
    }
  });

  // Buttons
  const cancelButton = settingsDialog.querySelector('button[value="cancel"]');
  const saveButton = settingsDialog.querySelector('button[value="confirm"]');
  const closeButton = settingsDialog.querySelector('.modal__close');

  if (cancelButton) {
    cancelButton.addEventListener('click', () => settingsDialog.close('cancel'));
  }
  if (saveButton) {
    saveButton.addEventListener('click', () => settingsDialog.close('confirm'));
  }
  if (closeButton) {
    closeButton.addEventListener('click', () => settingsDialog.close('cancel'));
  }

  // Backdrop
  settingsDialog.addEventListener('click', (e) => {
    if (e.target === settingsDialog) {
      settingsDialog.close('cancel');
    }
  });

  const dialogContent = settingsDialog.querySelector('.modal__content');
  if (dialogContent) {
    dialogContent.addEventListener('click', (e) => e.stopPropagation());
  }
}

function initializeSettings() {
  chrome.storage.local.get(['darkMode'], (result) => {
    const darkMode = result.darkMode || false;
    if (darkMode) {
      document.body.setAttribute('data-theme', 'dark');
    }
  });
}

window.SettingsPanel = {
  registerSettingsHandlers,
  initializeSettings
};