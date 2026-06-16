import { getApiBase } from './apiBase.js';
import { getUserAuthHeaders } from './authHeaders.js';

const API_BASE = getApiBase();

async function readApiJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function cvEndpointError(res, json, fallback) {
  if (json?.message) return json.message;
  if (res.status === 404) {
    return 'CV generator is not available on the server. Deploy the latest server folder and restart the API (cPanel → Restart App).';
  }
  if (res.status === 401) return 'Please sign in again to use the CV generator.';
  if (res.status >= 500) return 'Server error loading CV generator. Try again shortly.';
  return `${fallback} (${res.status})`;
}

export async function fetchCvAccess(signal) {
  const res = await fetch(`${API_BASE}/cv/access`, {
    cache: 'no-store',
    headers: getUserAuthHeaders(),
    signal,
  });
  const json = await readApiJson(res);
  if (!res.ok) throw new Error(cvEndpointError(res, json, 'Could not load CV access'));
  if (json.ok === false) throw new Error(cvEndpointError(res, json, 'Could not load CV access'));
  return json.data;
}

export async function fetchCvSuggestions(signal) {
  const res = await fetch(`${API_BASE}/cv/suggestions`, {
    cache: 'no-store',
    headers: getUserAuthHeaders(),
    signal,
  });
  const json = await readApiJson(res);
  if (!res.ok) throw new Error(cvEndpointError(res, json, 'Could not load suggestions'));
  if (json.ok === false) throw new Error(cvEndpointError(res, json, 'Could not load suggestions'));
  return json.data;
}

export async function initiateCvMobileCheckout({ amount, phone }) {
  const res = await fetch(`${API_BASE}/cv/checkout/mobile-money`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ amount, currency: 'ZMW', phone }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || 'Checkout failed.');
  return json.data;
}

export async function createCvCardCheckoutSession({ amount, currency = 'ZMW', billingAmountZmw }) {
  const res = await fetch(`${API_BASE}/cv/checkout/card-session`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ amount, currency, billingAmountZmw }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || 'Card checkout failed.');
  return json.data;
}

export async function verifyCvPayment(reference) {
  const res = await fetch(`${API_BASE}/cv/checkout/complete`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reference }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || 'Could not confirm payment.');
  return json.data;
}

export async function pollLencoPayment(reference) {
  const res = await fetch(`${API_BASE}/payments/lenco/verify`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reference }),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}
