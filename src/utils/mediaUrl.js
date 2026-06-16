import { getApiBase } from './apiBase';

/** Resolve stored upload paths or relative URLs to a browser-loadable URL. */
export function resolveMediaUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;

  const apiBase = getApiBase();
  const origin = apiBase.replace(/\/api\/?$/, '');
  const path = raw.startsWith('/')
    ? raw
    : `/${raw.startsWith('uploads/') ? raw : `uploads/${raw}`}`;
  return `${origin}${path}`;
}
