const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'MutaleMubanga/1.0 (https://mutalemubanga.org; contact@mutalemubanga.org)';
const DEFAULT_MIN_INTERVAL_MS = 1000;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;

/** Zambia-biased box around Lusaka; used with bounded=0 so other countries still match. */
export const LUSAKA_VIEWBOX = '27.80,-14.90,28.75,-15.75';

let lastRequestAt = 0;
const resultCache = new Map();

export function resetGeoSearchStateForTests() {
  lastRequestAt = 0;
  resultCache.clear();
}

export function normalizeGeoQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
}

export function buildNominatimSearchUrl(query) {
  const q = normalizeGeoQuery(query);
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '8',
    q,
    viewbox: LUSAKA_VIEWBOX,
    bounded: '0',
  });
  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

export function mapNominatimResult(item = {}) {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const address = item.address && typeof item.address === 'object' ? item.address : {};
  const cityParts = [
    address.city || address.town || address.village || address.municipality || address.county,
    address.state,
    address.country,
  ].filter(Boolean);
  const city = [...new Set(cityParts)].join(', ');
  const displayName = String(item.display_name || '').trim();
  const venue = String(item.name || '').trim() || displayName.split(',')[0].trim();
  const label = displayName || venue;
  if (!label) return null;

  return { label, venue, city, lat, lng };
}

function readCache(key, now, ttlMs) {
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (now - hit.at > ttlMs) {
    resultCache.delete(key);
    return null;
  }
  return hit.results;
}

function writeCache(key, results, now) {
  resultCache.set(key, { at: now, results });
  while (resultCache.size > MAX_CACHE_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    resultCache.delete(oldest);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchPlaces(query, deps = {}) {
  const q = normalizeGeoQuery(query);
  if (q.length < MIN_QUERY_LENGTH) return [];

  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const nowFn = deps.now || Date.now;
  const minIntervalMs = deps.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const userAgent = String(deps.userAgent || process.env.GEO_USER_AGENT || DEFAULT_USER_AGENT).trim()
    || DEFAULT_USER_AGENT;
  const sleepFn = deps.sleep || sleep;

  const cacheKey = q.toLowerCase();
  const cached = readCache(cacheKey, nowFn(), cacheTtlMs);
  if (cached) return cached;

  const waitMs = minIntervalMs - (nowFn() - lastRequestAt);
  if (waitMs > 0) await sleepFn(waitMs);
  lastRequestAt = nowFn();

  if (typeof fetchImpl !== 'function') {
    throw new Error('Location search is not available.');
  }

  const response = await fetchImpl(buildNominatimSearchUrl(q), {
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json',
      'Accept-Language': 'en',
    },
  });
  if (!response?.ok) {
    const status = response?.status || 0;
    throw new Error(`Location lookup failed (${status}).`);
  }

  const payload = await response.json().catch(() => []);
  const results = (Array.isArray(payload) ? payload : [])
    .map(mapNominatimResult)
    .filter(Boolean);

  writeCache(cacheKey, results, nowFn());
  return results;
}
