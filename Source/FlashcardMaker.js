/**
 * Flashcard Maker Module
 * Handles flashcard generation and display
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'sumvid_flashcards';
  let flashcards = [];

  /**
   * Initializes the flashcard maker
   */
  async function initFlashcardMaker() {
    await loadFlashcards();
    console.log('[SumVid] FlashcardMaker initialized');
  }

  /**
   * Loads flashcards from storage
   */
  async function loadFlashcards() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      flashcards = result[STORAGE_KEY] || [];
    } catch (error) {
      console.error('[SumVid] Error loading flashcards:', error);
      flashcards = [];
    }
  }

  /**
   * Saves flashcards to storage
   */
  async function saveFlashcards() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: flashcards });
    } catch (error) {
      console.error('[SumVid] Error saving flashcards:', error);
    }
  }

  /**
   * Gets all flashcards
   */
  function getAllFlashcards() {
    return flashcards;
  }

  /**
   * Creates a new flashcard set
   */
  async function createFlashcardSet(title, cards) {
    const set = {
      id: Date.now().toString(),
      title: title || 'Untitled Flashcard Set',
      cards: cards || [],
      timestamp: Date.now(),
      updatedAt: Date.now()
    };
    flashcards.push(set);
    await saveFlashcards();
    return set;
  }

  /**
   * Gets a flashcard set by ID
   */
  function getFlashcardSetById(setId) {
    return flashcards.find(set => set.id === setId);
  }

  /**
   * Deletes a flashcard set
   */
  async function deleteFlashcardSet(setId) {
    const setIndex = flashcards.findIndex(set => set.id === setId);
    if (setIndex === -1) {
      throw new Error('Flashcard set not found');
    }
    flashcards.splice(setIndex, 1);
    await saveFlashcards();
  }

  // Export API
  window.SumVidFlashcardMaker = {
    init: initFlashcardMaker,
    getAllFlashcards,
    createFlashcardSet,
    getFlashcardSetById,
    deleteFlashcardSet,
    loadFlashcards
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFlashcardMaker);
  } else {
    initFlashcardMaker();
  }
})();
