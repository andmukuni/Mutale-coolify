import { getApiBase } from './apiBase';
import { getSessionAuthHeaders } from './authHeaders';
import { normalizeUploadedImageUrl, readFileAsDataUrl } from './uploadBlogImage';
import { compressImageFile } from './compressImageFile';

const API_BASE = getApiBase();

/** Upload a site section image (hero, about, CTA, etc.) and return its /uploads URL. */
export async function uploadSiteImageFile(file) {
  if (!file) throw new Error('No image selected.');
  const prepared = await compressImageFile(file);
  const image = await readFileAsDataUrl(prepared);
  const res = await fetch(`${API_BASE}/site-images/upload`, {
    method: 'POST',
    headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ image }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json?.url) {
    const msg = json?.message || json?.error || `Image upload failed (${res.status}).`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${msg} Sign in as admin and try again.`);
    }
    throw new Error(msg);
  }
  return normalizeUploadedImageUrl(json.url);
}
