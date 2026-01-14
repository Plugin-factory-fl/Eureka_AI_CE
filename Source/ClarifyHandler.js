/**
 * Clarify Handler Module
 * Handles selection-clarify messages from content scripts
 */

(function() {
  'use strict';

  class ClarifyHandler {
    constructor(options = {}) {
      this.chatMessages = options.chatMessages;
      this.questionInput = options.questionInput;
      this.isProcessingClarify = false;
      this.init();
    }

    init() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'selection-clarify') {
          if (this.isProcessingClarify) {
            console.warn('[Eureka AI] Clarify request already being processed');
            sendResponse({ success: false, error: 'Already processing' });
            return false;
          }
          
          this.isProcessingClarify = true;
          
          (async () => {
            try {
              const stored = await chrome.storage.local.get(['currentContentInfo', 'clarifyRequest']);
              const contentInfo = stored.currentContentInfo;
              const clarifyRequest = stored.clarifyRequest;
              
              const textToClarify = message.text || (clarifyRequest?.text);
              
              if (!textToClarify) {
                console.warn('[Eureka AI] No text to clarify');
                this.isProcessingClarify = false;
                sendResponse({ success: false, error: 'No text provided' });
                return;
              }
              
              let systemPrompt = `Please clarify the following text in the context of the current webpage:\n\n"${textToClarify}"\n\n`;
              
              let combinedContext = '';
              if (window.fileManager) {
                combinedContext = await window.fileManager.getCombinedContext();
              }
              
              if (combinedContext) {
                const contextSnippet = combinedContext.substring(0, 2000);
                systemPrompt += `Here is the context:\n\n${contextSnippet}`;
              }
              
              const userMessage = `Clarify this for me: "${textToClarify}"`;
              if (this.chatMessages && window.addChatMessage) {
                window.addChatMessage(userMessage, true);
              }
              
              if (this.questionInput) {
                this.questionInput.value = '';
              }
              
              const response = await chrome.runtime.sendMessage({
                action: 'sidechat',
                message: systemPrompt,
                chatHistory: [],
                context: combinedContext ? combinedContext.substring(0, 5000) : ''
              });
              
              if (response?.error) {
                if (window.addChatMessage) {
                  window.addChatMessage(`Error: ${response.error}`, false);
                }
              } else if (response?.reply) {
                if (window.addChatMessage) {
                  window.addChatMessage(response.reply, false);
                }
              } else {
                if (window.addChatMessage) {
                  window.addChatMessage('I apologize, but I was unable to clarify that text. Please try again.', false);
                }
              }
              
              chrome.storage.local.remove(['clarifyRequest']);
              
              if (window.usageManager) {
                await window.usageManager.updateStatusCards();
              }
              
              this.isProcessingClarify = false;
              sendResponse({ success: true });
            } catch (error) {
              console.error('[Eureka AI] Error handling selection-clarify:', error);
              if (this.chatMessages && window.addChatMessage) {
                window.addChatMessage(`Error: ${error.message}`, false);
              }
              this.isProcessingClarify = false;
              sendResponse({ success: false, error: error.message });
            }
          })();
          return true;
        }
        return false;
      });
    }
  }

  // Export to global scope
  window.ClarifyHandler = ClarifyHandler;
})();
