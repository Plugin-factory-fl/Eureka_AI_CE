// Backend API configuration
const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com'; // Update with your backend URL

console.log('[SumVid] Background script loaded');

// Helper function to get JWT token from storage
async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sumvid_auth_token'], (result) => {
      resolve(result.sumvid_auth_token || null);
    });
  });
}

// Helper function to save JWT token to storage
async function saveAuthToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ sumvid_auth_token: token }, () => {
      resolve();
    });
  });
}

// Helper function to remove auth token
async function clearAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['sumvid_auth_token'], () => {
      resolve();
    });
  });
}

// Helper function to make authenticated backend API calls
async function callBackendAPI(endpoint, method = 'POST', body = null) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated. Please log in.');
  }

  const url = `${BACKEND_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    // Token expired or invalid, clear it
    await clearAuthToken();
    throw new Error('Authentication expired. Please log in again.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
}

let currentVideoInfo = null;
let transcriptCache = new Map();

// Helper to generate summary via backend API (supports video, webpage, PDF)
async function generateSummary(contentText, context, title, contentId, contentType = 'video') {
  const cleanContent = contentType === 'video' 
    ? contentText.replace(/\[\d+:\d+\]/g, '').replace(/\s+/g, ' ').trim()
    : contentText.replace(/\s+/g, ' ').trim();
    
  if (cleanContent.length < 10) {
    throw new Error(contentType === 'video' ? 'Transcript is too short or empty' : 'Content is too short or empty');
  }

  const requestBody = {
    contentType: contentType,
    context: context || '',
    title: title || (contentType === 'video' ? 'unknown video' : contentType === 'pdf' ? 'unknown document' : 'unknown page')
  };

  if (contentType === 'video') {
    requestBody.videoId = contentId || null;
    requestBody.transcript = cleanContent;
  } else {
    requestBody.text = cleanContent;
    if (contentType === 'pdf') {
      requestBody.contentUrl = contentId; // PDF URL
    }
  }

  const response = await callBackendAPI('/api/summarize', 'POST', requestBody);

  return response.summary;
}

// Helper to generate quiz via backend API
async function generateQuiz(transcript, summary, context, title, videoId) {
  const response = await callBackendAPI('/api/quiz', 'POST', {
    videoId: videoId || null,
    transcript: transcript || '',
    summary: summary || '',
    difficulty: context || '',
    title: title || 'unknown video'
  });

  const quiz = response.quiz;
  // Verify we got exactly 3 questions
  const questionCount = (quiz.match(/<div class="question">/g) || []).length;
  if (questionCount !== 3) {
    console.warn(`Generated ${questionCount} questions instead of 3`);
  }
  return quiz;
}

// Auto-generation removed - users must manually trigger generation via buttons

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VIDEO_INFO' || message.type === 'CONTENT_INFO') {
    (async () => {
      try {
        const url = sanitizeInput(message.data?.url);
        if (!url) throw new Error('No URL provided');
        
        const contentType = message.data.type || 'video';
        
        // Store content info (handles video, webpage, PDF)
        const contentInfo = {
          ...message.data,
          type: contentType,
          title: sanitizeInput(message.data.title || 'Untitled'),
          timestamp: new Date().toISOString()
        };

        // Sanitize content text
        if (contentType === 'video' && message.data.transcript) {
          contentInfo.transcript = sanitizeInput(message.data.transcript);
        } else if ((contentType === 'webpage' || contentType === 'pdf') && message.data.text) {
          contentInfo.text = sanitizeInput(message.data.text);
        }

        // Store as currentContentInfo (replaces currentVideoInfo)
        await chrome.storage.local.set({ currentContentInfo: contentInfo });
        
        // Legacy support: also store as currentVideoInfo if it's a video
        if (contentType === 'video') {
          const videoId = new URL(url).searchParams.get('v');
          if (videoId) {
            currentVideoInfo = {
              ...contentInfo,
              channel: sanitizeInput(message.data.channel || 'Unknown Channel'),
              transcript: contentInfo.transcript || null
            };
            await chrome.storage.local.set({ currentVideoInfo });
            
            if (currentVideoInfo.transcript && !currentVideoInfo.error) {
              transcriptCache.set(videoId, currentVideoInfo.transcript);
            } else {
              chrome.action.setBadgeText({ text: 'X' });
              chrome.action.setBadgeBackgroundColor({ color: '#808080' });
            }
          }
        } else {
          // For webpages/PDFs, clear badge
          chrome.action.setBadgeText({ text: '' });
        }
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('[SumVid] Error processing content info:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  } else if (message.action === 'summarize') {
    (async () => {
      try {
        // Get current content info
        const stored = await chrome.storage.local.get(['currentContentInfo']);
        const contentInfo = stored.currentContentInfo || currentVideoInfo;
        
        if (!contentInfo) {
          throw new Error('No content available to summarize');
        }

        const contentType = contentInfo.type || 'video';
        const contentText = contentType === 'video' ? message.transcript || contentInfo.transcript : (message.text || contentInfo.text);
        
        if (!contentText) {
          throw new Error('No content text available');
        }

        const contentId = contentType === 'video' 
          ? (contentInfo.url ? new URL(contentInfo.url).searchParams.get('v') : null)
          : null;

        const summary = await generateSummary(contentText, message.context, contentInfo.title, contentId, contentType);
        sendResponse({ success: true, summary });
      } catch (error) {
        console.error('[SumVid] Summarization error:', error);
        sendResponse({ success: false, error: error.message || 'Failed to generate summary' });
      }
    })();
    return true;
  } else if (message.action === 'generate-quiz') {
    (async () => {
      try {
        const videoId = currentVideoInfo?.url ? new URL(currentVideoInfo.url).searchParams.get('v') : null;
        const questions = await generateQuiz(message.transcript, message.summary, message.context, currentVideoInfo?.title, videoId);
        sendResponse({ success: true, questions });
      } catch (error) {
        console.error('Quiz generation error:', error);
        sendResponse({ success: false, error: error.message || 'Failed to generate quiz' });
      }
    })();
    return true;
  } else if (message.action === 'ask-question') {
    (async () => {
      try {
        // Get current content info
        const stored = await chrome.storage.local.get(['currentContentInfo']);
        const contentInfo = stored.currentContentInfo || currentVideoInfo;
        
        if (!contentInfo) {
          throw new Error('No content available for questions');
        }

        const contentType = contentInfo.type || 'video';
        const contentId = contentType === 'video' 
          ? (contentInfo.url ? new URL(contentInfo.url).searchParams.get('v') : null)
          : null;
        
        const contentText = contentType === 'video' 
          ? (message.transcript || contentInfo.transcript || '')
          : (message.text || contentInfo.text || '');

        const requestBody = {
          contentType: contentType,
          question: message.question,
          chatHistory: message.chatHistory || null,
          summary: message.summary || '',
          title: contentInfo.title || (contentType === 'video' ? 'unknown video' : contentType === 'pdf' ? 'unknown document' : 'unknown page')
        };

        if (contentType === 'video') {
          requestBody.videoId = contentId || null;
          requestBody.transcript = contentText;
        } else {
          requestBody.text = contentText;
          if (contentType === 'pdf') {
            requestBody.contentUrl = contentInfo.pdfUrl || contentInfo.url;
          }
        }

        const response = await callBackendAPI('/api/qa', 'POST', requestBody);
        sendResponse({ success: true, answer: response.answer });
      } catch (error) {
        console.error('[SumVid] Question answering error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Failed to answer question'
        });
      }
    })();
    return true;
  } else if (message.action === 'generate-flashcards') {
    (async () => {
      try {
        // Get current content info
        const stored = await chrome.storage.local.get(['currentContentInfo']);
        const contentInfo = stored.currentContentInfo || currentVideoInfo;
        
        if (!contentInfo) {
          throw new Error('No content available to generate flashcards from');
        }

        const contentType = message.contentType || contentInfo.type || 'video';
        const contentText = contentType === 'video' 
          ? (message.transcript || contentInfo.transcript || '')
          : (message.text || contentInfo.text || '');

        if (!contentText) {
          throw new Error('No content text available');
        }

        const requestBody = {
          contentType: contentType,
          title: message.title || contentInfo.title || (contentType === 'video' ? 'unknown video' : contentType === 'pdf' ? 'unknown document' : 'unknown page')
        };

        if (contentType === 'video') {
          requestBody.transcript = contentText;
        } else {
          requestBody.text = contentText;
        }

        const response = await callBackendAPI('/api/flashcards', 'POST', requestBody);
        sendResponse({ success: true, flashcards: response.flashcards });
      } catch (error) {
        console.error('[SumVid] Flashcard generation error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Failed to generate flashcards'
        });
      }
    })();
    return true;
  } else if (message.action === 'sidechat') {
    (async () => {
      try {
        const response = await callBackendAPI('/api/chat', 'POST', {
          message: message.message,
          chatHistory: message.chatHistory || []
        });
        sendResponse({ success: true, reply: response.reply });
      } catch (error) {
        console.error('[SumVid] Sidechat error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Failed to send message'
        });
      }
    })();
    return true;
  } else if (message.type === 'AUTH_TOKEN') {
    // Handle auth token updates from login menu
    (async () => {
      try {
        if (message.token) {
          await saveAuthToken(message.token);
          sendResponse({ success: true });
        } else if (message.action === 'clear') {
          await clearAuthToken();
          sendResponse({ success: true });
        } else {
          const token = await getAuthToken();
          sendResponse({ success: true, token });
        }
      } catch (error) {
        console.error('Auth token error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  } else if (message.action === 'selection-explain' || 
             message.action === 'selection-summarize' || 
             message.action === 'selection-flashcard' || 
             message.action === 'selection-notes') {
    // Handle selection toolbar actions
    // These actions will route to sidebar functionality
    // For now, just send message to sidebar (will be handled when sidebar is open)
    chrome.storage.local.set({ 
      pendingSelectionAction: {
        action: message.action,
        text: message.text,
        timestamp: Date.now()
      }
    });
    sendResponse({ success: true });
    return true;
  }
  return true;
});

// Use setPanelBehavior to automatically open side panel when icon is clicked
// This is the recommended approach for Manifest V3 side panels

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Enable side panel for all tabs
    chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: true
    }).catch(err => {
      // Ignore errors if sidePanel API not available (older Chrome versions)
      console.warn('[SumVid] SidePanel API not available:', err);
    });
    
    // Don't clear content info - extension works on all pages
    // Content info will be updated by content script when page changes
  }
});

// Enable side panel globally when extension starts
chrome.runtime.onStartup.addListener(async () => {
  try {
    // Set panel behavior to automatically open when action icon is clicked
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log('[SumVid] Side panel behavior set on startup');
  } catch (error) {
    console.warn('[SumVid] Could not set side panel behavior on startup:', error);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  transcriptCache.clear();
  chrome.storage.local.remove('currentVideoInfo');
  chrome.action.setBadgeText({ text: '' });
  
  // Set panel behavior to automatically open when action icon is clicked
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log('[SumVid] Side panel behavior set on install');
  } catch (error) {
    console.warn('[SumVid] Could not set side panel behavior on install:', error);
  }
  
  chrome.storage.local.get(['darkMode'], (result) => {
    if (result.darkMode === undefined) {
      chrome.storage.local.set({ darkMode: false });
    }
  });
});