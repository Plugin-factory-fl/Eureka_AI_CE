/**
 * Settings Panel Module
 * Handles settings dialog functionality for SumVid Learn
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
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {
        autoCollapse: false,
        cacheDuration: 24
      };

      // Update auto-collapse toggle
      const autoCollapseToggle = document.getElementById('setting-auto-collapse');
      if (autoCollapseToggle) {
        autoCollapseToggle.checked = settings.autoCollapse || false;
      }

      return settings;
    } catch (error) {
      console.error('[SettingsPanel] Error loading settings:', error);
      return { autoCollapse: false, cacheDuration: 24 };
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

  // Handle dialog close
  settingsDialog.addEventListener('close', async () => {
    if (settingsDialog.returnValue !== 'confirm') {
      // User cancelled, reload settings to reset any changes
      await loadSettings();
      return;
    }

    // User confirmed, save settings
    const autoCollapseToggle = document.getElementById('setting-auto-collapse');

    const newSettings = {
      autoCollapse: autoCollapseToggle ? autoCollapseToggle.checked : false,
      cacheDuration: 24 // Can be made configurable later
    };

    await saveSettings(newSettings);

    // Ensure light mode is always active (remove dark mode attribute if present)
    document.body.removeAttribute('data-theme');

    // Trigger custom event for other modules to react to settings changes
    window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: newSettings }));
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
    // Always ensure light mode is active (remove dark mode attribute if present)
    document.body.removeAttribute('data-theme');
  } catch (error) {
    console.error('[SettingsPanel] Error initializing settings:', error);
  }
}

// Export to window for non-module usage
window.SettingsPanel = {
  registerSettingsHandlers,
  initializeSettings
};
