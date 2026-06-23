/**
 * Shared security utilities (testable, no Express app dependency).
 */

const _genericRateBuckets = new Map();

export function resetGenericRateBucketsForTests() {
  _genericRateBuckets.clear();
}

/**
 * @param {{ windowMs?: number, max?: number, routeKey: string, getKey: (req: object) => string }} opts
 */
export function rateLimitByKey({ windowMs = 60_000, max = 10, routeKey, getKey }) {
  return (req, res, next) => {
    const key = `${routeKey}::${getKey(req)}`;
    const now = Date.now();

    let bucket = _genericRateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      _genericRateBuckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({
        ok: false,
        message: 'Too many requests. Please try again shortly.',
      });
    }

    return next();
  };
}

/**
 * @param {string | undefined} origin
 * @param {{ corsOrigins: string[], serverOrigin: string, nodeEnv: string }} config
 */
/**
 * @param {string} routePath
 * @param {string} method
 */
export function isCatalogAdminMutation(routePath, method) {
  const m = String(method || '').toUpperCase();
  if (!['POST', 'PUT', 'DELETE'].includes(m)) return false;
  return routePath.startsWith('/api/products') || routePath.startsWith('/api/product-types') || routePath.startsWith('/api/product-categories');
}

export function evaluateCorsOrigin(origin, { corsOrigins, serverOrigin, nodeEnv }) {
  if (!origin) return { allowed: true };
  if (serverOrigin && origin === serverOrigin) return { allowed: true };
  if (corsOrigins.length > 0) {
    return corsOrigins.includes(origin)
      ? { allowed: true }
      : { allowed: false, reason: 'origin_not_listed' };
  }
  if (nodeEnv === 'production') {
    return { allowed: false, reason: 'cors_origins_unset' };
  }
  return { allowed: true };
}

const MEETING_JOIN_HOST_SUFFIXES = [
  'zoom.us',
  'zoom.com',
  'zoomgov.com',
  'daily.co',
];

/**
 * @param {unknown} url
 * @param {string} [expectedUrl] - optional event-stored URL must match host+path prefix
 * @returns {string} Sanitized URL or ''
 */
export function sanitizeMeetingJoinUrl(url, expectedUrl = '') {
  const raw = String(url ?? '').trim();
  if (!raw) return '';

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';

  const host = parsed.hostname.toLowerCase();
  const allowedHost = MEETING_JOIN_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
  if (!allowedHost) return '';

  if (expectedUrl) {
    try {
      const expected = new URL(String(expectedUrl).trim());
      if (expected.hostname.toLowerCase() !== host) return '';
    } catch {
      return '';
    }
  }

  return parsed.href;
}

const SECRET_PATHS = [
  ['email', 'smtpPassword'],
  ['payment', 'secretKey'],
  ['payment', 'webhookSecret'],
  ['sms', 'apiKey'],
  ['sms', 'apiSecret'],
  ['whatsapp', 'accessToken'],
  ['whatsapp', 'greenApiToken'],
  ['integrations', 'smartdataApiKey'],
  ['integrations', 'slackWebhook'],
  ['zoom', 'clientSecret'],
  ['zoom', 'sdkSecret'],
  ['zoom', 'webhookSecretToken'],
  ['daily', 'apiKey'],
  ['daily', 'webhookSecret'],
];

function maskSecretValue(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return MASK_PLACEHOLDER;
}

/**
 * @param {object} settings
 * @returns {object}
 */
const MASK_PLACEHOLDER = '••••••••';

function isMaskedOrEmptySecret(value) {
  const s = String(value ?? '').trim();
  return !s || s === MASK_PLACEHOLDER;
}

/**
 * Keep stored secrets when the admin UI sends masked placeholders.
 * @param {object} incoming
 * @param {object} stored
 * @returns {object}
 */
export function preserveMaskedSecrets(incoming, stored) {
  const out = JSON.parse(JSON.stringify(incoming || {}));
  for (const path of SECRET_PATHS) {
    let inNode = out;
    let storeNode = stored || {};
    for (let i = 0; i < path.length - 1; i += 1) {
      inNode[path[i]] = inNode[path[i]] || {};
      inNode = inNode[path[i]];
      storeNode = storeNode?.[path[i]] || {};
    }
    const key = path[path.length - 1];
    if (isMaskedOrEmptySecret(inNode[key]) && storeNode[key]) {
      inNode[key] = storeNode[key];
    }
  }
  return out;
}

export function maskSystemSettingsSecrets(settings) {
  const out = JSON.parse(JSON.stringify(settings || {}));
  for (const path of SECRET_PATHS) {
    let node = out;
    for (let i = 0; i < path.length - 1; i += 1) {
      if (!node[path[i]] || typeof node[path[i]] !== 'object') {
        node = null;
        break;
      }
      node = node[path[i]];
    }
    if (!node) continue;
    const key = path[path.length - 1];
    if (node[key]) {
      node[key] = maskSecretValue(node[key]);
      node[`${key}Configured`] = true;
    }
  }
  return out;
}

/**
 * @param {boolean} isProduction
 * @param {Error | string} error
 * @param {string} publicMessage
 */
export function apiErrorPayload(isProduction, error, publicMessage) {
  const payload = { ok: false, message: publicMessage };
  if (!isProduction && error) {
    payload.error = typeof error === 'string' ? error : error.message;
  }
  return payload;
}

const UPLOAD_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const UPLOAD_FORBIDDEN_MIMES = new Set(['image/svg+xml']);

export const MAX_GENERAL_UPLOAD_BYTES = 3 * 1024 * 1024;

/**
 * @param {string} mimeType
 * @returns {boolean}
 */
export function isAllowedUploadMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (UPLOAD_FORBIDDEN_MIMES.has(mime)) return false;
  return UPLOAD_IMAGE_MIMES.has(mime);
}

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function bufferMatchesImageMime(buffer, mimeType) {
  if (!buffer || buffer.length < 4) return false;
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('png') && buffer[0] === 0x89 && buffer[1] === 0x50) return true;
  if ((mime.includes('jpeg') || mime.includes('jpg')) && buffer[0] === 0xff && buffer[1] === 0xd8) return true;
  if (mime.includes('webp') && buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') return true;
  if (mime.includes('gif') && buffer.toString('ascii', 0, 3) === 'GIF') return true;
  return false;
}
