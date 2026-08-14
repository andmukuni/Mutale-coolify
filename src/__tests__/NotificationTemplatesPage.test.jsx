import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationTemplatesPage from '../pages/admin/NotificationTemplatesPage';

const toast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: (extra = {}) => ({ Authorization: 'Bearer admin', ...extra }),
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@mutale.test' } }),
}));

function response(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
  };
}

const smsTemplate = {
  id: 'ntpl-1',
  name: 'Entry ticket',
  slug: 'ticket',
  channel: 'sms',
  description: 'Sent with a paid or complimentary event ticket.',
  subject: '',
  body: '{{thank_you}} {{event_title}}. View your ticket here: {{ticket_url}}',
  is_system: true,
  enabled: true,
};

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const href = String(url);
    if (href.includes('/admin/notification-templates/test') && method === 'POST') {
      return response({ ok: true, message: 'Test SMS sent.', data: { status: 'sent', recipient: '0971234567' } });
    }
    if (href.includes('/admin/notification-templates') && method === 'GET') {
      return response({ ok: true, data: [smsTemplate] });
    }
    return response({ ok: true, data: {} });
  });
});

describe('NotificationTemplatesPage test send', () => {
  it('sends a test SMS from the edit modal', async () => {
    render(
      <MemoryRouter>
        <NotificationTemplatesPage />
      </MemoryRouter>,
    );

    await screen.findAllByText('Entry ticket');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(await screen.findByText('Send a test')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Test phone'), { target: { value: '0971234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send test SMS' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Test SMS sent to 0971234567.');
    });

    const testCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/notification-templates/test'));
    expect(testCall).toBeTruthy();
    const body = JSON.parse(testCall[1].body);
    expect(body.channel).toBe('sms');
    expect(body.recipient).toBe('0971234567');
    expect(body.body).toContain('{{ticket_url}}');
  });
});
