import { EventEmitter } from 'events';
import crypto from 'crypto';

const bus = new EventEmitter();
bus.setMaxListeners(200);

function channelKey(reference = '') {
  return `lenco:${String(reference || '').trim()}`;
}

function signaturesMatch(expected = '', signature = '') {
  try {
    const a = Buffer.from(String(expected || ''), 'utf8');
    const b = Buffer.from(String(signature || ''), 'utf8');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function hmacSha512Hex(key = '', rawBody = '') {
  return crypto
    .createHmac('sha512', String(key || ''))
    .update(String(rawBody || ''), 'utf8')
    .digest('hex');
}

/**
 * Verify X-Lenco-Signature.
 * Prefer the dashboard "Signature key" (webhook hash key) when provided.
 * Fallback: derive hash key as SHA256(API secret/token) per Lenco docs.
 */
export function verifyLencoWebhookSignature({
  rawBody = '',
  signature = '',
  signatureKey = '',
  apiToken = '',
} = {}) {
  const sig = String(signature || '').trim();
  if (!sig) return false;

  const body = String(rawBody || '');
  const keys = [];

  const dashboardKey = String(signatureKey || '').trim();
  if (dashboardKey) keys.push(dashboardKey);

  const token = String(apiToken || '').trim();
  if (token) {
    keys.push(crypto.createHash('sha256').update(token).digest('hex'));
    // Some setups paste the API secret into the signature field — accept both.
    keys.push(token);
  }

  for (const key of keys) {
    if (signaturesMatch(hmacSha512Hex(key, body), sig)) return true;
  }
  return false;
}

export function publishLencoPaymentUpdate(reference, payload = {}) {
  const ref = String(reference || '').trim();
  if (!ref) return;
  bus.emit(channelKey(ref), {
    reference: ref,
    ...payload,
    at: Date.now(),
  });
}

/**
 * Wait until a terminal payment update is published for the reference.
 * @returns {Promise<{ timedOut: boolean, update?: object }>}
 */
export function waitForLencoPaymentUpdate(reference, { timeoutMs = 120000 } = {}) {
  const ref = String(reference || '').trim();
  if (!ref) return Promise.resolve({ timedOut: true });

  return new Promise((resolve) => {
    const key = channelKey(ref);
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      bus.off(key, onUpdate);
      resolve(result);
    };

    const onUpdate = (update) => {
      const status = String(update?.status || '').toLowerCase();
      if (['successful', 'failed'].includes(status) || update?.paid === true) {
        finish({ timedOut: false, update });
      }
    };

    const timer = setTimeout(() => finish({ timedOut: true }), Math.max(1000, Number(timeoutMs) || 120000));
    bus.on(key, onUpdate);
  });
}

export function subscribeLencoPaymentUpdates(reference, listener) {
  const key = channelKey(reference);
  bus.on(key, listener);
  return () => bus.off(key, listener);
}
