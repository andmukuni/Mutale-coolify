const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const DEV_FALLBACK = 'http://localhost:5173';

let warnedMissingProductionOrigin = false;

export function stripTrailingSlash(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

export function isLoopbackPublicOrigin(value = '') {
  const raw = stripTrailingSlash(value);
  if (!raw) return false;
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function usablePublicOrigin(value = '') {
  const origin = stripTrailingSlash(value);
  if (!origin) return '';
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return '';
    return stripTrailingSlash(origin);
  } catch {
    return '';
  }
}

function corsOriginCandidates(corsOrigins = '') {
  return String(corsOrigins || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function requestOrigin(req) {
  const headerOrigin = usablePublicOrigin(req?.headers?.origin);
  if (headerOrigin) return headerOrigin;

  const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || '').trim() || 'http';
  const host = String(req?.headers?.['x-forwarded-host'] || req?.get?.('host') || '').trim();
  if (!host) return '';
  return usablePublicOrigin(`${proto}://${host}`);
}

function warnMissingProductionOrigin() {
  if (warnedMissingProductionOrigin) return;
  warnedMissingProductionOrigin = true;
  console.warn('[publicAppUrl] No public APP_URL configured; omitting localhost links from emails and SMS.');
}

export function resetPublicAppUrlWarningForTests() {
  warnedMissingProductionOrigin = false;
}

/**
 * Canonical public site origin for SMS, email, QR, and ticket links.
 * Prefers APP_URL (Coolify/cPanel) and never returns a loopback URL in production.
 *
 * @param {object} [req]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} Origin without a trailing slash, or '' in production when none is public.
 */
export function resolvePublicAppUrl(req, env = process.env) {
  const nodeEnv = String(env?.NODE_ENV || '').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';

  const candidates = [
    env?.APP_URL,
    env?.APP_ORIGIN,
    env?.VITE_APP_ORIGIN,
    ...corsOriginCandidates(env?.CORS_ORIGINS),
  ];

  for (const candidate of candidates) {
    const origin = usablePublicOrigin(candidate);
    if (origin) return origin;
  }

  const fromRequest = requestOrigin(req);
  if (fromRequest) return fromRequest;

  if (!isProduction) return DEV_FALLBACK;

  warnMissingProductionOrigin();
  return '';
}
