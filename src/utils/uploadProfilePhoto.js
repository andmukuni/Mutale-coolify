import { getApiBase } from './apiBase';
import { getUserAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function validateProfilePhotoFile(file) {
  if (!file) return 'No image file selected.';
  if (!ACCEPTED_TYPES.has(file.type)) {
    return 'Please choose a JPEG, PNG, or WebP image.';
  }
  if (file.size > MAX_BYTES) {
    return 'Image is too large. Maximum size is 2 MB.';
  }
  return '';
}

export async function uploadProfilePhoto(file) {
  const validationError = validateProfilePhotoFile(file);
  if (validationError) throw new Error(validationError);

  const image = await readFileAsDataUrl(file);
  const res = await fetch(`${API_BASE}/auth/profile-photo`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ image }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json?.data) {
    throw new Error(json?.message || 'Profile photo upload failed.');
  }
  return json.data;
}

export async function removeProfilePhoto() {
  const res = await fetch(`${API_BASE}/auth/profile-photo`, {
    method: 'DELETE',
    headers: getUserAuthHeaders(),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json?.data) {
    throw new Error(json?.message || 'Failed to remove profile photo.');
  }
  return json.data;
}
