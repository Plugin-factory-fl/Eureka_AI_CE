/**
 * Chat Manager Module
 * Handles chat functionality, suggestions, and message management
 */

(function() {
  'use strict';

  class ChatManager {
    constructor(container, input, sendButton, suggestionsContainer, chatSection) {
      this.container = container;
      this.input = input;
      this.sendButton = sendButton;
      this.suggestionsContainer = suggestionsContainer;
      this.chatSection = chatSection;
      this.playfulMessageShown = false;
      this.pendingScreenshot = null;
      this.placeholderIndex = 0;
      this.placeholderInterval = null;
      this.placeholders = [
        "Ask me to summarize chapters 1-5 in the PDF",
        "Ask me a unique question",
        "Ask me to clarify something"
      ];
      
      // Get screenshot preview elements
      this.screenshotPreview = document.getElementById('screenshot-preview');
      this.screenshotPreviewImg = document.getElementById('screenshot-preview-img');
      this.screenshotPreviewRemove = document.getElementById('screenshot-preview-remove');

      // Get file preview elements
      this.filePreview = document.getElementById('file-preview');
      this.filePreviewImg = document.getElementById('file-preview-img');
      this.filePreviewInfo = document.getElementById('file-preview-info');
      this.filePreviewIcon = document.getElementById('file-preview-icon');
      this.filePreviewName = document.getElementById('file-preview-name');
      this.filePreviewRemove = document.getElementById('file-preview-remove');
      this.filePreviewLoading = document.getElementById('file-preview-loading');
      this.pendingFile = null;

      this.init();
    }

    compressImage(imageData, maxWidth = 800, maxHeight = 800, quality = 0.7) {
      return window.ImageUtils?.compressImage(imageData, maxWidth, maxHeight, quality) || Promise.resolve(imageData);
    }

    init() {
      // Event listeners
      if (this.sendButton) {
        this.sendButton.addEventListener('click', () => this.handleSubmit());
      }
      
      if (this.input) {
        this.input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.handleSubmit();
          }
        });
        
        // Initialize placeholder rotation
        this.input.placeholder = this.placeholders[0];
        this.startPlaceholderRotation();
        
        this.input.addEventListener('focus', () => this.stopPlaceholderRotation());
        this.input.addEventListener('blur', () => {
          if (!this.input.value) {
            this.startPlaceholderRotation();
          }
        });
        this.input.addEventListener('input', () => {
          if (this.input.value) {
            this.stopPlaceholderRotation();
          } else if (document.activeElement !== this.input) {
            this.startPlaceholderRotation();
          }
        });
      }
      
      // Screenshot preview remove button
      if (this.screenshotPreviewRemove) {
        this.screenshotPreviewRemove.addEventListener('click', () => {
          this.hideScreenshotPreview();
        });
      }

      // File preview remove button
      if (this.filePreviewRemove) {
        this.filePreviewRemove.addEventListener('click', () => {
          this.hideFilePreview();
        });
      }

      // Listen for uploaded files
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.uploadedFileContext) {
          const fileContext = changes.uploadedFileContext.newValue;
          if (fileContext) {
            this.showFilePreview(fileContext);
          }
        }
      });
      
      // Clear chat button
      const clearChatButton = document.getElementById('clear-chat-button');
      if (clearChatButton) {
        clearChatButton.addEventListener('click', () => {
          this.clearChat();
        });
      }
      
      // Listen for captured screenshots
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.capturedScreenshot) {
          const screenshot = changes.capturedScreenshot.newValue;
          if (screenshot && screenshot.imageData) {
            this.showScreenshotPreview(screenshot.imageData);
            chrome.storage.local.remove('capturedScreenshot');
          }
        }
      });
      
      // Runtime message listener for screenshots
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'screenshot-captured' && message.imageData) {
          this.showScreenshotPreview(message.imageData);
          sendResponse({ success: true });
        }
        return false;
      });
      
      // Generate suggestions on load
      setTimeout(() => this.generateSuggestions(), 100);
      
      // Show upload limit toast on sidebar open (for freemium users)
      setTimeout(() => {
        this.updateUploadLimitIndicator();
      }, 500);
    }

    async updateUploadLimitIndicator() {
      const toast = document.getElementById('upload-limit-toast');
      if (!toast) return;
      
      // Don't show if already dismissed
      if (toast.hasAttribute('data-dismissed')) {
        return;
      }
      
      // Check if user is premium
      if (window.premiumManager) {
        const isPremium = await window.premiumManager.checkPremiumStatus();
        if (isPremium) {
          toast.style.display = 'none';
          return;
        }
      }
      
      // Show toast for freemium users on sidebar open
      toast.style.display = 'block';
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
      
      // Add hover handler to dismiss on hover
      const hoverHandler = () => {
        if (toast.hasAttribute('data-dismissed')) return;
        toast.setAttribute('data-dismissed', 'true');
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(5px)';
        setTimeout(() => {
          if (toast) {
            toast.style.display = 'none';
            toast.removeEventListener('mouseenter', hoverHandler);
          }
        }, 300);
      };
      
      // Remove any existing listener and add new one
      toast.removeEventListener('mouseenter', hoverHandler);
      toast.addEventListener('mouseenter', hoverHandler);
      
      // Auto-hide after 5 seconds if not hovered
      setTimeout(() => {
        if (toast && !toast.hasAttribute('data-dismissed')) {
          toast.setAttribute('data-dismissed', 'true');
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(5px)';
          setTimeout(() => {
            if (toast) {
              toast.style.display = 'none';
              toast.removeEventListener('mouseenter', hoverHandler);
            }
          }, 300);
        }
      }, 5000);
    }

    addMessage(message, isUser = false) {
      if (!this.container) return;
      
      // Create wrapper for assistant messages to position copy button outside
      const messageWrapper = document.createElement('div');
      messageWrapper.style.position = 'relative';
      messageWrapper.style.display = 'inline-block';
      messageWrapper.style.width = '100%';
      messageWrapper.style.maxWidth = '80%';
      
      const messageElement = document.createElement('div');
      messageElement.className = `chat-message ${isUser ? 'user' : 'assistant'}`;
      
      // Format message content for assistant messages (left-align, parse lists, etc.)
      if (!isUser && message) {
        let formattedMessage = message;
        
        // Parse numbered lists: Convert "1. text 2. text" to proper list format
        // Match patterns like "1. ", "2. ", etc. at start of lines
        formattedMessage = formattedMessage.replace(/(\d+\.\s+[^\n]+(?:\n(?!(?:\d+\.|\*\*|$))[^\n]+)*)/g, (match) => {
          // Split by line breaks and number patterns
          const lines = match.split(/(?=\d+\.\s+)/);
          return lines.map(line => {
            const trimmed = line.trim();
            if (trimmed && /^\d+\.\s+/.test(trimmed)) {
              return `<p style="margin: 8px 0;">${trimmed}</p>`;
            }
            return trimmed ? `<p style="margin: 8px 0;">${trimmed}</p>` : '';
          }).join('');
        });
        
        // Convert markdown-style bold (**text**) to <strong>
        formattedMessage = formattedMessage.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Detect section headers (lines ending with ":" followed by content)
        formattedMessage = formattedMessage.replace(/^([^:\n]+:)(?=\s*\n)/gm, '<strong>$1</strong>');
        
        // Wrap in div with left alignment
        messageElement.innerHTML = `<div style="text-align: left; width: 100%;">${formattedMessage}</div>`;
        
        // Add copy button for assistant messages (outside the bubble)
        const copyButton = document.createElement('button');
        copyButton.className = 'chat-message-copy-btn';
        copyButton.setAttribute('aria-label', 'Copy message');
        copyButton.innerHTML = '📋';
        copyButton.title = 'Copy to clipboard';
        
        copyButton.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            // Get plain text version of message (strip HTML)
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = formattedMessage;
            const plainText = tempDiv.textContent || tempDiv.innerText || message;
            
            await navigator.clipboard.writeText(plainText);
            
            // Show feedback
            const originalHTML = copyButton.innerHTML;
            copyButton.innerHTML = '✓';
            copyButton.style.color = '#10b981';
            
            setTimeout(() => {
              copyButton.innerHTML = originalHTML;
              copyButton.style.color = '';
            }, 1500);
          } catch (error) {
            console.error('[Eureka AI] Error copying message:', error);
            alert('Failed to copy message. Please try again.');
          }
        });
        
        messageWrapper.appendChild(messageElement);
        messageWrapper.appendChild(copyButton);
        this.container.appendChild(messageWrapper);
      } else {
        // User messages stay as plain text
        messageElement.textContent = message;
        this.container.appendChild(messageElement);
      }
      
      if (this.container) {
        this.container.scrollTop = this.container.scrollHeight;
      }
      
      // Hide suggestions when message is added
      this.hideSuggestions();
    }

    async generateSuggestions() {
      if (!this.suggestionsContainer) return;
      
      // Get current content info and uploaded file context
      const [contentInfo, fileContext] = await Promise.all([
        chrome.storage.local.get(['currentContentInfo']),
        chrome.storage.local.get(['uploadedFileContext'])
      ]);
      
      const contentInfoData = contentInfo.currentContentInfo;
      const uploadedFileContext = fileContext.uploadedFileContext;
      
      const suggestions = [];
      
      if (contentInfoData) {
        const contentType = contentInfoData.type || 'webpage';
        if (contentType === 'video') {
          suggestions.push(
            'Summarize this video',
            'What are the main points?',
            'Explain the key concepts',
            'Generate flashcards from this video'
          );
        } else if (contentType === 'pdf') {
          suggestions.push(
            'Summarize this PDF',
            'What are the main ideas?',
            'Explain the key points',
            'Generate flashcards from this document'
          );
        } else {
          suggestions.push(
            'Summarize this content',
            'What are the main ideas?',
            'Explain the key points',
            'Generate flashcards from this page'
          );
        }
      } else {
        suggestions.push(
          'Ask a question',
          'Get help',
          'Explain something',
          'Summarize content'
        );
      }
      
      // Display suggestions with "Eureka AI for Chrome" header
      this.suggestionsContainer.innerHTML = '';
      
      // Add wave-animated header
      const header = document.createElement('div');
      header.className = 'playful-message';
      const waveText = document.createElement('span');
      waveText.className = 'wave-text';
      const text = 'Eureka AI for Chrome';
      text.split('').forEach((char, index) => {
        const charSpan = document.createElement('span');
        charSpan.className = 'wave-char';
        charSpan.textContent = char === ' ' ? '\u00A0' : char;
        charSpan.style.animationDelay = `${index * 0.1}s`;
        waveText.appendChild(charSpan);
      });
      header.appendChild(waveText);
      this.suggestionsContainer.appendChild(header);
      
      suggestions.forEach(suggestion => {
        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.textContent = suggestion;
        card.addEventListener('click', async () => {
          // Check if suggestion should trigger tab switch and auto-generate
          const lowerSuggestion = suggestion.toLowerCase();
          
          if (lowerSuggestion.includes('summarize')) {
            // Trigger tab switch and summary generation via custom event
            window.dispatchEvent(new CustomEvent('chat-suggestion-action', {
              detail: { action: 'summarize', text: suggestion }
            }));
          } else if (lowerSuggestion.includes('flashcard')) {
            // Trigger tab switch and flashcard generation
            window.dispatchEvent(new CustomEvent('chat-suggestion-action', {
              detail: { action: 'flashcards', text: suggestion }
            }));
          } else if (lowerSuggestion.includes('test') || lowerSuggestion.includes('quiz')) {
            // Trigger tab switch and quiz generation
            window.dispatchEvent(new CustomEvent('chat-suggestion-action', {
              detail: { action: 'quiz', text: suggestion }
            }));
          } else {
            // Regular suggestion - fill input and auto-submit for "main points" and "key concepts"
            const lowerSuggestion = suggestion.toLowerCase();
            const shouldAutoSubmit = lowerSuggestion.includes('main points') || 
                                   lowerSuggestion.includes('main ideas') ||
                                   lowerSuggestion.includes('key concepts') ||
                                   lowerSuggestion.includes('key points');
            
            if (this.input) {
              this.input.value = suggestion;
              this.input.focus();
              
              // Auto-submit if it's "main points" or "key concepts"
              if (shouldAutoSubmit) {
                // Small delay to ensure input is set, then submit
                setTimeout(() => {
                  this.handleSubmit();
                }, 100);
              }
            }
          }
        });
        this.suggestionsContainer.appendChild(card);
      });
      
      this.suggestionsContainer.classList.remove('hidden');
    }

    hideSuggestions() {
      if (this.suggestionsContainer) {
        this.suggestionsContainer.classList.add('hidden');
      }
    }

    async showScreenshotPreview(imageData) {
      if (!this.screenshotPreview || !this.screenshotPreviewImg) return;

      // Check upload limit for free users
      const limitCheck = await this.checkUploadLimit();
      if (!limitCheck.allowed) {
        await this.showUpgradeDialog(limitCheck.message);
        return;
      }

      // Hide file preview if showing
      if (this.filePreview) {
        this.filePreview.style.display = 'none';
      }
      this.pendingFile = null;

      this.pendingScreenshot = imageData;
      this.screenshotPreviewImg.src = imageData;
      this.screenshotPreview.style.display = 'block';

        // Update upload timestamps (track last 2 uploads for freemium limit)
        const stored = await chrome.storage.local.get(['fileUploadTimestamps']);
        const uploadTimestamps = stored.fileUploadTimestamps || [];
        uploadTimestamps.push(Date.now());
        const trimmedTimestamps = uploadTimestamps.slice(-10);
        
        // Store screenshot for context
        await chrome.storage.local.set({
          pendingScreenshotContext: {
            imageData: imageData,
            filename: 'screenshot.png',
            fileType: 'image/png',
            timestamp: Date.now()
          },
          fileUploadTimestamps: trimmedTimestamps
        });
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

    hideScreenshotPreview() {
      if (!this.screenshotPreview) return;
      this.pendingScreenshot = null;
      this.screenshotPreview.style.display = 'none';
      // Also hide file preview if showing (they're mutually exclusive)
      if (this.filePreview) {
        this.filePreview.style.display = 'none';
      }
    }

    showFilePreviewLoading(file) {
      if (!this.filePreview) return;

      // Hide screenshot preview if showing
      if (this.screenshotPreview) {
        this.screenshotPreview.style.display = 'none';
      }

      // Show file preview with loading state
      this.filePreview.style.display = 'block';
      this.filePreview.classList.add('loading');

      // Show loading overlay
      const loadingOverlay = document.getElementById('file-preview-loading');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
      }

      // Set up preview based on file type
      const fileName = file.name || 'Uploaded file';
      const fileType = file.type || '';

      // If it's an image, try to show a preview
      if (fileType.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (this.filePreviewImg) {
            this.filePreviewImg.src = e.target.result;
            this.filePreviewImg.style.display = 'block';
          }
          if (this.filePreviewInfo) {
            this.filePreviewInfo.style.display = 'none';
          }
        };
        reader.readAsDataURL(file);
      } else {
        // For PDFs and documents, show file icon and name
        if (this.filePreviewImg) {
          this.filePreviewImg.style.display = 'none';
        }
        if (this.filePreviewInfo) {
          const fileIcon = fileType === 'application/pdf' ? '📄' : 
                          fileType?.includes('document') ? '📝' : '📎';
          if (this.filePreviewIcon) {
            this.filePreviewIcon.textContent = fileIcon;
          }
          if (this.filePreviewName) {
            this.filePreviewName.textContent = fileName;
          }
          this.filePreviewInfo.style.display = 'flex';
        }
      }

      // Store pending file info
      this.pendingFile = {
        filename: fileName,
        fileType: fileType,
        loading: true
      };
    }

    showFilePreview(fileContext) {
      if (!this.filePreview) return;

      this.pendingFile = fileContext;
      
      // Hide screenshot preview if showing
      if (this.screenshotPreview) {
        this.screenshotPreview.style.display = 'none';
      }

      // Show file preview
      this.filePreview.style.display = 'block';
      
      // Remove loading state
      this.filePreview.classList.remove('loading');
      const loadingOverlay = document.getElementById('file-preview-loading');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }

      // If it's an image, show the image preview
      if (fileContext.imageData && fileContext.fileType?.startsWith('image/')) {
        if (this.filePreviewImg) {
          this.filePreviewImg.src = fileContext.imageData;
          this.filePreviewImg.style.display = 'block';
        }
        if (this.filePreviewInfo) {
          this.filePreviewInfo.style.display = 'none';
        }
      } else {
        // For PDFs and documents, show file icon and name
        if (this.filePreviewImg) {
          this.filePreviewImg.style.display = 'none';
        }
        if (this.filePreviewInfo) {
          const fileName = fileContext.filename || 'Uploaded file';
          const fileIcon = fileContext.fileType === 'application/pdf' ? '📄' : 
                          fileContext.fileType?.includes('document') ? '📝' : '📎';
          if (this.filePreviewIcon) {
            this.filePreviewIcon.textContent = fileIcon;
          }
          if (this.filePreviewName) {
            this.filePreviewName.textContent = fileName;
          }
          this.filePreviewInfo.style.display = 'flex';
        }
      }
    }

    hideFilePreview() {
      if (!this.filePreview) return;
      this.pendingFile = null;
      this.filePreview.style.display = 'none';
      // Also hide screenshot preview if showing (they're mutually exclusive)
      if (this.screenshotPreview) {
        this.screenshotPreview.style.display = 'none';
        this.pendingScreenshot = null;
      }
      // Hide file upload status
      const fileUploadStatus = document.getElementById('file-upload-status');
      if (fileUploadStatus) {
        fileUploadStatus.style.display = 'none';
        fileUploadStatus.textContent = '';
        fileUploadStatus.classList.remove('loaded');
      }
    }

    startPlaceholderRotation() {
      if (this.placeholderInterval || !this.input) return;
      this.placeholderInterval = setInterval(() => {
        if (this.input && !this.input.value && document.activeElement !== this.input) {
          this.placeholderIndex = (this.placeholderIndex + 1) % this.placeholders.length;
          this.input.placeholder = this.placeholders[this.placeholderIndex];
        }
      }, 2000);
    }

    stopPlaceholderRotation() {
      if (this.placeholderInterval) {
        clearInterval(this.placeholderInterval);
        this.placeholderInterval = null;
      }
    }

    async handleSubmit() {
      const question = this.input?.value.trim();
      
      // If there's a pending screenshot or file, include it even if question is empty
      if (!question && !this.pendingScreenshot && !this.pendingFile) return;

      // Check usage limit
      const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
      const stored = await chrome.storage.local.get(['sumvid_auth_token']);
      const token = stored.sumvid_auth_token;
      
      let limitReached = false;
      let isPremium = false;
      
      if (token) {
        try {
          const usageResponse = await fetch(`${BACKEND_URL}/api/user/usage`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (usageResponse.ok) {
            const usage = await usageResponse.json();
            limitReached = usage.enhancementsUsed >= usage.enhancementsLimit;
            isPremium = usage.subscriptionStatus === 'premium';
          }
        } catch (error) {
          console.warn('[Eureka AI] Failed to check usage from backend:', error);
          // Fallback to local check
          if (window.UsageTracker) {
            limitReached = await window.UsageTracker.isLimitReached();
          }
        }
      } else {
        // Not logged in, check local storage
        if (window.UsageTracker) {
          limitReached = await window.UsageTracker.isLimitReached();
        }
      }
      
      if (limitReached && !isPremium) {
        // Show usage limit message
        const messageText = "You're out of uses for Eureka AI! Wait 24 hours for 10 more uses or ";
        const upgradeLinkText = "UPGRADE TO PRO";
        const messageAfterLink = " for unlimited access.";
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message assistant usage-limit-message';
        messageElement.innerHTML = `${messageText}<a href="#" class="upgrade-link" id="chat-upgrade-link">${upgradeLinkText}</a>${messageAfterLink}`;
        this.container?.appendChild(messageElement);
        if (this.container) {
          this.container.scrollTop = this.container.scrollHeight;
        }
        
        // Add click handler for upgrade link
        const upgradeLink = document.getElementById('chat-upgrade-link');
        if (upgradeLink) {
          upgradeLink.addEventListener('click', async (e) => {
            e.preventDefault();
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
          });
        }
        
        return;
      }

      // Check for uploaded file context first (before handling screenshot)
      const uploadedFileContext = await chrome.storage.local.get(['uploadedFileContext']);
      const fileContext = uploadedFileContext.uploadedFileContext;
      const hasUploadedFile = fileContext && (fileContext.filename || fileContext.imageData || fileContext.text);
      
      // Handle pending screenshot
      let screenshotToSend = null;
      if (this.pendingScreenshot) {
        screenshotToSend = this.pendingScreenshot;
        await chrome.storage.local.set({
          uploadedFileContext: {
            imageData: this.pendingScreenshot,
            filename: 'screenshot.png',
            fileType: 'image/png',
            timestamp: Date.now()
          }
        });
      }
      
      // Add user's question to chat
      if (question) {
        this.addMessage(question, true);
      } else if (screenshotToSend) {
        this.addMessage('Screenshot:', true);
      } else if (hasUploadedFile) {
        const fileName = fileContext.filename || 'Uploaded file';
        this.addMessage(`File: ${fileName}`, true);
      }
      
      // Add screenshot image to the last user message if present
      if (screenshotToSend && this.container) {
        const lastMessage = this.container.querySelector('.chat-message.user:last-child');
        if (lastMessage) {
          const img = document.createElement('img');
          img.src = screenshotToSend;
          img.className = 'chat-message-image';
          lastMessage.appendChild(img);
        }
      }
      
      // Add uploaded file image to the last user message if present (for image files)
      if (hasUploadedFile && fileContext.imageData && this.container) {
        const lastMessage = this.container.querySelector('.chat-message.user:last-child');
        if (lastMessage) {
          const img = document.createElement('img');
          img.src = fileContext.imageData;
          img.className = 'chat-message-image';
          lastMessage.appendChild(img);
        }
      }
      
      if (this.input) {
        this.input.value = '';
      }

      // Clear previews immediately after capturing data and before sending
      // This ensures the preview doesn't persist for the next message
      if (screenshotToSend) {
        this.hideScreenshotPreview();
      }
      if (hasUploadedFile) {
        this.hideFilePreview();
      }

      // Show loading state
      if (this.chatSection && window.showLoadingIndicator) {
        window.showLoadingIndicator(this.chatSection);
      }

      try {
        if (typeof chrome === 'undefined' || !chrome.runtime) {
          throw new Error('Chrome runtime not available');
        }
        
        // Get combined context via FileManager if available
        let combinedContext = '';
        if (window.fileManager) {
          combinedContext = await window.fileManager.getCombinedContext();
        }
        
        // Get chat history
        const chatHistoryElements = this.container?.querySelectorAll('.chat-message.user, .chat-message.assistant');
        const chatHistory = [];
        if (chatHistoryElements) {
          chatHistoryElements.forEach((el, index) => {
            if (index < chatHistoryElements.length - 1) {
              const isUser = el.classList.contains('user');
              const text = el.textContent.trim();
              if (text && !el.classList.contains('playful-message') && !el.classList.contains('usage-limit-message')) {
                chatHistory.push({
                  role: isUser ? 'user' : 'assistant',
                  content: text
                });
              }
            }
          });
        }
        
        // Include screenshot or file in message if present
        let messageToSend = question || '';
        if (screenshotToSend) {
          messageToSend = question || 'Please analyze this screenshot.';
        } else if (hasUploadedFile) {
          const fileName = fileContext.filename || 'uploaded file';
          if (fileContext.fileType?.startsWith('image/')) {
            messageToSend = question || `Please analyze this image: ${fileName}`;
          } else if (fileContext.fileType === 'application/pdf') {
            messageToSend = question || `Please analyze this PDF: ${fileName}`;
          } else {
            messageToSend = question || `Please analyze this document: ${fileName}`;
          }
        }
        
        // Check if we need vision model (screenshot or uploaded image file)
        const hasImageOrFile = screenshotToSend || 
                              (fileContext && 
                               (fileContext.imageData || 
                                fileContext.fileType?.startsWith('image/')));
        
        // Extract image data for vision model and compress before sending
        let imageDataToSend = null;
        if (screenshotToSend) {
          imageDataToSend = await this.compressImage(screenshotToSend);
        } else if (fileContext && fileContext.imageData) {
          imageDataToSend = await this.compressImage(fileContext.imageData);
        }
        
        const response = await chrome.runtime.sendMessage({
          action: 'sidechat',
          message: messageToSend,
          chatHistory: chatHistory,
          context: combinedContext,
          useVisionModel: !!hasImageOrFile, // Request vision model if image/file is present
          imageData: imageDataToSend // Send compressed image data (full data URL format)
        });

        // Clear storage after sending (previews already cleared above)
        if (hasUploadedFile || screenshotToSend) {
          await chrome.storage.local.remove('uploadedFileContext');
          await chrome.storage.local.remove('pendingScreenshotContext');
          // Ensure previews are hidden (in case they weren't already)
          this.hideScreenshotPreview();
          this.hideFilePreview();
        }

        if (response?.error) {
          this.addMessage(`Error: ${response.error}`, false);
        } else if (response?.reply) {
          this.addMessage(response.reply, false);
        } else {
          this.addMessage('Sorry, I encountered an error while processing your question.', false);
        }

        // Update status cards with fresh data after enhancement use (force refresh)
        if (window.usageManager && window.usageManager.updateStatusCards) {
          await window.usageManager.updateStatusCards(true);
        }
      } catch (error) {
        console.error('Error submitting question:', error);
        this.addMessage('Sorry, I encountered an error while processing your question.', false);
      }

      // Show completion state
      if (this.chatSection && window.showCompletionBadge) {
        window.showCompletionBadge(this.chatSection);
      }
    }

    async clearChat() {
      if (!this.container) return;
      
      // Clear all messages from container
      this.container.innerHTML = '';
      
      // Clear any pending file/screenshot previews
      this.hideScreenshotPreview();
      this.hideFilePreview();
      this.pendingScreenshot = null;
      this.pendingFile = null;
      
      // Re-add suggestions container
      if (this.suggestionsContainer) {
        this.container.appendChild(this.suggestionsContainer);
      }
      
      // Clear cached chat
      try {
        const stored = await chrome.storage.local.get(['currentContentInfo', 'currentVideoInfo']);
        const contentInfo = stored.currentContentInfo || stored.currentVideoInfo;
        if (contentInfo?.url) {
          try {
            const urlObj = new URL(contentInfo.url);
            const videoId = urlObj.searchParams.get('v');
            if (videoId) {
              await chrome.storage.local.remove(`chat_${videoId}`);
            }
          } catch (e) {
            // Not a valid URL, skip
          }
        }
      } catch (error) {
        console.error('[Eureka AI] Error clearing cached chat:', error);
      }
      
      // Reset playful message flag
      this.playfulMessageShown = false;
      
      // Regenerate suggestions
      this.generateSuggestions();
    }

    async saveChatToCache(videoId) {
      if (!videoId || !this.container) return;
      
      const chatHistoryElements = this.container.querySelectorAll('.chat-message.user, .chat-message.assistant');
      const chatHistory = [];
      chatHistoryElements.forEach(el => {
        const isUser = el.classList.contains('user');
        const text = el.textContent.trim();
        if (text && !el.classList.contains('playful-message') && !el.classList.contains('usage-limit-message')) {
          chatHistory.push({
            role: isUser ? 'user' : 'assistant',
            content: text
          });
        }
      });
      
      if (chatHistory.length > 0) {
        const key = `chat_${videoId}`;
        const data = {
          content: chatHistory,
          timestamp: Date.now(),
          videoId: videoId
        };
        
        try {
          await chrome.storage.local.set({ [key]: data });
        } catch (error) {
          console.error('[Eureka AI] Error saving chat:', error);
        }
      }
    }

    async loadCachedChat(videoId) {
      if (!videoId || !this.container) return;
      
      const key = `chat_${videoId}`;
      try {
        const result = await chrome.storage.local.get([key]);
        const data = result[key];
        
        if (data && data.content && Array.isArray(data.content)) {
          // Clear existing messages (except playful message)
          const existingMessages = this.container.querySelectorAll('.chat-message:not(.playful-message)');
          existingMessages.forEach(msg => msg.remove());
          
          // Load cached messages
          data.content.forEach(msg => {
            this.addMessage(msg.content, msg.role === 'user');
          });
        }
      } catch (error) {
        console.error('Error loading cached chat:', error);
      }
    }
  }

  // Export to global scope
  window.ChatManager = ChatManager;
})();
