import { getApiBase } from './apiBase';
import { getAdminAuthHeaders, getSessionAuthHeaders } from './authHeaders';
import { normalizeUploadedImageUrl, readFileAsDataUrl } from './uploadBlogImage';
import { compressImageFile } from './compressImageFile';

const API_BASE = getApiBase();

export async function fetchPartnerLogos({ includeInactive = false } = {}) {
  const query = includeInactive ? '?all=1' : '';
  const res = await fetch(`${API_BASE}/partner-logos${query}`, {
    cache: 'no-store',
    headers: includeInactive ? getAdminAuthHeaders() : {},
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load partner logos.');
  }
  return Array.isArray(json.data) ? json.data : [];
}

export async function createPartnerLogo(payload) {
  const res = await fetch(`${API_BASE}/partner-logos`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to create partner logo.');
  }
  return json.data;
}

export async function updatePartnerLogo(id, payload) {
  const res = await fetch(`${API_BASE}/partner-logos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to update partner logo.');
  }
  return json.data;
}

export async function deletePartnerLogo(id) {
  const res = await fetch(`${API_BASE}/partner-logos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to delete partner logo.');
  }
  return true;
}

export async function uploadPartnerLogoFile(file) {
  if (!file) throw new Error('No image selected.');
  const prepared = await compressImageFile(file);
  const image = await readFileAsDataUrl(prepared);
  const res = await fetch(`${API_BASE}/partner-logos/upload`, {
    method: 'POST',
    headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ image }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json?.url) {
    throw new Error(json?.message || 'Logo upload failed.');
  }
  return normalizeUploadedImageUrl(json.url);
}
