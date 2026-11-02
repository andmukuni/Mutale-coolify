import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Mutale Mubanga' }, hasPermission: () => true, refreshPermissions: vi.fn() }),
}));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/admin/AdminUserMenu', () => ({ default: () => null }));
vi.mock('../components/SiteLogo', () => ({ default: () => null }));
vi.mock('../utils/speakingAdminApi', () => ({
  ENQUIRIES_CHANGED_EVENT: 'mm:speaking-enquiries-changed',
  fetchNewEnquiryCount: vi.fn().mockResolvedValue(2),
}));
vi.mock('../pages/admin/shopCatalogPages', () => ({}));

import AdminLayout from '../layouts/AdminLayout';

beforeEach(() => {
  // A laptop: hover-capable, so the mouse opens flyouts on hover.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
});

function renderLayout() {
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<p>Dashboard</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole('button', { name: /^Speaking/ });
}

describe('AdminLayout sidebar groups', () => {
  it('opens a group from the keyboard on a hover-capable device, and closes it with Escape', async () => {
    const trigger = renderLayout();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Enter or Space on a button fires a click with detail 0.
    fireEvent.click(trigger, { detail: 0 });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('group', { name: 'Speaking submenu' });
    expect(trigger).toHaveAttribute('aria-controls', panel.id);
    expect(within(panel).getByRole('link', { name: 'Speaking Engagements' })).toHaveAttribute('href', '/admin/speaking');
    expect(within(panel).queryByRole('menuitem')).not.toBeInTheDocument();

    within(panel).getByRole('link', { name: /Enquiries/ }).focus();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Speaking submenu' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('leaves a mouse click to the hover behaviour', () => {
    const trigger = renderLayout();
    fireEvent.click(trigger, { detail: 1 });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the group when keyboard focus moves on to the next item', () => {
    const trigger = renderLayout();
    trigger.focus();
    fireEvent.click(trigger, { detail: 0 });
    const next = screen.getByRole('button', { name: /^Shop/ });
    // jsdom leaves relatedTarget empty on focus changes, so say where focus went.
    fireEvent.blur(trigger, { relatedTarget: next });
    expect(screen.queryByRole('group', { name: 'Speaking submenu' })).not.toBeInTheDocument();
  });
});
