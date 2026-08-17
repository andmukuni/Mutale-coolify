import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isLoopbackPublicOrigin,
  resetPublicAppUrlWarningForTests,
  resolvePublicAppUrl,
} from '../publicAppUrl.js';

afterEach(() => {
  resetPublicAppUrlWarningForTests();
  vi.restoreAllMocks();
});

const productionEnv = {
  NODE_ENV: 'production',
  APP_URL: '',
  APP_ORIGIN: '',
  VITE_APP_ORIGIN: '',
  CORS_ORIGINS: '',
};

describe('isLoopbackPublicOrigin', () => {
  it('detects localhost and loopback hosts', () => {
    expect(isLoopbackPublicOrigin('http://localhost:5173')).toBe(true);
    expect(isLoopbackPublicOrigin('http://127.0.0.1:4000')).toBe(true);
    expect(isLoopbackPublicOrigin('https://mutalemubanga.org')).toBe(false);
  });
});

describe('resolvePublicAppUrl', () => {
  it('prefers APP_URL over a localhost request Origin', () => {
    const req = { headers: { origin: 'http://localhost:5173' } };
    expect(resolvePublicAppUrl(req, {
      ...productionEnv,
      APP_URL: 'https://mutalemubanga.org',
    })).toBe('https://mutalemubanga.org');
  });

  it('uses APP_URL when APP_ORIGIN is unset', () => {
    expect(resolvePublicAppUrl(undefined, {
      ...productionEnv,
      APP_URL: 'https://mutalemubanga.org/',
    })).toBe('https://mutalemubanga.org');
  });

  it('ignores a loopback APP_URL when CORS_ORIGINS has a public URL', () => {
    expect(resolvePublicAppUrl(undefined, {
      ...productionEnv,
      APP_URL: 'http://localhost:5173',
      CORS_ORIGINS: 'http://localhost:5173,https://mutalemubanga.org',
    })).toBe('https://mutalemubanga.org');
  });

  it('does not return localhost in production when nothing public is configured', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const origin = resolvePublicAppUrl(
      { headers: { origin: 'http://localhost:5173' }, protocol: 'http', get: () => 'localhost:4000' },
      productionEnv,
    );
    expect(origin).toBe('');
    expect(origin).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to the Vite origin in development', () => {
    expect(resolvePublicAppUrl(undefined, {
      NODE_ENV: 'development',
    })).toBe('http://localhost:5173');
  });
});
