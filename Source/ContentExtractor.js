/**
 * Content Extractor Module
 * Universal content extraction for videos, webpages, and PDFs
 */

/**
 * Detects the content type of the current page
 * @returns {Promise<Object|null>} Content type info or null
 */
export async function detectContentType() {
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
    console.error('[ContentExtractor] Error detecting content type:', error);
    return null;
  }
}

/**
 * Extracts text content from a webpage
 * @returns {Promise<string>} Extracted text
 */
export async function extractWebpageText() {
  try {
    // Remove script and style elements
    const scripts = document.querySelectorAll('script, style, noscript, iframe');
    scripts.forEach(el => el.remove());
    
    // Get main content areas (prioritize article, main, content areas)
    let content = '';
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    const contentArea = document.querySelector('[role="main"], .content, .post-content, .entry-content');
    
    if (article) {
      content = article.innerText || article.textContent || '';
    } else if (main) {
      content = main.innerText || main.textContent || '';
    } else if (contentArea) {
      content = contentArea.innerText || contentArea.textContent || '';
    } else {
      // Fallback to body
      const bodyClone = document.body.cloneNode(true);
      bodyClone.querySelectorAll('script, style, noscript, iframe, nav, header, footer, aside').forEach(el => el.remove());
      content = bodyClone.innerText || bodyClone.textContent || '';
    }
    
    // Clean up text
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    return content;
  } catch (error) {
    console.error('[ContentExtractor] Error extracting webpage text:', error);
    return '';
  }
}

/**
 * Gets webpage metadata
 * @returns {Object} Metadata object
 */
export function getWebpageMetadata() {
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
