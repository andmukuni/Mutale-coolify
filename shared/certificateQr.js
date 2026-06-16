import QRCode from 'qrcode';

/**
 * Public verification page URL for a certificate code.
 * @param {string} certificateCode
 * @param {string} appOrigin - Site origin without trailing slash
 */
export function buildCertificateVerifyUrl(certificateCode, appOrigin = '') {
  const code = String(certificateCode || '').trim();
  const origin = String(appOrigin || '').trim().replace(/\/$/, '');
  if (!code || !origin) return '';
  return `${origin}/certificates/verify/${encodeURIComponent(code)}`;
}

/**
 * @param {string} url
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function generateCertificateQrDataUrl(url, { size = 200 } = {}) {
  if (!url) return '';
  return QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

/**
 * @param {string} certificateCode
 * @param {string} appOrigin
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function buildCertificateQrDataUrl(certificateCode, appOrigin = '', opts = {}) {
  const url = buildCertificateVerifyUrl(certificateCode, appOrigin);
  if (!url) return '';
  try {
    return await generateCertificateQrDataUrl(url, opts);
  } catch {
    return '';
  }
}
