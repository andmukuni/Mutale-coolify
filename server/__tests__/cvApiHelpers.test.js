import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rateLimitCv,
  resetCvRateBucketsForTests,
  getCachedCvSuggestions,
  clearCvSuggestionsCacheForTests,
  invalidateCvSuggestionsCache,
} from '../cvApiHelpers.js';

function mockReq(key = 'user-1') {
  return { ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' }, _testKey: key };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

describe('rateLimitCv', () => {
  beforeEach(() => {
    resetCvRateBucketsForTests();
  });

  it('allows requests up to max then returns 429', () => {
    const limiter = rateLimitCv({
      routeKey: 'test',
      windowMs: 60_000,
      max: 2,
      getKey: (req) => req._testKey,
    });
    const next = vi.fn();
    const req = mockReq();

    limiter(req, mockRes(), next);
    limiter(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const blocked = mockRes();
    limiter(req, blocked, next);
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(blocked.body?.ok).toBe(false);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe('getCachedCvSuggestions', () => {
  beforeEach(() => {
    clearCvSuggestionsCacheForTests();
  });

  it('calls loader once within TTL', async () => {
    const loader = vi.fn().mockResolvedValue({ score: 50, suggestions: [] });
    const a = await getCachedCvSuggestions('u1', loader);
    const b = await getCachedCvSuggestions('u1', loader);
    expect(a).toEqual(b);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads after cache invalidation', async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ score: 1 })
      .mockResolvedValueOnce({ score: 2 });
    await getCachedCvSuggestions('u2', loader);
    invalidateCvSuggestionsCache('u2');
    const second = await getCachedCvSuggestions('u2', loader);
    expect(second.score).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
