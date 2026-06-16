import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CERTIFICATE_ACHIEVEMENT_FRAME_SRC } from './certificateBundledAssets.js';

export { CERTIFICATE_ACHIEVEMENT_FRAME_SRC } from './certificateBundledAssets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUNDLED_FRAME_PATH = path.join(__dirname, 'assets', 'certificate-achievement-frame.png');

let cachedFrameDataUrl = null;

export function getBundledAchievementFramePath() {
  return BUNDLED_FRAME_PATH;
}

/**
 * Load achievement certificate frame as data URL for jsPDF.
 * @param {string} [appRoot]
 */
export async function loadAchievementFrameDataUrl(appRoot = '') {
  if (cachedFrameDataUrl) return cachedFrameDataUrl;

  const candidates = [BUNDLED_FRAME_PATH];

  if (appRoot) {
    candidates.push(path.join(appRoot, 'shared', 'assets', 'certificate-achievement-frame.png'));
  }

  for (const framePath of candidates) {
    try {
      const buf = await fs.readFile(framePath);
      cachedFrameDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      return cachedFrameDataUrl;
    } catch {
      // try next
    }
  }

  console.warn('[certificate] Achievement frame not found; falling back to drawn background.');
  return '';
}

/**
 * Resolve bundled background image src token to data URL.
 * @param {string} src
 * @param {string} [appRoot]
 */
export async function resolveCertificateBackgroundImageSrc(src, appRoot = '') {
  if (src === CERTIFICATE_ACHIEVEMENT_FRAME_SRC) {
    return loadAchievementFrameDataUrl(appRoot);
  }
  return '';
}
