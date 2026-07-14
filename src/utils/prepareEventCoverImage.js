import { compressImageFile } from './compressImageFile';
import { readFileAsDataUrl } from './uploadBlogImage';

/** Recommended event cover dimensions (16:9). */
export const EVENT_COVER_MAX_WIDTH = 1200;
export const EVENT_COVER_MAX_HEIGHT = 630;
/** Target binary size — base64 stays under the 3 MB server limit. */
export const EVENT_COVER_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Resize/compress any cover image to recommended event dimensions in the browser.
 * @param {File} file
 * @param {{ onProgress?: (percent: number) => void }} [opts]
 * @returns {Promise<{ dataUrl: string, file: File }>}
 */
export async function prepareEventCoverImage(file, opts = {}) {
  const onProgress = opts.onProgress;

  onProgress?.(0);

  const compressed = await compressImageFile(file, {
    maxWidth: EVENT_COVER_MAX_WIDTH,
    maxHeight: EVENT_COVER_MAX_HEIGHT,
    maxBytes: EVENT_COVER_MAX_BYTES,
    quality: 0.88,
    force: true,
    onProgress: (value) => {
      onProgress?.(Math.min(92, Math.round(value * 0.92)));
    },
  });

  onProgress?.(94);
  const dataUrl = await readFileAsDataUrl(compressed);
  onProgress?.(100);

  return { dataUrl, file: compressed };
}
