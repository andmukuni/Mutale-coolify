import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_LOGO_PATH = path.join(__dirname, 'assets', 'certificate-logo-navy.png');
const FALLBACK_LOGO_PATH = path.join(__dirname, 'assets', 'Logo-Website-Mutale-08.png');

let cachedDataUrl = null;

export function getBundledCertificateLogoPath() {
  return BUNDLED_LOGO_PATH;
}

/**
 * Load certificate logo as a data URL for jsPDF and server-side PDF generation.
 * @param {string} [appRoot]
 */
export async function loadCertificateLogoDataUrl(appRoot = '') {
  if (cachedDataUrl) return cachedDataUrl;

  const candidates = [BUNDLED_LOGO_PATH, FALLBACK_LOGO_PATH];

  if (appRoot) {
    candidates.push(
      path.join(appRoot, 'shared', 'assets', 'certificate-logo-navy.png'),
      path.join(appRoot, 'Logo-Website-Mutale_Main - Navy and Teal.png'),
      path.join(appRoot, 'Logo-Website-Mutale-08.png'),
    );
  }

  for (const logoPath of candidates) {
    try {
      const buf = await fs.readFile(logoPath);
      cachedDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      return cachedDataUrl;
    } catch {
      // try next
    }
  }

  console.warn('[certificate] Logo file not found; certificates will render without logo.');
  return '';
}

export async function getCertificateLogoFileUrl() {
  try {
    await fs.access(BUNDLED_LOGO_PATH);
    return pathToFileURL(BUNDLED_LOGO_PATH).href;
  } catch {
    try {
      await fs.access(FALLBACK_LOGO_PATH);
      return pathToFileURL(FALLBACK_LOGO_PATH).href;
    } catch {
      return '';
    }
  }
}
