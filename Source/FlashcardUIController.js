/**
 * Flashcard UI Controller Module
 * Handles flashcard UI initialization and rendering
 */

(function() {
  'use strict';

  class FlashcardUIController {
    constructor(options = {}) {
      this.flashcardContainer = options.flashcardContainer;
      this.flashcardContent = options.flashcardContent;
      this.flashcardList = options.flashcardList;
      this.flashcardEmpty = options.flashcardEmpty;
      this.currentFlashcardSet = null;
      this.currentFlashcardIndex = 0;
    }

    async initializeFlashcardUI() {
      const generateFlashcardButton = document.getElementById('generate-flashcard-button');
      
      if (!this.flashcardContainer || !generateFlashcardButton) {
        console.warn('[Eureka AI] Flashcard UI elements not found');
        return;
      }
      
      generateFlashcardButton.addEventListener('click', async () => {
        await this.handleGenerateFlashcards();
      });
      
      await this.renderFlashcards();
    }

    async handleGenerateFlashcards() {
      const generateButton = document.getElementById('generate-flashcard-button');
      if (!generateButton || !window.SumVidFlashcardMaker) return;
      
      const stored = await chrome.storage.local.get(['currentContentInfo', 'currentVideoInfo']);
      const contentInfo = stored.currentContentInfo || stored.currentVideoInfo;
      
      if (!contentInfo) {
        alert('No content available to generate flashcards from.');
        return;
      }
      
      const contentType = contentInfo.type || 'video';
      const contentText = contentType === 'video' 
        ? (contentInfo.transcript || '')
        : (contentInfo.text || '');
      
      if (!contentText || contentText.length < 50) {
        alert('Content is too short to generate flashcards. Please ensure you have a summary or transcript available.');
        return;
      }
      
      if (window.usageManager) {
        const limitReached = await window.usageManager.checkUsageLimit();
        if (limitReached) {
          alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
          return;
        }
      }
      
      generateButton.disabled = true;
      generateButton.textContent = 'Generating...';
      
      if (this.flashcardContent) {
        this.flashcardContent.classList.remove('collapsed');
        this.flashcardContent.style.display = 'block';
        if (this.flashcardList) {
          this.flashcardList.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-secondary);">Generating flashcards...</p>';
        }
      }
      if (this.flashcardContainer) {
        this.flashcardContainer.classList.remove('hidden');
      }
      
      try {
        const message = {
          action: 'generate-flashcards',
          contentType: contentType,
          title: contentInfo.title || (contentType === 'video' ? 'unknown video' : contentType === 'pdf' ? 'unknown document' : 'unknown page')
        };
        
        if (contentType === 'video') {
          message.transcript = contentText;
        } else {
          message.text = contentText;
        }
        
        const response = await chrome.runtime.sendMessage(message);
        
        if (response?.error) {
          alert(response.error);
          if (this.flashcardList) {
            this.flashcardList.innerHTML = `<p style="text-align: center; padding: 20px; color: #e74c3c;">Failed to generate flashcards: ${response.error}</p>`;
          }
        } else if (response?.success && response?.flashcards) {
          const setTitle = `${contentInfo.title || 'Untitled'} - Flashcards`;
          await window.SumVidFlashcardMaker.createFlashcardSet(setTitle, response.flashcards);
          await this.renderFlashcards();
          if (this.flashcardContent) {
            this.flashcardContent.classList.remove('collapsed');
            this.flashcardContent.style.display = 'block';
          }
        }
        
        if (window.usageManager) {
          await window.usageManager.updateStatusCards();
        }
      } catch (error) {
        console.error('[Eureka AI] Flashcard generation error:', error);
        alert('Failed to generate flashcards. Please try again.');
        if (this.flashcardList) {
          this.flashcardList.innerHTML = '<p style="text-align: center; padding: 20px; color: #e74c3c;">Failed to generate flashcards.</p>';
        }
      } finally {
        generateButton.disabled = false;
        generateButton.textContent = 'Generate Flashcards';
      }
    }
  
    async renderFlashcards() {
      console.log('[FlashcardUIController] renderFlashcards called');
      console.log('[FlashcardUIController] SumVidFlashcardMaker available:', !!window.SumVidFlashcardMaker);
      console.log('[FlashcardUIController] flashcardList:', !!this.flashcardList, 'flashcardEmpty:', !!this.flashcardEmpty);
      
      if (!window.SumVidFlashcardMaker) {
        console.warn('[FlashcardUIController] SumVidFlashcardMaker not available');
        return;
      }
      
      if (!this.flashcardList || !this.flashcardEmpty) {
        console.warn('[FlashcardUIController] Missing flashcardList or flashcardEmpty elements');
        return;
      }
      
      await window.SumVidFlashcardMaker.loadFlashcards();
      const sets = window.SumVidFlashcardMaker.getAllFlashcards();
      console.log('[FlashcardUIController] Loaded flashcard sets:', sets.length);
      
      const stored = await chrome.storage.local.get(['currentContentInfo', 'currentVideoInfo']);
      const contentInfo = stored.currentContentInfo || stored.currentVideoInfo;
      const currentTitle = contentInfo?.title || '';
      console.log('[FlashcardUIController] Current content title:', currentTitle);
      
      const relevantSets = currentTitle 
        ? sets.filter(set => set.title.includes(currentTitle))
        : sets.slice(-1);
      
      console.log('[FlashcardUIController] Relevant sets:', relevantSets.length);
      
      if (relevantSets.length === 0) {
        console.log('[FlashcardUIController] No relevant sets, showing empty state');
        if (this.flashcardList) {
          this.flashcardList.innerHTML = '';
        }
        if (this.flashcardEmpty) {
          this.flashcardEmpty.classList.remove('hidden');
          this.flashcardEmpty.style.display = 'block';
        }
        this.currentFlashcardSet = null;
        this.currentFlashcardIndex = 0;
      } else {
        console.log('[FlashcardUIController] Found relevant sets, rendering slideshow');
        if (this.flashcardEmpty) {
          this.flashcardEmpty.classList.add('hidden');
          this.flashcardEmpty.style.display = 'none';
        }
        
        this.currentFlashcardSet = relevantSets[0];
        this.currentFlashcardIndex = 0;
        
        this.renderFlashcardSlideshow();
      }
    }
  
    renderFlashcardSlideshow() {
      console.log('[FlashcardUIController] renderFlashcardSlideshow called');
      console.log('[FlashcardUIController] currentFlashcardSet:', this.currentFlashcardSet);
      console.log('[FlashcardUIController] flashcardList:', this.flashcardList);
      
      if (!this.currentFlashcardSet || !this.flashcardList) {
        console.warn('[FlashcardUIController] Missing currentFlashcardSet or flashcardList');
        return;
      }
      
      // Ensure flashcard list is visible
      if (this.flashcardList) {
        this.flashcardList.style.display = 'block';
        this.flashcardList.style.visibility = 'visible';
      }
      
      const cards = this.currentFlashcardSet.cards.slice(0, 10);
      console.log('[FlashcardUIController] Cards to display:', cards.length);
      
      if (cards.length === 0) {
        console.log('[FlashcardUIController] No cards, showing empty message');
        this.flashcardList.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-secondary);">No flashcards available.</p>';
        return;
      }
      
      const currentCard = cards[this.currentFlashcardIndex];
      if (!currentCard) {
        console.warn('[FlashcardUIController] No current card at index:', this.currentFlashcardIndex);
        return;
      }
      
      console.log('[FlashcardUIController] Rendering card:', currentCard);
      
      const cardElement = document.createElement('div');
      cardElement.className = 'flashcard-card';
      const frontText = currentCard.front || currentCard.question || 'Front';
      const backText = currentCard.back || currentCard.answer || 'Back';
      cardElement.innerHTML = `
        <div class="flashcard-front">${frontText}</div>
        <div class="flashcard-back">${backText}</div>
      `;
      
      cardElement.addEventListener('click', () => {
        cardElement.classList.toggle('flipped');
      });
      
      this.flashcardList.innerHTML = '';
      this.flashcardList.appendChild(cardElement);
      console.log('[FlashcardUIController] Card element added to list');
      
      // Navigation buttons
      const navContainer = document.createElement('div');
      navContainer.className = 'flashcard-nav';
      navContainer.innerHTML = `
        <button class="flashcard-nav-btn" id="flashcard-prev" ${this.currentFlashcardIndex === 0 ? 'disabled' : ''}>←</button>
        <span class="flashcard-counter">${this.currentFlashcardIndex + 1}/${cards.length}</span>
        <button class="flashcard-nav-btn" id="flashcard-next" ${this.currentFlashcardIndex === cards.length - 1 ? 'disabled' : ''}>→</button>
      `;
      
      const prevBtn = navContainer.querySelector('#flashcard-prev');
      const nextBtn = navContainer.querySelector('#flashcard-next');
      
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (this.currentFlashcardIndex > 0) {
            this.currentFlashcardIndex--;
            this.renderFlashcardSlideshow();
          }
        });
      }
      
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (this.currentFlashcardIndex < cards.length - 1) {
            this.currentFlashcardIndex++;
            this.renderFlashcardSlideshow();
          }
        });
      }
      
      this.flashcardList.appendChild(navContainer);
    }
  }

  // Export to global scope
  window.FlashcardUIController = FlashcardUIController;
})();
