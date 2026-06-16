export function getApiBase() {
  const env = String(import.meta.env.VITE_API_URL || '').trim();
  if (env) {
    const cleaned = env.replace(/\/$/, '');
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${cleaned.startsWith('/') ? cleaned : `/${cleaned}`}`;
    }
    return `http://localhost:4000${cleaned.startsWith('/') ? cleaned : `/${cleaned}`}`;
  }

  // Default to same-origin in production (cPanel/Passenger serves both frontend + /api)
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api`.replace(/\/$/, '');
  }

  return 'http://localhost:4000/api';
}

/** Origin for static assets (/uploads/...). */
export function getAppOrigin() {
  return getApiBase().replace(/\/api\/?$/i, '');
}

