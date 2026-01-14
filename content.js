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

// Inline content detection functions (since content scripts can't easily use ES6 imports)
function detectContentType() {
  try {
    const url = window.location.href;
    
    // Check for PDF (Chrome PDF viewer)
    const pdfEmbed = document.body.querySelector('embed[type="application/pdf"]');
    if (pdfEmbed && pdfEmbed.getAttribute('width') === '100%' && 
        pdfEmbed.getAttribute('height') === '100%' && 
        pdfEmbed.getAttribute('internalid')) {
      return {
        type: 'pdf',
        title: document.title || url,
        url: url,
        canSummarize: true,
        pdfUrl: url
      };
    }
    
    // Check for YouTube video
    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
      return {
        type: 'video',
        platform: 'youtube',
        url: url,
        canSummarize: true
      };
    }
    
    // Default to webpage
    return {
      type: 'webpage',
      title: document.title || url,
      url: url,
      canSummarize: true
    };
  } catch (error) {
    console.error('[Eureka AI] Error detecting content type:', error);
    return null;
  }
}

function extractWebpageText() {
  try {
    // Create a clone of the document body to avoid modifying the actual DOM
    const bodyClone = document.body.cloneNode(true);
    
    // Remove unwanted elements from the clone
    const elementsToRemove = bodyClone.querySelectorAll('script, style, noscript, iframe, nav, header, footer, aside, .ad, .advertisement, .ads, [class*="ad-"], [id*="ad-"]');
    elementsToRemove.forEach(el => el.remove());
    
    // Get main content areas (prioritize article, main, content areas)
    let content = '';
    const article = bodyClone.querySelector('article');
    const main = bodyClone.querySelector('main');
    const contentArea = bodyClone.querySelector('[role="main"], .content, .post-content, .entry-content, #content, #main-content, .main-content');
    
    if (article) {
      content = article.innerText || article.textContent || '';
    } else if (main) {
      content = main.innerText || main.textContent || '';
    } else if (contentArea) {
      content = contentArea.innerText || contentArea.textContent || '';
    } else {
      // Fallback: use the entire body clone (already cleaned)
      content = bodyClone.innerText || bodyClone.textContent || '';
    }
    
    // Clean up text
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    // Log extraction for debugging
    console.log('[Eureka AI] Extracted webpage text length:', content.length);
    
    return content;
  } catch (error) {
    console.error('[Eureka AI] Error extracting webpage text:', error);
    return '';
  }
}

function getWebpageMetadata() {
  const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
  const metaTitle = document.querySelector('meta[property="og:title"]')?.content || 
                    document.querySelector('meta[name="twitter:title"]')?.content ||
                    document.title ||
                    window.location.href;
  
  return {
    title: metaTitle,
    description: metaDescription,
    url: window.location.href
  };
}

function isChromePDFViewer() {
  try {
    const pdfEmbed = document.body.querySelector('embed[type="application/pdf"]');
    return !!(
      pdfEmbed &&
      pdfEmbed.getAttribute('width') === '100%' &&
      pdfEmbed.getAttribute('height') === '100%' &&
      pdfEmbed.getAttribute('internalid')
    );
  } catch (error) {
    return false;
  }
}

function isPDFjs() {
  try {
    return !!(
      window.PDFViewerApplication ||
      document.querySelector('.textLayer') ||
      document.querySelector('#viewer') ||
      window.location.href.includes('pdfjs')
    );
  } catch (error) {
    return false;
  }
}

async function extractChromePDFViewer() {
  try {
    const url = window.location.href;
    return {
      type: 'pdf',
      title: document.title || url,
      url: url,
      pdfUrl: url,
      canSummarize: true,
      needsServerExtraction: true
    };
  } catch (error) {
    console.error('[Eureka AI] Error extracting Chrome PDF viewer:', error);
    throw error;
  }
}

async function extractPDFjsText() {
  try {
    if (!isPDFjs()) {
      throw new Error('PDF.js not detected on page');
    }
    
    let text = '';
    
    // Try to get text from textLayer elements (PDF.js renders text there)
    const textLayers = document.querySelectorAll('.textLayer');
    if (textLayers.length > 0) {
      textLayers.forEach(layer => {
        const layerText = layer.innerText || layer.textContent || '';
        text += layerText + '\n';
      });
    } else {
      // Fallback: try to get text from the viewer container
      const viewer = document.querySelector('#viewer') || document.querySelector('.pdfViewer');
      if (viewer) {
        text = viewer.innerText || viewer.textContent || '';
      } else {
        // Last resort: get all visible text
        const bodyClone = document.body.cloneNode(true);
        bodyClone.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
        text = bodyClone.innerText || bodyClone.textContent || '';
      }
    }
    
    // Clean up text
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    return text;
  } catch (error) {
    console.error('[Eureka AI] Error extracting PDF.js text:', error);
    throw error;
  }
}

function getPDFUrl() {
  try {
    const pdfEmbed = document.body.querySelector('embed[type="application/pdf"]');
    if (pdfEmbed && pdfEmbed.src) {
      return pdfEmbed.src;
    }
    return window.location.href;
  } catch (error) {
    return window.location.href;
  }
}

// Function to send content info to background script (universal: video, webpage, PDF)
async function sendContentInfo() {
  if (isProcessing) {
    console.log('[Eureka AI] Already processing content info, queuing...');
    messageQueue.push({ type: 'send_content_info' });
    return;
  }

  try {
    isProcessing = true;
    console.log('[Eureka AI] Detecting content type...');

    const contentType = detectContentType();
    if (!contentType) {
      throw new Error('Failed to detect content type');
    }

    console.log('[Eureka AI] Content type detected:', contentType.type);

    let contentData = {
      ...contentType,
      timestamp: new Date().toISOString()
    };

    // Extract content based on type
    if (contentType.type === 'video') {
      // YouTube video - use existing extraction
      const titleElement = await waitForElement('h1.style-scope.ytd-watch-metadata', 5000, 3);
      if (!titleElement) {
        throw new Error('Failed to find video title element after retries');
      }

      const videoInfo = extractVideoInfo();
      if (!videoInfo) {
        throw new Error('Failed to extract basic video info');
      }

      console.log('[Eureka AI] Basic video info extracted, now getting transcript...');
      const transcriptData = await extractTranscript();

      contentData = {
        ...contentData,
        ...videoInfo,
        ...transcriptData
      };
    } else if (contentType.type === 'pdf') {
      // PDF content
      if (isChromePDFViewer()) {
        console.log('[Eureka AI] Detected Chrome PDF viewer');
        const pdfInfo = await extractChromePDFViewer();
        contentData = { ...contentData, ...pdfInfo };
        // Chrome PDF viewer needs server-side extraction
        contentData.needsServerExtraction = true;
      } else if (isPDFjs()) {
        console.log('[Eureka AI] Detected PDF.js viewer');
        const pdfText = await extractPDFjsText();
        contentData.text = pdfText;
        contentData.pdfUrl = getPDFUrl();
      } else {
        throw new Error('PDF detected but extraction method not available');
      }
    } else if (contentType.type === 'webpage') {
      // Webpage content
      console.log('[Eureka AI] Extracting webpage text...');
      const webpageText = extractWebpageText();
      const metadata = getWebpageMetadata();
      
      contentData = {
        ...contentData,
        text: webpageText,
        ...metadata
      };
    }

    console.log('[Eureka AI] Content extracted, sending to background script.');
    
    const response = await sendMessageWithTimeout({
      type: 'CONTENT_INFO',
      data: contentData
    });

    if (response?.error) {
      console.warn('[Eureka AI] Warning sending content info:', response.error);
    } else {
      console.log('[Eureka AI] Content info sent successfully');
    }
  } catch (error) {
    console.error('[Eureka AI] Error in sendContentInfo:', error.message || error);
  } finally {
    isProcessing = false;
    processNextMessage();
  }
}

// Legacy function name for backward compatibility
async function sendVideoInfo() {
  return sendContentInfo();
}

function processNextMessage() {
  if (messageQueue.length > 0 && !isProcessing) {
    const nextMessage = messageQueue.shift();
    if (nextMessage.type === 'send_video_info' || nextMessage.type === 'send_content_info') {
      sendContentInfo();
    }
  }
}

// Initialize content script - send content info for all pages
console.log('[Eureka AI] Content script initialized');

// Initialize sticky button on all pages
// StickyButton.js is now loaded as a content script, so it should auto-initialize
// But we'll also try to initialize it here as a fallback
if (typeof window.EurekaAIStickyButton !== 'undefined') {
  window.EurekaAIStickyButton.init();
} else {
  // Wait for StickyButton to load (it's in content_scripts, so should be available)
  const checkStickyButton = setInterval(() => {
    if (typeof window.EurekaAIStickyButton !== 'undefined') {
      window.EurekaAIStickyButton.init();
      clearInterval(checkStickyButton);
    }
  }, 100);
  
  // Stop checking after 5 seconds
  setTimeout(() => clearInterval(checkStickyButton), 5000);
}

// Send content info for current page
sendContentInfo();

// Handle URL changes - enhanced to catch all navigation types
let lastUrl = location.href;

// Function to trigger content detection when URL changes
function triggerContentUpdate() {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('[Eureka AI] URL changed, updating content info...');
    setTimeout(sendContentInfo, 2000);
  }
}

// MutationObserver for DOM changes (catches some SPA navigations)
const observer = new MutationObserver(() => {
  triggerContentUpdate();
});
observer.observe(document, { subtree: true, childList: true });

// Periodic check for URL changes (catches pushState/replaceState)
setInterval(triggerContentUpdate, 500);

// Listen for popstate (back/forward navigation)
window.addEventListener('popstate', () => {
  triggerContentUpdate();
});

// Override pushState and replaceState to catch SPA navigation
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(history, args);
  triggerContentUpdate();
};

history.replaceState = function(...args) {
  originalReplaceState.apply(history, args);
  triggerContentUpdate();
};

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_VIDEO_INFO' || message.type === 'REQUEST_CONTENT_INFO') {
    (async () => {
      if (isProcessing) {
        messageQueue.push({ type: 'send_content_info' });
        sendResponse({ success: false, error: 'Already processing content info, queued request' });
        return;
      }

      try {
        isProcessing = true;
        
        const contentType = detectContentType();
        if (!contentType) {
          throw new Error('Failed to detect content type');
        }

        let contentData = { ...contentType };

        if (contentType.type === 'video') {
          const transcriptData = await extractTranscript();
          const videoInfo = extractVideoInfo();
          contentData = { ...contentData, ...videoInfo, ...transcriptData };
        } else if (contentType.type === 'pdf') {
          if (isChromePDFViewer()) {
            const pdfInfo = await extractChromePDFViewer();
            contentData = { ...contentData, ...pdfInfo };
          } else if (isPDFjs()) {
            const pdfText = await extractPDFjsText();
            contentData.text = pdfText;
            contentData.pdfUrl = getPDFUrl();
          }
        } else if (contentType.type === 'webpage') {
          const webpageText = extractWebpageText();
          const metadata = getWebpageMetadata();
          contentData = { ...contentData, text: webpageText, ...metadata };
        }
        
        const response = await sendMessageWithTimeout({
          type: 'CONTENT_INFO',
          data: contentData
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
    // Get basic video info without extracting transcript (legacy support)
    (async () => {
      try {
        if (window.location.href.includes('youtube.com/watch')) {
          const videoInfo = extractVideoInfo();
          if (videoInfo) {
            sendResponse({ success: true, ...videoInfo });
          } else {
            sendResponse({ success: false, error: 'Could not extract video info' });
          }
        } else {
          sendResponse({ success: false, error: 'Not a YouTube video page' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  return false;
});