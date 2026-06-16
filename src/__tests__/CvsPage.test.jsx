import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../utils/cvGenerator.js', () => ({
  openCvForPrint: vi.fn(),
}));

vi.mock('../utils/authHeaders.js', () => ({
  getAdminAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}));

import CvsPage from '../pages/admin/CvsPage';

const CV_RECORDS = [
  {
    id: 'usr-abc123',
    user_name: 'Mutale Mubanga',
    user_email: 'mutale@example.com',
    user_phone: '+260977000000',
    profession: 'QA Professional',
    unlocked_at: '2026-06-01T10:00:00.000Z',
    payment_reference: 'MM-CV-001',
    payment_amount: 75,
    payment_currency: 'ZMW',
    payment_status: 'successful',
  },
];

const CV_DOC = {
  user: { name: 'Mutale Mubanga', email: 'mutale@example.com', about: 'Bio' },
  certificates: [],
  developmentEvents: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url) => {
    const u = String(url);
    const body = (data) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(data),
    });
    if (u.includes('/admin/cv/usr-')) {
      return Promise.resolve(body({ ok: true, data: CV_DOC }));
    }
    if (u.includes('/admin/cv')) {
      return Promise.resolve(body({ ok: true, data: CV_RECORDS }));
    }
    if (u.includes('/admin/users')) {
      return Promise.resolve(body({ ok: true, data: CV_RECORDS.map((r) => ({
        id: r.id,
        name: r.user_name,
        email: r.user_email,
        phone: r.user_phone,
        profession: r.profession,
        cv_unlocked_at: r.unlocked_at,
      })) }));
    }
    return Promise.resolve(body({ ok: true, data: [] }));
  });
});

describe('CvsPage', () => {
  it('lists unlocked CV records', async () => {
    render(
      <MemoryRouter>
        <CvsPage />
      </MemoryRouter>,
    );
    await screen.findByText('Mutale Mubanga');
    expect(screen.getByText(/CV-202606/i)).toBeInTheDocument();
  });

  it('opens CV preview modal on View', async () => {
    render(
      <MemoryRouter>
        <CvsPage />
      </MemoryRouter>,
    );
    await screen.findByText('Mutale Mubanga');
    fireEvent.click(screen.getByRole('button', { name: /^view$/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /cv preview/i })).toBeInTheDocument();
    });
  });
});
