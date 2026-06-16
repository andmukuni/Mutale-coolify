import { createCanvas, loadImage } from 'canvas';
import { getCertificateSealSvg } from './certificateSealArt.js';
import {
  CERTIFICATE_SEAL_GOLD_ROUND,
  CERTIFICATE_SEAL_NAVY_STAR,
  CERTIFICATE_SEAL_TEAL_LAUREL,
  CERTIFICATE_SEAL_WAX,
} from './certificateSeals.js';

const cache = new Map();

const SEAL_SRC_TO_ART_ID = {
  [CERTIFICATE_SEAL_GOLD_ROUND]: 'gold-round',
  [CERTIFICATE_SEAL_NAVY_STAR]: 'navy-star',
  [CERTIFICATE_SEAL_TEAL_LAUREL]: 'teal-laurel',
  [CERTIFICATE_SEAL_WAX]: 'classic-wax',
};

async function rasterizeSvgToPngDataUrl(svg, size = 256) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = await loadImage(Buffer.from(svg));
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

/**
 * Load a bundled decorative seal as a PNG data URL for jsPDF.
 * @param {string} src
 */
export async function loadCertificateSealDataUrl(src) {
  const raw = String(src || '').trim();
  const artId = SEAL_SRC_TO_ART_ID[raw];
  if (!artId) return '';

  if (cache.has(raw)) return cache.get(raw);

  const svg = getCertificateSealSvg(artId);
  if (!svg) return '';

  try {
    const dataUrl = await rasterizeSvgToPngDataUrl(svg);
    cache.set(raw, dataUrl);
    return dataUrl;
  } catch (error) {
    console.warn('[certificate] Failed to rasterize seal:', raw, error.message);
    return '';
  }
}

export function isBundledCertificateSealSrc(src) {
  return Boolean(SEAL_SRC_TO_ART_ID[String(src || '').trim()]);
}
