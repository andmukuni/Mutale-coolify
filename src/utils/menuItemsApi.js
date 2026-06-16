import { getApiBase } from './apiBase';
import { getAdminAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

export async function fetchMenuItems({ includeHidden = false, location = '' } = {}) {
  const params = new URLSearchParams();
  if (includeHidden) params.set('all', '1');
  if (location) params.set('location', location);
  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${API_BASE}/menu-items${query}`, {
    cache: 'no-store',
    headers: includeHidden ? getAdminAuthHeaders() : {},
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load menu items.');
  }
  return Array.isArray(json.data) ? json.data : [];
}

export async function createMenuItem(payload) {
  const res = await fetch(`${API_BASE}/menu-items`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to create menu item.');
  }
  return json.data;
}

export async function updateMenuItem(id, payload) {
  const res = await fetch(`${API_BASE}/menu-items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to update menu item.');
  }
  return json.data;
}

export async function deleteMenuItem(id) {
  const res = await fetch(`${API_BASE}/menu-items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to delete menu item.');
  }
  return true;
}

export async function reorderMenuItems(location, orderedIds) {
  const res = await fetch(`${API_BASE}/menu-items/reorder`, {
    method: 'PUT',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ location, ordered_ids: orderedIds }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to reorder menu items.');
  }
  return Array.isArray(json.data) ? json.data : [];
}
