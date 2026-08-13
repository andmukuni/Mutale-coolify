import { getApiBase } from './apiBase';
import { getAdminAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

async function parseJson(res) {
  return res.json().catch(() => ({}));
}

export async function fetchNotificationTemplates({ channel } = {}) {
  const query = channel ? `?channel=${encodeURIComponent(channel)}` : '';
  const res = await fetch(`${API_BASE}/admin/notification-templates${query}`, {
    headers: getAdminAuthHeaders(),
    cache: 'no-store',
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to load templates.');
  return Array.isArray(json.data) ? json.data : [];
}

export async function fetchTemplatePlaceholders() {
  const res = await fetch(`${API_BASE}/admin/notification-templates/placeholders`, {
    headers: getAdminAuthHeaders(),
    cache: 'no-store',
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) {
    return { placeholders: [], sampleVars: {} };
  }
  return json.data || { placeholders: [], sampleVars: {} };
}

export async function previewNotificationTemplate(payload) {
  const res = await fetch(`${API_BASE}/admin/notification-templates/preview`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to preview template.');
  return json.data;
}

export async function createNotificationTemplate(payload) {
  const res = await fetch(`${API_BASE}/admin/notification-templates`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to create template.');
  return json.data;
}

export async function updateNotificationTemplate(id, payload) {
  const res = await fetch(`${API_BASE}/admin/notification-templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to save template.');
  return json.data;
}

export async function resetNotificationTemplate(id) {
  const res = await fetch(`${API_BASE}/admin/notification-templates/${encodeURIComponent(id)}/reset`, {
    method: 'POST',
    headers: getAdminAuthHeaders(),
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to reset template.');
  return json.data;
}

export async function deleteNotificationTemplate(id) {
  const res = await fetch(`${API_BASE}/admin/notification-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAdminAuthHeaders(),
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to delete template.');
  return true;
}
