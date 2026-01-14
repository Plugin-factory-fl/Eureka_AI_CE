/**
 * UI Controller Module
 * Handles theme, collapse, playful message, and copy URL functionality
 */

(function() {
  'use strict';

  class UIController {
    constructor(options = {}) {
      this.themeToggle = options.themeToggle;
      this.summaryHeader = options.summaryHeader;
      this.summaryContent = options.summaryContent;
      this.quizHeader = options.quizHeader;
      this.quizContent = options.quizContent;
      this.chatMessages = options.chatMessages;
      this.playfulMessageShown = false;
      
      this.init();
    }

    init() {
      this.setupThemeToggle();
      this.setupCollapseHandlers();
      this.setupCopyUrlButton();
    }

    setupThemeToggle() {
      if (!this.themeToggle) return;

      chrome.storage.local.get(['darkMode'], (result) => {
        if (chrome.runtime.lastError) {
          console.warn('Error getting dark mode setting:', chrome.runtime.lastError);
          return;
        }
        const isDarkMode = result.darkMode || false;
        this.themeToggle.checked = isDarkMode;
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
      });

      this.themeToggle.addEventListener('change', () => {
        const isDarkMode = this.themeToggle.checked;
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        chrome.storage.local.set({ darkMode: isDarkMode }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Error saving dark mode setting:', chrome.runtime.lastError);
          }
        });
      });
    }

    setupCollapseHandlers() {
      // Summary collapse handling
      if (this.summaryHeader && this.summaryContent) {
        this.summaryHeader.addEventListener('click', (e) => {
          if (e.target.closest('.regenerate-button') || e.target.closest('.context-bar')) {
            return;
          }
          
          const isCollapsed = this.summaryContent.classList.contains('collapsed');
          const summaryCollapseButton = this.summaryHeader.querySelector('.collapse-button');
          if (isCollapsed) {
            this.summaryContent.classList.remove('collapsed');
            summaryCollapseButton?.classList.remove('collapsed');
          } else {
            this.summaryContent.classList.add('collapsed');
            summaryCollapseButton?.classList.add('collapsed');
          }
        });
      }

      // Quiz collapse handling
      if (this.quizHeader && this.quizContent) {
        this.quizHeader.addEventListener('click', (e) => {
          if (e.target.closest('.regenerate-button') || e.target.closest('.context-bar')) {
            return;
          }
          
          const isCollapsed = this.quizContent.classList.contains('collapsed');
          const quizCollapseButton = this.quizHeader.querySelector('.collapse-button');
          if (isCollapsed) {
            this.quizContent.classList.remove('collapsed');
            quizCollapseButton?.classList.remove('collapsed');
          } else {
            this.quizContent.classList.add('collapsed');
            quizCollapseButton?.classList.add('collapsed');
          }
        });
      }
    }

    setupCopyUrlButton() {
      const copyUrlButton = document.getElementById('copy-url-button');
      if (!copyUrlButton) return;

      copyUrlButton.addEventListener('click', async (e) => {
        const urlToCopy = e.currentTarget.dataset.fullUrl;
        if (!urlToCopy) return;
        
        try {
          await navigator.clipboard.writeText(urlToCopy);
          const originalTitle = e.currentTarget.title;
          e.currentTarget.title = 'Copied!';
          e.currentTarget.style.color = '#4CAF50';
          setTimeout(() => {
            e.currentTarget.title = originalTitle || 'Copy URL';
            e.currentTarget.style.color = '';
          }, 2000);
        } catch (error) {
          console.error('Failed to copy URL:', error);
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = urlToCopy;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          try {
            document.execCommand('copy');
            e.currentTarget.title = 'Copied!';
            e.currentTarget.style.color = '#4CAF50';
            setTimeout(() => {
              e.currentTarget.title = 'Copy URL';
              e.currentTarget.style.color = '';
            }, 2000);
          } catch (fallbackError) {
            console.error('Fallback copy failed:', fallbackError);
          }
          document.body.removeChild(textArea);
        }
      });
    }

    showPlayfulMessage() {
      if (!this.chatMessages || this.playfulMessageShown || this.chatMessages.children.length > 0) return;
      
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message assistant playful-message';
      
      const text = 'Eureka AI for Chrome';
      const waveText = text.split('').map((char, index) => {
        if (char === ' ') {
          return '<span class="wave-char" style="display: inline-block; width: 0.3em;"> </span>';
        }
        return `<span class="wave-char" style="animation-delay: ${index * 0.1}s;">${char}</span>`;
      }).join('');
      
      messageElement.innerHTML = `<span class="wave-text">${waveText}</span>`;
      this.chatMessages.appendChild(messageElement);
      this.playfulMessageShown = true;
    }

    hidePlayfulMessage() {
      if (!this.chatMessages) return;
      const playfulMsg = this.chatMessages.querySelector('.playful-message');
      if (playfulMsg) {
        playfulMsg.remove();
        this.playfulMessageShown = false;
      }
    }
  }

  // Export to global scope
  window.UIController = UIController;
  // Make showPlayfulMessage globally accessible
  window.showPlayfulMessage = function() {
    if (window.uiController) {
      window.uiController.showPlayfulMessage();
    }
  };
})();
