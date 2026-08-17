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

    let canvas = createCanvas(width, height);
    let ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    for (let round = 0; round < 6; round += 1) {
      for (let quality = 0.92; quality >= 0.4; quality -= 0.06) {
        const jpeg = canvas.toBuffer('image/jpeg', { quality });
        if (jpeg.length <= maxBytes) {
          return { buffer: jpeg, mimeType: 'image/jpeg' };
        }
      }
      const nextWidth = Math.max(320, Math.round(width * 0.75));
      const nextHeight = Math.max(180, Math.round(height * 0.75));
      if (nextWidth === width && nextHeight === height) break;
      const next = createCanvas(nextWidth, nextHeight);
      next.getContext('2d').drawImage(canvas, 0, 0, nextWidth, nextHeight);
      canvas = next;
      ctx = next.getContext('2d');
      width = nextWidth;
      height = nextHeight;
    }

    const smallest = canvas.toBuffer('image/jpeg', { quality: 0.38 });
    return { buffer: smallest, mimeType: 'image/jpeg' };
  } catch (error) {
    if (buffer.length <= maxBytes) {
      return { buffer, mimeType };
    }
    throw new Error(error?.message || 'Image is too large. Try a JPG or PNG photo.');
  }
}
