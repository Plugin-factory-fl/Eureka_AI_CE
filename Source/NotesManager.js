/**
 * Notes Manager Module
 * Handles notes storage and organization with folders/categories
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'sumvid_notes';
  let notes = [];

  /**
   * Initializes the notes manager
   */
  async function initNotesManager() {
    await loadNotes();
    console.log('[Eureka AI] NotesManager initialized');
  }

  /**
   * Loads notes from storage
   */
  async function loadNotes() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      notes = result[STORAGE_KEY] || [];
    } catch (error) {
      console.error('[Eureka AI] Error loading notes:', error);
      notes = [];
    }
  }

  /**
   * Saves notes to storage
   */
  async function saveNotes() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: notes });
    } catch (error) {
      console.error('[Eureka AI] Error saving notes:', error);
    }
  }

  /**
   * Gets all notes
   */
  function getAllNotes() {
    return notes;
  }

  /**
   * Gets notes by folder
   */
  function getNotesByFolder(folder) {
    return notes.filter(note => note.folder === folder);
  }

  /**
   * Gets all folders
   */
  function getFolders() {
    const folders = new Set(notes.map(note => note.folder || 'Uncategorized'));
    return Array.from(folders).sort();
  }

  /**
   * Creates a new note
   */
  async function createNote(title, content, folder = 'Uncategorized') {
    const note = {
      id: Date.now().toString(),
      title: title || 'Untitled Note',
      content: content || '',
      folder: folder,
      timestamp: Date.now(),
      updatedAt: Date.now()
    };
    notes.push(note);
    await saveNotes();
    return note;
  }

  /**
   * Updates a note
   */
  async function updateNote(noteId, updates) {
    const noteIndex = notes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) {
      throw new Error('Note not found');
    }
    notes[noteIndex] = {
      ...notes[noteIndex],
      ...updates,
      updatedAt: Date.now()
    };
    await saveNotes();
    return notes[noteIndex];
  }

  /**
   * Deletes a note
   */
  async function deleteNote(noteId) {
    const noteIndex = notes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) {
      throw new Error('Note not found');
    }
    notes.splice(noteIndex, 1);
    await saveNotes();
  }

  /**
   * Gets a note by ID
   */
  function getNoteById(noteId) {
    return notes.find(n => n.id === noteId);
  }

  /**
   * Creates a folder
   */
  function createFolder(folderName) {
    // Folders are implicit (created when notes use them)
    // This is a placeholder for future folder management features
    return folderName;
  }

  // Export API
  window.SumVidNotesManager = {
    init: initNotesManager,
    getAllNotes,
    getNotesByFolder,
    getFolders,
    createNote,
    updateNote,
    deleteNote,
    getNoteById,
    createFolder,
    loadNotes
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotesManager);
  } else {
    initNotesManager();
  }
})();
