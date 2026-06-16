import { getApiBase } from './apiBase.js';
import { getAdminAuthHeaders } from './authHeaders.js';

const API_BASE = getApiBase();

async function readApiJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function apiErrorMessage(res, json, fallback) {
  if (json?.message) return json.message;
  if (res.status === 404) {
    return 'CV API is not available. Deploy the latest server folder and restart the API.';
  }
  if (res.status === 401 || res.status === 403) {
    return 'Admin session expired. Please log in again.';
  }
  return `${fallback} (${res.status})`;
}

function shouldUseLegacyFallback(status) {
  return status === 404 || status === 500 || status === 502 || status === 503;
}

function mapUserToCvRecord(user) {
  return {
    id: user.id,
    user_name: user.name,
    user_email: user.email,
    user_phone: user.phone || '',
    profession: user.profession || user.occupation || user.organization || '',
    unlocked_at: user.cv_unlocked_at,
    payment_reference: null,
    payment_amount: null,
    payment_currency: 'ZMW',
    payment_status: null,
  };
}

/** Uses /admin/users when /admin/cv is missing on an older API build. */
async function fetchAdminCvListViaUsers() {
  const res = await fetch(`${API_BASE}/admin/users`, {
    cache: 'no-store',
    headers: getAdminAuthHeaders(),
  });
  const json = await readApiJson(res);
  if (!res.ok || json.ok === false) {
    throw new Error(apiErrorMessage(res, json, 'Failed to load users for CV list'));
  }
  return (Array.isArray(json.data) ? json.data : [])
    .filter((u) => u.cv_unlocked_at)
    .map(mapUserToCvRecord);
}

export async function fetchAdminCvList() {
  const res = await fetch(`${API_BASE}/admin/cv`, {
    cache: 'no-store',
    headers: getAdminAuthHeaders(),
  });
  const json = await readApiJson(res);

  if (res.ok && json.ok !== false) {
    return Array.isArray(json.data) ? json.data : [];
  }

  if (shouldUseLegacyFallback(res.status)) {
    try {
      return await fetchAdminCvListViaUsers();
    } catch (fallbackErr) {
      throw new Error(fallbackErr?.message || apiErrorMessage(res, json, 'Failed to load CV records'));
    }
  }

  throw new Error(apiErrorMessage(res, json, 'Failed to load CV records'));
}

async function fetchAdminCvDocumentViaUserApis(userId) {
  const headers = getAdminAuthHeaders();
  const [userRes, certRes, regRes] = await Promise.all([
    fetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}`, { cache: 'no-store', headers }),
    fetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}/certificates`, { cache: 'no-store', headers }),
    fetch(`${API_BASE}/registrations`, { cache: 'no-store', headers }),
  ]);

  const userJson = await readApiJson(userRes);
  if (!userRes.ok || userJson.ok === false || !userJson.data) {
    throw new Error(apiErrorMessage(userRes, userJson, 'Failed to load user'));
  }
  if (!userJson.data.cv_unlocked_at) {
    throw new Error('CV not unlocked for this user.');
  }

  const certJson = await readApiJson(certRes);
  const regJson = await readApiJson(regRes);

  const certificates = (certRes.ok && Array.isArray(certJson.data) ? certJson.data : []).map((c) => ({
    event_title: c.event_title,
    certificate_code: c.certificate_code,
    issued_at: c.issued_at,
  }));

  const registrations = (regRes.ok && Array.isArray(regJson.data) ? regJson.data : [])
    .filter((r) => String(r.user_id) === String(userId));

  const developmentEvents = registrations
    .filter((r) => String(r.status || '').toLowerCase() === 'attended')
    .map((r) => ({
      status: r.status,
      registered_at: r.registered_at,
      event_title: r.event_title,
    }));

  const user = userJson.data;
  return {
    user: {
      ...user,
      specialties: Array.isArray(user.specialties)
        ? user.specialties
        : (user.specialties ? String(user.specialties).split(',').map((s) => s.trim()).filter(Boolean) : []),
    },
    certificates,
    developmentEvents,
  };
}

export async function fetchAdminCvDocument(userId) {
  const res = await fetch(`${API_BASE}/admin/cv/${encodeURIComponent(userId)}`, {
    cache: 'no-store',
    headers: getAdminAuthHeaders(),
  });
  const json = await readApiJson(res);

  if (res.ok && json.ok !== false) {
    return json.data;
  }

  if (shouldUseLegacyFallback(res.status)) {
    return fetchAdminCvDocumentViaUserApis(userId);
  }

  throw new Error(apiErrorMessage(res, json, 'Failed to load CV'));
}
