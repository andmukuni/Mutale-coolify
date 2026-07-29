import { EventEmitter } from 'events';
import crypto from 'crypto';

const bus = new EventEmitter();
bus.setMaxListeners(200);

function channelKey(reference = '') {
  return `lenco:${String(reference || '').trim()}`;
}

/**
 * Lenco webhook_hash_key = SHA256(API secret/token) hex.
 * Signature header X-Lenco-Signature = HMAC-SHA512(rawBody, webhookHashKey).
 */
export function verifyLencoWebhookSignature({ rawBody = '', signature = '', apiToken = '' } = {}) {
  const token = String(apiToken || '').trim();
  const sig = String(signature || '').trim();
  if (!token || !sig) return false;

  const webhookHashKey = crypto.createHash('sha256').update(token).digest('hex');
  const expected = crypto
    .createHmac('sha512', webhookHashKey)
    .update(String(rawBody || ''), 'utf8')
    .digest('hex');

  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
