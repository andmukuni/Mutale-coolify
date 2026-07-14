import { getApiBase } from './apiBase';
import { getAdminAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

export async function fetchEventBadgeTemplate(eventId) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/badge-template`, {
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load badge template.');
  }
  return json.data || { configured: false, template: null };
}

export async function activateEventBadgeTemplate(eventId) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/badge-template/activate`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to activate badge template.');
  }
  return json.data;
}

export async function saveEventBadgeTemplate(eventId, payload) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/badge-template`, {
    method: 'PUT',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to save badge template.');
  }
  return json.data;
}

export async function publishEventBadgeTemplate(eventId, payload = {}) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/badge-template/publish`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const err = new Error(json?.message || 'Failed to publish badge template.');
    err.errors = json?.errors || [];
    throw err;
  }
  return json.data;
}

export async function previewEventBadgeTemplate(eventId, payload = {}) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/badge-template/preview`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/pdf' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || `Preview failed (${res.status}).`);
  }
  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength) throw new Error('Preview PDF is empty.');
  return new Blob([buffer], { type: 'application/pdf' });
}

export async function downloadEventBadgePrintPdf(eventId, { registrationIds = [] } = {}) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/badges/print`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/pdf' }),
    body: JSON.stringify({ registration_ids: registrationIds }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || `Badge export failed (${res.status}).`);
  }
  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength) throw new Error('Badge PDF is empty.');
  return new Blob([buffer], { type: 'application/pdf' });
}

export async function createWalkInRegistration(eventId, payload) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/walk-in-registrations`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to add walk-in attendee.');
  }
  return json.data;
}
