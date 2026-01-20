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

    /**
     * Compress image to reduce file size before sending to backend
     * @param {string} imageData - Base64 data URL
     * @param {number} maxWidth - Maximum width in pixels (default: 1024)
     * @param {number} maxHeight - Maximum height in pixels (default: 1024)
     * @param {number} quality - JPEG quality 0-1 (default: 0.8)
     * @returns {Promise<string>} Compressed base64 data URL
     */
    async compressImage(imageData, maxWidth = 800, maxHeight = 800, quality = 0.7) {
      return new Promise((resolve, reject) => {
        if (!imageData || typeof imageData !== 'string') {
          resolve(imageData);
          return;
        }

        const img = new Image();
        img.onload = () => {
          try {
            // Calculate new dimensions maintaining aspect ratio
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }

            // Create canvas and draw resized image
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to base64 with compression
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
          } catch (error) {
            console.error('[Eureka AI] Error compressing image:', error);
            // Return original if compression fails
            resolve(imageData);
          }
        };

        img.onerror = () => {
          console.error('[Eureka AI] Error loading image for compression');
          // Return original if loading fails
          resolve(imageData);
        };

        img.src = imageData;
      });
    }

    init() {
      console.log('[Eureka AI] FileManager init - uploadButton:', !!this.uploadButton, 'fileInput:', !!this.fileInput);
      
      // File upload button
      if (this.uploadButton && this.fileInput) {
        this.uploadButton.addEventListener('click', () => {
          console.log('[Eureka AI] Upload button clicked');
          this.fileInput.click();
        });
        
        this.fileInput.addEventListener('change', (e) => {
          console.log('[Eureka AI] File input changed, files:', e.target.files?.length || 0);
          const file = e.target.files?.[0];
          if (file) {
            console.log('[Eureka AI] File selected:', file.name, file.type, file.size, 'bytes');
            this.handleFileUpload(file).then(() => {
              // Reset file input so change event fires again if same file is selected
              e.target.value = '';
            }).catch((error) => {
              console.error('[Eureka AI] Error in handleFileUpload:', error);
              e.target.value = '';
            });
          } else {
            console.log('[Eureka AI] No file selected');
          }
        });
      } else {
        console.error('[Eureka AI] FileManager: Missing required elements - uploadButton:', !!this.uploadButton, 'fileInput:', !!this.fileInput);
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
      
      // Check last upload timestamp for freemium users
      const stored = await chrome.storage.local.get(['lastFileUploadTimestamp']);
      const lastUpload = stored.lastFileUploadTimestamp;
      
      if (lastUpload) {
        const hoursSinceLastUpload = (Date.now() - lastUpload) / (1000 * 60 * 60);
        if (hoursSinceLastUpload < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSinceLastUpload);
          return { 
            allowed: false, 
            message: `Free users can upload 1 file or screenshot per 24 hours. Please wait ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''} or upgrade to Pro for unlimited uploads.` 
          };
        }
      }
      
      return { allowed: true };
    }

    async showUpgradeDialog(message) {
      // Create or show upgrade dialog
      const dialog = document.createElement('dialog');
      dialog.id = 'upload-limit-dialog';
      dialog.className = 'modal';
      dialog.innerHTML = `
        <form method="dialog" class="modal__content">
          <header class="modal__header">
            <h2>Upload Limit Reached</h2>
            <button class="btn btn--ghost modal__close" type="button" aria-label="Close">×</button>
          </header>
          <div class="modal__body">
            <p>${message}</p>
          </div>
          <footer class="modal__footer">
            <button type="button" class="btn btn--ghost" onclick="this.closest('dialog').close()">Cancel</button>
            <button type="button" class="btn btn--primary" id="upload-limit-upgrade-btn">Upgrade to Pro</button>
          </footer>
        </form>
      `;
      
      // Add to body if not already there
      if (!document.getElementById('upload-limit-dialog')) {
        document.body.appendChild(dialog);
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
      
      dialog.showModal();
    }

    async handleFileUpload(file) {
      console.log('[Eureka AI] handleFileUpload called for file:', file.name);
      
      // Check upload limit for free users first
      const limitCheck = await this.checkUploadLimit();
      if (!limitCheck.allowed) {
        console.log('[Eureka AI] Upload limit reached');
        await this.showUpgradeDialog(limitCheck.message);
        return;
      }
      
      // Show preview immediately with loading state
      const filePreview = document.getElementById('file-preview');
      if (filePreview && window.chatManager && window.chatManager.showFilePreviewLoading) {
        // Show preview immediately with loading state
        window.chatManager.showFilePreviewLoading(file);
      } else if (filePreview && window.chatManager && window.chatManager.showFilePreview) {
        // Fallback: show preview without loading state if method doesn't exist
        const fileIcon = file.type === 'application/pdf' ? '📄' : 
                        file.type?.startsWith('image/') ? '🖼️' : 
                        file.type?.includes('document') ? '📝' : '📎';
        window.chatManager.showFilePreview({
          filename: file.name,
          fileType: file.type,
          imageData: null,
          text: null,
          loading: true
        });
      }
      
      console.log('[Eureka AI] Upload limit check passed, proceeding with upload');

      try {
        console.log('[Eureka AI] Processing uploaded file...');
        const result = await this.processUploadedFile(file);
        console.log('[Eureka AI] File processed, result:', {
          hasText: !!result.text,
          hasImageData: !!result.imageData,
          textLength: result.text?.length || 0,
          imageDataLength: result.imageData?.length || 0
        });
        
        // Compress image data if present before storing
        let compressedImageData = result.imageData || '';
        if (compressedImageData && file.type?.startsWith('image/')) {
          console.log('[Eureka AI] Compressing image...');
          compressedImageData = await this.compressImage(compressedImageData);
          console.log('[Eureka AI] Image compressed, size:', compressedImageData.length, 'bytes');
        }
        
        // Update last upload timestamp after successful upload
        await chrome.storage.local.set({
          lastFileUploadTimestamp: Date.now()
        });

        // Store in chrome.storage.local
        const fileContext = {
          text: result.text || '',
          imageData: compressedImageData,
          filename: file.name,
          fileType: file.type,
          timestamp: Date.now()
        };
        console.log('[Eureka AI] Storing file context:', {
          filename: fileContext.filename,
          fileType: fileContext.fileType,
          hasText: !!fileContext.text,
          hasImageData: !!fileContext.imageData
        });
        
        await chrome.storage.local.set({
          uploadedFileContext: fileContext
        });

        // Update status (optional)
        if (this.fileUploadStatus) {
          this.fileUploadStatus.textContent = `File loaded: ${file.name}`;
          this.fileUploadStatus.classList.add('loaded');
        }

        // Update file preview to remove loading state (similar to screenshot preview)
        console.log('[Eureka AI] Attempting to update file preview, chatManager:', !!window.chatManager, 'showFilePreview:', !!(window.chatManager && window.chatManager.showFilePreview));
        if (window.chatManager && window.chatManager.showFilePreview) {
          // This will update the preview and remove loading state
          window.chatManager.showFilePreview(fileContext);
          console.log('[Eureka AI] File preview updated, loading state removed');
        } else {
          console.warn('[Eureka AI] chatManager or showFilePreview not available');
        }

        console.log('[Eureka AI] File uploaded and processed successfully');
      } catch (error) {
        console.error('[Eureka AI] Error uploading file:', error);
        console.error('[Eureka AI] Error stack:', error.stack);
        
        // Hide file preview on error
        if (window.chatManager && window.chatManager.hideFilePreview) {
          window.chatManager.hideFilePreview();
        }
        
        alert(`Failed to upload file: ${error.message}`);
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
