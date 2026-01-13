const DEFAULT_CONTEXT = {
  summary: '', // 5th grade, 200-400 words is default prompt
  quiz: ''    // 'easy' is default
};

document.addEventListener('DOMContentLoaded', async () => {
  // Check if chrome.runtime is available
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.error('Chrome runtime not available - extension may not be properly loaded');
    document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Extension not properly loaded. Please refresh the page.</div>';
    return;
  }

  const loadingState = document.getElementById('loading');
  const noVideoState = document.getElementById('no-video');
  const videoInfoState = document.getElementById('video-info');
  const videoTitle = document.getElementById('video-title');
  const channelName = document.getElementById('channel-name');
  const summaryContainer = document.getElementById('summary-container');
  const summaryContent = document.getElementById('summary-content');
  const summaryHeader = document.getElementById('summary-header');
  const collapseButton = document.querySelector('.collapse-button');
  const themeToggle = document.getElementById('theme-toggle');
  const flashcardContainer = document.getElementById('flashcard-container');
  const flashcardContent = document.getElementById('flashcard-content');
  const flashcardHeader = document.getElementById('flashcard-header');
  const flashcardList = document.getElementById('flashcard-list');
  const flashcardEmpty = document.getElementById('flashcard-empty');

  const quizContainer = document.getElementById('quiz-container');
  const quizContent = document.getElementById('quiz-content');
  const quizHeader = document.getElementById('quiz-header');

  const chatSection = document.getElementById('chat-section');
  const questionInput = document.getElementById('question-input');
  const sendQuestionButton = document.getElementById('send-question');
  const chatMessages = document.getElementById('chat-messages');
  
  const summaryContextBar = document.getElementById('summary-context-bar');
  const summaryContextInput = document.getElementById('summary-context-input');
  const summaryContextSubmit = document.getElementById('summary-context-submit');
  const quizContextBar = document.getElementById('quiz-context-bar');
  const quizContextInput = document.getElementById('quiz-context-input');
  const quizContextSubmit = document.getElementById('quiz-context-submit');
  
  let currentVideoInfo = null;
  let currentQuestionIndex = 0;
  let totalQuestions = 0;
  let userContext = { summary: '', quiz: '' };
  let currentFlashcardIndex = 0;
  let currentFlashcardSet = null;

  // Memory management constants
  const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Function to get video ID from URL
  function getVideoId(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('v');
    } catch (error) {
      console.error('Error parsing video URL:', error);
      return null;
    }
  }

  // Function to save generated content to storage
  async function saveGeneratedContent(videoId, type, content) {
    if (!videoId) return;
    
    const key = `${type}_${videoId}`;
    const data = {
      content: content,
      timestamp: Date.now(),
      videoId: videoId
    };
    
    try {
      await chrome.storage.local.set({ [key]: data });
      console.log(`Saved ${type} for video ${videoId}`);
    } catch (error) {
      console.error(`Error saving ${type}:`, error);
    }
  }

  // Function to load generated content from storage
  async function loadGeneratedContent(videoId, type) {
    if (!videoId) return null;
    
    const key = `${type}_${videoId}`;
    
    try {
      const result = await chrome.storage.local.get([key]);
      const data = result[key];
      
      if (!data) return null;
      
      // Check if content has expired
      if (Date.now() - data.timestamp > CACHE_EXPIRY_TIME) {
        // Remove expired content
        await chrome.storage.local.remove([key]);
        return null;
      }
      
      return data.content;
    } catch (error) {
      console.error(`Error loading ${type}:`, error);
      return null;
    }
  }

  // Function to clear expired cached content
  async function clearExpiredContent() {
    try {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];
      
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('summary_') || key.startsWith('quiz_') || key.startsWith('chat_')) {
          if (value.timestamp && Date.now() - value.timestamp > CACHE_EXPIRY_TIME) {
            keysToRemove.push(key);
          }
        }
      }
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`Cleared ${keysToRemove.length} expired cache entries`);
      }
    } catch (error) {
      console.error('Error clearing expired content:', error);
    }
  }

  // Clear expired content on startup
  clearExpiredContent();

  // Function to show tooltip on regenerate quiz button
  function showRegenerateTooltip() {
    const regenerateButton = document.getElementById('regenerate-quiz-button');
    if (!regenerateButton) return;

    // Remove any existing tooltip
    const existingTooltip = document.querySelector('.regenerate-tooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'regenerate-tooltip';
    tooltip.textContent = 'Generate a new quiz!';
    
    // Position tooltip relative to button
    document.body.appendChild(tooltip);
    
    const buttonRect = regenerateButton.getBoundingClientRect();
    tooltip.style.position = 'fixed';
    tooltip.style.top = (buttonRect.bottom + 8) + 'px';
    tooltip.style.left = (buttonRect.left - 60) + 'px'; // More centered positioning
    
    // Show tooltip with animation
    setTimeout(() => {
      tooltip.classList.add('show');
    }, 100);

    // Hide tooltip when user hovers over it (indicates they've seen it)
    const hideTooltip = () => {
      tooltip.classList.remove('show');
      setTimeout(() => {
        tooltip.remove();
      }, 300);
      tooltip.removeEventListener('mouseenter', hideTooltip);
      document.removeEventListener('click', hideTooltip);
    };

    // Hide on hover (user acknowledgment) or click anywhere
    tooltip.addEventListener('mouseenter', hideTooltip);
    setTimeout(() => {
      document.addEventListener('click', hideTooltip);
    }, 500);
  }

  // Function to send message with timeout and retries
  async function sendMessageWithTimeout(message, maxRetries = 3) {
    return new Promise((resolve) => {
      let retryCount = 0;

      function attemptSend() {
        try {
          // Check if chrome.runtime is available
          if (typeof chrome === 'undefined' || !chrome.runtime) {
            console.warn('Chrome runtime not available');
            resolve({ error: 'Chrome runtime not available' });
            return;
          }

          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
              console.warn('Chrome runtime error in tabs.query:', chrome.runtime.lastError);
              handleRetry();
              return;
            }

            if (!tabs?.[0]?.id) {
              console.warn('No active tab found');
              resolve({ error: 'No active tab found' });
              return;
            }
            
            chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('Chrome runtime error in sendMessage:', chrome.runtime.lastError);
                handleRetry();
                return;
              }
              resolve(response || { success: true });
            });
          });
        } catch (error) {
          console.warn('Error sending message:', error);
          handleRetry();
        }
      }

      function handleRetry() {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`Retrying message send (attempt ${retryCount + 1}/${maxRetries})...`);
          setTimeout(attemptSend, 1000 * retryCount); // Exponential backoff
        } else {
          resolve({ error: 'Failed to send message after multiple attempts' });
        }
      }

      attemptSend();
    });
  }

  function showLoadingIndicator(container) {
    const statusIndicator = container.querySelector('.status-indicator');
    if (statusIndicator) {
      const spinner = statusIndicator.querySelector('.loading-spinner');
      const badge = statusIndicator.querySelector('.completion-badge');
      if (spinner && badge) {
        spinner.style.display = 'block';
        badge.style.display = 'none';
      }
    }
  }

  function showCompletionBadge(container) {
    const statusIndicator = container.querySelector('.status-indicator');
    if (statusIndicator) {
      const spinner = statusIndicator.querySelector('.loading-spinner');
      const badge = statusIndicator.querySelector('.completion-badge');
      if (spinner && badge) {
        spinner.style.display = 'none';
        badge.style.display = 'block';
      }
    }
  }


  // Theme handling
  if (themeToggle) {
    chrome.storage.local.get(['darkMode'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('Error getting dark mode setting:', chrome.runtime.lastError);
        return;
      }
      const isDarkMode = result.darkMode || false;
      themeToggle.checked = isDarkMode;
      document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    });

    themeToggle.addEventListener('change', () => {
      const isDarkMode = themeToggle.checked;
      document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
      chrome.storage.local.set({ darkMode: isDarkMode }, () => {
        if (chrome.runtime.lastError) {
          console.warn('Error saving dark mode setting:', chrome.runtime.lastError);
        }
      });
    });
  }

  // Summary collapse handling
  summaryHeader?.addEventListener('click', (e) => {
    // Don't collapse if clicking on the regenerate button or context popup
    if (e.target.closest('.regenerate-button') || e.target.closest('.context-bar')) {
      return;
    }
    
    const isCollapsed = summaryContent.classList.contains('collapsed');
    const summaryCollapseButton = summaryHeader.querySelector('.collapse-button');
    if (isCollapsed) {
      summaryContent.classList.remove('collapsed');
      summaryCollapseButton?.classList.remove('collapsed');
    } else {
      summaryContent.classList.add('collapsed');
      summaryCollapseButton?.classList.add('collapsed');
    }
  });

  // Quiz collapse handling
  quizHeader?.addEventListener('click', (e) => {
    // Don't collapse if clicking on the regenerate button or context popup
    if (e.target.closest('.regenerate-button') || e.target.closest('.context-bar')) {
      return;
    }
    
    const isCollapsed = quizContent.classList.contains('collapsed');
    const quizCollapseButton = quizHeader.querySelector('.collapse-button');
    if (isCollapsed) {
      quizContent.classList.remove('collapsed');
      quizCollapseButton?.classList.remove('collapsed');
    } else {
      quizContent.classList.add('collapsed');
      quizCollapseButton?.classList.add('collapsed');
    }
  });

  // Chat section is always visible (no collapse handling needed)

  // Function to add a message to the chat
  // Playful chat message
  let playfulMessageShown = false;

  function showPlayfulMessage() {
    if (!chatMessages || playfulMessageShown || chatMessages.children.length > 0) return;
    
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
    chatMessages.appendChild(messageElement);
    playfulMessageShown = true;
  }

  function hidePlayfulMessage() {
    if (!chatMessages) return;
    const playfulMsg = chatMessages.querySelector('.playful-message');
    if (playfulMsg) {
      playfulMsg.remove();
      playfulMessageShown = false;
    }
  }

  function addChatMessage(message, isUser = false) {
    // Hide playful message when user sends first message
    if (isUser) {
      hidePlayfulMessage();
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${isUser ? 'user' : 'assistant'}`;
    messageElement.textContent = message;
    chatMessages?.appendChild(messageElement);
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Save chat to cache after adding message
    saveChatToCache();
  }

  // Function to save current chat to cache
  async function saveChatToCache() {
    if (!currentVideoInfo) return;
    
    const videoId = getVideoId(currentVideoInfo.url);
    if (!videoId || !chatMessages) return;
    
    const messages = Array.from(chatMessages.children).map(messageEl => ({
      text: messageEl.textContent,
      isUser: messageEl.classList.contains('user')
    }));
    
    await saveGeneratedContent(videoId, 'chat', messages);
  }

  // Function to load cached chat
  async function loadCachedChat(videoId) {
    if (!videoId || !chatMessages) return;
    
    const cachedChat = await loadGeneratedContent(videoId, 'chat');
    if (cachedChat && Array.isArray(cachedChat)) {
      chatMessages.innerHTML = '';
      playfulMessageShown = false;
      cachedChat.forEach(message => {
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.isUser ? 'user' : 'assistant'}`;
        messageElement.textContent = message.text;
        chatMessages.appendChild(messageElement);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  // Function to load cached quiz
  async function loadCachedQuiz(videoId, transcript, summary) {
    if (!videoId) return;
    
    const cachedQuiz = await loadGeneratedContent(videoId, 'quiz');
    if (cachedQuiz) {
      console.log('Loading cached quiz');
      quizContainer?.classList.remove('hidden');
      
      if (quizContent) {
        quizContent.innerHTML = cachedQuiz;
        quizContent.classList.add('collapsed');
      }
      quizHeader?.querySelector('.collapse-button')?.classList.add('collapsed');
      
      // Initialize question navigation for cached quiz
      initializeQuizNavigation();
      showCompletionBadge(quizContainer);
    }
    // Don't auto-generate - user must click "Make Test" button
  }

  // Generate quiz questions
  async function generateQuiz(transcript, summary, context = '') {
    try {
      console.log('Starting quiz generation...');
      quizContainer?.classList.remove('hidden');
      
      if (quizContent) {
        quizContent.textContent = 'Generating quiz questions...';
      }
      
      // Show loading indicator
      showLoadingIndicator(quizContainer);
      
      const effectiveContext = context || userContext.quiz || '';
      
      // Check if chrome.runtime is available
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        throw new Error('Chrome runtime not available');
      }
      
      const response = await chrome.runtime.sendMessage({
        action: 'generate-quiz',
        transcript: transcript,
        summary: summary,
        context: effectiveContext
      });

      if (response?.error) {
        console.error('Quiz generation error:', response.error);
        if (quizContent) {
          quizContent.textContent = `Failed to generate quiz: ${response.error}`;
        }
        showCompletionBadge(quizContainer);
        return;
      }

      if (response?.success && response?.questions) {
        console.log('Quiz generated successfully');
        
        if (quizContent) {
          quizContent.innerHTML = response.questions;
          quizContent.classList.add('collapsed');
        }
        quizHeader?.querySelector('.collapse-button')?.classList.add('collapsed');
        
        // Initialize quiz navigation
        initializeQuizNavigation();
        addSubmitButton();
        
        // Save quiz to cache
        const videoId = currentVideoInfo ? getVideoId(currentVideoInfo.url) : null;
        if (videoId) {
          await saveGeneratedContent(videoId, 'quiz', response.questions);
        }
        
        // Show completion badge
        showCompletionBadge(quizContainer);
        
        // Show regenerate button, hide make test button
        const makeTestButton = document.getElementById('make-test-button');
        const regenerateQuizButton = document.getElementById('regenerate-quiz-button');
        if (makeTestButton) makeTestButton.style.display = 'none';
        if (regenerateQuizButton) regenerateQuizButton.style.display = 'block';
        
        // Make sure content is visible
        if (quizContent) {
          quizContent.style.display = 'block';
        }
      } else {
        throw new Error('Invalid quiz response format');
      }
    } catch (error) {
      console.error('Quiz generation error:', error);
      if (quizContent) {
        quizContent.textContent = `Failed to generate quiz: ${error.message}`;
        quizContent.style.display = 'block';
      }
      showCompletionBadge(quizContainer);
    }
  }

  // Handle question submission
  async function handleQuestionSubmit() {
    const question = questionInput?.value.trim();
    if (!question) return;

    // Check usage limit and subscription status before processing question
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
        limitReached = await checkUsageLimit();
      }
    } else {
      // Not logged in, check local storage
      limitReached = await checkUsageLimit();
    }
    
    if (limitReached && !isPremium) {
      // Show styled message with upgrade link
      const messageText = "You're out of uses for Eureka AI! Wait 24 hours for 10 more uses or ";
      const upgradeLinkText = "UPGRADE TO PRO";
      const messageAfterLink = " for unlimited access.";
      
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message assistant usage-limit-message';
      messageElement.innerHTML = `${messageText}<a href="#" class="upgrade-link" id="chat-upgrade-link">${upgradeLinkText}</a>${messageAfterLink}`;
      chatMessages?.appendChild(messageElement);
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
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

    // Add user's question to chat
    addChatMessage(question, true);
    if (questionInput) {
      questionInput.value = '';
    }

    // Show loading state
    if (chatSection) showLoadingIndicator(chatSection);

    try {
      // Check if chrome.runtime is available
      // Note: Usage is tracked and incremented on the backend API
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        throw new Error('Chrome runtime not available');
      }
      
      const response = await chrome.runtime.sendMessage({
        action: 'ask-question',
        question,
        transcript: currentVideoInfo?.transcript,
        summary: summaryContent?.textContent
      });

      if (response?.error) {
        addChatMessage(`Error: ${response.error}`);
      } else {
        addChatMessage(response.answer);
      }

      // Update status cards after successful question
      await updateStatusCards();
    } catch (error) {
      console.error('Error submitting question:', error);
      addChatMessage('Sorry, I encountered an error while processing your question.');
    }

    // Show completion state
    if (chatSection) showCompletionBadge(chatSection);
  }

  // Event listeners for question input
  sendQuestionButton?.addEventListener('click', handleQuestionSubmit);
  questionInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleQuestionSubmit();
    }
  });

  // Rotating placeholder text for question input
  const placeholders = [
    "Ask me to summarize",
    "Ask me to clarify",
    "Ask a unique question"
  ];
  let placeholderIndex = 0;
  let placeholderInterval = null;

  function startPlaceholderRotation() {
    if (placeholderInterval || !questionInput) return;
    placeholderInterval = setInterval(() => {
      if (questionInput && !questionInput.value && document.activeElement !== questionInput) {
        placeholderIndex = (placeholderIndex + 1) % placeholders.length;
        questionInput.placeholder = placeholders[placeholderIndex];
      }
    }, 2000);
  }

  function stopPlaceholderRotation() {
    if (placeholderInterval) {
      clearInterval(placeholderInterval);
      placeholderInterval = null;
    }
  }

  // Initialize placeholder rotation
  if (questionInput) {
    questionInput.placeholder = placeholders[0];
    startPlaceholderRotation();
    
    // Stop rotation when input is focused
    questionInput.addEventListener('focus', () => {
      stopPlaceholderRotation();
    });
    
    // Resume rotation when input is blurred (if empty)
    questionInput.addEventListener('blur', () => {
      if (!questionInput.value) {
        startPlaceholderRotation();
      }
    });
    
    // Stop rotation if user types something
    questionInput.addEventListener('input', () => {
      if (questionInput.value) {
        stopPlaceholderRotation();
      } else if (document.activeElement !== questionInput) {
        startPlaceholderRotation();
      }
    });
  }

  // Get Pro button text alternation
  const getProButton = document.getElementById('get-pro-button');
  const getProTexts = ['Get Pro', 'Get unlimited usage'];
  let getProTextIndex = 0;
  let getProInterval = null;

  function startGetProTextRotation() {
    if (getProInterval || !getProButton) return;
    getProInterval = setInterval(() => {
      if (getProButton) {
        getProTextIndex = (getProTextIndex + 1) % getProTexts.length;
        getProButton.textContent = getProTexts[getProTextIndex];
      }
    }, 3500); // Change every 3.5 seconds
  }

  if (getProButton) {
    getProButton.textContent = getProTexts[0];
    startGetProTextRotation();
  }

  // Info button handler
  const infoButton = document.getElementById('eureka-info-btn');
  const infoDialog = document.getElementById('eureka-info-dialog');
  const infoDialogGetProBtn = document.getElementById('info-dialog-get-pro-btn');
  
  if (infoButton && infoDialog) {
    infoButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      infoDialog.showModal();
    });
  }

  // Info dialog close handlers
  if (infoDialog) {
    const closeButtons = infoDialog.querySelectorAll('.modal__close, button[value="cancel"]');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        infoDialog.close();
      });
    });

    infoDialog.addEventListener('click', (e) => {
      if (e.target === infoDialog) {
        infoDialog.close();
      }
    });

    infoDialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        infoDialog.close();
      }
    });
  }

  // Info dialog GET PRO button handler
  if (infoDialogGetProBtn) {
    infoDialogGetProBtn.addEventListener('click', async () => {
      const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
      const stored = await chrome.storage.local.get(['sumvid_auth_token']);
      const token = stored.sumvid_auth_token;
      
      if (!token) {
        alert('Please log in to upgrade to Pro');
        return;
      }

      // Disable button to prevent double-clicks
      infoDialogGetProBtn.disabled = true;
      const originalText = infoDialogGetProBtn.textContent;
      infoDialogGetProBtn.textContent = 'Loading...';

      try {
        console.log('[Info Dialog Get Pro] Creating checkout session...');
        const response = await fetch(`${BACKEND_URL}/api/checkout/create-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
        });

        console.log('[Info Dialog Get Pro] Response status:', response.status);
        
        if (!response.ok) {
          let errorMessage = `Server error: ${response.status}`;
          try {
            const errorData = await response.json();
            console.error('[Info Dialog Get Pro] Error response:', errorData);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch (parseError) {
            const text = await response.text().catch(() => '');
            console.error('[Info Dialog Get Pro] Non-JSON error response:', text);
            errorMessage = text || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('[Info Dialog Get Pro] Checkout session created:', data);
        
        if (data.url) {
          window.open(data.url, '_blank');
          // Reset button after successful checkout session creation
          infoDialogGetProBtn.disabled = false;
          infoDialogGetProBtn.textContent = originalText;
          infoDialog.close();
        } else {
          console.warn('[Info Dialog Get Pro] No checkout URL in response:', data);
          alert('Upgrade feature coming soon!');
          infoDialogGetProBtn.disabled = false;
          infoDialogGetProBtn.textContent = originalText;
        }
      } catch (error) {
        console.error('[Info Dialog Get Pro] Error details:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        alert(`Failed to initiate upgrade: ${errorMessage}`);
        infoDialogGetProBtn.disabled = false;
        infoDialogGetProBtn.textContent = originalText;
      }
    });
  }

  // Function to format duration in MM:SS or HH:MM:SS
  function formatDuration(seconds) {
    if (!seconds) return '--:--';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Function to calculate estimated reading time
  function calculateReadingTime(text, returnRawMinutes = false) {
    if (!text) return returnRawMinutes ? 0 : '-- min';
    
    // Create a temporary element to parse the HTML and get text content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    const cleanText = tempDiv.textContent || tempDiv.innerText || "";
  
    // Average reading speed (words per minute)
    const wordsPerMinute = 200;
    const wordCount = cleanText.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount === 0) return returnRawMinutes ? 0 : '-- min';
  
    const minutes = Math.ceil(wordCount / wordsPerMinute);
    
    return returnRawMinutes ? minutes : `${minutes} min`;
  }

  // Function to update the info center
  function updateInfoCenter(videoDuration, summaryText) {
    const videoDurationElement = document.getElementById('video-duration');
    const readingTimeElement = document.getElementById('estimated-reading-time');
    const learningMultiplierElement = document.getElementById('learning-multiplier');
    const multiplierMainText = document.getElementById('multiplier-main-text');
    const multiplierSubtitle = document.getElementById('multiplier-subtitle');

    if (videoDurationElement) {
      videoDurationElement.textContent = formatDuration(videoDuration);
    }
    
    const readingMinutes = calculateReadingTime(summaryText, true);

    if (readingTimeElement) {
      readingTimeElement.textContent = readingMinutes > 0 ? `${readingMinutes} min` : '-- min';
    }

    if (learningMultiplierElement && videoDuration > 0 && readingMinutes > 0) {
      const videoMinutes = videoDuration / 60;
      const multiplier = Math.round(videoMinutes / readingMinutes);

      if (multiplier > 1) {
        if (multiplierMainText && multiplierSubtitle) {
            multiplierMainText.innerHTML = `You are a <strong>${multiplier}X</strong> learner!`;
            multiplierSubtitle.textContent = "Visit the Test Your Knowledge section to truly retain this knowledge!";
        }
        learningMultiplierElement.classList.remove('hidden');
      } else {
        learningMultiplierElement.classList.add('hidden');
      }
    } else if (learningMultiplierElement) {
      learningMultiplierElement.classList.add('hidden');
    }
  }

  // Modify summarizeText to update reading time when summary is generated
  async function summarizeText(text, forceRegenerate = false, context = '') {
    summaryContainer?.classList.remove('hidden');
    quizContainer?.classList.remove('hidden');

    // Premium feature check for long videos
    if (currentVideoInfo?.duration > 3600) {
      console.log('Video is longer than 1 hour. Showing premium message.');
      const summaryTextElement = document.querySelector('#summary-content .summary-text');
      
      if (summaryTextElement) {
        summaryTextElement.innerHTML = `
          <div class="premium-popup">
            <h4>Premium Feature</h4>
            <p>Summarizing videos 1 hour or longer is a premium feature.</p>
            <button class="upgrade-button">Upgrade to the PROfessor Plan for $5.99 to access!</button>
          </div>
        `;
        document.querySelector('.summary-info-center')?.classList.add('hidden');
        showCompletionBadge(summaryContainer);
      }

      if (quizContent) {
        quizContent.innerHTML = `
          <div class="premium-popup">
            <h4>Premium Feature</h4>
            <p>Quizzes for videos 1 hour or longer is a premium feature.</p>
            <button class="upgrade-button">Upgrade to the PROfessor Plan for $5.99 to access!</button>
          </div>
        `;
        showCompletionBadge(quizContainer);
      }

      if (chatMessages) {
        chatMessages.innerHTML = `
          <div class="premium-popup" style="padding: 10px; margin-top: 0;">
            <p style="margin-bottom: 0;">AI Chat is also a premium feature for long videos.</p>
          </div>
        `;
        questionInput.disabled = true;
        sendQuestionButton.disabled = true;
        questionInput.placeholder = 'Upgrade to use AI Chat for this video.';
      }

      return;
    }
    
    // Ensure chat is enabled for non-premium videos
    if (chatMessages) {
      questionInput.disabled = false;
      sendQuestionButton.disabled = false;
      questionInput.placeholder = 'Ask a question about the video...';
    }

    try {
      console.log('Starting summarization...');
      
      const videoId = currentVideoInfo ? getVideoId(currentVideoInfo.url) : null;
      const summaryTextElement = document.querySelector('#summary-content .summary-text');
      const summaryInfoCenter = document.querySelector('.summary-info-center');
      
      // Check for cached summary if not forcing regeneration
      if (!forceRegenerate && videoId) {
        const cachedSummary = await loadGeneratedContent(videoId, 'summary');
        if (cachedSummary) {
          console.log('Loading cached summary');
          if (summaryTextElement) {
            summaryTextElement.innerHTML = cachedSummary;
            // Show and update info center for cached summary
            summaryInfoCenter?.classList.remove('hidden');
            updateInfoCenter(currentVideoInfo?.duration, cachedSummary);
          }
          showCompletionBadge(summaryContainer);
          
          // Keep summary collapsed when loading cached content
          summaryContent?.classList.add('collapsed');
          summaryHeader?.querySelector('.collapse-button')?.classList.add('collapsed');
          
          // Load cached chat
          await loadCachedChat(videoId);
          
          // Load cached quiz
          await loadCachedQuiz(videoId, text, cachedSummary);
          return;
        }
      }
      
      // Ensure summary container is visible
      if (summaryContainer) {
        summaryContainer.classList.remove('hidden');
      }
      if (summaryContent) {
        summaryContent.style.display = 'block';
      }
      
      if (summaryTextElement) {
        summaryTextElement.textContent = 'Generating summary...';
        summaryInfoCenter?.classList.add('hidden');
      }
      
      // Show loading indicator
      showLoadingIndicator(summaryContainer);
      
      const effectiveContext = context || userContext.summary || '';
      
      let response;
      try {
        // Check if chrome.runtime is available
        if (typeof chrome === 'undefined' || !chrome.runtime) {
          throw new Error('Chrome runtime not available');
        }
        
        response = await chrome.runtime.sendMessage({ 
          action: 'summarize', 
          transcript: text,
          context: effectiveContext
        });

        // Cache the transcript in currentVideoInfo
        if (currentVideoInfo && !currentVideoInfo.transcript) {
          currentVideoInfo.transcript = text;
        }

      } catch (error) {
        console.error('Error sending message to background:', error);
        if (summaryTextElement) {
          summaryTextElement.textContent = `Failed to generate summary: ${error.message}`;
          summaryInfoCenter?.classList.add('hidden');
        }
        return;
      }

      console.log('Received summary response:', response);
      if (response?.error) {
        console.error('Summary error:', response.error);
        if (summaryTextElement) {
          summaryTextElement.textContent = `Failed to generate summary: ${response.error}`;
          summaryInfoCenter?.classList.add('hidden');
        }
      } else {
        // Use innerHTML to properly render HTML tags
        if (summaryTextElement) {
          summaryTextElement.innerHTML = response.summary;
          // Show and update info center for new summary
          summaryInfoCenter?.classList.remove('hidden');
          updateInfoCenter(currentVideoInfo?.duration, response.summary);
        }
        
        // Save summary to cache
        if (videoId) {
          await saveGeneratedContent(videoId, 'summary', response.summary);
        }
        
        // Show completion badge
        showCompletionBadge(summaryContainer);
        
        // Show regenerate button, hide summarize button
        const summarizeButton = document.getElementById('summarize-button');
        const regenerateSummaryButton = document.getElementById('regenerate-summary-button');
        if (summarizeButton) summarizeButton.style.display = 'none';
        if (regenerateSummaryButton) regenerateSummaryButton.style.display = 'block';
        
        // Make sure content is visible
        if (summaryContent) {
          summaryContent.style.display = 'block';
        }
        
        // Keep summary collapsed when generating new content
        summaryContent?.classList.add('collapsed');
        summaryHeader?.querySelector('.collapse-button')?.classList.add('collapsed');
        
        // Show and initialize questions section
        if (chatMessages) {
          chatMessages.innerHTML = '';
          playfulMessageShown = false;
          showPlayfulMessage();
        }
        
        // Don't auto-generate quiz - user must click "Make Test" button
        quizContainer?.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Summary error:', error);
      if (summaryTextElement) {
        summaryTextElement.textContent = `Failed to generate summary: ${error.message}`;
        summaryInfoCenter?.classList.add('hidden');
      }
    }
  }

  function checkQuizAnswers() {
    const questions = quizContent?.querySelectorAll('.question');
    if (!questions) return;

    let correctAnswers = 0;
    let totalQuestions = questions.length;

    questions.forEach((question) => {
      const selectedAnswer = question.querySelector('input[type="radio"]:checked');
      const correctAnswer = question.querySelector('.correct-answer')?.textContent;

      if (selectedAnswer && correctAnswer && selectedAnswer.value === correctAnswer) {
        correctAnswers++;
      }
    });

    const percentage = Math.round((correctAnswers / totalQuestions) * 100 * 10) / 10; // Round to 1 decimal place
    const resultClass = percentage >= 80 ? 'good' : percentage >= 60 ? 'okay' : 'poor';

    // Create result element
    const resultElement = document.createElement('div');
    resultElement.className = `quiz-result ${resultClass}`;
    resultElement.textContent = `You scored ${percentage}% (${correctAnswers}/${totalQuestions} correct)`;

    // Show tooltip on regenerate button after quiz completion
    setTimeout(() => {
      showRegenerateTooltip();
    }, 1500);

    // Remove any existing result
    const existingResult = quizContent?.querySelector('.quiz-result');
    if (existingResult) {
      existingResult.remove();
    }

    // Find the navigation element
    const navigation = quizContent?.querySelector('.quiz-navigation');
    
    // Insert the result after the navigation
    if (navigation && quizContent) {
      navigation.insertAdjacentElement('afterend', resultElement);
    }
  }

  // Add event listener to submit button in navigation
  function addSubmitButton() {
    if (!quizContent) return;

    const submitButton = quizContent.querySelector('#submitQuiz');
    if (submitButton) {
      submitButton.addEventListener('click', checkQuizAnswers);
    }
  }

  // Function to initialize quiz navigation (used for both new and cached quizzes)
  function initializeQuizNavigation() {
    currentQuestionIndex = 0;
    const questions = quizContent?.querySelectorAll('.question');
    if (questions) {
      totalQuestions = questions.length;
      
      // Show first question
      questions[0].classList.add('active');
    }
    updateQuestionCounter();
    
    // Add navigation event listeners
    const prevButton = quizContent?.querySelector('#prevQuestion');
    const nextButton = quizContent?.querySelector('#nextQuestion');
    
    prevButton?.addEventListener('click', () => navigateQuestions(-1));
    nextButton?.addEventListener('click', () => navigateQuestions(1));
    
    // Update button states
    updateNavigationButtons();
  }

  function navigateQuestions(direction) {
    const questions = quizContent?.querySelectorAll('.question');
    if (!questions) return;

    questions[currentQuestionIndex].classList.remove('active');
    
    currentQuestionIndex = Math.max(0, Math.min(totalQuestions - 1, currentQuestionIndex + direction));
    
    questions[currentQuestionIndex].classList.add('active');
    updateQuestionCounter();
    updateNavigationButtons();
  }

  function updateQuestionCounter() {
    const counter = quizContent?.querySelector('#questionCounter');
    if (counter) {
      counter.textContent = `Question ${currentQuestionIndex + 1}/${totalQuestions}`;
    }
  }

  function updateNavigationButtons() {
    const prevButton = quizContent?.querySelector('#prevQuestion');
    const nextButton = quizContent?.querySelector('#nextQuestion');
    
    if (prevButton && nextButton) {
      prevButton.disabled = currentQuestionIndex === 0;
      nextButton.disabled = currentQuestionIndex === totalQuestions - 1;
    }
  }
  
  // Function to request fresh content info (works for any content type)
  async function requestContentInfo() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs?.[0];
      
      if (currentTab?.id) {
        const response = await sendMessageWithTimeout({ type: 'REQUEST_CONTENT_INFO' });
        if (response?.error) {
          console.warn('Error requesting content info:', response.error);
          // Don't show error state - just wait for content script to send info
        }
      }
    } catch (error) {
      console.warn('Error requesting content info:', error);
      // Don't show error state - allow extension to work anyway
    }
  }

  // Show loading state initially
  showState(loadingState);
  
  // Initialize extension for any content type (video, webpage, PDF)
  async function initializeExtension() {
    try {
      // Check for cached content info (works for any content type)
      const stored = await chrome.storage.local.get(['currentContentInfo', 'currentVideoInfo']);
      const contentInfo = stored.currentContentInfo || stored.currentVideoInfo;
      
      if (contentInfo) {
        // We have content info, display it
        await displayVideoInfo(contentInfo);
        return;
      }
      
      // No cached content yet, request it from content script
      // The content script will send content info when ready
      showState(loadingState);
      const loadingText = loadingState.querySelector('p');
      if (loadingText) loadingText.textContent = 'Extracting content...';
      requestContentInfo();
    } catch (error) {
      console.warn('Error initializing extension:', error);
      // Don't show error state - show interface anyway and let content script populate it
      showState(videoInfoState);
    }
  }
  
  // Initialize extension
  initializeExtension();
  
  // Initialize modules (wait a bit to ensure scripts are loaded)
  let moduleRetryCount = 0;
  const MAX_MODULE_RETRIES = 10;
  
  function initializeModules() {
    if (window.SettingsPanel) {
      window.SettingsPanel.initializeSettings();
      window.SettingsPanel.registerSettingsHandlers();
    } else {
      console.warn('[Eureka AI] SettingsPanel module not loaded');
    }
    if (window.LoginMenu) {
      window.LoginMenu.initializeLoginMenu();
      window.LoginMenu.registerAccountHandlers();
    } else {
      moduleRetryCount++;
      if (moduleRetryCount < MAX_MODULE_RETRIES) {
        console.warn(`[Eureka AI] LoginMenu module not loaded, retrying... (${moduleRetryCount}/${MAX_MODULE_RETRIES})`);
        setTimeout(initializeModules, 200);
        return;
      } else {
        console.error('[Eureka AI] LoginMenu module failed to load after max retries');
      }
    }
    if (!window.UsageTracker) {
      console.warn('[Eureka AI] UsageTracker module not loaded');
    }
    if (window.SumVidNotesManager) {
      window.SumVidNotesManager.init();
      initializeNotesUI();
    } else {
      console.warn('[Eureka AI] SumVidNotesManager module not loaded');
    }
    if (window.SumVidFlashcardMaker) {
      window.SumVidFlashcardMaker.init();
      initializeFlashcardUI();
    } else {
      console.warn('[Eureka AI] SumVidFlashcardMaker module not loaded');
    }
  }
  
  // Flashcard UI initialization
  async function initializeFlashcardUI() {
    const generateFlashcardButton = document.getElementById('generate-flashcard-button');
    
    if (!flashcardContainer || !generateFlashcardButton) {
      console.warn('[Eureka AI] Flashcard UI elements not found');
      return;
    }
    
    // Generate flashcard button handler
    generateFlashcardButton.addEventListener('click', async () => {
      await handleGenerateFlashcards();
    });
    
    // Initial render
    await renderFlashcards();
  }
  
  async function handleGenerateFlashcards() {
    const generateButton = document.getElementById('generate-flashcard-button');
    if (!generateButton || !window.SumVidFlashcardMaker) return;
    
    // Get current content info
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
    
    // Check usage limit
    const limitReached = await checkUsageLimit();
    if (limitReached) {
      alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
      return;
    }
    
    generateButton.disabled = true;
    generateButton.textContent = 'Generating...';
    
    if (flashcardContent) {
      flashcardContent.classList.remove('collapsed');
      flashcardContent.style.display = 'block';
      flashcardList.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-secondary);">Generating flashcards...</p>';
    }
    flashcardContainer?.classList.remove('hidden');
    
    try {
      // Note: Usage is tracked and incremented on the backend API
      // Generate flashcards
      const message = {
        action: 'generate-flashcards',
        contentType: contentType,
        title: contentInfo.title || (contentType === 'video' ? 'unknown video' : contentType === 'pdf' ? 'unknown document' : 'unknown page')
      };
      
      // Only include the relevant content field (transcript for video, text for others)
      if (contentType === 'video') {
        message.transcript = contentText;
      } else {
        message.text = contentText;
      }
      
      const response = await chrome.runtime.sendMessage(message);
      
      if (response?.error) {
        alert(response.error);
        if (flashcardList) {
          flashcardList.innerHTML = `<p style="text-align: center; padding: 20px; color: #e74c3c;">Failed to generate flashcards: ${response.error}</p>`;
        }
      } else if (response?.success && response?.flashcards) {
        // Create flashcard set
        const setTitle = `${contentInfo.title || 'Untitled'} - Flashcards`;
        await window.SumVidFlashcardMaker.createFlashcardSet(setTitle, response.flashcards);
        await renderFlashcards();
        // Ensure content is visible
        if (flashcardContent) {
          flashcardContent.classList.remove('collapsed');
          flashcardContent.style.display = 'block';
        }
      }
      
      await updateStatusCards();
    } catch (error) {
      console.error('[Eureka AI] Flashcard generation error:', error);
      alert('Failed to generate flashcards. Please try again.');
      if (flashcardList) {
        flashcardList.innerHTML = '<p style="text-align: center; padding: 20px; color: #e74c3c;">Failed to generate flashcards.</p>';
      }
    } finally {
      generateButton.disabled = false;
      generateButton.textContent = 'Generate Flashcards';
    }
  }
  
  async function renderFlashcards() {
    if (!window.SumVidFlashcardMaker || !flashcardList || !flashcardEmpty) return;
    
    await window.SumVidFlashcardMaker.loadFlashcards();
    const sets = window.SumVidFlashcardMaker.getAllFlashcards();
    
    // Get current content to filter relevant flashcards
    const stored = await chrome.storage.local.get(['currentContentInfo', 'currentVideoInfo']);
    const contentInfo = stored.currentContentInfo || stored.currentVideoInfo;
    const currentTitle = contentInfo?.title || '';
    
    // Filter flashcards for current content (simple title matching)
    const relevantSets = currentTitle 
      ? sets.filter(set => set.title.includes(currentTitle))
      : sets.slice(-1); // Show most recent if no content
    
    if (relevantSets.length === 0) {
      flashcardList.innerHTML = '';
      flashcardEmpty.classList.remove('hidden');
      currentFlashcardSet = null;
      currentFlashcardIndex = 0;
    } else {
      flashcardEmpty.classList.add('hidden');
      
      // Store the set and reset index
      currentFlashcardSet = relevantSets[0];
      currentFlashcardIndex = 0;
      
      // Render slideshow view (single card)
      renderFlashcardSlideshow();
    }
  }
  
  function renderFlashcardSlideshow() {
    if (!currentFlashcardSet || !flashcardList) return;
    
    // Limit to 10 cards
    const cards = currentFlashcardSet.cards.slice(0, 10);
    
    if (cards.length === 0) {
      flashcardList.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-secondary);">No flashcards available.</p>';
      return;
    }
    
    // Clear and show only current card
    flashcardList.innerHTML = '';
    const currentCard = cards[currentFlashcardIndex];
    const cardElement = createFlashcardElement(currentCard, currentFlashcardIndex, currentFlashcardSet.id);
    flashcardList.appendChild(cardElement);
    
    // Add card counter
    const counter = document.createElement('div');
    counter.className = 'flashcard-counter';
    counter.textContent = `${currentFlashcardIndex + 1} / ${cards.length}`;
    flashcardList.appendChild(counter);
  }
  
  function navigateFlashcard(direction) {
    if (!currentFlashcardSet) return;
    
    const cards = currentFlashcardSet.cards.slice(0, 10);
    if (cards.length === 0) return;
    
    if (direction === 'next') {
      currentFlashcardIndex = (currentFlashcardIndex + 1) % cards.length;
    } else if (direction === 'prev') {
      currentFlashcardIndex = (currentFlashcardIndex - 1 + cards.length) % cards.length;
    }
    
    renderFlashcardSlideshow();
  }
  
  function createFlashcardElement(card, index, setId) {
    const div = document.createElement('div');
    div.className = 'flashcard-item';
    div.dataset.index = index;
    div.dataset.setId = setId;
    
    const inner = document.createElement('div');
    inner.className = 'flashcard-item__inner';
    
    const front = document.createElement('div');
    front.className = 'flashcard-item__front';
    const frontText = document.createElement('div');
    frontText.className = 'flashcard-item__text';
    frontText.textContent = card.question || card.front || 'Question';
    front.appendChild(frontText);
    
    const back = document.createElement('div');
    back.className = 'flashcard-item__back';
    const backText = document.createElement('div');
    backText.className = 'flashcard-item__text';
    backText.textContent = card.answer || card.back || 'Answer';
    back.appendChild(backText);
    
    inner.appendChild(front);
    inner.appendChild(back);
    div.appendChild(inner);
    
    const actions = document.createElement('div');
    actions.className = 'flashcard-item__actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'flashcard-item__action';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete flashcard';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this flashcard?')) {
        // Remove card from set
        const set = window.SumVidFlashcardMaker.getFlashcardSetById(setId);
        if (set) {
          set.cards.splice(index, 1);
          if (set.cards.length === 0) {
            await window.SumVidFlashcardMaker.deleteFlashcardSet(setId);
          } else {
            await window.SumVidFlashcardMaker.loadFlashcards(); // Refresh
            const updatedSet = window.SumVidFlashcardMaker.getFlashcardSetById(setId);
            if (updatedSet) {
              updatedSet.cards = set.cards;
              updatedSet.updatedAt = Date.now();
              await chrome.storage.local.set({ sumvid_flashcards: window.SumVidFlashcardMaker.getAllFlashcards() });
            }
          }
          await renderFlashcards();
        }
      }
    });
    actions.appendChild(deleteBtn);
    div.appendChild(actions);
    
    // Click behavior: flip on first click, navigate to next on second click
    let isFlipped = false;
    div.addEventListener('click', (e) => {
      if (e.target === deleteBtn || deleteBtn.contains(e.target) || actions.contains(e.target)) return;
      
      if (!isFlipped) {
        // First click: flip the card
        div.classList.add('flipped');
        isFlipped = true;
      } else {
        // Second click: navigate to next card (unflipped)
        div.classList.remove('flipped');
        navigateFlashcard('next');
        isFlipped = false;
      }
    });
    
    return div;
  }
  
  // Notes UI initialization
  async function initializeNotesUI() {
    const notesContainer = document.getElementById('notes-container');
    const notesList = document.getElementById('notes-list');
    const noteEmpty = document.getElementById('note-empty');
    const createNoteButton = document.getElementById('create-note-button');
    const notesFilter = document.getElementById('notes-filter');
    const noteEditorDialog = document.getElementById('note-editor-dialog');
    const noteEditorForm = document.getElementById('note-editor-form');
    const noteTitleInput = document.getElementById('note-title');
    const noteFolderInput = document.getElementById('note-folder');
    const noteContentInput = document.getElementById('note-content');
    
    if (!notesContainer || !notesList || !createNoteButton) {
      console.warn('[Eureka AI] Notes UI elements not found');
      return;
    }
    
    // Render notes
    async function renderNotes(folder = 'all') {
      if (!window.SumVidNotesManager) return;
      
      await window.SumVidNotesManager.loadNotes();
      let notesToShow = folder === 'all' 
        ? window.SumVidNotesManager.getAllNotes()
        : window.SumVidNotesManager.getNotesByFolder(folder);
      
      // Sort by updatedAt (newest first)
      notesToShow.sort((a, b) => (b.updatedAt || b.timestamp) - (a.updatedAt || a.timestamp));
      
      if (notesToShow.length === 0) {
        notesList.innerHTML = '';
        if (noteEmpty) noteEmpty.classList.remove('hidden');
      } else {
        if (noteEmpty) noteEmpty.classList.add('hidden');
        notesList.innerHTML = '';
        
        notesToShow.forEach(note => {
          const noteElement = createNoteElement(note);
          notesList.appendChild(noteElement);
        });
      }
      
      // Update folder filter options
      if (notesFilter) {
        const folders = window.SumVidNotesManager.getFolders();
        const currentValue = notesFilter.value;
        notesFilter.innerHTML = '<option value="all">All Notes</option>';
        folders.forEach(folder => {
          const option = document.createElement('option');
          option.value = folder;
          option.textContent = folder;
          notesFilter.appendChild(option);
        });
        notesFilter.value = currentValue;
      }
    }
    
    function createNoteElement(note) {
      const div = document.createElement('div');
      div.className = 'note-item';
      div.dataset.noteId = note.id;
      
      const updatedAt = new Date(note.updatedAt || note.timestamp);
      const timeStr = updatedAt.toLocaleDateString() + ' ' + updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      div.innerHTML = `
        <div class="note-item__header">
          <h4 class="note-item__title">${escapeHtml(note.title)}</h4>
          <span class="note-item__folder">${escapeHtml(note.folder || 'Uncategorized')}</span>
        </div>
        <div class="note-item__content">${escapeHtml(note.content)}</div>
        <div class="note-item__footer">
          <span class="note-item__timestamp">${timeStr}</span>
          <div class="note-item__actions">
            <button class="note-item__button note-item__button--flashcard" data-action="flashcard" data-note-id="${note.id}">Flashcard</button>
            <button class="note-item__button note-item__button--edit" data-action="edit" data-note-id="${note.id}">Edit</button>
            <button class="note-item__button note-item__button--delete" data-action="delete" data-note-id="${note.id}">Delete</button>
          </div>
        </div>
      `;
      
      // Add event listeners
      const flashcardBtn = div.querySelector('[data-action="flashcard"]');
      const editBtn = div.querySelector('[data-action="edit"]');
      const deleteBtn = div.querySelector('[data-action="delete"]');
      
      if (flashcardBtn) {
        flashcardBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await handleGenerateFlashcard(note.id);
        });
      }
      
      if (editBtn) {
        editBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await handleEditNote(note.id);
        });
      }
      
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Delete this note?')) {
            await handleDeleteNote(note.id);
          }
        });
      }
      
      return div;
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    async function handleGenerateFlashcard(noteId) {
      if (!window.SumVidNotesManager || !window.SumVidFlashcardMaker) return;
      const note = window.SumVidNotesManager.getNoteById(noteId);
      if (!note || !note.content) return;
      
      // Check usage limit from backend API
      try {
        const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
        const stored = await chrome.storage.local.get(['sumvid_auth_token']);
        const token = stored.sumvid_auth_token;
        
        if (token) {
          const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const usage = await response.json();
            if (usage.enhancementsUsed >= usage.enhancementsLimit) {
              alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
              return;
            }
          }
        }
      } catch (error) {
        console.warn('[Eureka AI] Failed to check usage limit from backend, using local storage fallback:', error);
        // Fallback to local storage if backend is not available
        if (window.UsageTracker) {
          const limitReached = await window.UsageTracker.isLimitReached();
          if (limitReached) {
            alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
            return;
          }
        }
      }
      
      try {
        // Note: Usage is tracked and incremented on the backend API
        // Generate flashcards from note content
        const response = await chrome.runtime.sendMessage({
          action: 'generate-flashcards',
          contentType: 'webpage', // Treat notes as webpage content
          text: note.content,
          title: note.title || 'Untitled Note'
        });
        
        if (response?.error) {
          alert(response.error);
        } else if (response?.success && response?.flashcards) {
          // Create flashcard set
          const setTitle = `${note.title || 'Untitled Note'} - Flashcards`;
          await window.SumVidFlashcardMaker.createFlashcardSet(setTitle, response.flashcards);
          await renderFlashcards();
          alert('Flashcards generated successfully!');
        }
        
        await updateStatusCards();
      } catch (error) {
        console.error('[Eureka AI] Error generating flashcards from note:', error);
        alert('Failed to generate flashcards. Please try again.');
      }
    }
    
    async function handleEditNote(noteId) {
      if (!window.SumVidNotesManager || !noteEditorDialog) return;
      const note = window.SumVidNotesManager.getNoteById(noteId);
      if (!note) return;
      
      document.getElementById('note-editor-title').textContent = 'Edit Note';
      noteTitleInput.value = note.title;
      noteFolderInput.value = note.folder || 'Uncategorized';
      noteContentInput.value = note.content;
      noteEditorForm.dataset.noteId = noteId;
      
      noteEditorDialog.showModal();
    }
    
    async function handleDeleteNote(noteId) {
      if (!window.SumVidNotesManager) return;
      await window.SumVidNotesManager.deleteNote(noteId);
      await renderNotes(notesFilter?.value || 'all');
    }
    
    // Create note button handler
    createNoteButton.addEventListener('click', () => {
      if (!noteEditorDialog) return;
      document.getElementById('note-editor-title').textContent = 'New Note';
      noteTitleInput.value = '';
      noteFolderInput.value = 'Uncategorized';
      noteContentInput.value = '';
      delete noteEditorForm.dataset.noteId;
      noteEditorDialog.showModal();
    });
    
    // Filter change handler
    if (notesFilter) {
      notesFilter.addEventListener('change', () => {
        renderNotes(notesFilter.value);
      });
    }
    
    // Note editor form handler
    if (noteEditorForm) {
      noteEditorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!window.SumVidNotesManager) return;
        
        const title = noteTitleInput.value.trim();
        const folder = noteFolderInput.value.trim() || 'Uncategorized';
        const content = noteContentInput.value.trim();
        
        if (!title || !content) {
          alert('Title and content are required');
          return;
        }
        
        const noteId = noteEditorForm.dataset.noteId;
        if (noteId) {
          // Update existing note
          await window.SumVidNotesManager.updateNote(noteId, { title, folder, content });
        } else {
          // Create new note
          await window.SumVidNotesManager.createNote(title, content, folder);
        }
        
        noteEditorDialog.close();
        await renderNotes(notesFilter?.value || 'all');
      });
    }
    
    // Close dialog handlers
    const cancelButtons = document.querySelectorAll('.note-editor__cancel');
    cancelButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (noteEditorDialog) noteEditorDialog.close();
      });
    });
    
    // Initial render
    await renderNotes();
  }
  
  // Try immediately, then retry if needed
  setTimeout(initializeModules, 100);

  // Initialize usage tracking and update status cards
  async function updateStatusCards() {
    // Update cards in account dialog
    const enhancementsCountEl = document.getElementById('account-enhancements-count');
    const enhancementsLimitEl = document.getElementById('account-enhancements-limit');
    const userStatusEl = document.getElementById('account-user-status');
    const userPlanEl = document.getElementById('account-user-plan');
    
    try {
      // Try to get usage from backend API if user is logged in
      let usage = null;
      const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
      
      try {
        // Get auth token from storage
        const stored = await chrome.storage.local.get(['sumvid_auth_token']);
        const token = stored.sumvid_auth_token;
        
        if (token) {
          // Fetch usage from backend
          const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            usage = {
              enhancementsUsed: data.enhancementsUsed || 0,
              enhancementsLimit: data.enhancementsLimit || 10
            };
          }
        }
      } catch (error) {
        console.warn('[Eureka AI] Failed to get usage from backend:', error);
      }
      
      // Fallback to local storage if backend is not available or user is not logged in
      if (!usage && window.UsageTracker) {
        await window.UsageTracker.resetDailyUsageIfNeeded();
        const localUsage = await window.UsageTracker.getUsage();
        usage = {
          enhancementsUsed: localUsage.enhancementsUsed,
          enhancementsLimit: localUsage.enhancementsLimit
        };
      }
      
      // Default values if neither backend nor local storage is available
      if (!usage) {
        usage = {
          enhancementsUsed: 0,
          enhancementsLimit: 10
        };
      }
      
      if (enhancementsCountEl) enhancementsCountEl.textContent = usage.enhancementsUsed;
      if (enhancementsLimitEl) enhancementsLimitEl.textContent = usage.enhancementsLimit;
      
      // Update user status and plan in account dialog
      const storedToken = await chrome.storage.local.get(['sumvid_auth_token']);
      const authToken = storedToken.sumvid_auth_token;
      
      if (authToken) {
        try {
          const profileResponse = await fetch(`${BACKEND_URL}/api/user/profile`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            const userProfile = profileData.user || profileData;
            const displayName = (userProfile.name && userProfile.name.trim()) 
              ? userProfile.name 
              : (userProfile.email || 'User');
            const subscriptionStatus = userProfile.subscription_status || 'freemium';
            
            if (userStatusEl) {
              userStatusEl.textContent = displayName;
            }
            if (userPlanEl) {
              userPlanEl.textContent = subscriptionStatus === 'premium' ? 'PRO' : 'Freemium';
            }
          }
        } catch (error) {
          console.warn('[Eureka AI] Failed to get user profile:', error);
        }
      } else {
        if (userStatusEl) {
          userStatusEl.textContent = 'Not Logged In';
        }
        if (userPlanEl) {
          userPlanEl.textContent = 'Freemium';
        }
      }
      
      // Update button states based on usage
      const summarizeButton = document.getElementById('summarize-button');
      const makeTestButton = document.getElementById('make-test-button');
      const limitReached = usage.enhancementsUsed >= usage.enhancementsLimit;
      
      if (summarizeButton) {
        summarizeButton.disabled = limitReached;
        if (limitReached) {
          summarizeButton.title = 'Daily limit reached. Reset tomorrow.';
        }
      }
      if (makeTestButton) {
        makeTestButton.disabled = limitReached;
        if (limitReached) {
          makeTestButton.title = 'Daily limit reached. Reset tomorrow.';
        }
      }
    } catch (error) {
      console.error('Error updating status cards:', error);
      // Set default values on error
      if (enhancementsCountEl) enhancementsCountEl.textContent = '0';
      if (enhancementsLimitEl) enhancementsLimitEl.textContent = '10';
    }
  }
  updateStatusCards();

  // Helper function to check usage limit from backend API
  async function checkUsageLimit() {
    try {
      const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
      const stored = await chrome.storage.local.get(['sumvid_auth_token']);
      const token = stored.sumvid_auth_token;
      
      if (token) {
        const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const usage = await response.json();
          return usage.enhancementsUsed >= usage.enhancementsLimit;
        }
      }
    } catch (error) {
      console.warn('[Eureka AI] Failed to check usage limit from backend:', error);
    }
    
    // Fallback to local storage if backend is not available
    if (window.UsageTracker) {
      return await window.UsageTracker.isLimitReached();
    }
    
    return false; // Allow usage on error
  }

  // Copy URL button handler
  const copyUrlButton = document.getElementById('copy-url-button');
  if (copyUrlButton) {
    copyUrlButton.addEventListener('click', async (e) => {
      const urlToCopy = e.currentTarget.dataset.fullUrl;
      if (!urlToCopy) return;
      
      try {
        await navigator.clipboard.writeText(urlToCopy);
        // Visual feedback
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

  // Manual Summarize button handler
  const summarizeButton = document.getElementById('summarize-button');
  if (summarizeButton) {
    summarizeButton.addEventListener('click', async () => {
      if (!currentVideoInfo) {
        alert('No content available to summarize.');
        return;
      }
      
      // Check for content based on type (transcript for videos, text for webpages/PDFs)
      const contentType = currentVideoInfo.type || 'video';
      const hasContent = contentType === 'video' 
        ? currentVideoInfo.transcript 
        : (currentVideoInfo.text || currentVideoInfo.needsServerExtraction);
      
      if (!hasContent) {
        const errorMsg = contentType === 'video' 
          ? 'No video transcript available.'
          : contentType === 'pdf'
          ? 'No PDF content available.'
          : 'No webpage content available.';
        alert(errorMsg);
        return;
      }

      // Check usage limit from backend API
      try {
        const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
        const stored = await chrome.storage.local.get(['sumvid_auth_token']);
        const token = stored.sumvid_auth_token;
        
        if (token) {
          const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const usage = await response.json();
            if (usage.enhancementsUsed >= usage.enhancementsLimit) {
              alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
              return;
            }
          }
        }
      } catch (error) {
        console.warn('[Eureka AI] Failed to check usage limit from backend, using local storage fallback:', error);
        // Fallback to local storage if backend is not available
        if (window.UsageTracker) {
          const limitReached = await window.UsageTracker.isLimitReached();
          if (limitReached) {
            alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
            return;
          }
        }
      }

      // Show loading state
      summarizeButton.disabled = true;
      summarizeButton.textContent = 'Generating...';
      
      // Show summary container and content
      if (summaryContainer) summaryContainer.classList.remove('hidden');
      if (summaryContent) {
        summaryContent.style.display = 'block';
        summaryContent.innerHTML = '<div class="summary-text">Generating summary...</div>';
      }
      showLoadingIndicator(summaryContainer);

      try {
        // Note: Usage is tracked and incremented on the backend API
        // Generate summary - use appropriate content field based on type
        const contentText = contentType === 'video' 
          ? currentVideoInfo.transcript 
          : (currentVideoInfo.text || '');
        await summarizeText(contentText, false, '');
        
        // Show regenerate button, hide summarize button
        const regenerateButton = document.getElementById('regenerate-summary-button');
        if (regenerateButton) regenerateButton.style.display = 'block';
        summarizeButton.style.display = 'none';
        
        // Update status cards
        await updateStatusCards();
      } catch (error) {
        console.error('Error generating summary:', error);
        alert('Failed to generate summary. Please try again.');
        summarizeButton.disabled = false;
        summarizeButton.textContent = 'Summarize';
      }
    });
  }

  // Manual Make Test button handler
  const makeTestButton = document.getElementById('make-test-button');
  if (makeTestButton) {
    makeTestButton.addEventListener('click', async () => {
      if (!currentVideoInfo) {
        alert('No content available to generate quiz from.');
        return;
      }
      
      // Check for content based on type (transcript for videos, text for webpages/PDFs)
      const contentType = currentVideoInfo.type || 'video';
      const hasContent = contentType === 'video' 
        ? currentVideoInfo.transcript 
        : (currentVideoInfo.text || currentVideoInfo.needsServerExtraction);
      
      if (!hasContent) {
        const errorMsg = contentType === 'video' 
          ? 'No video transcript available.'
          : contentType === 'pdf'
          ? 'No PDF content available.'
          : 'No webpage content available.';
        alert(errorMsg);
        return;
      }

      // Check usage limit from backend API
      try {
        const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
        const stored = await chrome.storage.local.get(['sumvid_auth_token']);
        const token = stored.sumvid_auth_token;
        
        if (token) {
          const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const usage = await response.json();
            if (usage.enhancementsUsed >= usage.enhancementsLimit) {
              alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
              return;
            }
          }
        }
      } catch (error) {
        console.warn('[Eureka AI] Failed to check usage limit from backend, using local storage fallback:', error);
        // Fallback to local storage if backend is not available
        if (window.UsageTracker) {
          const limitReached = await window.UsageTracker.isLimitReached();
          if (limitReached) {
            alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
            return;
          }
        }
      }

      // Show loading state
      makeTestButton.disabled = true;
      makeTestButton.textContent = 'Generating...';
      
      // Show quiz container and content
      if (quizContainer) quizContainer.classList.remove('hidden');
      if (quizContent) {
        quizContent.style.display = 'block';
        quizContent.innerHTML = 'Generating questions...';
      }
      showLoadingIndicator(quizContainer);

      try {
        // Get summary if available
        const videoId = getVideoId(currentVideoInfo.url);
        let summaryText = '';
        if (videoId) {
          const cachedSummary = await loadGeneratedContent(videoId, 'summary');
          if (cachedSummary) {
            const summaryEl = document.querySelector('.summary-text');
            if (summaryEl) summaryText = summaryEl.textContent;
          }
        }

        // Note: Usage is tracked and incremented on the backend API
        // Generate quiz
        await generateQuiz(currentVideoInfo.transcript, summaryText, '');
        
        // Show regenerate button, hide make test button
        const regenerateButton = document.getElementById('regenerate-quiz-button');
        if (regenerateButton) regenerateButton.style.display = 'block';
        makeTestButton.style.display = 'none';
        
        // Update status cards
        await updateStatusCards();
      } catch (error) {
        console.error('Error generating quiz:', error);
        alert('Failed to generate quiz. Please try again.');
        makeTestButton.disabled = false;
        makeTestButton.textContent = 'Make Test';
      }
    });
  }
  
  // Also ensure event listeners are attached after a short delay
  setTimeout(ensureEventListeners, 500);
  
  async function displayVideoInfoFromCache(videoInfo, videoId, cachedSummary, cachedQuiz, cachedChat) {
    currentVideoInfo = videoInfo;
    userContext = { ...DEFAULT_CONTEXT };
    
    // Try to get basic video info without transcript
    try {
      const basicInfo = await sendMessageWithTimeout({ type: 'GET_BASIC_VIDEO_INFO' });
      if (basicInfo && !basicInfo.error) {
        currentVideoInfo = { ...videoInfo, ...basicInfo };
        if (videoTitle) {
          // Decode HTML entities (like &#39; to ') before displaying
          const titleText = basicInfo.title || 'Unknown Title';
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = titleText;
          videoTitle.textContent = tempDiv.textContent || tempDiv.innerText || titleText;
        }
        if (channelName) {
          channelName.textContent = basicInfo.channel || 'Unknown Channel';
        }
      }
    } catch (error) {
      console.warn('Could not get basic video info:', error);
    }
    
    // Display cached content
    if (cachedSummary) {
      summaryContainer?.classList.remove('hidden');
      if (summaryContent) {
        summaryContent.style.display = 'block';
      }
      const summaryTextElement = document.querySelector('.summary-text');
      const summaryInfoCenter = document.querySelector('.summary-info-center');
      if (summaryTextElement) {
        summaryTextElement.innerHTML = cachedSummary;
      }
      if(summaryInfoCenter){
        summaryInfoCenter.classList.remove('hidden');
        updateInfoCenter(currentVideoInfo?.duration, cachedSummary);
      }
      showCompletionBadge(summaryContainer);
      summaryContent?.classList.add('collapsed');
      summaryHeader?.querySelector('.collapse-button')?.classList.add('collapsed');
      // Hide summarize button, show regenerate button
      const summarizeButton = document.getElementById('summarize-button');
      const regenerateSummaryButton = document.getElementById('regenerate-summary-button');
      if (summarizeButton) summarizeButton.style.display = 'none';
      if (regenerateSummaryButton) regenerateSummaryButton.style.display = 'block';
    } else {
      // No cached summary - show summarize button, hide regenerate
      const summarizeButton = document.getElementById('summarize-button');
      const regenerateSummaryButton = document.getElementById('regenerate-summary-button');
      if (summarizeButton) summarizeButton.style.display = 'block';
      if (regenerateSummaryButton) regenerateSummaryButton.style.display = 'none';
    }
    
    // Always show questions section with cached content
    if (cachedChat) {
      await loadCachedChat(videoId);
    } else {
      // Clear chat if no cached content
      if (chatMessages) {
        chatMessages.innerHTML = '';
        playfulMessageShown = false;
        showPlayfulMessage();
      }
    }
    
    // Always show quiz section whether there's cached content or not
    quizContainer?.classList.remove('hidden');
    if (cachedQuiz) {
      if (quizContent) {
        quizContent.style.display = 'block';
        quizContent.innerHTML = cachedQuiz;
        quizContent.classList.add('collapsed');
      }
      quizHeader?.querySelector('.collapse-button')?.classList.add('collapsed');
      initializeQuizNavigation();
      addSubmitButton();
      showCompletionBadge(quizContainer);
      // Hide make test button, show regenerate button
      const makeTestButton = document.getElementById('make-test-button');
      const regenerateQuizButton = document.getElementById('regenerate-quiz-button');
      if (makeTestButton) makeTestButton.style.display = 'none';
      if (regenerateQuizButton) regenerateQuizButton.style.display = 'block';
    } else {
      // No cached quiz - show make test button, hide regenerate, hide content
      if (quizContent) {
        quizContent.style.display = 'none';
      }
      const makeTestButton = document.getElementById('make-test-button');
      const regenerateQuizButton = document.getElementById('regenerate-quiz-button');
      if (makeTestButton) makeTestButton.style.display = 'block';
      if (regenerateQuizButton) regenerateQuizButton.style.display = 'none';
      if (quizContent) {
        quizContent.style.display = 'none';
      quizContent.classList.add('collapsed');
      }
      quizHeader?.querySelector('.collapse-button')?.classList.add('collapsed');
    }
    
    // Update status cards
    await updateStatusCards();
    
    // Show status section
    // Status cards are now in account dialog, no need to show status section
    
    showState(videoInfoState);
    // Ensure event listeners are attached after DOM is updated
    setTimeout(ensureEventListeners, 100);
  }
  
  // Display content info (works for video, webpage, PDF)
  async function displayVideoInfo(contentInfo) {
    if (!contentInfo) {
      // No content info, but don't show error state - show interface anyway
      showState(videoInfoState);
      if (chatMessages && chatMessages.children.length === 0) {
        showPlayfulMessage();
      }
      return;
    }
    
    currentVideoInfo = contentInfo;
    userContext = { ...DEFAULT_CONTEXT };
    
    if (videoTitle) {
      // Decode HTML entities (like &#39; to ') before displaying
      const titleText = contentInfo.title || 'Untitled Content';
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = titleText;
      videoTitle.textContent = tempDiv.textContent || tempDiv.innerText || titleText;
    }
    if (channelName) {
      // Show channel for videos, URL/source for webpages/PDFs
      const sourceText = contentInfo.channel || contentInfo.url || 'Unknown Source';
      const copyUrlButton = document.getElementById('copy-url-button');
      
      if (contentInfo.url && !contentInfo.channel) {
        // For URLs (webpages/PDFs): hide the text, show copy button
        if (channelName) {
          channelName.textContent = '';
          channelName.style.display = 'none';
        }
        if (copyUrlButton) {
          copyUrlButton.dataset.fullUrl = contentInfo.url;
          copyUrlButton.style.display = 'flex';
          // Preserve the SVG icon when setting text
          const svg = copyUrlButton.querySelector('svg');
          if (svg) {
            copyUrlButton.innerHTML = svg.outerHTML + ' Copy URL';
          } else {
            copyUrlButton.textContent = 'Copy URL';
          }
        }
      } else {
        // For channels (videos): show the text, hide copy button
        if (channelName) {
          channelName.textContent = sourceText;
          channelName.style.display = 'block';
        }
        if (copyUrlButton) {
          copyUrlButton.style.display = 'none';
        }
      }
    }
    
    // Update duration in info center (only for videos)
    if (contentInfo.duration) {
      updateInfoCenter(contentInfo.duration, '');
    }
    
    summaryContainer?.classList.add('hidden');
    quizContainer?.classList.add('hidden');
    
    // Status cards are now in account dialog, no need to show status section
    
    // Show containers if we have content (transcript for video, text for webpage/PDF)
    const hasContent = contentInfo.transcript || contentInfo.text || contentInfo.needsServerExtraction;
    if (hasContent) {
      summaryContainer?.classList.remove('hidden');
      quizContainer?.classList.remove('hidden');
      // Chat section is always visible
      // But keep content hidden until manually generated
      if (summaryContent) summaryContent.style.display = 'none';
      if (quizContent) quizContent.style.display = 'none';
    }
    
    showState(videoInfoState);
    // Show playful message if chat is empty
    if (chatMessages && chatMessages.children.length === 0) {
      showPlayfulMessage();
    }
    // Ensure event listeners are attached after DOM is updated
    setTimeout(ensureEventListeners, 100);
  }
  
  // Listen for content info updates
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    // Handle content info updates from content script
    if (changes.currentContentInfo?.newValue) {
      const newContentInfo = changes.currentContentInfo.newValue;
      displayVideoInfo(newContentInfo);
    } else if (changes.currentVideoInfo?.newValue) {
      // Legacy support for currentVideoInfo
      const newVideoInfo = changes.currentVideoInfo.newValue;
      displayVideoInfo(newVideoInfo);
    }

    // Note: clarify requests are now handled by the message listener
    // This storage listener is disabled to prevent duplicate messages
    // The background script sends a direct message instead
    // if (changes.clarifyRequest?.newValue) {
    //   // Disabled to prevent duplicate message handling
    // }
  });
  
  // Regenerate quiz button handler
  const regenerateQuizButton = document.getElementById('regenerate-quiz-button');
  if (regenerateQuizButton) {
    regenerateQuizButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentVideoInfo?.url || !summaryContent) {
      console.warn('Missing video info or summary content');
      return;
    }
    // If quiz already exists, show context bar as a floating popup
    if (quizContent && quizContent.textContent && !quizContent.textContent.includes('Generating')) {
      quizContextBar.classList.remove('hidden');
      quizContextInput.value = '';
      quizContextInput.focus();
      // No need to position relative to button; CSS handles centering
      // Hide on click outside
      const handleClickOutside = (event) => {
        if (!quizContextBar.contains(event.target) && event.target !== regenerateQuizButton) {
          quizContextBar.classList.add('hidden');
          document.removeEventListener('mousedown', handleClickOutside);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      // Submit on button or Enter
      const submitContext = async () => {
        quizContextBar.classList.add('hidden');
        document.removeEventListener('mousedown', handleClickOutside);

        // Check usage limit before regenerating
        if (window.UsageTracker) {
          const limitReached = await window.UsageTracker.isLimitReached();
          if (limitReached) {
            alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
            return;
          }
        }

        // Clear cached quiz for this video
        const videoId = getVideoId(currentVideoInfo.url);
        if (videoId) {
          chrome.storage.local.remove([`quiz_${videoId}`]);
        }
        showLoadingIndicator(quizContainer);
        if (quizContent) quizContent.textContent = 'Generating new quiz questions...';
        try {
          // Note: Usage is tracked and incremented on the backend API
          if (!currentVideoInfo.transcript) {
            const transcriptResponse = await sendMessageWithTimeout({ type: 'REQUEST_VIDEO_INFO' });
            if (transcriptResponse?.error) throw new Error('Failed to get transcript');
            await new Promise((resolve) => {
              const checkTranscript = () => {
                chrome.storage.local.get(['currentVideoInfo'], (result) => {
                  if (result.currentVideoInfo?.transcript) {
                    currentVideoInfo = result.currentVideoInfo;
                    resolve();
                  } else {
                    setTimeout(checkTranscript, 500);
                  }
                });
              };
              checkTranscript();
            });
          }
          const summaryTextElement = document.querySelector('#summary-content .summary-text');
          const summaryText = summaryTextElement ? summaryTextElement.innerHTML : '';
          userContext.quiz = quizContextInput.value;
          await generateQuiz(currentVideoInfo.transcript, summaryText, quizContextInput.value);
          await updateStatusCards();
        } catch (error) {
          if (quizContent) quizContent.textContent = `Failed to regenerate quiz: ${error.message}`;
          showCompletionBadge(quizContainer);
        }
      };
      quizContextSubmit.onclick = submitContext;
      quizContextInput.onkeydown = (ev) => { if (ev.key === 'Enter') submitContext(); };
      return;
    }
      // Default: no quiz exists, proceed with regeneration after checking usage
      // Check usage limit before regenerating
      if (window.UsageTracker) {
        const limitReached = await window.UsageTracker.isLimitReached();
        if (limitReached) {
          alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
          return;
        }
      }
      
      // Note: Usage is tracked and incremented on the backend API
      // Proceed with default regeneration
      showLoadingIndicator(quizContainer);
      if (quizContent) {
        quizContent.style.display = 'block';
        quizContent.textContent = 'Generating quiz questions...';
      }
      
      try {
        if (!currentVideoInfo.transcript) {
          const transcriptResponse = await sendMessageWithTimeout({ type: 'REQUEST_VIDEO_INFO' });
          if (transcriptResponse?.error) throw new Error('Failed to get transcript');
          await new Promise((resolve) => {
            const checkTranscript = () => {
              chrome.storage.local.get(['currentVideoInfo'], (result) => {
                if (result.currentVideoInfo?.transcript) {
                  currentVideoInfo = result.currentVideoInfo;
                  resolve();
                } else {
                  setTimeout(checkTranscript, 500);
                }
              });
            };
            checkTranscript();
          });
        }
        
        const summaryTextElement = document.querySelector('#summary-content .summary-text');
        const summaryText = summaryTextElement ? summaryTextElement.innerHTML : '';
        
        // Clear cached quiz
          const videoId = getVideoId(currentVideoInfo.url);
          if (videoId) {
          chrome.storage.local.remove([`quiz_${videoId}`]);
        }
        
        await generateQuiz(currentVideoInfo.transcript, summaryText, '');
        
        // Button visibility is handled in generateQuiz function
        await updateStatusCards();
      } catch (error) {
        if (quizContent) {
          quizContent.textContent = `Failed to regenerate quiz: ${error.message}`;
          quizContent.style.display = 'block';
        }
        showCompletionBadge(quizContainer);
      }
    });
  }

  // Regenerate summary button handler
    const regenerateSummaryButton = document.getElementById('regenerate-summary-button');
  if (regenerateSummaryButton) {
    console.log('Regenerate summary button found, attaching listener');
      regenerateSummaryButton.addEventListener('click', async (e) => {
        console.log('Regenerate summary button clicked');
        e.stopPropagation();
        if (!currentVideoInfo?.transcript) {
          console.warn('No transcript available for summary regeneration');
          // Try to get transcript first
          try {
            const transcriptResponse = await sendMessageWithTimeout({ type: 'REQUEST_VIDEO_INFO' });
            if (transcriptResponse?.error) {
              console.error('Failed to get transcript:', transcriptResponse.error);
              return;
            }
            // Wait for transcript to be available
            await new Promise((resolve) => {
              const checkTranscript = () => {
                chrome.storage.local.get(['currentVideoInfo'], (result) => {
                  if (result.currentVideoInfo?.transcript) {
                    currentVideoInfo = result.currentVideoInfo;
                    resolve();
                  } else {
                    setTimeout(checkTranscript, 500);
                  }
                });
              };
              checkTranscript();
            });
          } catch (error) {
            console.error('Failed to get transcript for summary regeneration:', error);
            return;
          }
        }
        
        // If summary already exists, show context bar as a floating popup
        if (summaryContent && summaryContent.textContent && !summaryContent.textContent.includes('Generating')) {
          summaryContextBar.classList.remove('hidden');
          summaryContextInput.value = '';
          summaryContextInput.focus();
          // Hide on click outside
          const handleClickOutside = (event) => {
            if (!summaryContextBar.contains(event.target) && event.target !== regenerateSummaryButton) {
              summaryContextBar.classList.add('hidden');
              document.removeEventListener('mousedown', handleClickOutside);
            }
          };
          document.addEventListener('mousedown', handleClickOutside);
          // Submit on button or Enter
          const submitContext = async () => {
            summaryContextBar.classList.add('hidden');
            document.removeEventListener('mousedown', handleClickOutside);

          // Check usage limit before regenerating
          if (window.UsageTracker) {
            const limitReached = await window.UsageTracker.isLimitReached();
            if (limitReached) {
              alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
              return;
            }
          }

            // Clear cached content for this video
            const videoId = getVideoId(currentVideoInfo.url);
            if (videoId) {
              chrome.storage.local.remove([
                `summary_${videoId}`,
                `quiz_${videoId}`,
                `chat_${videoId}`
              ]);
            }
          
          // Note: Usage is tracked and incremented on the backend API
            userContext.summary = summaryContextInput.value;
          await summarizeText(currentVideoInfo.transcript, true, summaryContextInput.value);
            if (chatMessages) {
              chatMessages.innerHTML = '';
              playfulMessageShown = false;
              showPlayfulMessage();
            }
          await updateStatusCards();
          };
          summaryContextSubmit.onclick = submitContext;
          summaryContextInput.onkeydown = (ev) => { if (ev.key === 'Enter') submitContext(); };
          return;
        }
        // Default: no summary exists or summary is being generated, proceed with regeneration
        console.log('Proceeding with summary regeneration');
      
      // Check usage limit before regenerating
      if (window.UsageTracker) {
        const limitReached = await window.UsageTracker.isLimitReached();
        if (limitReached) {
          alert('Daily enhancement limit reached. Your limit will reset tomorrow.');
          return;
        }
      }
      
        // Clear cached content for this video
        const videoId = getVideoId(currentVideoInfo.url);
        if (videoId) {
          chrome.storage.local.remove([
            `summary_${videoId}`,
            `quiz_${videoId}`,
            `chat_${videoId}`
          ]);
        }
      
      // Note: Usage is tracked and incremented on the backend API
        userContext.summary = '';
      await summarizeText(currentVideoInfo.transcript, true, '');
        if (chatMessages) {
          chatMessages.innerHTML = '';
          playfulMessageShown = false;
          showPlayfulMessage();
        }
      await updateStatusCards();
    });
  } else {
    console.warn('Regenerate summary button not found');
  }
  
  function showState(stateElement) {
    if (!stateElement) return;

    if (loadingState) loadingState.classList.add('hidden');
    if (noVideoState) noVideoState.classList.add('hidden');
    if (videoInfoState) videoInfoState.classList.add('hidden');
    
    stateElement.classList.remove('hidden');
  }

  // Function to ensure event listeners are properly attached
  function ensureEventListeners() {
    // Event listeners are already attached above, this function is kept for compatibility
    // but no longer needs to re-attach since handlers are set up properly
    
    // Setup status upgrade button handler (upgrade-button in account dialog is handled by LoginMenu.js)
    const statusUpgradeBtn = document.getElementById('status-upgrade-btn');
    if (statusUpgradeBtn && !statusUpgradeBtn.dataset.listenerAttached) {
      statusUpgradeBtn.dataset.listenerAttached = 'true';
      statusUpgradeBtn.addEventListener('click', async () => {
        const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
        try {
          const stored = await chrome.storage.local.get(['sumvid_auth_token']);
          const token = stored.sumvid_auth_token;
          
          if (!token) {
            alert('Please log in to upgrade to Pro');
            return;
          }

          const response = await fetch(`${BACKEND_URL}/api/checkout/create-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || errorData.message || `Server error: ${response.status}`);
          }

          const data = await response.json();
          if (data.url) {
            window.open(data.url, '_blank');
          } else {
            alert('Upgrade feature coming soon!');
          }
        } catch (error) {
          console.error('Upgrade error:', error);
          alert(`Failed to initiate upgrade: ${error.message}. Please try again later.`);
        }
      });
    }
  }

  // Listen for selection-clarify messages from content scripts
  let isProcessingClarify = false; // Prevent duplicate processing
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'selection-clarify') {
      // Prevent duplicate processing
      if (isProcessingClarify) {
        console.warn('[Eureka AI] Clarify request already being processed');
        sendResponse({ success: false, error: 'Already processing' });
        return false;
      }
      
      isProcessingClarify = true;
      
      (async () => {
        try {
          // Get current content info for context
          const stored = await chrome.storage.local.get(['currentContentInfo', 'clarifyRequest']);
          const contentInfo = stored.currentContentInfo || currentVideoInfo;
          const clarifyRequest = stored.clarifyRequest;
          
          // Use text from message or from stored clarifyRequest
          const textToClarify = message.text || (clarifyRequest?.text);
          
          if (!textToClarify) {
            console.warn('[Eureka AI] No text to clarify');
            isProcessingClarify = false;
            sendResponse({ success: false, error: 'No text provided' });
            return;
          }
          
          // Build system prompt with context (not shown to user)
          let systemPrompt = `Please clarify the following text in the context of the current webpage:\n\n"${textToClarify}"\n\n`;
          
          // Get content info for context
          const contentType = contentInfo?.type || 'webpage';
          const contentText = contentType === 'video' 
            ? (contentInfo?.transcript || '')
            : (contentInfo?.text || '');
          
          if (contentText) {
            // Include a snippet of the webpage content for context (in system prompt only)
            const contextSnippet = contentText.substring(0, 2000); // First 2000 chars for context
            systemPrompt += `Here is the context from the ${contentType}:\n\n${contextSnippet}`;
          }
          
          // Show only the user's actual question to the chat UI
          const userMessage = `Clarify this for me: "${textToClarify}"`;
          if (chatMessages) {
            addChatMessage(userMessage, true); // true = isUser
          }
          
          // Clear input
          if (questionInput) {
            questionInput.value = '';
          }
          
          // Send system prompt to backend via background script (which handles context automatically)
          // The system prompt includes context but won't be shown to user
          const response = await chrome.runtime.sendMessage({
            action: 'sidechat',
            message: systemPrompt,
            chatHistory: [],
            context: contentText ? contentText.substring(0, 5000) : '' // Include context for clarification
          });
          
          if (response?.error) {
            addChatMessage(`Error: ${response.error}`, false); // false = assistant
          } else if (response?.reply) {
            addChatMessage(response.reply, false); // false = assistant
          } else {
            addChatMessage('I apologize, but I was unable to clarify that text. Please try again.', false); // false = assistant
          }
          
          // Clear the clarify request from storage
          chrome.storage.local.remove(['clarifyRequest']);
          
          // Update status cards
          await updateStatusCards();
          
          isProcessingClarify = false;
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Eureka AI] Error handling selection-clarify:', error);
          if (chatMessages) {
            addChatMessage(`Error: ${error.message}`, false); // false = assistant
          }
          isProcessingClarify = false;
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Indicate that sendResponse will be called asynchronously
    }
    return false;
  });
  
  // Note: clarify requests are now handled by the message listener above
  // No need to check on load as the background script sends the message directly
});