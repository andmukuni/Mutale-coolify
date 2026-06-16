import { getApiBase, getAppOrigin } from './apiBase';
import { getSessionAuthHeaders } from './authHeaders';
import { compressImageFile } from './compressImageFile';

const API_BASE = getApiBase();

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/** Same-origin URL for /uploads (works with Vite proxy in dev). */
export function normalizeUploadedImageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;

  try {
    const parsed = new URL(raw, getAppOrigin());
    if (parsed.pathname.startsWith('/uploads/')) {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}${parsed.pathname}`;
      }
      return parsed.pathname;
    }
    return parsed.href;
  } catch {
    if (raw.startsWith('/uploads/') && typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${raw}`;
    }
    return raw;
  }
}

export async function uploadBlogInlineImage(file) {
  if (!file) throw new Error('No image file selected.');

  const prepared = await compressImageFile(file);
  const image = await readFileAsDataUrl(prepared);

  const res = await fetch(`${API_BASE}/blog/upload-image`, {
    method: 'POST',
    headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ image }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json?.url) {
    const msg = json?.message || json?.error || `Image upload failed (${res.status}).`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${msg} Sign in at Admin login and try again.`);
    }
    throw new Error(msg);
  }
  return normalizeUploadedImageUrl(json.url);
}
