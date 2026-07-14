import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPublicUserSession,
  decodeJwtPayload,
  getSessionAuthHeaders,
  getUserAuthHeaders,
  hasUserAuthToken,
  isBearerTokenExpired,
  purgeInvalidAuthState,
  resolveUserBearerToken,
} from '../utils/authHeaders';

function makeJwt(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  return `${header}.${body}.signature`;
}

describe('authHeaders', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the stored user token when present', () => {
    localStorage.setItem('mm_user_token', 'user-jwt');
    expect(resolveUserBearerToken()).toBe('user-jwt');
    expect(getUserAuthHeaders()).toEqual({ Authorization: 'Bearer user-jwt' });
  });

  it('falls back to admin token when user session matches admin session', () => {
    localStorage.setItem('mm_admin_token', 'admin-jwt');
    localStorage.setItem('mm_auth_session', JSON.stringify({ id: '42', email: 'a@test.com' }));
    localStorage.setItem('mm_user_session', JSON.stringify({ id: 42, email: 'a@test.com' }));

    expect(resolveUserBearerToken()).toBe('admin-jwt');
    expect(localStorage.getItem('mm_user_token')).toBe('admin-jwt');
    expect(hasUserAuthToken()).toBe(true);
  });

  it('does not reuse admin token for a different public user session', () => {
    localStorage.setItem('mm_admin_token', 'admin-jwt');
    localStorage.setItem('mm_auth_session', JSON.stringify({ id: '1' }));
    localStorage.setItem('mm_user_session', JSON.stringify({ id: '2' }));

    expect(resolveUserBearerToken()).toBe('');
    expect(getUserAuthHeaders()).toEqual({});
  });

  it('getSessionAuthHeaders prefers synced user token then admin token', () => {
    localStorage.setItem('mm_admin_token', 'admin-jwt');
    expect(getSessionAuthHeaders({ 'Content-Type': 'application/json' })).toEqual({
      Authorization: 'Bearer admin-jwt',
      'Content-Type': 'application/json',
    });
  });

  it('buildPublicUserSession adds expiry metadata', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00Z'));

    const session = buildPublicUserSession({ id: 'u1', name: 'Jane', email: 'j@test.com' });
    expect(session.id).toBe('u1');
    expect(session.loggedInAt).toBe(Date.now());
    expect(session.expiresAt).toBe(Date.now() + 7 * 24 * 60 * 60 * 1000);

    vi.useRealTimers();
  });

  it('detects expired bearer tokens', () => {
    const expired = makeJwt({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 });
    const valid = makeJwt({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isBearerTokenExpired(expired)).toBe(true);
    expect(isBearerTokenExpired(valid)).toBe(false);
    expect(decodeJwtPayload(valid)?.sub).toBe('1');
  });

  it('purges expired user session tokens before resolving bearer', () => {
    const expired = makeJwt({ sub: '9', exp: Math.floor(Date.now() / 1000) - 10 });
    localStorage.setItem('mm_user_token', expired);
    localStorage.setItem('mm_user_session', JSON.stringify({ id: '9', expiresAt: Date.now() + 999999 }));

    purgeInvalidAuthState();

    expect(localStorage.getItem('mm_user_token')).toBeNull();
    expect(localStorage.getItem('mm_user_session')).toBeNull();
    expect(resolveUserBearerToken()).toBe('');
  });
});
