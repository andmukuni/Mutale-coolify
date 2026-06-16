import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_LOGO_PATH = path.join(__dirname, 'assets', 'Logo-Website-Mutale-08.png');

let cachedDataUrl = null;
let cachedFileUrl = null;

/**
 * Absolute path to the bundled receipt logo (ships inside shared/ on every deploy).
 */
export function getBundledReceiptLogoPath() {
  return BUNDLED_LOGO_PATH;
}

/**
 * file:// URL for headless Chrome PDF rendering.
 */
export async function getReceiptLogoFileUrl() {
  if (cachedFileUrl) return cachedFileUrl;
  try {
    await fs.access(BUNDLED_LOGO_PATH);
    cachedFileUrl = pathToFileURL(BUNDLED_LOGO_PATH).href;
    return cachedFileUrl;
  } catch {
    return '';
  }
}

/**
 * Load receipt logo as a data URL for jsPDF / inline HTML.
 * @param {string} [appRoot] - optional app root for legacy fallbacks
 */
export async function loadReceiptLogoDataUrl(appRoot = '') {
  if (cachedDataUrl) return cachedDataUrl;

  const candidates = [BUNDLED_LOGO_PATH];

  if (appRoot) {
    candidates.push(path.join(appRoot, 'Logo-Website-Mutale-08.png'));
    try {
      const assetsDir = path.join(appRoot, 'dist', 'assets');
      const files = await fs.readdir(assetsDir);
      const hashedLogo = files.find(
        (name) => name.startsWith('Logo-Website-Mutale-08') && name.endsWith('.png'),
      );
      if (hashedLogo) {
        candidates.push(path.join(assetsDir, hashedLogo));
      }
    } catch {
      // ignore
    }
  }

  for (const logoPath of candidates) {
    try {
      const buf = await fs.readFile(logoPath);
      cachedDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      cachedFileUrl = pathToFileURL(logoPath).href;
      return cachedDataUrl;
    } catch {
      // try next
    }
  }

  console.warn('[receipt] Logo file not found; receipts will render without logo.');
  return '';
}
