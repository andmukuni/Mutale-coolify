import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../utils/receiptPdfClient.js', () => ({
  downloadReceiptPreviewPdf: vi.fn(),
}));

vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}));

vi.mock('../../shared/receiptQr.js', () => ({
  buildEventReceiptQrDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
}));

import ReceiptsPage from '../pages/admin/ReceiptsPage';

const RECEIPTS = [
  {
    id: 'r1',
    user_name: 'Alice Banda',
    user_email: 'alice@example.com',
    event_id: 'evt-1',
    event_slug: 'qa-masterclass',
    event_title: 'QA Masterclass',
    registered_at: '2024-05-12T09:00:00.000Z',
    reference_code: 'MM-EVT-001',
    payment_status: 'paid',
    amount_zmw: 250,
    currency: 'ZMW',
    registration_type: 'subscription',
    payment_method: 'mobile_money',
  },
  {
    id: 'r2',
    user_name: 'Bob Mule',
    user_email: 'bob@example.com',
    event_title: 'Free Workshop',
    registered_at: '2024-06-01T09:00:00.000Z',
    reference_code: 'MM-EVT-002',
    payment_status: 'pending',
    amount_zmw: 0,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ReceiptsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url) => {
    if (String(url).includes('/books/orders')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: RECEIPTS }) });
  });
});

describe('ReceiptsPage', () => {
  it('lists only receipt-eligible registrations', async () => {
    renderPage();
    await screen.findByText('Alice Banda');
    expect(screen.getByText('Alice Banda')).toBeInTheDocument();
    expect(screen.queryByText('Bob Mule')).not.toBeInTheDocument();
  });

  it('opens receipt preview when View is clicked', async () => {
    renderPage();
    await screen.findByText('Alice Banda');
    fireEvent.click(screen.getByRole('button', { name: /^view$/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /receipt preview/i })).toBeInTheDocument();
      expect(screen.getByText(/TOTAL PAID/i)).toBeInTheDocument();
    });
  });

  it('shows event QR in preview for event receipts', async () => {
    renderPage();
    await screen.findByText('Alice Banda');
    fireEvent.click(screen.getByRole('button', { name: /^view$/i }));
    await waitFor(() => {
      expect(screen.getByAltText(/event details qr code/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/scan for event/i)).toBeInTheDocument();
  });
});
