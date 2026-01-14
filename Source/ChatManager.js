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
      
      this.init();
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
    }

    addMessage(message, isUser = false) {
      if (!this.container) return;
      
      const messageElement = document.createElement('div');
      messageElement.className = `chat-message ${isUser ? 'user' : 'assistant'}`;
      messageElement.textContent = message;
      this.container.appendChild(messageElement);
      
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
            // Regular suggestion - just fill input
            if (this.input) {
              this.input.value = suggestion;
              this.input.focus();
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

    showScreenshotPreview(imageData) {
      if (!this.screenshotPreview || !this.screenshotPreviewImg) return;
      
      this.pendingScreenshot = imageData;
      this.screenshotPreviewImg.src = imageData;
      this.screenshotPreview.style.display = 'block';
      
      // Store screenshot for context
      chrome.storage.local.set({
        pendingScreenshotContext: {
          imageData: imageData,
          filename: 'screenshot.png',
          fileType: 'image/png',
          timestamp: Date.now()
        }
      });
    }

    hideScreenshotPreview() {
      if (!this.screenshotPreview) return;
      
      this.pendingScreenshot = null;
      this.screenshotPreview.style.display = 'none';
      chrome.storage.local.remove('pendingScreenshotContext');
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
      
      // If there's a pending screenshot, include it even if question is empty
      if (!question && !this.pendingScreenshot) return;

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
        this.hideScreenshotPreview();
      }

      // Add user's question to chat
      if (question) {
        this.addMessage(question, true);
      } else if (screenshotToSend) {
        this.addMessage('Screenshot:', true);
      }
      
      // Add screenshot image to the last user message if present
      if (screenshotToSend && this.container) {
        const lastMessage = this.container.querySelector('.chat-message.user:last-child');
        if (lastMessage) {
          const img = document.createElement('img');
          img.src = screenshotToSend;
          img.style.maxWidth = '100%';
          img.style.borderRadius = '8px';
          img.style.marginTop = '8px';
          img.style.display = 'block';
          lastMessage.appendChild(img);
        }
      }
      
      if (this.input) {
        this.input.value = '';
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
        
        // Include screenshot in message if present
        let messageToSend = question || '';
        if (screenshotToSend) {
          messageToSend = question || 'Please analyze this screenshot.';
        }
        
        const response = await chrome.runtime.sendMessage({
          action: 'sidechat',
          message: messageToSend,
          chatHistory: chatHistory,
          context: combinedContext
        });

        if (response?.error) {
          this.addMessage(`Error: ${response.error}`, false);
        } else if (response?.reply) {
          this.addMessage(response.reply, false);
        } else {
          this.addMessage('Sorry, I encountered an error while processing your question.', false);
        }

        // Update status cards
        if (window.usageManager) {
          await window.usageManager.updateStatusCards();
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
          console.log(`Saved chat for video ${videoId}`);
        } catch (error) {
          console.error('Error saving chat:', error);
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
