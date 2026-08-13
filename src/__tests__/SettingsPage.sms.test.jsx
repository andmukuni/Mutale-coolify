import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../pages/admin/SettingsPage';

const toast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: (extra = {}) => ({ Authorization: 'Bearer admin', ...extra }),
}));
vi.mock('../context/DataContext', () => ({
  useData: () => ({
    profile: {
      name: 'Mutale',
      tagline: '',
      heroIntro: '',
      email: '',
      phone: '',
      location: '',
      availableFor: '',
    },
    updateProfile: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));

const systemSettings = {
  sms: {
    enabled: true,
    provider: 'ontech',
    baseUrl: 'https://bulksms.ontech.co.zm/smsservice',
    accessId: '••••••••',
    accessIdConfigured: true,
    senderId: 'Mutale',
  },
};

function response(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
  };
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (String(url).endsWith('/settings/system') && method === 'GET') {
      return response({ ok: true, data: systemSettings });
    }
    if (String(url).endsWith('/settings/system') && method === 'PUT') {
      return response({ ok: true, data: systemSettings });
    }
    if (String(url).endsWith('/notifications/test') && method === 'POST') {
      return response({
        ok: true,
        data: {
          channel: 'sms',
          status: 'sent',
          recipient: '260971234567',
          provider: 'ontech',
          messageId: 'sms-123',
        },
      });
    }
    return response({ ok: true, data: {} });
  });
});

describe('SettingsPage Ontech SMS', () => {
  it('shows only Ontech credentials and removes the old provider controls', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/settings?tab=sms']}>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Ontech SMS')).toBeInTheDocument();
    expect(await screen.findByLabelText('API Key *')).toHaveValue('••••••••');
    expect(screen.getByLabelText('Sender ID *')).toHaveValue('Mutale');
    expect(screen.getByLabelText('Sender ID *')).toHaveAttribute('maxlength', '11');
    expect(screen.getByLabelText('API Base URL')).toHaveValue('https://bulksms.ontech.co.zm/smsservice');

    expect(screen.queryByText('Twilio')).not.toBeInTheDocument();
    expect(screen.queryByText("Africa's Talking")).not.toBeInTheDocument();
    expect(screen.queryByText('AWS SNS')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom Webhook')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('API Secret')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delivery Webhook URL')).not.toBeInTheDocument();
  });

  it('saves the Ontech settings and sends a real test request with phone and message', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/settings?tab=sms']}>
        <SettingsPage />
      </MemoryRouter>,
    );

    await screen.findByText('Ontech SMS');
    await waitFor(() => {
      expect(screen.getByLabelText('API Key *')).toHaveValue('••••••••');
    });
    fireEvent.change(screen.getByLabelText('Zambian Phone Number'), { target: { value: '0971234567' } });
    fireEvent.change(screen.getByLabelText('Test Message'), { target: { value: 'Hello from Mutale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Test SMS' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://test.api/notifications/test',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const testCall = globalThis.fetch.mock.calls.find(([url]) => String(url).endsWith('/notifications/test'));
    expect(JSON.parse(testCall[1].body)).toEqual({
      channel: 'sms',
      recipient: '0971234567',
      message: 'Hello from Mutale',
    });
    expect(await screen.findByText(/SMS test sent successfully.*sms-123/i)).toBeInTheDocument();
  });
});
