import { getApiBase } from './apiBase.js';
import { getUserAuthHeaders } from './authHeaders.js';

const API_BASE = getApiBase();

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function apiError(res, json, fallback) {
  return new Error(json?.message || json?.error || `${fallback} (${res.status})`);
}

export async function initiateShopMobileCheckout({ orderId, phone }) {
  const res = await fetch(`${API_BASE}/books/orders/checkout/mobile-money`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ orderId, phone }),
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw apiError(res, json, 'Failed to start mobile money checkout');
  return json.data;
}

export async function createShopCardCheckoutSession({ orderId }) {
  const res = await fetch(`${API_BASE}/books/orders/checkout/card-session`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ orderId }),
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw apiError(res, json, 'Failed to prepare card checkout');
  return json.data;
}

export async function completeShopCheckout({ orderId, reference }) {
  const res = await fetch(`${API_BASE}/books/orders/checkout/complete`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ orderId, reference }),
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.ok) throw apiError(res, json, 'Failed to complete checkout');
  return json.data;
}

export async function verifyLencoPayment(reference) {
  const res = await fetch(`${API_BASE}/payments/lenco/verify`, {
    method: 'POST',
    headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reference }),
  });
  const json = await parseJson(res);
  return { res, json };
}
