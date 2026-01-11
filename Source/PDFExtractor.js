/**
 * PDF Extractor Module
 * Handles PDF text extraction for both Chrome PDF viewer and PDF.js
 */

/**
 * Checks if current page is a PDF (Chrome PDF viewer)
 * @returns {boolean} True if PDF viewer detected
 */
export function isChromePDFViewer() {
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

/**
 * Checks if current page is using PDF.js
 * @returns {boolean} True if PDF.js detected
 */
export function isPDFjs() {
  try {
    // Check for PDF.js viewer
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

/**
 * Extracts text from Chrome PDF viewer
 * Note: Chrome PDF viewer has limited access, we return the URL for server-side extraction
 * @returns {Promise<Object>} PDF info object
 */
export async function extractChromePDFViewer() {
  try {
    const url = window.location.href;
    return {
      type: 'pdf',
      title: document.title || url,
      url: url,
      pdfUrl: url,
      canSummarize: true,
      // Chrome PDF viewer doesn't allow direct text extraction
      // Server will need to fetch and extract
      needsServerExtraction: true
    };
  } catch (error) {
    console.error('[PDFExtractor] Error extracting Chrome PDF viewer:', error);
    throw error;
  }
}

/**
 * Extracts text from PDF.js viewer
 * @returns {Promise<string>} Extracted text
 */
export async function extractPDFjsText() {
  try {
    // Check if PDF.js is available
    if (!window.PDFViewerApplication && !document.querySelector('.textLayer')) {
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
    console.error('[PDFExtractor] Error extracting PDF.js text:', error);
    throw error;
  }
}

/**
 * Gets PDF URL from current page
 * @returns {string} PDF URL
 */
export function getPDFUrl() {
  try {
    // Try to get URL from embed src
    const pdfEmbed = document.body.querySelector('embed[type="application/pdf"]');
    if (pdfEmbed && pdfEmbed.src) {
      return pdfEmbed.src;
    }
    
    // Fallback to current URL
    return window.location.href;
  } catch (error) {
    return window.location.href;
  }
}
