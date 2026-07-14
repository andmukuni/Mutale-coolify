/**
 * Server-side image downscale/compress fallback when uploads exceed size limits.
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {{ maxBytes?: number, maxWidth?: number, maxHeight?: number, forceDimensions?: boolean }} [opts]
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
export async function optimizeImageBuffer(buffer, mimeType = 'image/jpeg', opts = {}) {
  const maxBytes = opts.maxBytes ?? 3 * 1024 * 1024;
  const maxWidth = opts.maxWidth ?? 1920;
  const maxHeight = opts.maxHeight ?? 1920;
  const forceDimensions = Boolean(opts.forceDimensions);

  if (!buffer) {
    return { buffer, mimeType };
  }

  try {
    const { createCanvas, loadImage } = await import('canvas');
    const img = await loadImage(buffer);
    const needsScale = img.width > maxWidth || img.height > maxHeight;

    if (!forceDimensions && !needsScale && buffer.length <= maxBytes) {
      return { buffer, mimeType };
    }

    let width = img.width;
    let height = img.height;
    const scale = Math.min(1, maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    for (let quality = 0.92; quality >= 0.4; quality -= 0.06) {
      const jpeg = canvas.toBuffer('image/jpeg', { quality });
      if (jpeg.length <= maxBytes) {
        return { buffer: jpeg, mimeType: 'image/jpeg' };
      }
    }

    const smallest = canvas.toBuffer('image/jpeg', { quality: 0.38 });
    if (smallest.length <= maxBytes) {
      return { buffer: smallest, mimeType: 'image/jpeg' };
    }

    throw new Error('Image is too large even after optimization. Try a smaller photo or paste an image URL.');
  } catch (error) {
    if (error?.message?.includes('too large even after optimization')) throw error;
    throw new Error('Image is too large. Maximum size is 3 MB.');
  }
}
