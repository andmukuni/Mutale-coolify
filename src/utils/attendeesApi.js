import { getApiBase } from './apiBase';
import { getAdminAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

function filenameFromDisposition(header, fallback) {
  const raw = String(header || '');
  const match = raw.match(/filename="([^"]+)"/i) || raw.match(/filename=([^;]+)/i);
  return match ? match[1].trim() : fallback;
}

async function parseError(res) {
  const json = await res.json().catch(() => ({}));
  return json?.message || `Request failed (${res.status}).`;
}

export async function fetchEventAttendees(eventId, filters = {}) {
  const query = new URLSearchParams();
  if (filters.q) query.set('q', filters.q);
  if (filters.status) query.set('status', filters.status);
  if (filters.payment_status) query.set('payment_status', filters.payment_status);
  if (filters.attended) query.set('attended', filters.attended);
  const suffix = query.toString() ? `?${query}` : '';
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/attendees${suffix}`, {
    cache: 'no-store',
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.message || `Failed to load attendees (${res.status}).`);
  }
  return json;
}

export async function fetchEventAttendee(eventId, registrationId) {
  const res = await fetch(
    `${API_BASE}/admin/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(registrationId)}`,
    { cache: 'no-store', headers: getAdminAuthHeaders() },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.message || `Failed to load attendee (${res.status}).`);
  }
  return json;
}

export async function exportEventAttendees(eventId, payload) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/attendees/export`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const blob = await res.blob();
  const count = Number(res.headers.get('X-Export-Count') || 0);
  const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), 'attendees.csv');
  return { blob, filename, count, scope: res.headers.get('X-Export-Scope') || payload.scope };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
