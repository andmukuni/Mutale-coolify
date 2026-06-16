/**
 * Downscale/compress an image file before upload (keeps under API size limits).
 * @param {File} file
 * @param {{ maxDim?: number, quality?: number, maxBytes?: number }} [opts]
 * @returns {Promise<File>}
 */
export async function compressImageFile(file, opts = {}) {
  const maxDim = opts.maxDim ?? 1920;
  const quality = opts.quality ?? 0.86;
  const maxBytes = opts.maxBytes ?? 2.5 * 1024 * 1024;

  if (!file?.type?.startsWith('image/')) return file;
  if (file.size <= maxBytes && !file.type.includes('png')) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height, 1));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const outType = file.type === 'image/png' || file.type === 'image/webp'
      ? 'image/jpeg'
      : (file.type || 'image/jpeg');
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outType, quality);
    });
    if (!blob || blob.size >= file.size) return file;

    const ext = outType === 'image/jpeg' ? '.jpg' : '';
    const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}${ext}`, { type: outType, lastModified: Date.now() });
  } catch {
    return file;
  }
}
