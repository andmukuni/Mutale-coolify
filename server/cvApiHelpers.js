/**
 * CV API rate limiting and suggestions cache (in-memory, per process).
 */

const _cvRateBuckets = new Map();

const _cvSuggestionsCache = new Map();
const CV_SUGGESTIONS_CACHE_TTL_MS = 60_000;

export function resetCvRateBucketsForTests() {
  _cvRateBuckets.clear();
}

export function clearCvSuggestionsCacheForTests() {
  _cvSuggestionsCache.clear();
}

export function invalidateCvSuggestionsCache(userId) {
  if (userId) _cvSuggestionsCache.delete(String(userId));
}

/**
 * @param {{ windowMs?: number, max?: number, routeKey: string, getKey: (req: import('express').Request) => string }} opts
 */
export function rateLimitCv({ windowMs = 60_000, max = 10, routeKey, getKey }) {
  return (req, res, next) => {
    const key = `${routeKey}::${getKey(req)}`;
    const now = Date.now();

    let bucket = _cvRateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      _cvRateBuckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({
        ok: false,
        message: 'Too many CV requests. Please try again shortly.',
      });
    }

    return next();
  };
}

/**
 * @param {string} userId
 * @param {() => Promise<object>} loader
 */
export async function getCachedCvSuggestions(userId, loader) {
  const id = String(userId || '').trim();
  if (!id) return loader();

  const now = Date.now();
  const hit = _cvSuggestionsCache.get(id);
  if (hit && now - hit.at < CV_SUGGESTIONS_CACHE_TTL_MS) {
    return hit.data;
  }

  const data = await loader();
  _cvSuggestionsCache.set(id, { at: now, data });
  return data;
}
