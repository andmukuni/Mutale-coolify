/** Physical event map pins — coords, Open in Maps, and OSM embed URLs. */

export function parseEventCoords(event = {}) {
  if (event.location_lat == null || event.location_lng == null) return null;
  if (event.location_lat === '' || event.location_lng === '') return null;
  const lat = Number(event.location_lat);
  const lng = Number(event.location_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function isPhysicalEventMode(event = {}) {
  const mode = String(event.event_mode || '').trim().toLowerCase();
  return mode === 'in_person' || mode === 'hybrid';
}

export function hasEventMapPin(event = {}) {
  const mode = String(event.event_mode || '').trim().toLowerCase();
  if (mode === 'virtual') return false;
  if (mode && !isPhysicalEventMode(event)) return false;
  return Boolean(parseEventCoords(event));
}

export function eventMapLabel(event = {}) {
  const place = String(event.location_place || '').trim();
  if (place) return place;
  const venue = String(event.venue || '').trim();
  const city = String(event.location || '').trim();
  if (venue && city && venue !== city) return `${venue}, ${city}`;
  return venue || city || '';
}

export function buildOpenInMapsUrl(event = {}, { userAgent } = {}) {
  const coords = parseEventCoords(event);
  if (!coords) return '';
  const label = eventMapLabel(event) || `${coords.lat},${coords.lng}`;
  const ua = userAgent
    ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (/iPad|iPhone|iPod/i.test(String(ua))) {
    const params = new URLSearchParams({
      ll: `${coords.lat},${coords.lng}`,
      q: label,
    });
    return `https://maps.apple.com/?${params.toString()}`;
  }
  const params = new URLSearchParams({
    api: '1',
    query: `${coords.lat},${coords.lng}`,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function buildOsmEmbedUrl(event = {}, { delta = 0.012 } = {}) {
  const coords = parseEventCoords(event);
  if (!coords) return '';
  const { lat, lng } = coords;
  const span = Number.isFinite(Number(delta)) && Number(delta) > 0 ? Number(delta) : 0.012;
  const bbox = [lng - span, lat - span, lng + span, lat + span].join(',');
  const params = new URLSearchParams({
    bbox,
    layer: 'mapnik',
    marker: `${lat},${lng}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

export function normalizeEventMapFields(payload = {}) {
  const mode = String(payload.event_mode || 'virtual').trim().toLowerCase();
  if (mode === 'virtual') {
    return { location_lat: null, location_lng: null, location_place: null };
  }
  const coords = parseEventCoords(payload);
  const place = String(payload.location_place || '').trim().slice(0, 255) || null;
  if (!coords) {
    return { location_lat: null, location_lng: null, location_place: place };
  }
  return {
    location_lat: coords.lat,
    location_lng: coords.lng,
    location_place: place,
  };
}
