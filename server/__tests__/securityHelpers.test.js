import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateCorsOrigin,
  isCatalogAdminMutation,
  sanitizeMeetingJoinUrl,
  maskSystemSettingsSecrets,
  preserveMaskedSecrets,
  rateLimitByKey,
  resetGenericRateBucketsForTests,
} from '../securityHelpers.js';

describe('isCatalogAdminMutation', () => {
  it('requires admin for product writes', () => {
    expect(isCatalogAdminMutation('/api/products', 'POST')).toBe(true);
    expect(isCatalogAdminMutation('/api/product-types/abc', 'DELETE')).toBe(true);
    expect(isCatalogAdminMutation('/api/products', 'GET')).toBe(false);
  });
});

describe('evaluateCorsOrigin', () => {
  it('allows missing origin', () => {
    expect(evaluateCorsOrigin(undefined, { corsOrigins: [], serverOrigin: '', nodeEnv: 'production' }).allowed).toBe(true);
  });

  it('rejects unknown origin in production when list empty', () => {
    const result = evaluateCorsOrigin('https://evil.example', {
      corsOrigins: [],
      serverOrigin: '',
      nodeEnv: 'production',
    });
    expect(result.allowed).toBe(false);
  });

  it('allows listed origin', () => {
    const result = evaluateCorsOrigin('https://app.example', {
      corsOrigins: ['https://app.example'],
      serverOrigin: '',
      nodeEnv: 'production',
    });
    expect(result.allowed).toBe(true);
  });
});

describe('sanitizeMeetingJoinUrl', () => {
  it('allows zoom URLs', () => {
    expect(sanitizeMeetingJoinUrl('https://us06web.zoom.us/j/123')).toContain('zoom.us');
  });

  it('blocks arbitrary hosts', () => {
    expect(sanitizeMeetingJoinUrl('https://evil.example/phish')).toBe('');
  });
});

describe('maskSystemSettingsSecrets', () => {
  it('masks secret fields', () => {
    const masked = maskSystemSettingsSecrets({
      payment: { secretKey: 'sk_live_abc' },
      email: { smtpPassword: 'pw' },
    });
    expect(masked.payment.secretKey).toBe('••••••••');
    expect(masked.email.smtpPassword).toBe('••••••••');
  });
});

describe('preserveMaskedSecrets', () => {
  it('keeps stored secret when incoming is masked', () => {
    const out = preserveMaskedSecrets(
      { payment: { secretKey: '••••••••' } },
      { payment: { secretKey: 'sk_real' } },
    );
    expect(out.payment.secretKey).toBe('sk_real');
  });
});

describe('rateLimitByKey', () => {
  beforeEach(() => {
    resetGenericRateBucketsForTests();
  });

  it('returns 429 after max', () => {
    const limiter = rateLimitByKey({
      routeKey: 't',
      max: 1,
      windowMs: 60_000,
      getKey: () => 'k',
    });
    const next = () => {};
    const res1 = { statusCode: 200, status() { return this; }, json() { return this; } };
    const res2 = { statusCode: 200, status(c) { this.statusCode = c; return this; }, body: null, json(b) { this.body = b; return this; } };
    limiter({}, res1, next);
    limiter({}, res2, next);
    expect(res2.statusCode).toBe(429);
  });
});
