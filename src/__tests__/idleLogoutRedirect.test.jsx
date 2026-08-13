import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { UserAuthProvider } from '../context/UserAuthContext';

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
  });
});
