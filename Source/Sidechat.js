/**
 * Sidechat Module
 * Always-visible ChatGPT chat interface (ChatGPT-only, not multi-model)
 */

(function() {
  'use strict';

  let chatHistory = [];
  let isProcessing = false;

  /**
   * Initializes the sidechat system
   */
  function initSidechat() {
    const sidechatSection = document.getElementById('sidechat-section');
    const sidechatMessages = document.getElementById('sidechat-messages');
    const sidechatInput = document.getElementById('sidechat-input');
    const sidechatSend = document.getElementById('sidechat-send');

    if (!sidechatSection || !sidechatMessages || !sidechatInput || !sidechatSend) {
      console.warn('[Eureka AI] Sidechat elements not found');
      return;
    }

    // Send button click handler
    sidechatSend.addEventListener('click', handleSend);
    
    // Enter key handler
    sidechatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Load chat history from storage
    loadChatHistory();

    console.log('[Eureka AI] Sidechat initialized');
  }

  /**
   * Handles sending a message
   */
  async function handleSend() {
    const sidechatInput = document.getElementById('sidechat-input');
    const message = sidechatInput?.value.trim();
    
    if (!message || isProcessing) return;

    isProcessing = true;
    sidechatInput.value = '';
    
    // Add user message to UI
    addMessage(message, 'user');
    
    // Add user message to history
    chatHistory.push({ role: 'user', content: message });

    try {
      // Send to backend
      const response = await chrome.runtime.sendMessage({
        action: 'sidechat',
        message: message,
        chatHistory: chatHistory
      });

      if (response?.error) {
        addMessage(`Error: ${response.error}`, 'assistant');
      } else if (response?.reply) {
        addMessage(response.reply, 'assistant');
        // Add assistant response to history
        chatHistory.push({ role: 'assistant', content: response.reply });
        // Save chat history
        saveChatHistory();
      }
    } catch (error) {
      console.error('[Eureka AI] Sidechat error:', error);
      addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
    } finally {
      isProcessing = false;
    }
  }

  /**
   * Adds a message to the chat UI
   */
  function addMessage(text, role) {
    const sidechatMessages = document.getElementById('sidechat-messages');
    if (!sidechatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = `sidechat-message sidechat-message--${role}`;
    messageElement.textContent = text;
    
    sidechatMessages.appendChild(messageElement);
    sidechatMessages.scrollTop = sidechatMessages.scrollHeight;
  }

  /**
   * Saves chat history to storage
   */
  async function saveChatHistory() {
    try {
      await chrome.storage.local.set({ sumvid_sidechat_history: chatHistory });
    } catch (error) {
      console.error('[Eureka AI] Error saving sidechat history:', error);
    }
  }

  /**
   * Loads chat history from storage
   */
  async function loadChatHistory() {
    try {
      const result = await chrome.storage.local.get(['sumvid_sidechat_history']);
      if (result.sumvid_sidechat_history && Array.isArray(result.sumvid_sidechat_history)) {
        chatHistory = result.sumvid_sidechat_history;
        
        // Restore messages to UI
        const sidechatMessages = document.getElementById('sidechat-messages');
        if (sidechatMessages) {
          sidechatMessages.innerHTML = '';
          chatHistory.forEach(msg => {
            addMessage(msg.content, msg.role);
          });
        }
      }
    } catch (error) {
      console.error('[Eureka AI] Error loading sidechat history:', error);
    }
  }

  /**
   * Clears chat history
   */
  function clearChatHistory() {
    chatHistory = [];
    const sidechatMessages = document.getElementById('sidechat-messages');
    if (sidechatMessages) {
      sidechatMessages.innerHTML = '';
    }
    chrome.storage.local.remove('sumvid_sidechat_history');
  }

  // Export functions for global access
  window.SumVidSidechat = {
    init: initSidechat,
    clear: clearChatHistory
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidechat);
  } else {
    initSidechat();
  }
})();
