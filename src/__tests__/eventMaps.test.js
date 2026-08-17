import { describe, expect, it } from 'vitest';
import {
  buildOpenInMapsUrl,
  buildOsmEmbedUrl,
  eventMapLabel,
  hasEventMapPin,
  normalizeEventMapFields,
  parseEventCoords,
} from '../../shared/eventMaps.js';

const physical = {
  event_mode: 'in_person',
  venue: 'Mulungushi Conference Centre',
  location: 'Lusaka',
  location_place: 'Mulungushi International Conference Centre, Lusaka, Zambia',
  location_lat: '-15.4167',
  location_lng: '28.2833',
};

describe('hasEventMapPin', () => {
  it('requires a physical or hybrid event with valid coordinates', () => {
    expect(hasEventMapPin(physical)).toBe(true);
    expect(hasEventMapPin({ ...physical, event_mode: 'hybrid' })).toBe(true);
    expect(hasEventMapPin({ ...physical, event_mode: 'virtual' })).toBe(false);
    expect(hasEventMapPin({ ...physical, location_lat: '', location_lng: '' })).toBe(false);
  });
});

describe('parseEventCoords', () => {
  it('parses decimal strings from MySQL', () => {
    expect(parseEventCoords(physical)).toEqual({ lat: -15.4167, lng: 28.2833 });
    expect(parseEventCoords({ location_lat: 91, location_lng: 28 })).toBeNull();
  });
});

describe('buildOpenInMapsUrl', () => {
  it('opens Apple Maps on iPhone', () => {
    const url = new URL(buildOpenInMapsUrl(physical, {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    }));
    expect(url.hostname).toBe('maps.apple.com');
    expect(url.searchParams.get('ll')).toBe('-15.4167,28.2833');
    expect(url.searchParams.get('q')).toContain('Mulungushi');
  });

  it('opens Google Maps on Android and desktop', () => {
    const android = new URL(buildOpenInMapsUrl(physical, {
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    }));
    expect(android.hostname).toBe('www.google.com');
    expect(android.pathname).toBe('/maps/search/');
    expect(android.searchParams.get('query')).toBe('-15.4167,28.2833');

    const desktop = new URL(buildOpenInMapsUrl(physical, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    }));
    expect(desktop.searchParams.get('api')).toBe('1');
  });
});

describe('buildOsmEmbedUrl', () => {
  it('embeds an OSM marker for the stored pin', () => {
    const url = new URL(buildOsmEmbedUrl(physical));
    expect(url.hostname).toBe('www.openstreetmap.org');
    expect(url.searchParams.get('marker')).toBe('-15.4167,28.2833');
    expect(url.searchParams.get('layer')).toBe('mapnik');
  });
});

describe('eventMapLabel', () => {
  it('prefers the formatted place name', () => {
    expect(eventMapLabel(physical)).toContain('Mulungushi International Conference Centre');
    expect(eventMapLabel({ venue: 'Hall', location: 'Lusaka' })).toBe('Hall, Lusaka');
  });
});

describe('normalizeEventMapFields', () => {
  it('clears the pin when the event is virtual', () => {
    expect(normalizeEventMapFields({ ...physical, event_mode: 'virtual' })).toEqual({
      location_lat: null,
      location_lng: null,
      location_place: null,
    });
  });

  it('keeps coordinates for in-person events', () => {
    expect(normalizeEventMapFields(physical)).toEqual({
      location_lat: -15.4167,
      location_lng: 28.2833,
      location_place: physical.location_place,
    });
  });
});
