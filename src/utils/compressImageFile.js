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

  if (!file?.type?.startsWith('image/')) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

  report(5);

  try {
    const bitmap = await createImageBitmap(file);
    report(25);

    let { width, height } = bitmap;
    const scale = Math.min(1, maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1));
    const needsScale = scale < 1;
    const needsCompress = opts.force || file.size > maxBytes || needsScale;

    if (!needsCompress) {
      bitmap.close?.();
      report(100);
      return file;
    }

    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      report(100);
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    report(55);

    const outType = file.type === 'image/gif' ? 'image/jpeg' : 'image/jpeg';
    let blob = null;
    let usedQuality = quality;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      usedQuality = Math.max(0.42, quality - attempt * 0.06);
      // eslint-disable-next-line no-await-in-loop
      blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), outType, usedQuality);
      });
      report(55 + ((attempt + 1) / 8) * 35);
      if (blob && blob.size <= maxBytes) break;
    }

    if (!blob) {
      report(100);
      return file;
    }

    if (!opts.force && blob.size >= file.size && !needsScale) {
      report(100);
      return file;
    }

    const ext = '.jpg';
    const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    report(100);
    return new File([blob], `${baseName}${ext}`, { type: outType, lastModified: Date.now() });
  } catch {
    report(100);
    return file;
  }
}
