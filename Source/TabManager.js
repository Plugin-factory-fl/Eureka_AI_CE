/**
 * Tab Manager Module
 * Handles tab switching and content visibility management
 */

(function() {
  'use strict';

  class TabManager {
    constructor(tabButtons, tabContents) {
      this.tabButtons = Array.isArray(tabButtons) ? tabButtons : Array.from(tabButtons || []);
      this.tabContents = Array.isArray(tabContents) ? tabContents : Array.from(tabContents || []);
      this.activeTab = 'chat';
      this.onTabChangeCallbacks = [];
      
      this.init();
    }

    init() {
      // Add event listeners to tab buttons
      this.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchTab(btn.dataset.tab);
        });
      });
      
      // Ensure Chat tab is active by default
      this.switchTab('chat');
    }

    switchTab(tabName) {
      console.log('[TabManager] Switching to tab:', tabName);
      this.activeTab = tabName;
      
      // Update tab buttons
      this.tabButtons.forEach(btn => {
        if (btn.dataset.tab === tabName) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      
      // Update tab contents - hide all first by removing active class
      // CSS will handle display via .tab-content.active selector
      this.tabContents.forEach(content => {
        content.classList.remove('active');
        // Aggressively remove all inline display styles to let CSS handle it
        content.style.removeProperty('display');
        content.style.removeProperty('visibility');
        content.style.removeProperty('opacity');
      });
      
      // Show only the active tab
      const activeTabContent = document.getElementById(`tab-${tabName}`);
      console.log('[TabManager] Active tab content element:', activeTabContent);
      if (activeTabContent) {
        // Aggressively remove all inline display styles first
        activeTabContent.style.removeProperty('display');
        activeTabContent.style.removeProperty('visibility');
        activeTabContent.style.removeProperty('opacity');
        activeTabContent.classList.add('active');
        console.log('[TabManager] Active class added, CSS .tab-content.active should handle display');
        
        // Force a reflow to ensure CSS applies
        void activeTabContent.offsetHeight;
        
        // Remove collapsed class and ensure visibility for content sections when tab is active
        if (tabName === 'flashcards') {
          const flashcardContent = activeTabContent.querySelector('#flashcard-content');
          const flashcardContainer = activeTabContent.querySelector('#flashcard-container');
          const flashcardList = activeTabContent.querySelector('#flashcard-list');
          const flashcardEmpty = activeTabContent.querySelector('#flashcard-empty');
          console.log('[TabManager] Flashcard elements:', {
            content: !!flashcardContent,
            container: !!flashcardContainer,
            list: !!flashcardList,
            empty: !!flashcardEmpty
          });
          if (flashcardContent) {
            flashcardContent.classList.remove('collapsed');
            flashcardContent.style.display = 'block';
            flashcardContent.style.visibility = 'visible';
            flashcardContent.style.opacity = '1';
          }
          if (flashcardContainer) {
            flashcardContainer.style.display = 'block';
            flashcardContainer.style.visibility = 'visible';
          }
          if (flashcardList) {
            flashcardList.style.display = 'block';
          }
          if (flashcardEmpty) {
            flashcardEmpty.style.display = 'block';
          }
        } else if (tabName === 'quiz') {
          const quizContent = activeTabContent.querySelector('#quiz-content');
          const quizContainer = activeTabContent.querySelector('#quiz-container');
          const quizQuestions = activeTabContent.querySelector('#quiz-questions-container');
          const quizEmpty = activeTabContent.querySelector('#quiz-empty');
          console.log('[TabManager] Quiz elements:', {
            content: !!quizContent,
            container: !!quizContainer,
            questions: !!quizQuestions,
            empty: !!quizEmpty
          });
          if (quizContent) {
            quizContent.classList.remove('collapsed');
            quizContent.style.display = 'block';
            quizContent.style.visibility = 'visible';
            quizContent.style.opacity = '1';
          }
          if (quizContainer) {
            quizContainer.style.display = 'block';
            quizContainer.style.visibility = 'visible';
          }
          if (quizQuestions) {
            quizQuestions.style.display = 'block';
          }
          if (quizEmpty) {
            quizEmpty.style.display = 'block';
          }
        } else if (tabName === 'notes') {
          const notesContent = activeTabContent.querySelector('#notes-content');
          const notesContainer = activeTabContent.querySelector('#notes-container');
          const notesList = activeTabContent.querySelector('#notes-list');
          const noteEmpty = activeTabContent.querySelector('#note-empty');
          console.log('[TabManager] Notes elements:', {
            content: !!notesContent,
            container: !!notesContainer,
            list: !!notesList,
            empty: !!noteEmpty
          });
          if (notesContent) {
            notesContent.classList.remove('collapsed');
            notesContent.style.display = 'block';
            notesContent.style.visibility = 'visible';
            notesContent.style.opacity = '1';
          }
          if (notesContainer) {
            notesContainer.style.display = 'block';
            notesContainer.style.visibility = 'visible';
          }
          if (notesList) {
            notesList.style.display = 'block';
          }
          if (noteEmpty) {
            noteEmpty.classList.remove('hidden');
            noteEmpty.style.display = 'block';
            noteEmpty.style.visibility = 'visible';
          }
        }
      } else {
        console.error('[TabManager] Active tab content not found for:', tabName);
      }
      
      // Call registered callbacks
      this.onTabChangeCallbacks.forEach(callback => {
        try {
          callback(tabName);
        } catch (error) {
          console.error('[TabManager] Error in tab change callback:', error);
        }
      });
      
      // Regenerate suggestions when switching to chat tab
      if (tabName === 'chat' && window.chatManager) {
        console.log('[TabManager] Regenerating chat suggestions');
        window.chatManager.generateSuggestions();
      }
      
      // Render content when switching to flashcards, quiz, or notes tabs
      if (tabName === 'flashcards') {
        console.log('[TabManager] Rendering flashcards, controller exists:', !!window.flashcardUIController);
        if (window.flashcardUIController) {
          window.flashcardUIController.renderFlashcards().catch(err => {
            console.error('[TabManager] Error rendering flashcards:', err);
          });
        } else {
          console.warn('[TabManager] FlashcardUIController not available');
        }
      }
      
      if (tabName === 'quiz') {
        console.log('[TabManager] Rendering quiz, generator exists:', !!window.contentGenerator);
        const quizContent = document.getElementById('quiz-content');
        if (quizContent) {
          quizContent.classList.remove('collapsed');
          quizContent.style.display = 'block';
          console.log('[TabManager] Quiz content made visible');
        } else {
          console.warn('[TabManager] Quiz content element not found');
        }
      }
      
      if (tabName === 'notes') {
        console.log('[TabManager] Rendering notes, controller exists:', !!window.notesUIController);
        if (window.notesUIController) {
          const notesFilter = document.getElementById('notes-filter');
          const folder = notesFilter ? notesFilter.value : 'all';
          console.log('[TabManager] Rendering notes for folder:', folder);
          window.notesUIController.renderNotes(folder).catch(err => {
            console.error('[TabManager] Error rendering notes:', err);
          });
        } else {
          console.warn('[TabManager] NotesUIController not available');
        }
      }
    }

    getActiveTab() {
      return this.activeTab;
    }

    onTabChange(callback) {
      if (typeof callback === 'function') {
        this.onTabChangeCallbacks.push(callback);
      }
    }
  }

  // Export to global scope
  window.TabManager = TabManager;
})();
