import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EventSessionsPanel from '../components/admin/event/EventSessionsPanel';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: (extra = {}) => ({ Authorization: 'Bearer admin', ...extra }),
}));

const session = {
  id: 'esn-1',
  title: 'Opening lecture',
  session_date: '2026-09-01',
  start_time: '09:00:00',
  end_time: '10:30:00',
  meeting_url: 'https://zoom.example/session',
};

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ ok, data }),
  };
}

describe('EventSessionsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('lets an admin edit an existing session', async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ ...session, title: 'Updated lecture' }));
      }
      return Promise.resolve(jsonResponse([session]));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EventSessionsPanel eventId="evt-1" event={{
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      start_time: '09:00',
      end_time: '17:00',
      timezone: 'Africa/Lusaka',
    }} />);

    await waitFor(() => {
      expect(screen.getByText('Opening lecture')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /edit session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete session/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit session/i }));

    expect(screen.getByText('Edit session')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Opening lecture')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-09-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('09:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10:30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://zoom.example/session')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/session title/i), {
      target: { value: 'Updated lecture' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test.api/admin/events/evt-1/sessions/esn-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    const patchCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    expect(JSON.parse(patchCall[1].body)).toMatchObject({
      title: 'Updated lecture',
      session_date: '2026-09-01',
      start_time: '09:00',
      end_time: '10:30',
      meeting_url: 'https://zoom.example/session',
    });
  });

  it('counts passed and upcoming from the event period', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([
      session,
      {
        id: 'esn-2',
        title: 'Wrap-up',
        session_date: '2026-08-11',
        start_time: '09:00:00',
        end_time: '10:00:00',
      },
    ])));
    vi.stubGlobal('fetch', fetchMock);

    render(<EventSessionsPanel eventId="evt-1" event={{
      start_date: '2026-08-10',
      end_date: '2026-09-16',
      start_time: '09:00',
      end_time: '17:00',
      timezone: 'Africa/Lusaka',
    }} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-status-counts')).toHaveTextContent('1 passed · 1 upcoming');
    });
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });
});
