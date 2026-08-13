import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventCreateChatPanel from '../components/admin/EventCreateChatPanel';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: (extra = {}) => ({ Authorization: 'Bearer admin', ...extra }),
}));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('EventCreateChatPanel', () => {
  it('welcomes the admin without showing invented draft defaults', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          reply: 'Hello — what event are you planning?',
          draft: {
            title: '',
            category: '',
            event_mode: '',
            is_free: null,
          },
          readyToCreate: false,
        },
      }),
    });

    render(
      <MemoryRouter>
        <EventCreateChatPanel onClose={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/tell me about the event in your own words/i)).toBeInTheDocument();
    expect(screen.queryByText(/draft so far/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Hello — what event are you planning?')).toBeInTheDocument();
    });
    expect(screen.queryByText(/draft so far/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Workshop')).not.toBeInTheDocument();
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
  });

  it('shows thinking while the assistant is loading', async () => {
    let resolveFetch;
    global.fetch = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    render(
      <MemoryRouter>
        <EventCreateChatPanel onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByLabelText('Send'));

    expect(await screen.findByRole('status')).toHaveTextContent(/thinking/i);

    resolveFetch({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          reply: 'Hello — what event are you planning?',
          draft: {},
          readyToCreate: false,
        },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('Hello — what event are you planning?')).toBeInTheDocument();
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
