import { getApiBase } from './apiBase';
import { getAdminAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getAdminAuthHeaders(body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.message || `Request failed (${res.status}).`);
  }
  return json;
}

export function fetchCampaigns(params = {}) {
  const query = new URLSearchParams();
  if (params.eventId) query.set('event_id', params.eventId);
  if (params.state) query.set('state', params.state);
  const suffix = query.toString() ? `?${query}` : '';
  return request(`/admin/campaigns${suffix}`);
}

export function fetchEventCampaigns(eventId) {
  return request(`/admin/events/${encodeURIComponent(eventId)}/campaigns`);
}

export function fetchCampaign(id) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}`);
}

export function fetchCampaignTemplates() {
  return request('/admin/campaigns/templates');
}

export function fetchCampaignProviderStatus() {
  return request('/admin/campaigns/provider-status');
}

export function createCampaign(payload) {
  return request('/admin/campaigns', { method: 'POST', body: payload });
}

export function updateCampaign(id, payload) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
}

export function saveCampaignRevision(id, payload) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/revision`, { method: 'POST', body: payload });
}

export function duplicateCampaign(id) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: {} });
}

export function previewCampaignAudience(id, payload) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/audience-preview`, { method: 'POST', body: payload });
}

export function sendCampaignTest(id, recipient) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/test`, { method: 'POST', body: { recipient } });
}

export function sendCampaign(id, payload) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/send`, { method: 'POST', body: payload });
}

export function pauseCampaign(id) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/pause`, { method: 'POST', body: {} });
}

export function resumeCampaign(id) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/resume`, { method: 'POST', body: {} });
}

export function cancelCampaign(id) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
}

export function fetchCampaignReport(id) {
  return request(`/admin/campaigns/${encodeURIComponent(id)}/report`);
}

export function fetchEventResources(eventId) {
  return request(`/admin/events/${encodeURIComponent(eventId)}/resources`);
}

export function createEventResource(eventId, payload) {
  return request(`/admin/events/${encodeURIComponent(eventId)}/resources`, { method: 'POST', body: payload });
}

export function publishEventResource(eventId, id, published = true) {
  return request(`/admin/events/${encodeURIComponent(eventId)}/resources/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    body: { published },
  });
}

export function revokeEventResource(eventId, id) {
  return request(`/admin/events/${encodeURIComponent(eventId)}/resources/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    body: {},
  });
}

export function uploadEventResource(eventId, id, payload) {
  return request(`/admin/events/${encodeURIComponent(eventId)}/resources/${encodeURIComponent(id)}/upload`, {
    method: 'POST',
    body: payload,
  });
}
