import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPublicUserSession,
  getSessionAuthHeaders,
  getUserAuthHeaders,
  hasUserAuthToken,
  resolveUserBearerToken,
} from '../utils/authHeaders';

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
});
