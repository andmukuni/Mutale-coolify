/**
 * Downscale/compress an image file before upload (keeps under API size limits).
 * @param {File} file
 * @param {{
 *   maxDim?: number,
 *   maxWidth?: number,
 *   maxHeight?: number,
 *   quality?: number,
 *   maxBytes?: number,
 *   force?: boolean,
 *   onProgress?: (percent: number) => void,
 * }} [opts]
 * @returns {Promise<File>}
 */
export async function compressImageFile(file, opts = {}) {
  const maxDim = opts.maxDim ?? 1920;
  const maxWidth = opts.maxWidth ?? maxDim;
  const maxHeight = opts.maxHeight ?? maxDim;
  const quality = opts.quality ?? 0.86;
  const maxBytes = opts.maxBytes ?? 2.5 * 1024 * 1024;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  const report = (value) => {
    onProgress?.(Math.max(0, Math.min(100, Math.round(value))));
  };

  if (!file || typeof file.size !== 'number') return file;
  if (file.type && !String(file.type).startsWith('image/')) return file;
  if (typeof document === 'undefined') {
    if (file.size > maxBytes) {
      throw new Error('Image is too large to process in this environment. Try a JPG or PNG under 3 MB.');
    }
    return file;
  }

  report(5);

  try {
    const source = await loadImageSource(file);
    report(25);

    let width = Math.max(1, Number(source.width) || 1);
    let height = Math.max(1, Number(source.height) || 1);
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    const needsScale = scale < 1;
    const needsCompress = opts.force || file.size > maxBytes || needsScale;

    if (!needsCompress) {
      closeImageSource(source);
      report(100);
      return file;
    }

    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    let canvas = drawToCanvas(source, width, height);
    closeImageSource(source);
    if (!canvas) {
      report(100);
      if (file.size > maxBytes) {
        throw new Error('Could not compress this image. Try a JPG or PNG instead.');
      }
      return file;
    }
    report(55);

    const blob = await encodeJpegUntilFits(canvas, maxBytes, quality, report);
    if (!blob) {
      throw new Error('Could not compress this image. Try a JPG or PNG instead.');
    }
    if (blob.size > maxBytes) {
      throw new Error('This photo is still too large after shrinking. Try a simpler image.');
    }

    const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    report(100);
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (error) {
    report(100);
    if (error?.message) throw error;
    throw new Error('Could not read this image. Use a JPG, PNG, or WebP photo.');
  }
}

async function loadImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* some types (HEIC) fail here — try HTMLImageElement */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read this image. Use a JPG, PNG, or WebP photo.'));
      el.src = url;
    });
    image._objectUrl = url;
    return image;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function closeImageSource(source) {
  source?.close?.();
  if (source?._objectUrl) URL.revokeObjectURL(source._objectUrl);
}

function drawToCanvas(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function encodeJpegUntilFits(startCanvas, maxBytes, startQuality, report) {
  let canvas = startCanvas;
  let width = canvas.width;
  let height = canvas.height;

  for (let round = 0; round < 6; round += 1) {
    for (let step = 0; step < 8; step += 1) {
      const usedQuality = Math.max(0.4, startQuality - step * 0.06);
      // eslint-disable-next-line no-await-in-loop
      const blob = await canvasToBlob(canvas, 'image/jpeg', usedQuality);
      report(55 + Math.round(((round * 8 + step + 1) / 48) * 40));
      if (blob && blob.size <= maxBytes) return blob;
    }

    const nextWidth = Math.max(320, Math.round(width * 0.75));
    const nextHeight = Math.max(180, Math.round(height * 0.75));
    if (nextWidth === width && nextHeight === height) break;
    const next = document.createElement('canvas');
    next.width = nextWidth;
    next.height = nextHeight;
    const ctx = next.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(canvas, 0, 0, nextWidth, nextHeight);
    canvas = next;
    width = nextWidth;
    height = nextHeight;
  }

  return canvasToBlob(canvas, 'image/jpeg', 0.38);
}
