// Function to extract video information
function extractVideoInfo() {
  const titleElement = document.querySelector('h1.style-scope.ytd-watch-metadata');
  
  if (titleElement) {
    const videoTitle = titleElement.textContent.trim();
    const channelElement = document.querySelector('#owner #channel-name a');
    const channelName = channelElement ? channelElement.textContent.trim() : 'Unknown Channel';
    
    // Extract video duration
    const durationElement = document.querySelector('.ytp-time-duration');
    let duration = 0;
    if (durationElement) {
      const durationText = durationElement.textContent;
      const parts = durationText.split(':').map(Number);
      if (parts.length === 2) { // MM:SS format
        duration = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) { // HH:MM:SS format
        duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    
    return {
      title: videoTitle,
      channel: channelName,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      duration: duration
    };
  }
  return null;
}

// Function to wait for element with timeout and retry
async function waitForElement(selector, timeout = 5000, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await new Promise((resolve) => {
        if (document.querySelector(selector)) {
          return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
          if (document.querySelector(selector)) {
            observer.disconnect();
            resolve(document.querySelector(selector));
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeout);
      });

      if (result) return result;
      console.log(`Attempt ${attempt + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error waiting for element:', error.message || error);
    }
  }
  return null;
}

// Function to open and extract transcript
async function extractTranscript() {
  try {
    let showTranscriptButton = await waitForElement('button[aria-label="Show transcript"]');
    
    if (!showTranscriptButton) {
      const moreActionsButton = document.querySelector('button.ytp-button[aria-label="More actions"]');
      if (moreActionsButton) {
        moreActionsButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const menuItems = Array.from(document.querySelectorAll('.ytp-menuitem'));
        const transcriptItem = menuItems.find(item => 
          item.textContent.toLowerCase().includes('transcript')
        );
        
        if (transcriptItem) {
          transcriptItem.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw new Error('Transcript option not found in menu');
        }
      } else {
        throw new Error('More actions button not found');
      }
    } else {
      showTranscriptButton.click();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const transcriptSegments = await waitForElement('ytd-transcript-segment-renderer');
    if (!transcriptSegments) {
      throw new Error('Transcript segments not found');
    }

    const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments.length) {
      throw new Error('No transcript segments available');
    }

    const transcriptText = Array.from(segments)
      .map(segment => {
        const timestamp = segment.querySelector('.ytd-transcript-segment-renderer')?.textContent.trim() || '';
        const text = segment.querySelector('#content-text')?.textContent.trim() || '';
        return `${timestamp} ${text}`;
      })
      .filter(text => text.length > 0)
      .join('\n');

    if (!transcriptText) {
      throw new Error('Failed to extract transcript text');
    }

    const closeButton = document.querySelector('button[aria-label="Close transcript"]');
    if (closeButton) {
      closeButton.click();
    }

    return { transcript: transcriptText };
  } catch (error) {
    console.error('Error extracting transcript:', error.message || 'Unknown error');
    return { error: error.message || 'Failed to extract transcript' };
  }
}

// Function to send message with timeout and retries
async function sendMessageWithTimeout(message) {
  return new Promise((resolve, reject) => {
    try {
      // Check if chrome.runtime is available
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        console.warn('Chrome runtime not available');
        resolve({ error: 'Chrome runtime not available' });
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Chrome runtime error:', chrome.runtime.lastError);
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      console.warn('Error sending message:', error);
      resolve({ error: error.message });
    }
  });
}

let isProcessing = false;
let messageQueue = [];

const SIDEBAR_CONTAINER_ID = 'sumvid-learn-sidebar-container';
const SIDEBAR_ID = 'sumvid-learn-sidebar';
const SIDEBAR_VISIBLE_CLASS = 'sumvid-sidebar-visible';

function ensureSidebarStyles() {
  if (document.getElementById(`${SIDEBAR_CONTAINER_ID}-style`)) {
    return;
  }

  const style = document.createElement('style');
  style.id = `${SIDEBAR_CONTAINER_ID}-style`;
  style.textContent = `
    #${SIDEBAR_CONTAINER_ID} {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: min(546px, 94vw);
      transform: translateX(100%);
      transition: transform 160ms ease-in-out;
      z-index: 2147483647;
      box-shadow: -12px 0 32px rgba(17, 24, 39, 0.24);
      display: flex;
      flex-direction: column;
      background: transparent;
      pointer-events: none;
    }

    #${SIDEBAR_CONTAINER_ID}.${SIDEBAR_VISIBLE_CLASS} {
      transform: translateX(0);
      pointer-events: auto;
    }

    #${SIDEBAR_CONTAINER_ID} #${SIDEBAR_ID} {
      border: none;
      width: 100%;
      height: 100%;
      background: #f5f7fb;
    }

    #${SIDEBAR_CONTAINER_ID} .sumvid-close {
      position: absolute;
      top: 12px;
      left: -52px;
      width: 40px;
      height: 40px;
      border-radius: 20px 0 0 20px;
      border: none;
      background: #1f2a44;
      color: #ffffff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: -8px 0 14px rgba(17, 24, 39, 0.35);
      padding: 0;
      font-size: 18px;
      font-weight: bold;
      visibility: hidden;
      pointer-events: none;
      transition: visibility 0s linear 160ms, opacity 160ms ease;
      opacity: 0;
    }

    #${SIDEBAR_CONTAINER_ID} .sumvid-close:hover {
      background: #162036;
    }

    #${SIDEBAR_CONTAINER_ID}.${SIDEBAR_VISIBLE_CLASS} .sumvid-close {
      visibility: visible;
      pointer-events: auto;
      transition-delay: 0s;
      opacity: 1;
    }
  `;

  document.head.appendChild(style);
}

function createSidebarContainer() {
  ensureSidebarStyles();

  let container = document.getElementById(SIDEBAR_CONTAINER_ID);
  if (container) {
    return container;
  }

  container = document.createElement('div');
  container.id = SIDEBAR_CONTAINER_ID;

  const closeButton = document.createElement('button');
  closeButton.className = 'sumvid-close';
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = 'Close SumVid Learn';
  closeButton.addEventListener('click', () => {
    closeSidebar(container);
  });

  const sidebar = document.createElement('iframe');
  sidebar.id = SIDEBAR_ID;
  sidebar.src = chrome.runtime.getURL('sidebar.html');
  sidebar.setAttribute('allow', 'clipboard-write');

  container.appendChild(closeButton);
  container.appendChild(sidebar);
  document.documentElement.appendChild(container);
  return container;
}

function toggleSidebar() {
  const container = createSidebarContainer();
  const willShow = !container.classList.contains(SIDEBAR_VISIBLE_CLASS);
  container.classList.toggle(SIDEBAR_VISIBLE_CLASS, willShow);
}

function closeSidebar(container) {
  if (!container) {
    container = document.getElementById(SIDEBAR_CONTAINER_ID);
  }
  if (container) {
    container.classList.remove(SIDEBAR_VISIBLE_CLASS);
  }
}

function injectSidebar() {
  // Sidebar is now created via createSidebarContainer when needed
  // Just ensure styles are loaded
  ensureSidebarStyles();
}

// Function to send video info to background script
async function sendVideoInfo() {
  if (isProcessing) {
    console.log('Already processing video info, queuing...');
    messageQueue.push({ type: 'send_video_info' });
    return;
  }

  try {
    isProcessing = true;
    console.log('Attempting to send FULL video info...');
    const titleElement = await waitForElement('h1.style-scope.ytd-watch-metadata', 5000, 3);
    
    if (!titleElement) {
      throw new Error('Failed to find video title element after retries');
    }
    
    const videoInfo = extractVideoInfo();
    if (!videoInfo) {
      throw new Error('Failed to extract basic video info');
    }

    console.log('Basic video info extracted, now getting transcript...');
    const transcriptData = await extractTranscript();

    const data = {
      ...videoInfo,
      ...transcriptData
    };

    console.log('Full video info extracted, sending to background script.');
    
    const response = await sendMessageWithTimeout({
      type: 'VIDEO_INFO',
      data
    });

    if (response?.error) {
      console.warn('Warning sending video info:', response.error);
    } else {
      console.log('Video info sent successfully');
    }
  } catch (error) {
    console.error('Error in sendVideoInfo:', error.message || error);
  } finally {
    isProcessing = false;
    processNextMessage();
  }
}

function processNextMessage() {
  if (messageQueue.length > 0 && !isProcessing) {
    const nextMessage = messageQueue.shift();
    if (nextMessage.type === 'send_video_info') {
      sendVideoInfo();
    }
  }
}

// Initialize content script
console.log('Content script initialized');
sendVideoInfo();

// Handle URL changes
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (url.includes('youtube.com/watch')) {
      console.log('URL changed to a video page, updating info...');
      setTimeout(sendVideoInfo, 2000);
    }
  }
});

observer.observe(document, { subtree: true, childList: true });

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
    sendResponse({ success: true });
    return;
  }

  if (message.type === 'REQUEST_VIDEO_INFO') {
    (async () => {
      if (isProcessing) {
        messageQueue.push({ type: 'send_video_info' });
        sendResponse({ success: false, error: 'Already processing video info, queued request' });
        return;
      }

      try {
        isProcessing = true;
        const transcriptData = await extractTranscript();
        const videoInfo = extractVideoInfo();
        const data = {
          ...videoInfo,
          ...transcriptData
        };
        
        const response = await sendMessageWithTimeout({
          type: 'VIDEO_INFO',
          data
        });

        if (response?.error) {
          sendResponse({ success: false, error: response.error });
        } else {
          sendResponse({ success: true });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      } finally {
        isProcessing = false;
        processNextMessage();
      }
    })();
    return true;
  } else if (message.type === 'GET_BASIC_VIDEO_INFO') {
    // Get basic video info without extracting transcript
    (async () => {
      try {
        const videoInfo = extractVideoInfo();
        if (videoInfo) {
          sendResponse({ success: true, ...videoInfo });
        } else {
          sendResponse({ success: false, error: 'Could not extract video info' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  return false;
});

// Listen for messages from sidebar iframe
window.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'SIDEBAR_MESSAGE') {
    try {
      const response = await sendMessageWithTimeout(event.data.message);
      
      // Send response back to sidebar
      event.source.postMessage({
        type: 'SIDEBAR_RESPONSE',
        response: response
      }, '*');
    } catch (error) {
      // Send error response back to sidebar
      event.source.postMessage({
        type: 'SIDEBAR_RESPONSE',
        response: { error: error.message }
      }, '*');
    }
  } else if (event.data && event.data.type === 'GET_CURRENT_URL') {
    // Send current URL back to sidebar
    event.source.postMessage({
      type: 'CURRENT_URL_RESPONSE',
      url: window.location.href
    }, '*');
  }
});

// Initialize sticky button and sidebar
function initializeExtension() {
  const url = window.location.href;
  if (url.includes('youtube.com/watch')) {
    console.log('[SumVid] Initializing extension on YouTube video page');
    // Inject sidebar container (will be shown/hidden via toggle)
    injectSidebar();

    // Load and initialize sticky button
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('Source/StickyButton.js');
    script.onload = () => {
      console.log('[SumVid] StickyButton.js loaded');
      // Small delay to ensure IIFE has executed
      setTimeout(() => {
        if (window.SumVidStickyButton) {
          // Make toggleSidebar available globally for sticky button
          window.toggleSidebar = toggleSidebar;
          // Initialize sticky button
          console.log('[SumVid] Initializing sticky button');
          window.SumVidStickyButton.init({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
        } else {
          console.error('[SumVid] SumVidStickyButton not found on window after load');
          console.log('[SumVid] window.SumVidStickyButton:', typeof window.SumVidStickyButton);
        }
      }, 10);
    };
    script.onerror = () => {
      console.error('[SumVid] Failed to load StickyButton.js');
    };
    document.head.appendChild(script);
  } else {
    console.log('[SumVid] Not a YouTube video page, skipping initialization');
  }
}

// Initialize sticky button and sidebar when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeExtension, 100);
  });
} else {
  setTimeout(initializeExtension, 100);
}