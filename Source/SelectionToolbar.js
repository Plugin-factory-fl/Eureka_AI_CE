/**
 * Selection Toolbar Module
 * Highlight-to-action tooltip system for webpages and PDFs
 * Based on PromptProfile's AdapterBase selection toolbar pattern
 */

(function() {
  'use strict';

  const TOOLBAR_ID = 'eureka-ai-selection-toolbar';
  const TOOLBAR_VISIBLE_CLASS = 'is-visible';
  let toolbarElement = null;
  let selectedText = '';
  let updateRaf = null;

  /**
   * Initializes the selection toolbar system
   */
  function initSelectionToolbar() {
    // Listen for selection changes
    document.addEventListener('selectionchange', handleSelectionChange);
    
    // Hide toolbar when clicking outside
    document.addEventListener('click', handleDocumentClick, true);
    
    console.log('[Eureka AI] Selection toolbar initialized');
  }

  /**
   * Handles selection change events
   */
  function handleSelectionChange() {
    if (updateRaf !== null) {
      return;
    }
    updateRaf = window.requestAnimationFrame(() => {
      updateRaf = null;
      updateSelectionToolbar();
    });
  }

  // Add scroll listener to update toolbar position when scrolling
  let scrollTimeout = null;
  document.addEventListener('scroll', () => {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        updateSelectionToolbar();
      }
    }, 100);
  }, true);

  /**
   * Updates the selection toolbar visibility and position
   */
  function updateSelectionToolbar() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (!selection || selection.isCollapsed || !text) {
      hideToolbar();
      return;
    }

    // Show toolbar for all pages (including YouTube)
    // Removed YouTube exclusion - toolbar should work everywhere

    selectedText = text;
    showToolbar(selection);
  }

  /**
   * Gets the bounding rectangle of the selection
   */
  function getSelectionRect(selection) {
    if (!selection?.rangeCount) return null;
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect?.width || rect?.height) return rect;
      const rects = range.getClientRects();
      return rects[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Shows the selection toolbar
   */
  function showToolbar(selection) {
    if (!toolbarElement) {
      ensureToolbar();
    }

    if (!toolbarElement) {
      console.error('[Eureka AI] Failed to create selection toolbar');
      return;
    }

    const rangeRect = getSelectionRect(selection);
    if (!rangeRect) {
      hideToolbar();
      return;
    }

    // Hide toolbar first to measure it accurately
    toolbarElement.classList.remove(TOOLBAR_VISIBLE_CLASS);
    toolbarElement.style.position = 'fixed';
    toolbarElement.style.left = '-9999px';
    toolbarElement.style.top = '0';
    toolbarElement.style.transform = 'translate(-50%, 0)';
    toolbarElement.style.opacity = '0';
    toolbarElement.style.pointerEvents = 'none';
    toolbarElement.style.display = 'flex';

    // Force reflows for accurate measurement
    void toolbarElement.offsetWidth;
    void toolbarElement.offsetHeight;

    let w = toolbarElement.offsetWidth;
    let h = toolbarElement.offsetHeight;

    if (!w || !h) {
      void toolbarElement.offsetWidth;
      w = toolbarElement.offsetWidth;
      h = toolbarElement.offsetHeight;
      if (!w || !h) {
        console.error('[Eureka AI] Toolbar dimensions invalid, cannot position');
        return;
      }
    }

    const { clientWidth: vw, clientHeight: vh } = document.documentElement;
    const selectionCenterX = rangeRect.left + rangeRect.width / 2;
    const selectionBottom = rangeRect.bottom;

    // Position toolbar BELOW selection (like PromptProfile)
    let left = Math.max(w / 2 + 8, Math.min(vw - w / 2 - 8, selectionCenterX));
    let top = selectionBottom + 8;

    // Check if toolbar would go off-screen at bottom
    const maxTop = vh - h - 8;
    if (top > maxTop) {
      // Position above selection instead
      top = Math.max(8, rangeRect.top - h - 8);
      toolbarElement.style.transform = 'translate(-50%, -100%)';
    } else {
      toolbarElement.style.transform = 'translate(-50%, 0)';
    }

    toolbarElement.style.left = `${Math.round(left)}px`;
    toolbarElement.style.top = `${Math.round(top)}px`;
    toolbarElement.style.opacity = '';
    toolbarElement.style.pointerEvents = '';
    toolbarElement.classList.add(TOOLBAR_VISIBLE_CLASS);
  }

  /**
   * Hides the selection toolbar
   */
  function hideToolbar() {
    if (toolbarElement) {
      toolbarElement.classList.remove(TOOLBAR_VISIBLE_CLASS);
    }
    selectedText = '';
  }

  /**
   * Handles document clicks - don't auto-hide, only hide if clicking dismiss button
   */
  function handleDocumentClick(event) {
    // Don't auto-hide on clicks - toolbar stays visible until dismissed
    // Only hide if clicking the dismiss button (handled in ensureToolbar)
  }

  /**
   * Ensures the toolbar element exists
   */
  function ensureToolbar() {
    if (toolbarElement) return toolbarElement;

    ensureStyles();

    toolbarElement = document.createElement('div');
    toolbarElement.id = TOOLBAR_ID;

    // Create dismiss button (X)
    const dismissButton = document.createElement('button');
    dismissButton.className = 'eureka-ai-selection-toolbar__dismiss';
    dismissButton.innerHTML = '×';
    dismissButton.setAttribute('aria-label', 'Dismiss');
    dismissButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideToolbar();
    });

    // Create Clarify button
    const clarifyButton = document.createElement('button');
    clarifyButton.className = 'eureka-ai-selection-toolbar__button';
    clarifyButton.textContent = 'Clarify';
    clarifyButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleClarify();
      hideToolbar();
    });

    toolbarElement.appendChild(dismissButton);
    toolbarElement.appendChild(clarifyButton);

    if (!document.body) {
      console.error('[Eureka AI] Cannot create selection toolbar: document.body not available');
      return null;
    }

    document.body.appendChild(toolbarElement);
    return toolbarElement;
  }

  /**
   * Handles Clarify action - opens sidebar and sends message to sidechat
   */
  async function handleClarify() {
    if (!selectedText) {
      console.warn('[Eureka AI] No selected text to clarify');
      return;
    }

    try {
      console.log('[Eureka AI] Clarify action triggered with text:', selectedText.substring(0, 50));
      
      // Send message to background script to open side panel and handle clarify
      // Content scripts can't use chrome.tabs or chrome.sidePanel directly
      chrome.runtime.sendMessage({
        action: 'open-side-panel-and-clarify',
        text: selectedText
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Eureka AI] Error sending clarify message:', chrome.runtime.lastError);
        } else {
          console.log('[Eureka AI] Clarify message sent successfully');
        }
      });
    } catch (error) {
      console.error('[Eureka AI] Error handling clarify action:', error);
    }
  }

  /**
   * Ensures styles are loaded
   */
  function ensureStyles() {
    if (document.getElementById(`${TOOLBAR_ID}-style`)) {
      return;
    }

    const style = document.createElement('style');
    style.id = `${TOOLBAR_ID}-style`;
    style.textContent = `
      #${TOOLBAR_ID} {
        position: fixed;
        z-index: 2147483647;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease, transform 140ms ease;
      }

      #${TOOLBAR_ID}.${TOOLBAR_VISIBLE_CLASS} {
        opacity: 1;
        pointer-events: auto;
      }

      .eureka-ai-selection-toolbar__button {
        padding: 8px 16px;
        background: linear-gradient(135deg, #A855F7, #9333ea);
        color: #ffffff;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);
        transition: all 0.2s ease;
      }

      .eureka-ai-selection-toolbar__button:hover {
        background: linear-gradient(135deg, #9333ea, #7e22ce);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(168, 85, 247, 0.4);
      }

      .eureka-ai-selection-toolbar__button:active {
        transform: translateY(0);
      }

      .eureka-ai-selection-toolbar__dismiss {
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.5);
        color: #ffffff;
        border: none;
        border-radius: 50%;
        font-size: 18px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        margin-right: 4px;
        flex-shrink: 0;
      }

      .eureka-ai-selection-toolbar__dismiss:hover {
        background: rgba(0, 0, 0, 0.7);
        transform: scale(1.1);
      }

      .eureka-ai-selection-toolbar__dismiss:active {
        transform: scale(0.95);
      }
    `;

    document.head.appendChild(style);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Eureka AI] DOM loaded, initializing selection toolbar');
      initSelectionToolbar();
    });
  } else {
    console.log('[Eureka AI] DOM already ready, initializing selection toolbar');
    initSelectionToolbar();
  }

  // Also try to initialize after a short delay as a fallback
  setTimeout(() => {
    if (!toolbarElement) {
      console.log('[Eureka AI] Fallback initialization of selection toolbar');
      initSelectionToolbar();
    }
  }, 1000);
})();
