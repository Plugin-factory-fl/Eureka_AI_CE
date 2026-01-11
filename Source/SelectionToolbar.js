/**
 * Selection Toolbar Module
 * Highlight-to-action tooltip system for webpages and PDFs
 * Based on PromptProfile's AdapterBase selection toolbar pattern
 */

(function() {
  'use strict';

  const TOOLBAR_ID = 'sumvid-selection-toolbar';
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
    
    console.log('[SumVid] Selection toolbar initialized');
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

    // Show toolbar for webpages and PDFs (not on YouTube video pages)
    const url = window.location.href;
    if (url.includes('youtube.com/watch')) {
      hideToolbar();
      return;
    }

    selectedText = text;
    showToolbar(selection);
  }

  /**
   * Shows the selection toolbar
   */
  function showToolbar(selection) {
    if (!toolbarElement) {
      ensureToolbar();
    }

    if (!toolbarElement) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Position toolbar above selection
    toolbarElement.style.top = `${rect.top + window.scrollY - 50}px`;
    toolbarElement.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
    toolbarElement.style.transform = 'translateX(-50%)';

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
   * Handles document clicks (hide toolbar if clicking outside)
   */
  function handleDocumentClick(event) {
    if (toolbarElement && toolbarElement.contains(event.target)) {
      return; // Clicked inside toolbar
    }
    hideToolbar();
  }

  /**
   * Ensures the toolbar element exists
   */
  function ensureToolbar() {
    if (toolbarElement) return toolbarElement;

    ensureStyles();

    toolbarElement = document.createElement('div');
    toolbarElement.id = TOOLBAR_ID;

    // Create dropdown button
    const dropdownButton = document.createElement('button');
    dropdownButton.className = 'sumvid-selection-toolbar__button';
    dropdownButton.textContent = 'SumVid Actions';
    dropdownButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown();
    });

    // Create dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'sumvid-selection-toolbar__dropdown';
    
    // Action buttons
    const actions = [
      { id: 'explain', text: "Explain this like I'm 16" },
      { id: 'summarize', text: 'Summarize this paragraph' },
      { id: 'flashcard', text: 'Turn into flashcard' },
      { id: 'notes', text: 'Add to Notes' }
    ];

    actions.forEach(action => {
      const button = document.createElement('button');
      button.className = 'sumvid-selection-toolbar__action';
      button.dataset.action = action.id;
      button.textContent = action.text;
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleAction(action.id);
        hideToolbar();
        dropdown.classList.remove('is-visible');
      });
      dropdown.appendChild(button);
    });

    toolbarElement.appendChild(dropdownButton);
    toolbarElement.appendChild(dropdown);

    if (!document.body) {
      console.error('[SumVid] Cannot create selection toolbar: document.body not available');
      return null;
    }

    document.body.appendChild(toolbarElement);
    return toolbarElement;
  }

  /**
   * Toggles the dropdown menu
   */
  function toggleDropdown() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) return;

    const dropdown = toolbar.querySelector('.sumvid-selection-toolbar__dropdown');
    if (dropdown) {
      dropdown.classList.toggle('is-visible');
      
      // Update summarize button state
      const summarizeButton = dropdown.querySelector('[data-action="summarize"]');
      if (summarizeButton) {
        // Disable if less than 1 sentence (check for sentence-ending punctuation)
        const sentences = selectedText.match(/[.!?]+/g) || [];
        const hasMultipleSentences = sentences.length >= 1;
        summarizeButton.disabled = !hasMultipleSentences;
        summarizeButton.style.opacity = hasMultipleSentences ? '1' : '0.5';
        summarizeButton.style.cursor = hasMultipleSentences ? 'pointer' : 'not-allowed';
      }
    }
  }

  /**
   * Handles toolbar actions
   */
  async function handleAction(actionId) {
    if (!selectedText) return;

    try {
      switch (actionId) {
        case 'explain':
          await handleExplain();
          break;
        case 'summarize':
          await handleSummarize();
          break;
        case 'flashcard':
          await handleFlashcard();
          break;
        case 'notes':
          await handleNotes();
          break;
      }
    } catch (error) {
      console.error('[SumVid] Error handling action:', error);
    }
  }

  /**
   * Handles "Explain like I'm 16" action
   */
  async function handleExplain() {
    // Send message to background to handle explain action
    chrome.runtime.sendMessage({
      action: 'selection-explain',
      text: selectedText
    });
  }

  /**
   * Handles "Summarize paragraph" action
   */
  async function handleSummarize() {
    chrome.runtime.sendMessage({
      action: 'selection-summarize',
      text: selectedText
    });
  }

  /**
   * Handles "Turn into flashcard" action
   */
  async function handleFlashcard() {
    chrome.runtime.sendMessage({
      action: 'selection-flashcard',
      text: selectedText
    });
  }

  /**
   * Handles "Add to Notes" action
   */
  async function handleNotes() {
    chrome.runtime.sendMessage({
      action: 'selection-notes',
      text: selectedText
    });
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

      .sumvid-selection-toolbar__button {
        padding: 8px 14px;
        background: rgba(25, 118, 210, 0.95);
        color: #ffffff;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        transition: background-color 0.2s;
      }

      .sumvid-selection-toolbar__button:hover {
        background: rgba(21, 101, 192, 0.95);
      }

      .sumvid-selection-toolbar__dropdown {
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-top: 8px;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        min-width: 220px;
        display: none;
        flex-direction: column;
        overflow: hidden;
      }

      .sumvid-selection-toolbar__dropdown.is-visible {
        display: flex;
      }

      .sumvid-selection-toolbar__action {
        padding: 10px 14px;
        background: transparent;
        border: none;
        border-bottom: 1px solid #f0f0f0;
        text-align: left;
        font-size: 13px;
        color: #333333;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .sumvid-selection-toolbar__action:last-child {
        border-bottom: none;
      }

      .sumvid-selection-toolbar__action:hover:not(:disabled) {
        background: #f5f7fb;
      }

      .sumvid-selection-toolbar__action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;

    document.head.appendChild(style);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSelectionToolbar);
  } else {
    initSelectionToolbar();
  }
})();
