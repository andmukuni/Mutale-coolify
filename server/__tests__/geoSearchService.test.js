import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildNominatimSearchUrl,
  LUSAKA_VIEWBOX,
  mapNominatimResult,
  normalizeGeoQuery,
  resetGeoSearchStateForTests,
  searchPlaces,
} from '../geoSearchService.js';

afterEach(() => {
  resetGeoSearchStateForTests();
});

const mulungushi = {
  lat: '-15.4167',
  lon: '28.2833',
  name: 'Mulungushi International Conference Centre',
  display_name: 'Mulungushi International Conference Centre, Lusaka, Zambia',
  address: {
    city: 'Lusaka',
    country: 'Zambia',
  },
};

describe('normalizeGeoQuery', () => {
  it('rejects empty and short queries via searchPlaces', async () => {
    expect(await searchPlaces('')).toEqual([]);
    expect(await searchPlaces('a')).toEqual([]);
    expect(normalizeGeoQuery('  Lusaka   Zambia  ')).toBe('Lusaka Zambia');
  });
});

describe('buildNominatimSearchUrl', () => {
  it('biases toward Lusaka without locking the search to Zambia', () => {
    const url = new URL(buildNominatimSearchUrl('Mulungushi Conference Centre'));
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('addressdetails')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('8');
    expect(url.searchParams.get('viewbox')).toBe(LUSAKA_VIEWBOX);
    expect(url.searchParams.get('bounded')).toBe('0');
    expect(url.searchParams.get('q')).toBe('Mulungushi Conference Centre');
  });
});

describe('mapNominatimResult', () => {
  it('maps venue, city, and coordinates without dumping the raw payload', () => {
    expect(mapNominatimResult(mulungushi)).toEqual({
      label: 'Mulungushi International Conference Centre, Lusaka, Zambia',
      venue: 'Mulungushi International Conference Centre',
      city: 'Lusaka, Zambia',
      lat: -15.4167,
      lng: 28.2833,
    });
  });

  it('returns null for invalid coordinates', () => {
    expect(mapNominatimResult({ lat: 'abc', lon: '28' })).toBeNull();
  });
});

describe('searchPlaces', () => {
  it('sends an identifying User-Agent and returns mapped results', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mulungushi],
    });

    const results = await searchPlaces('Mulungushi', {
      fetchImpl,
      minIntervalMs: 0,
      userAgent: 'MutaleTest/1.0 (https://mutalemubanga.org; test@mutalemubanga.org)',
    });

    expect(results).toHaveLength(1);
    expect(results[0].venue).toContain('Mulungushi');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers['User-Agent']).toContain('MutaleTest/1.0');
    expect(options.headers['User-Agent']).toContain('mutalemubanga.org');
  });

  it('caches identical queries so Nominatim is not hit twice', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mulungushi],
    });

    await searchPlaces('Lusaka', { fetchImpl, minIntervalMs: 0 });
    await searchPlaces('Lusaka', { fetchImpl, minIntervalMs: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throttles consecutive Nominatim requests to one per second', async () => {
    const now = 1_000_000;
    const sleepFn = vi.fn(async () => {});
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mulungushi],
    });

    await searchPlaces('First', {
      fetchImpl,
      now: () => now,
      minIntervalMs: 1000,
      cacheTtlMs: 0,
      sleep: sleepFn,
    });
    expect(sleepFn).not.toHaveBeenCalled();

    await searchPlaces('Second', {
      fetchImpl,
      now: () => now,
      minIntervalMs: 1000,
      cacheTtlMs: 0,
      sleep: sleepFn,
    });
    expect(sleepFn).toHaveBeenCalledWith(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
