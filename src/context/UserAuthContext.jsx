/**
 * UserAuthContext — public user accounts (separate from admin auth)
 * Users can register/login to book events.
 * Auth is backed by the MySQL API. Session stored in localStorage under 'mm_user_session'.
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApiBase } from '../utils/apiBase';
import {
  USER_SESSION_SYNC_EVENT,
  buildPublicUserSession,
  getUserAuthHeaders,
  resolveUserBearerToken,
  purgeInvalidAuthState,
  clearAllAuthStorage,
  clearUserAuthStorage,
  dispatchUserSessionSync,
} from '../utils/authHeaders';
import { useIdleSessionLogout } from '../hooks/useIdleSessionLogout';
import { clearLastActivityAt, writeLastActivityAt } from '../utils/idleSession';

const UserAuthContext = createContext();

const API_BASE = getApiBase();
const USER_IDLE_TIMEOUT_MINUTES = Math.max(1, Number(import.meta.env.VITE_USER_IDLE_TIMEOUT_MINUTES || 30));
const USER_IDLE_TIMEOUT_MS = USER_IDLE_TIMEOUT_MINUTES * 60 * 1000;

function getStoredUserSession() {
  try {
    purgeInvalidAuthState();
    const stored = localStorage.getItem('mm_user_session');
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearUserAuthStorage();
      return null;
    }

    if (!resolveUserBearerToken()) {
      clearUserAuthStorage();
      return null;
    }

    return session;
  } catch {
    clearUserAuthStorage();
    return null;
  }
}

function saveSession(user) {
  const session = buildPublicUserSession(user);
  if (!session) return null;
  localStorage.setItem('mm_user_session', JSON.stringify(session));
  return session;
}

function saveSessionWithToken(user, token) {
  const session = saveSession(user);
  if (!session) return null;
  const resolvedToken = token || resolveUserBearerToken();
  if (resolvedToken) {
    localStorage.setItem('mm_user_token', String(resolvedToken));
  }
  return session;
}

export function UserAuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const [currentUser, setCurrentUser] = useState(() => getStoredUserSession());
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const isUserAuthenticated = Boolean(currentUser);

  /** Register a new public user account — creates DB record and sends verification email */
  const register = useCallback(async ({ name, email, phone, password, whatsapp, user_type, nrc_id }) => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password, whatsapp, user_type, nrc_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError(json.message || 'Registration failed.');
        return false;
      }
      // Return the success message so the UI can show it
      return { ok: true, message: json.message };
    } catch {
      setAuthError('Unable to connect. Please try again.');
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  /** Login an existing public user */
  const userLogin = useCallback(async ({ email, password }) => {
    purgeInvalidAuthState();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError(json.message || 'Login failed.');
        // Expose unverified flag so UI can show resend link
        return { ok: false, unverified: json.unverified || false };
      }
      const session = saveSessionWithToken(json.data, json.token);
      writeLastActivityAt();
      setCurrentUser(session);
      dispatchUserSessionSync(session);
      return { ok: true };
    } catch {
      setAuthError('Unable to connect. Please try again.');
      return { ok: false };
    } finally {
      setAuthLoading(false);
    }
  }, []);

  /** Logout public user */
  const userLogout = useCallback(() => {
    clearUserAuthStorage();
    clearLastActivityAt();
    setCurrentUser(null);
  }, []);

  const handleIdleTimeout = useCallback(() => {
    clearAllAuthStorage();
    clearLastActivityAt();
    dispatchUserSessionSync(null);
    setCurrentUser(null);
    setAuthError('Your session ended due to inactivity. Please log in again.');
    const pathname = locationRef.current?.pathname || '';
    if (!pathname.startsWith('/account/login') && !pathname.startsWith('/admin')) {
      navigate('/account/login', { replace: true });
    }
  }, [navigate]);

  useIdleSessionLogout({
    enabled: Boolean(currentUser),
    timeoutMs: USER_IDLE_TIMEOUT_MS,
    onTimeout: handleIdleTimeout,
  });

  useEffect(() => {
    purgeInvalidAuthState();
    setCurrentUser(getStoredUserSession());

    const syncFromStorage = () => {
      purgeInvalidAuthState();
      setCurrentUser(getStoredUserSession());
    };

    const onStorage = (event) => {
      if (!event.key || ['mm_user_session', 'mm_user_token', 'mm_auth_session', 'mm_admin_token'].includes(event.key)) {
        syncFromStorage();
      }
    };

    const onSessionSync = (event) => {
      if (event?.detail === null) {
        setCurrentUser(null);
        return;
      }
      const session = event?.detail || getStoredUserSession();
      setCurrentUser(session);
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(USER_SESSION_SYNC_EVENT, onSessionSync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(USER_SESSION_SYNC_EVENT, onSessionSync);
    };
  }, []);

  const applySessionUser = useCallback((user, token) => {
    const session = saveSessionWithToken(user, token);
    if (!session) return null;
    writeLastActivityAt();
    setCurrentUser(session);
    dispatchUserSessionSync(session);
    return session;
  }, []);

  /** Upload or replace profile photo */
  const uploadProfilePhoto = useCallback(async (file) => {
    if (!currentUser?.id) {
      return { ok: false, message: 'You must be logged in to upload a photo.' };
    }
    try {
      const { uploadProfilePhoto: doUpload } = await import('../utils/uploadProfilePhoto');
      const updated = await doUpload(file);
      applySessionUser(updated);
      return { ok: true };
    } catch (error) {
      const message = error?.message || 'Failed to upload profile photo.';
      setAuthError(message);
      return { ok: false, message };
    }
  }, [applySessionUser, currentUser?.id]);

  /** Remove profile photo */
  const removeProfilePhoto = useCallback(async () => {
    if (!currentUser?.id) {
      return { ok: false, message: 'You must be logged in to remove your photo.' };
    }
    try {
      const { removeProfilePhoto: doRemove } = await import('../utils/uploadProfilePhoto');
      const updated = await doRemove();
      applySessionUser(updated);
      return { ok: true };
    } catch (error) {
      const message = error?.message || 'Failed to remove profile photo.';
      setAuthError(message);
      return { ok: false, message };
    }
  }, [applySessionUser, currentUser?.id]);

  /** Update public user profile */
  const updateUserProfile = useCallback(async (updates) => {
    if (!currentUser?.id) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        cache: 'no-store',
        headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: currentUser.id, ...updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError(json.message || 'Failed to update profile.');
        return false;
      }
      applySessionUser(json.data);
      return true;
    } catch {
      setAuthError('Unable to connect. Please try again.');
      return false;
    }
  }, [applySessionUser, currentUser]);

  const clearAuthError = useCallback(() => setAuthError(''), []);

  const requestPasswordReset = useCallback(async (email) => {
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const text = await res.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
      const message =
        json?.message
        || json?.error
        || (text && !text.startsWith('<!doctype') ? text : '')
        || `Request failed (${res.status})`;
      if (!res.ok) return { ok: false, message };
      return { ok: true, message: message || 'If that email exists, we sent a password reset link.' };
    } catch {
      return { ok: false, message: 'Unable to connect. Please try again.' };
    }
  }, []);

  const resetPasswordWithToken = useCallback(async ({ token, password }) => {
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const text = await res.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
      const message =
        json?.message
        || json?.error
        || (text && !text.startsWith('<!doctype') ? text : '')
        || `Request failed (${res.status})`;
      if (!res.ok) return { ok: false, message };
      return { ok: true, message: message || 'Password updated.' };
    } catch {
      return { ok: false, message: 'Unable to connect. Please try again.' };
    }
  }, []);

  return (
    <UserAuthContext.Provider value={{
      currentUser,
      isUserAuthenticated,
      authError,
      authLoading,
      register,
      userLogin,
      userLogout,
      updateUserProfile,
      uploadProfilePhoto,
      removeProfilePhoto,
      requestPasswordReset,
      resetPasswordWithToken,
      clearAuthError,
      applySessionUser,
      userIdleTimeoutMinutes: USER_IDLE_TIMEOUT_MINUTES,
    }}>
      {children}
    </UserAuthContext.Provider>
  );
}

export function useUserAuth() {
  const ctx = useContext(UserAuthContext);
  if (!ctx) throw new Error('useUserAuth must be used within a UserAuthProvider');
  return ctx;
}
