/**
 * File Manager Module
 * Handles file upload, screenshot capture, and read button functionality
 */

(function() {
  'use strict';

  const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';

  class FileManager {
    constructor(options = {}) {
      this.uploadButton = options.uploadButton;
      this.fileInput = options.fileInput;
      this.fileUploadStatus = options.fileUploadStatus;
      this.screenshotButton = options.screenshotButton;
      
      this.init();
    }

    compressImage(imageData, maxWidth = 800, maxHeight = 800, quality = 0.7) {
      return window.ImageUtils?.compressImage(imageData, maxWidth, maxHeight, quality) || Promise.resolve(imageData);
    }

    init() {
      if (this.uploadButton && this.fileInput) {
        this.uploadButton.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (file) {
            this.handleFileUpload(file).finally(() => e.target.value = '');
          }
        });
      }
      
      // Screenshot button
      if (this.screenshotButton) {
        this.screenshotButton.addEventListener('click', () => {
          this.captureScreenshot();
        });
      }
    }

    async processUploadedFile(file) {
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const stored = await chrome.storage.local.get(['sumvid_auth_token']);
        const token = stored.sumvid_auth_token;
        
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`${BACKEND_URL}/api/process-file`, {
          method: 'POST',
          headers: headers,
          body: formData
        });
        
        if (!response.ok) {
          if (response.status === 429) {
            throw new Error('Too many requests. Please wait a moment and try again.');
          }
          throw new Error(`Failed to process file: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result;
      } catch (error) {
        console.error('[Eureka AI] Error processing file:', error);
        throw error;
      }
    }

    async checkUploadLimit() {
      // Check if user is premium
      if (window.premiumManager) {
        const isPremium = await window.premiumManager.checkPremiumStatus();
        if (isPremium) {
          return { allowed: true }; // Premium users have unlimited uploads
        }
      }
      
      // For freemium users: check upload count in last 24 hours (limit: 2)
      const stored = await chrome.storage.local.get(['fileUploadTimestamps']);
      const uploadTimestamps = stored.fileUploadTimestamps || [];
      const now = Date.now();
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
      
      // Filter out timestamps older than 24 hours
      const recentUploads = uploadTimestamps.filter(timestamp => timestamp > twentyFourHoursAgo);
      
      if (recentUploads.length >= 2) {
        // Find the oldest recent upload to calculate time until next allowed upload
        const oldestRecent = Math.min(...recentUploads);
        const hoursUntilNext = Math.ceil((oldestRecent + (24 * 60 * 60 * 1000) - now) / (1000 * 60 * 60));
        return { 
          allowed: false, 
          message: `Free users can upload 2 files or screenshots per 24 hours. Please wait ${hoursUntilNext} hour${hoursUntilNext !== 1 ? 's' : ''} or upgrade to Pro for unlimited uploads.` 
        };
      }
      
      return { allowed: true };
    }

    async showUpgradeDialog(message) {
      // Check if dialog already exists in the document
      let dialog = document.getElementById('upload-limit-dialog');
      
      if (!dialog) {
        // Create new dialog
        dialog = document.createElement('dialog');
        dialog.id = 'upload-limit-dialog';
        dialog.className = 'modal';
        dialog.innerHTML = `
          <form method="dialog" class="modal__content">
            <header class="modal__header">
              <h2>Upload Limit Reached</h2>
              <button class="btn btn--ghost modal__close" type="button" aria-label="Close">×</button>
            </header>
            <div class="modal__body">
              <p id="upload-limit-message">${message}</p>
            </div>
            <footer class="modal__footer">
              <button type="button" class="btn btn--ghost" id="upload-limit-cancel-btn">Cancel</button>
              <button type="button" class="btn btn--primary" id="upload-limit-upgrade-btn">Upgrade to Pro</button>
            </footer>
          </form>
        `;
        
        // Add to body
        document.body.appendChild(dialog);
        
        // Handle cancel button
        const cancelBtn = dialog.querySelector('#upload-limit-cancel-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            dialog.close();
          });
        }
        
        // Handle close button
        const closeBtn = dialog.querySelector('.modal__close');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            dialog.close();
          });
        }
        
        // Handle upgrade button
        const upgradeBtn = dialog.querySelector('#upload-limit-upgrade-btn');
        if (upgradeBtn) {
          upgradeBtn.addEventListener('click', async () => {
            dialog.close();
            // Use existing upgrade flow
            if (window.infoDialogsManager && window.infoDialogsManager.handleUpgrade) {
              await window.infoDialogsManager.handleUpgrade();
            }
          });
        }
        
        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog) {
            dialog.close();
          }
        });
      } else {
        // Update message if dialog exists
        const messageEl = dialog.querySelector('#upload-limit-message');
        if (messageEl) {
          messageEl.textContent = message;
        }
      }
      
      // Ensure dialog is in document before showing
      if (!dialog.isConnected) {
        document.body.appendChild(dialog);
      }
      
      dialog.showModal();
    }

    async handleFileUpload(file) {
      const limitCheck = await this.checkUploadLimit();
      if (!limitCheck.allowed) {
        await this.showUpgradeDialog(limitCheck.message);
        return;
      }
      
      if (window.chatManager?.showFilePreviewLoading) {
        window.chatManager.showFilePreviewLoading(file);
      }

      try {
        const result = await this.processUploadedFile(file);
        let compressedImageData = result.imageData || '';
        if (compressedImageData && file.type?.startsWith('image/')) {
          compressedImageData = await this.compressImage(compressedImageData);
        }
        
        // Update upload timestamps (track last 2 uploads for freemium limit)
        const stored = await chrome.storage.local.get(['fileUploadTimestamps']);
        const uploadTimestamps = stored.fileUploadTimestamps || [];
        uploadTimestamps.push(Date.now());
        // Keep only last 10 timestamps to avoid storage bloat
        const trimmedTimestamps = uploadTimestamps.slice(-10);
        
        await chrome.storage.local.set({
          fileUploadTimestamps: trimmedTimestamps,
          uploadedFileContext: {
            text: result.text || '',
            imageData: compressedImageData,
            filename: file.name,
            fileType: file.type,
            timestamp: Date.now()
          }
        });

        if (this.fileUploadStatus) {
          this.fileUploadStatus.textContent = `File loaded: ${file.name}`;
          this.fileUploadStatus.classList.add('loaded');
        }

        if (window.chatManager?.showFilePreview) {
          window.chatManager.showFilePreview({
            text: result.text || '',
            imageData: compressedImageData,
            filename: file.name,
            fileType: file.type,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('[Eureka AI] Error uploading file:', error);
        if (window.chatManager?.hideFilePreview) {
          window.chatManager.hideFilePreview();
        }
        
        // Show user-friendly error message
        let errorMessage = 'Failed to upload file. ';
        if (error.message.includes('429') || error.message.includes('Too many requests')) {
          errorMessage += 'Too many requests. Please wait a moment and try again.';
        } else {
          errorMessage += error.message || 'Please try again.';
        }
        alert(errorMessage);
        if (this.fileUploadStatus) {
          this.fileUploadStatus.style.display = 'none';
          this.fileUploadStatus.textContent = '';
          this.fileUploadStatus.classList.remove('loaded');
        }
      }
    }

    captureScreenshot() {
      // Send message to content script to start screenshot mode
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'start-screenshot' });
        }
      });
    }

    async readWebpage() {
      try {
        // Send message to content script to extract full webpage content
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'extract-full-content' });
          }
        });
        
        // Add a message to chat indicating the page is being read
        if (window.chatManager) {
          window.chatManager.addMessage('Reading entire webpage for context...', true);
        }
      } catch (error) {
        console.error('[Eureka AI] Error reading webpage:', error);
      }
    }

    async getCombinedContext() {
      try {
        // Get current content info
        const [contentInfo, fileContext, fullPageContext] = await Promise.all([
          chrome.storage.local.get(['currentContentInfo', 'currentVideoInfo']),
          chrome.storage.local.get(['uploadedFileContext']),
          chrome.storage.local.get(['fullPageContext'])
        ]);
        
        const currentContent = contentInfo.currentContentInfo || contentInfo.currentVideoInfo;
        const uploadedFile = fileContext.uploadedFileContext;
        const fullPage = fullPageContext.fullPageContext;
        
        let contextParts = [];
        
        // Add current content (transcript, text, etc.)
        if (currentContent) {
          if (currentContent.transcript) {
            // Truncate transcript to avoid token limits
            const truncated = currentContent.transcript.substring(0, 8000);
            contextParts.push(`Video/Content Transcript: ${truncated}`);
          } else if (currentContent.text) {
            const truncated = currentContent.text.substring(0, 8000);
            contextParts.push(`Webpage/PDF Content: ${truncated}`);
          }
        }
        
        // Add uploaded file context
        if (uploadedFile) {
          if (uploadedFile.text) {
            // For PDFs and documents, include the extracted text
            const truncated = uploadedFile.text.substring(0, 8000);
            const fileTypeLabel = uploadedFile.fileType === 'application/pdf' ? 'PDF' : 
                                 uploadedFile.fileType?.includes('document') ? 'Document' : 'File';
            contextParts.push(`Uploaded ${fileTypeLabel} (${uploadedFile.filename}): ${truncated}`);
            if (uploadedFile.text.length > 8000) {
              contextParts[contextParts.length - 1] += `\n[Note: File content truncated. Original was ${Math.ceil(uploadedFile.text.length / 1000)}k characters.]`;
            }
          } else if (uploadedFile.imageData) {
            contextParts.push(`Uploaded Image: ${uploadedFile.filename} (image data available)`);
          } else if (uploadedFile.filename) {
            // File uploaded but no text/image data yet
            contextParts.push(`Uploaded File: ${uploadedFile.filename} (processing...)`);
          }
        }
        
        // Add full page context from Read button
        if (fullPage) {
          const fullPageText = typeof fullPage === 'string' ? fullPage : (fullPage.text || '');
          if (fullPageText) {
            const truncated = fullPageText.substring(0, 8000);
            contextParts.push(`Full Webpage Content: ${truncated}`);
          }
        }
        
        return contextParts.join('\n\n');
      } catch (error) {
        console.error('[Eureka AI] Error getting combined context:', error);
        return '';
      }
    }
  }

  // Export to global scope
  window.FileManager = FileManager;
})();
