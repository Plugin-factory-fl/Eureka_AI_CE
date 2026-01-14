/**
 * Settings Panel Module
 * Handles settings dialog functionality for Eureka AI
 * Frontend-only implementation
 */

/**
 * Registers all event handlers for the Settings panel
 */
function registerSettingsHandlers() {
  const settingsDialog = document.getElementById('settings-dialog');
  const settingsTrigger = document.getElementById('open-settings');
  
  if (!settingsDialog || !settingsTrigger) {
    console.warn('[SettingsPanel] Missing settings dialog or trigger button');
    return;
  }

  // Load and render current settings
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings', 'darkMode', 'highlightToClarifyEnabled', 'stickyButtonEnabled']);
      const settings = result.settings || {
        cacheDuration: 24
      };
      const darkMode = result.darkMode || false;
      const highlightToClarifyEnabled = result.highlightToClarifyEnabled !== undefined ? result.highlightToClarifyEnabled : true; // Default ON
      const stickyButtonEnabled = result.stickyButtonEnabled !== undefined ? result.stickyButtonEnabled : true; // Default ON

      // Update dark mode toggle
      const darkModeToggle = document.getElementById('setting-dark-mode');
      if (darkModeToggle) {
        darkModeToggle.checked = darkMode;
        // Apply dark mode if enabled
        if (darkMode) {
          document.body.setAttribute('data-theme', 'dark');
        } else {
          document.body.removeAttribute('data-theme');
        }
      }

      // Update highlight-to-clarify toggle
      const highlightClarifyToggle = document.getElementById('setting-highlight-clarify');
      if (highlightClarifyToggle) {
        highlightClarifyToggle.checked = highlightToClarifyEnabled;
      }

      // Update sticky button toggle
      const stickyButtonToggle = document.getElementById('setting-sticky-button');
      if (stickyButtonToggle) {
        stickyButtonToggle.checked = stickyButtonEnabled;
      }

      return { ...settings, darkMode, highlightToClarifyEnabled, stickyButtonEnabled };
    } catch (error) {
      console.error('[SettingsPanel] Error loading settings:', error);
      return { darkMode: false, cacheDuration: 24, highlightToClarifyEnabled: true, stickyButtonEnabled: true };
    }
  }

  // Save settings
  async function saveSettings(settings) {
    try {
      await chrome.storage.local.set({ settings });
      console.log('[SettingsPanel] Settings saved:', settings);
    } catch (error) {
      console.error('[SettingsPanel] Error saving settings:', error);
    }
  }

  // Open settings dialog
  settingsTrigger.addEventListener('click', async () => {
    await loadSettings();
    settingsDialog.showModal();
  });

  // Handle dark mode toggle in real-time
  const darkModeToggle = document.getElementById('setting-dark-mode');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('change', async (e) => {
      const isDark = e.target.checked;
      if (isDark) {
        document.body.setAttribute('data-theme', 'dark');
      } else {
        document.body.removeAttribute('data-theme');
      }
      // Save immediately for better UX
      await chrome.storage.local.set({ darkMode: isDark });
    });
  }

  // Handle dialog close
  settingsDialog.addEventListener('close', async () => {
    if (settingsDialog.returnValue !== 'confirm') {
      // User cancelled, reload settings to reset any changes
      await loadSettings();
      return;
    }

    // User confirmed, save settings
    const darkModeToggle = document.getElementById('setting-dark-mode');
    const highlightClarifyToggle = document.getElementById('setting-highlight-clarify');
    const stickyButtonToggle = document.getElementById('setting-sticky-button');

    const darkMode = darkModeToggle ? darkModeToggle.checked : false;
    const highlightToClarifyEnabled = highlightClarifyToggle ? highlightClarifyToggle.checked : true;
    const stickyButtonEnabled = stickyButtonToggle ? stickyButtonToggle.checked : true;
    
    const newSettings = {
      cacheDuration: 24 // Can be made configurable later
    };

    await saveSettings(newSettings);
    await chrome.storage.local.set({ 
      darkMode,
      highlightToClarifyEnabled,
      stickyButtonEnabled
    });

    // Apply dark mode setting
    if (darkMode) {
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.removeAttribute('data-theme');
    }

    // Trigger custom event for other modules to react to settings changes
    window.dispatchEvent(new CustomEvent('settingsUpdated', { 
      detail: { ...newSettings, highlightToClarifyEnabled, stickyButtonEnabled }
    }));
  });

  // Handle cancel button
  const cancelButton = settingsDialog.querySelector('button[value="cancel"]');
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      settingsDialog.close('cancel');
    });
  }

  // Handle save button
  const saveButton = settingsDialog.querySelector('button[value="confirm"]');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      settingsDialog.close('confirm');
    });
  }

  // Handle backdrop clicks
  settingsDialog.addEventListener('click', (event) => {
    if (event.target === settingsDialog) {
      settingsDialog.close('cancel');
    }
  });

  // Handle Escape key
  settingsDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      settingsDialog.close('cancel');
    }
  });
}

/**
 * Initialize settings on page load
 */
async function initializeSettings() {
  try {
    // Load dark mode preference
    const result = await chrome.storage.local.get(['darkMode']);
    const darkMode = result.darkMode || false;
    
    if (darkMode) {
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.removeAttribute('data-theme');
    }
  } catch (error) {
    console.error('[SettingsPanel] Error initializing settings:', error);
  }
}

// Export to window for non-module usage
window.SettingsPanel = {
  registerSettingsHandlers,
  initializeSettings
};
