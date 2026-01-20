/**
 * Image Utilities Module
 * Shared image compression and processing functions
 */

(function() {
  'use strict';

  window.ImageUtils = {
    /**
     * Compress image to reduce file size
     * @param {string} imageData - Base64 data URL
     * @param {number} maxWidth - Maximum width in pixels (default: 800)
     * @param {number} maxHeight - Maximum height in pixels (default: 800)
     * @param {number} quality - JPEG quality 0-1 (default: 0.7)
     * @returns {Promise<string>} Compressed base64 data URL
     */
    async compressImage(imageData, maxWidth = 800, maxHeight = 800, quality = 0.7) {
      if (!imageData || typeof imageData !== 'string') return imageData;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (error) {
            resolve(imageData);
          }
        };
        img.onerror = () => resolve(imageData);
        img.src = imageData;
      });
    }
  };
})();
