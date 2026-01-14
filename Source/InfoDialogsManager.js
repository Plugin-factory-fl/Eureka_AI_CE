/**
 * Info Dialogs Manager Module
 * Handles info dialogs and auto-login functionality
 */

(function() {
  'use strict';

  const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';

  class InfoDialogsManager {
    constructor() {
      this.autoLoginInterval = null;
      this.autoLoginTimeout = null;
      this.init();
    }

    init() {
      this.setupInfoButtons();
      this.setupMainInfoDialog();
      this.startAutoLoginDialog();
    }

    setupInfoButtons() {
      const sectionInfoButtons = {
        'summary-info-button': 'summary-info-dialog',
        'flashcard-info-button': 'flashcard-info-dialog',
        'quiz-info-button': 'quiz-info-dialog',
        'notes-info-button': 'notes-info-dialog'
      };

      Object.entries(sectionInfoButtons).forEach(([buttonId, dialogId]) => {
        const button = document.getElementById(buttonId);
        const dialog = document.getElementById(dialogId);
        const upgradeButton = document.getElementById(buttonId.replace('-button', '-upgrade'));

        if (button && dialog) {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dialog.showModal();
          });
        }

        if (upgradeButton) {
          upgradeButton.addEventListener('click', async () => {
            dialog.close();
            await this.handleUpgrade();
          });
        }

        // Close button handlers
        const closeButtons = dialog?.querySelectorAll('.modal__close, button[value="cancel"]');
        if (closeButtons) {
          closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
              dialog.close();
            });
          });
        }

        if (dialog) {
          dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
              dialog.close();
            }
          });

          dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              dialog.close();
            }
          });
        }
      });
    }

    setupMainInfoDialog() {
      const infoButton = document.getElementById('eureka-info-btn');
      const infoDialog = document.getElementById('eureka-info-dialog');
      const infoDialogGetProBtn = document.getElementById('info-dialog-get-pro-btn');
      
      if (infoButton && infoDialog) {
        infoButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          infoDialog.showModal();
        });
      }

      if (infoDialog) {
        const closeButtons = infoDialog.querySelectorAll('.modal__close, button[value="cancel"]');
        closeButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            infoDialog.close();
          });
        });

        infoDialog.addEventListener('click', (e) => {
          if (e.target === infoDialog) {
            infoDialog.close();
          }
        });

        infoDialog.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            infoDialog.close();
          }
        });
      }

      if (infoDialogGetProBtn) {
        infoDialogGetProBtn.addEventListener('click', async () => {
          await this.handleUpgrade();
          infoDialog.close();
        });
      }
    }

    async handleUpgrade() {
      const stored = await chrome.storage.local.get(['sumvid_auth_token']);
      const token = stored.sumvid_auth_token;
      
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
        
        if (!response.ok) {
          throw new Error('Failed to create checkout session');
        }
        
        const data = await response.json();
        if (data.url) {
          window.open(data.url, '_blank');
        } else {
          alert('Upgrade feature coming soon!');
        }
      } catch (error) {
        console.error('[Eureka AI] Upgrade error:', error);
        alert(`Failed to initiate upgrade: ${error.message || 'Unknown error'}`);
      }
    }

    async checkAndShowLoginDialog() {
      const accountDialog = document.getElementById('account-dialog');
      const createAccountDialog = document.getElementById('create-account-dialog');
      if (!accountDialog) return;
      
      if (createAccountDialog && createAccountDialog.open) {
        return;
      }
      
      const stored = await chrome.storage.local.get(['sumvid_auth_token']);
      const isLoggedIn = !!stored.sumvid_auth_token;
      
      if (!isLoggedIn && !accountDialog.open) {
        accountDialog.showModal();
      } else if (isLoggedIn) {
        if (this.autoLoginInterval) {
          clearInterval(this.autoLoginInterval);
          this.autoLoginInterval = null;
        }
        if (this.autoLoginTimeout) {
          clearTimeout(this.autoLoginTimeout);
          this.autoLoginTimeout = null;
        }
      }
    }
    
    startAutoLoginDialog() {
      this.checkAndShowLoginDialog();
      
      this.autoLoginInterval = setInterval(() => {
        this.checkAndShowLoginDialog();
      }, 10000);
      
      const accountDialog = document.getElementById('account-dialog');
      if (accountDialog) {
        accountDialog.addEventListener('close', () => {
          chrome.storage.local.get(['sumvid_auth_token'], (result) => {
            if (!result.sumvid_auth_token) {
              if (this.autoLoginTimeout) {
                clearTimeout(this.autoLoginTimeout);
              }
              this.autoLoginTimeout = setTimeout(() => {
                this.checkAndShowLoginDialog();
              }, 10000);
            }
          });
        });
      }
      
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.sumvid_auth_token) {
          if (changes.sumvid_auth_token.newValue) {
            if (this.autoLoginInterval) {
              clearInterval(this.autoLoginInterval);
              this.autoLoginInterval = null;
            }
            if (this.autoLoginTimeout) {
              clearTimeout(this.autoLoginTimeout);
              this.autoLoginTimeout = null;
            }
          }
        }
      });
    }
  }

  // Export to global scope
  window.InfoDialogsManager = InfoDialogsManager;
})();
