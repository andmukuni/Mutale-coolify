import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { UserAuthProvider } from '../context/UserAuthContext';
import { LAST_ACTIVITY_STORAGE_KEY } from '../utils/idleSession';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <UserAuthProvider>
          <Routes>
            <Route path="/events" element={<div>Events page</div>} />
            <Route path="/admin/events" element={<div>Admin events</div>} />
            <Route path="/account/login" element={<div>Account login</div>} />
            <Route path="/admin/login" element={<div>Admin login</div>} />
          </Routes>
        </UserAuthProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function seedUserSession() {
  localStorage.setItem('mm_user_token', 'user-token');
  localStorage.setItem('mm_user_session', JSON.stringify({
    id: '9',
    email: 'user@test.com',
    name: 'Test User',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  }));
}

function seedAdminSession() {
  localStorage.setItem('mm_admin_token', 'admin-token');
  localStorage.setItem('mm_auth_session', JSON.stringify({
    id: '1',
    email: 'admin@test.com',
    name: 'Admin',
    role: 'admin',
    permissions: [],
    admin_permissions: [],
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  }));
}

function typeInForm() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
}

describe('idle session logout redirect', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('sends a public user to the account login page after idle timeout', () => {
    seedUserSession();
    renderAt('/events');
    expect(screen.getByText('Events page')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(THIRTY_MINUTES_MS);
    });

    expect(screen.getByText('Account login')).toBeInTheDocument();
    expect(localStorage.getItem('mm_user_session')).toBeNull();
    expect(localStorage.getItem('mm_user_token')).toBeNull();
  });

  it('sends an admin to the admin login page after idle timeout', () => {
    seedAdminSession();
    renderAt('/admin/events');
    expect(screen.getByText('Admin events')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(THIRTY_MINUTES_MS);
    });

    expect(screen.getByText('Admin login')).toBeInTheDocument();
    expect(localStorage.getItem('mm_auth_session')).toBeNull();
    expect(localStorage.getItem('mm_admin_token')).toBeNull();
  });

  it('does not log the person out while they are filling in a form', () => {
    seedUserSession();
    renderAt('/events');

    act(() => {
      vi.advanceTimersByTime(THIRTY_MINUTES_MS - 1000);
      typeInForm();
      vi.advanceTimersByTime(THIRTY_MINUTES_MS - 1000);
    });

    expect(screen.getByText('Events page')).toBeInTheDocument();
    expect(localStorage.getItem('mm_user_session')).toBeTruthy();
  });

  it('still logs the person out after they stop filling the form', () => {
    seedUserSession();
    renderAt('/events');

    act(() => {
      vi.advanceTimersByTime(THIRTY_MINUTES_MS - 1000);
      typeInForm();
      vi.advanceTimersByTime(THIRTY_MINUTES_MS);
    });

    expect(screen.getByText('Account login')).toBeInTheDocument();
    expect(localStorage.getItem('mm_user_session')).toBeNull();
  });

  it('logs the person out when they return to a tab after the idle window', () => {
    seedAdminSession();
    renderAt('/admin/events');
    expect(screen.getByText('Admin events')).toBeInTheDocument();

    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now() - THIRTY_MINUTES_MS - 1000));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText('Admin login')).toBeInTheDocument();
    expect(localStorage.getItem('mm_auth_session')).toBeNull();
    expect(localStorage.getItem('mm_admin_token')).toBeNull();
  });

  it('logs the person out on load when the stored idle window has already passed', () => {
    seedUserSession();
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now() - THIRTY_MINUTES_MS - 1000));

    renderAt('/events');

    expect(screen.getByText('Account login')).toBeInTheDocument();
    expect(localStorage.getItem('mm_user_session')).toBeNull();
  });
});
