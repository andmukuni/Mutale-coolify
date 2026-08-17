import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApiBase } from '../utils/apiBase';
import { getAdminAuthHeaders, buildPublicUserSession, dispatchUserSessionSync, purgeInvalidAuthState, clearAllAuthStorage, clearAdminAuthStorage } from '../utils/authHeaders';
import { isFullAdminAccess, permissionMatches } from '../../shared/rbacPermissions.js';
import { useIdleSessionLogout } from '../hooks/useIdleSessionLogout';
import { clearLastActivityAt, writeLastActivityAt } from '../utils/idleSession';

const AuthContext = createContext();
const API_BASE = getApiBase();
const ADMIN_IDLE_TIMEOUT_MINUTES = Math.max(1, Number(import.meta.env.VITE_ADMIN_IDLE_TIMEOUT_MINUTES || 30));
const ADMIN_IDLE_TIMEOUT_MS = ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000;

function getStoredSession() {
  try {
    purgeInvalidAuthState();
    const stored = localStorage.getItem('mm_auth_session');
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearAdminAuthStorage();
      return null;
    }
    const adminToken = localStorage.getItem('mm_admin_token') || '';
    if (!adminToken) {
      clearAdminAuthStorage();
      return null;
    }
    if (!Array.isArray(session.permissions)) {
      session.permissions = session.admin_permissions || [];
    }
    return session;
  } catch {
    clearAdminAuthStorage();
    return null;
  }
}

function canAccessAdminPanel(userData = {}) {
  const perms = userData.admin_permissions || userData.permissions || [];
  return userData.role === 'admin' || userData.admin_access === true || (Array.isArray(perms) && perms.length > 0);
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const [user, setUser] = useState(() => getStoredSession());
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isAuthenticated = Boolean(user);

  const login = useCallback(async (email, password) => {
    purgeInvalidAuthState();
    setLoginError('');
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoginError(json.message || 'Login failed.');
        return false;
      }

      const userData = json.data;
      if (!canAccessAdminPanel(userData)) {
        setLoginError('Access denied. Administrator privileges required.');
        return false;
      }

      const permissions = Array.isArray(userData.admin_permissions) ? userData.admin_permissions : [];
      const adminRoles = Array.isArray(userData.admin_roles) ? userData.admin_roles : [];
      const session = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        permissions,
        admin_permissions: permissions,
        admin_roles: adminRoles,
        loggedInAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('mm_auth_session', JSON.stringify(session));
      localStorage.setItem('mm_admin_token', String(json.token));
      writeLastActivityAt();

      const publicSession = buildPublicUserSession(userData);
      if (publicSession) {
        localStorage.setItem('mm_user_session', JSON.stringify(publicSession));
        localStorage.setItem('mm_user_token', String(json.token));
        dispatchUserSessionSync(publicSession);
      }

      setUser(session);
      return true;
    } catch {
      setLoginError('Unable to connect to server. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAllAuthStorage();
    clearLastActivityAt();
    dispatchUserSessionSync(null);
    setUser(null);
  }, []);

  const handleIdleTimeout = useCallback(() => {
    logout();
    setLoginError('Admin session ended due to inactivity. Please log in again.');
    const pathname = locationRef.current?.pathname || '';
    if (!pathname.startsWith('/admin/login')) {
      navigate('/admin/login', { replace: true });
    }
  }, [logout, navigate]);

  useIdleSessionLogout({
    enabled: Boolean(user),
    timeoutMs: ADMIN_IDLE_TIMEOUT_MS,
    onTimeout: handleIdleTimeout,
  });

  useEffect(() => {
    purgeInvalidAuthState();
    setUser(getStoredSession());
  }, []);

  const clearLoginError = useCallback(() => {
    setLoginError('');
  }, []);

  const permissions = user?.permissions || user?.admin_permissions || [];

  const hasPermission = useCallback((key) => {
    if (!user) return false;
    if (isFullAdminAccess({ role: user.role, roles: user.admin_roles || user.roles })) return true;
    return permissionMatches(permissions, key);
  }, [user, permissions]);

  const refreshPermissions = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/admin/rbac/me`, {
        headers: getAdminAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) return;
      const nextPerms = json.data?.permissions || [];
      const nextRoles = Array.isArray(json.data?.roles) ? json.data.roles : (user.admin_roles || []);
      const nextSession = {
        ...user,
        permissions: nextPerms,
        admin_permissions: nextPerms,
        admin_roles: nextRoles,
      };
      localStorage.setItem('mm_auth_session', JSON.stringify(nextSession));
      setUser(nextSession);
    } catch {
      // ignore
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isAuthenticated,
        isLoading,
        loginError,
        login,
        logout,
        clearLoginError,
        hasPermission,
        refreshPermissions,
        adminIdleTimeoutMinutes: ADMIN_IDLE_TIMEOUT_MINUTES,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
