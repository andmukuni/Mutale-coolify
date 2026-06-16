function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sameUserId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Resolve a bearer token for the public user account (incl. admin logged in as same user). */
export function resolveUserBearerToken() {
  const userToken = localStorage.getItem('mm_user_token') || '';
  if (userToken) return userToken;

  const userSession = readJsonStorage('mm_user_session');
  const adminSession = readJsonStorage('mm_auth_session');
  const adminToken = localStorage.getItem('mm_admin_token') || '';

  if (!adminToken || !adminSession?.id) {
    return '';
  }

  // Re-use admin JWT for user API calls when sessions refer to the same account
  // (or when no separate public session exists yet).
  if (!userSession?.id || sameUserId(adminSession.id, userSession.id)) {
    localStorage.setItem('mm_user_token', adminToken);
    return adminToken;
  }

  return '';
}

export function hasUserAuthToken() {
  return Boolean(resolveUserBearerToken());
}

export function getAdminAuthHeaders(extra = {}) {
  const token = localStorage.getItem('mm_admin_token') || '';
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export function getUserAuthHeaders(extra = {}) {
  const token = resolveUserBearerToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export function getSessionAuthHeaders(extra = {}) {
  const token = resolveUserBearerToken() || localStorage.getItem('mm_admin_token') || '';
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export function hasSessionAuth() {
  return Boolean(
    resolveUserBearerToken()
    || localStorage.getItem('mm_admin_token')
    || localStorage.getItem('mm_user_token'),
  );
}

/** Build a public user session object from login payload (admin or account login). */
export function buildPublicUserSession(userData, { expiresInMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  if (!userData?.id) return null;
  return {
    ...userData,
    loggedInAt: Date.now(),
    expiresAt: Date.now() + expiresInMs,
  };
}

export const USER_SESSION_SYNC_EVENT = 'mm-user-session-sync';

export function dispatchUserSessionSync(session) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(USER_SESSION_SYNC_EVENT, { detail: session }));
}
