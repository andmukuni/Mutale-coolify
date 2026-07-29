import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import {
  publishLencoPaymentUpdate,
  verifyLencoWebhookSignature,
  waitForLencoPaymentUpdate,
} from '../lencoPaymentRealtime.js';

describe('verifyLencoWebhookSignature', () => {
  it('accepts a valid Lenco HMAC signature', () => {
    const apiToken = 'test-secret-token';
    const body = JSON.stringify({ event: 'collection.successful', data: { reference: 'ref-1' } });
    const webhookHashKey = crypto.createHash('sha256').update(apiToken).digest('hex');
    const signature = crypto.createHmac('sha512', webhookHashKey).update(body, 'utf8').digest('hex');

    expect(verifyLencoWebhookSignature({
      rawBody: body,
      signature,
      apiToken,
    })).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyLencoWebhookSignature({
      rawBody: '{"event":"collection.successful"}',
      signature: 'deadbeef',
      apiToken: 'test-secret-token',
    })).toBe(false);
  });
});

describe('waitForLencoPaymentUpdate', () => {
  it('resolves when a terminal update is published', async () => {
    const reference = `ref-${Date.now()}`;
    const pending = waitForLencoPaymentUpdate(reference, { timeoutMs: 2000 });
    setTimeout(() => {
      publishLencoPaymentUpdate(reference, { status: 'successful', paid: true });
    }, 20);

    const result = await pending;
    expect(result.timedOut).toBe(false);
    expect(result.update?.status).toBe('successful');
  });

  it('times out when no update arrives', async () => {
    const result = await waitForLencoPaymentUpdate(`missing-${Date.now()}`, { timeoutMs: 50 });
    expect(result.timedOut).toBe(true);
  });
});
