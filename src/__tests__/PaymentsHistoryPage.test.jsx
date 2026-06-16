import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Module mocks ────────────────────────────────────────────────────────────
vi.mock('../utils/apiBase', () => ({
  getApiBase: () => 'http://test.api',
  getAppOrigin: () => 'http://test',
}));
vi.mock('../utils/apiBase.js', () => ({
  getApiBase: () => 'http://test.api',
  getAppOrigin: () => 'http://test',
}));
vi.mock('../../shared/receiptQr.js', () => ({
  buildEventReceiptQrDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
}));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: () => ({ Authorization: 'Bearer fake-admin-token' }),
}));

const downloadReceiptPreviewPdfMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../utils/receiptPdfClient.js', () => ({
  downloadReceiptPreviewPdf: (...args) => downloadReceiptPreviewPdfMock(...args),
}));

import PaymentsHistoryPage from '../pages/admin/PaymentsHistoryPage';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const REGS = [
  {
    id: 'r1',
    user_name: 'Alice Banda',
    user_email: 'alice@example.com',
    user_phone: '+260955111111',
    user_organization: 'Org A',
    event_title: 'QA Masterclass',
    registered_at: '2024-05-12T09:00:00.000Z',
    registration_type: 'subscription',
    payment_method: 'mobile_money',
    payment_reference: 'LENCO-AAA',
    reference_code: 'REG-AAA',
    payment_status: 'paid',
    amount: 250,
    amount_zmw: 250,
    currency: 'ZMW',
  },
  {
    id: 'r2',
    user_name: 'Brian Mwale',
    user_email: 'brian@example.com',
    event_title: 'Diagnostics Audit',
    registered_at: '2024-04-01T09:00:00.000Z',
    registration_type: 'subscription',
    payment_method: 'card',
    payment_reference: 'LENCO-BBB',
    reference_code: 'REG-BBB',
    payment_status: 'pending',
    amount: 500,
    amount_zmw: 500,
    currency: 'ZMW',
  },
  {
    id: 'r3',
    user_name: 'Carol Phiri',
    user_email: 'carol@example.com',
    event_title: 'Health Systems Workshop',
    registered_at: '2024-03-15T09:00:00.000Z',
    registration_type: 'subscription',
    payment_method: 'free',
    reference_code: 'REG-CCC',
    payment_status: 'not_required',
    amount: 0,
    amount_zmw: 0,
    currency: 'ZMW',
  },
  {
    id: 'r4',
    user_name: 'David Tembo',
    user_email: 'david@example.com',
    event_title: 'Quality Bootcamp',
    registered_at: '2024-02-10T09:00:00.000Z',
    registration_type: 'subscription',
    payment_method: 'mobile_money',
    reference_code: 'REG-DDD',
    payment_status: 'failed',
    amount: 100,
    amount_zmw: 100,
    currency: 'ZMW',
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/finance/payments-history']}>
      <PaymentsHistoryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  downloadReceiptPreviewPdfMock.mockClear();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, data: REGS }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PaymentsHistoryPage — admin', () => {
  it('renders the page header and breadcrumbs', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /payments history/i, level: 1 })).toBeInTheDocument();
  });

  it('calls /api/registrations with the admin auth header', async () => {
    renderPage();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      'http://test.api/registrations',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fake-admin-token' }),
      }),
    );
  });

  it('renders KPIs with the correct labels and total revenue', async () => {
    renderPage();
    // Successful = paid + not_required + waived = 2 (Alice, Carol)
    // Total revenue (paid) = 250 (Alice) + 0 (Carol) = 250
    // Pending/Unpaid = 1 (Brian)
    // Failed = 1 (David)
    expect(await screen.findByText('Successful Payments')).toBeInTheDocument();
    expect(screen.getByText('Pending / Unpaid')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue (ZMW)')).toBeInTheDocument();

    // Total revenue "K 250.00" appears both in the KPI card AND in Alice's
    // row (her amount paid is also 250). Assert it shows at least twice.
    await waitFor(() => {
      const matches = screen.getAllByText('K 250.00');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('lists all four users in the payment table', async () => {
    renderPage();
    expect(await screen.findByText('Alice Banda')).toBeInTheDocument();
    expect(screen.getByText('Brian Mwale')).toBeInTheDocument();
    expect(screen.getByText('Carol Phiri')).toBeInTheDocument();
    expect(screen.getByText('David Tembo')).toBeInTheDocument();
  });

  it('renders correct status badge per row', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    // Filter by row by scoping to <tr> elements (the <select> options also
    // contain status labels, so we exclude them).
    const aliceRow = screen.getByText('Alice Banda').closest('tr');
    expect(within(aliceRow).getByText('Paid')).toBeInTheDocument();

    const brianRow = screen.getByText('Brian Mwale').closest('tr');
    expect(within(brianRow).getByText('Pending')).toBeInTheDocument();

    const carolRow = screen.getByText('Carol Phiri').closest('tr');
    expect(within(carolRow).getByText('Complimentary')).toBeInTheDocument();

    const davidRow = screen.getByText('David Tembo').closest('tr');
    expect(within(davidRow).getByText('Failed')).toBeInTheDocument();
  });

  it('filters rows by status', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'failed' } });

    await waitFor(() => {
      expect(screen.queryByText('Alice Banda')).not.toBeInTheDocument();
      expect(screen.queryByText('Brian Mwale')).not.toBeInTheDocument();
      expect(screen.getByText('David Tembo')).toBeInTheDocument();
    });
  });

  it('filters rows by search query (case-insensitive)', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'BRIAN' } });

    await waitFor(() => {
      expect(screen.queryByText('Alice Banda')).not.toBeInTheDocument();
      expect(screen.getByText('Brian Mwale')).toBeInTheDocument();
    });
  });

  it('filters rows by payment method', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    fireEvent.change(screen.getByLabelText(/method/i), { target: { value: 'card' } });

    await waitFor(() => {
      expect(screen.queryByText('Alice Banda')).not.toBeInTheDocument();
      expect(screen.getByText('Brian Mwale')).toBeInTheDocument();
      expect(screen.queryByText('Carol Phiri')).not.toBeInTheDocument();
    });
  });

  it('disables View Receipt for non-paid statuses', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    const buttons = screen.getAllByRole('button', { name: /view receipt/i });
    // 4 rows → 4 buttons; Alice & Carol enabled (paid + not_required), Brian & David disabled.
    expect(buttons).toHaveLength(4);
    const enabled = buttons.filter((b) => !b.disabled);
    const disabled = buttons.filter((b) => b.disabled);
    expect(enabled).toHaveLength(2);
    expect(disabled).toHaveLength(2);
  });

  it('opens the receipt preview modal when View Receipt is clicked', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    const aliceRow = screen.getByText('Alice Banda').closest('tr');
    const viewBtn = within(aliceRow).getByRole('button', { name: /view receipt/i });
    fireEvent.click(viewBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /receipt preview/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Receipt Preview')).toBeInTheDocument();
    expect(screen.getByText('MUTALE MUBANGA')).toBeInTheDocument();
    expect(screen.getByText(/Growing People/i)).toBeInTheDocument();
    expect(screen.getByText(/TOTAL PAID/i)).toBeInTheDocument();
    expect(screen.getByText('ZMW 250.00')).toBeInTheDocument();
  });

  it('downloads the receipt when Download PDF is clicked', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    const aliceRow = screen.getByText('Alice Banda').closest('tr');
    fireEvent.click(within(aliceRow).getByRole('button', { name: /view receipt/i }));

    const dialog = await screen.findByRole('dialog', { name: /receipt preview/i });
    await waitFor(() => {
      expect(screen.getByText('MUTALE MUBANGA')).toBeInTheDocument();
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /download pdf/i }));

    await waitFor(() => {
      expect(downloadReceiptPreviewPdfMock).toHaveBeenCalledTimes(1);
    });
    const [vm, reg] = downloadReceiptPreviewPdfMock.mock.calls[0];
    expect(vm?.refCode || vm?.receiptNo).toBeTruthy();
    expect(reg.id).toBe('r1');
  });

  it('closes the modal when the footer Close button is clicked', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    const aliceRow = screen.getByText('Alice Banda').closest('tr');
    fireEvent.click(within(aliceRow).getByRole('button', { name: /view receipt/i }));

    const dialog = await screen.findByRole('dialog', { name: /receipt preview/i });
    // Two close affordances exist (X icon + footer button). Click the footer
    // text button which is the only one with the literal "Close" body text.
    const closeButtons = within(dialog).getAllByRole('button', { name: /close/i });
    const footerCloseBtn = closeButtons.find((b) => b.textContent.trim() === 'Close');
    expect(footerCloseBtn).toBeTruthy();
    fireEvent.click(footerCloseBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /receipt preview/i })).not.toBeInTheDocument();
    });
  });

  it('closes the modal on Escape key', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    const aliceRow = screen.getByText('Alice Banda').closest('tr');
    fireEvent.click(within(aliceRow).getByRole('button', { name: /view receipt/i }));

    await screen.findByRole('dialog', { name: /receipt preview/i });
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /receipt preview/i })).not.toBeInTheDocument();
    });
  });

  it('shows an error banner when the API fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, message: 'Server is down' }),
    });

    renderPage();

    expect(await screen.findByText(/server is down/i)).toBeInTheDocument();
  });

  it('shows an empty state when no payments match', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'zzz-no-match' } });

    expect(await screen.findByText(/No payments match these filters/i)).toBeInTheDocument();
  });

  it('shows a Clear filters button only when filters are active', async () => {
    renderPage();
    await screen.findByText('Alice Banda');

    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'alice' } });
    const clearBtn = await screen.findByRole('button', { name: /clear filters/i });

    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    });
  });
});
