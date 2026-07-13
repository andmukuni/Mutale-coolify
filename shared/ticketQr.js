import QRCode from 'qrcode';

/**
 * Public ticket page URL encoded in entry QR codes.
 * @param {string} referenceCode - Unique per-ticket reference (REG-…)
 * @param {string} appOrigin - Site origin without trailing slash
 * @returns {string|null}
 */
export function buildTicketScanUrl(referenceCode = '', appOrigin = '') {
  const code = String(referenceCode || '').trim();
  const origin = String(appOrigin || '').trim().replace(/\/$/, '');
  if (!code || !origin) return null;
  return `${origin}/tickets/${encodeURIComponent(code)}`;
}

/**
 * Extract a ticket reference from a scanned QR payload (full URL or raw code).
 * @param {string} value
 * @returns {string}
 */
export function parseTicketReferenceFromScan(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.includes('/tickets/')) {
    try {
      const url = raw.includes('://') ? new URL(raw) : new URL(`https://local${raw.startsWith('/') ? raw : `/${raw}`}`);
      const parts = url.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('tickets');
      if (idx >= 0 && parts[idx + 1]) {
        return decodeURIComponent(parts[idx + 1]).trim();
      }
    } catch {
      const match = raw.match(/\/tickets\/([^/?#]+)/i);
      if (match?.[1]) return decodeURIComponent(match[1]).trim();
    }
  }

  return raw;
}

/**
 * @param {string} url
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function generateTicketQrDataUrl(url, { size = 200 } = {}) {
  if (!url) return '';
  return QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

/**
 * @param {string} referenceCode
 * @param {string} appOrigin
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function buildTicketQrDataUrl(referenceCode = '', appOrigin = '', opts = {}) {
  const url = buildTicketScanUrl(referenceCode, appOrigin);
  if (!url) return '';
  try {
    return await generateTicketQrDataUrl(url, opts);
  } catch {
    return '';
  }
}
