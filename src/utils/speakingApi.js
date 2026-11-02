import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

const NETWORK_MESSAGE = 'We couldn’t reach the server. Check your connection and try again.';

/** fetch, but a lost connection reads as a plain message instead of the browser's "Failed to fetch". */
async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(NETWORK_MESSAGE);
  }
}

/** Published speaking engagements, grouped by the server into upcoming / previous / cancelled / tba. */
export async function fetchPublicSpeakingEngagements() {
  const res = await request(`${API_BASE}/speaking/engagements`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) throw new Error(json?.message || 'Speaking engagements could not be loaded.');
  const data = json.data || {};
  return {
    upcoming: Array.isArray(data.upcoming) ? data.upcoming : [],
    previous: Array.isArray(data.previous) ? data.previous : [],
    cancelled: Array.isArray(data.cancelled) ? data.cancelled : [],
    tba: Array.isArray(data.tba) ? data.tba : [],
  };
}

/** Signed timestamp the enquiry form must send back (spam protection). */
export async function fetchEnquiryToken() {
  const res = await request(`${API_BASE}/speaking/enquiry-token`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  // The form asks again on the next Send, so the visitor never needs to reload.
  if (!res.ok || !json?.token) throw new Error('The enquiry form isn’t ready yet. Please try again in a moment.');
  return json.token;
}

/**
 * Errors carry `fieldErrors` when the server rejected specific fields, and
 * `tokenRejected` when it turned the spam-protection token away (too new or
 * expired), which the server marks with a `token_…` code.
 */
const TOKEN_CODES = new Set(['token_expired', 'token_too_fast']);

export async function submitSpeakingEnquiry(payload) {
  const res = await request(`${API_BASE}/speaking/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const error = new Error(
      res.status === 429
        ? 'Too many enquiries have been sent from this connection. Please try again later.'
        : json?.message || 'Your enquiry could not be sent. Please try again.',
    );
    error.fieldErrors = json?.errors || null;
    // Older servers sent no code; a 400 without field errors was a token rejection.
    error.tokenRejected = TOKEN_CODES.has(json?.code) || (res.status === 400 && !json?.code && !json?.errors);
    throw error;
  }
  return json.data || {};
}
