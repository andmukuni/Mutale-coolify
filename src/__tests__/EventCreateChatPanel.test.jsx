import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function jsonResponse(data) {
  return {
    ok: true,
    json: async () => ({ ok: true, data }),
  };
}

describe('EventCreateChatPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('welcomes the admin without showing invented draft defaults', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/events/chat/session')) {
        return Promise.resolve(jsonResponse(null));
      }
      return Promise.resolve(jsonResponse({
        reply: 'Hello — what event are you planning?',
        draft: {
          title: '',
          category: '',
          event_mode: '',
          is_free: null,
        },
        readyToCreate: false,
      }));
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
    let resolveChat;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/events/chat/session')) {
        return Promise.resolve(jsonResponse(null));
      }
      return new Promise((resolve) => {
        resolveChat = resolve;
      });
    });

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

    resolveChat(jsonResponse({
      reply: 'Hello — what event are you planning?',
      draft: {},
      readyToCreate: false,
    }));

    await waitFor(() => {
      expect(screen.getByText('Hello — what event are you planning?')).toBeInTheDocument();
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders assistant markdown as bold instead of asterisks', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/events/chat/session')) {
        return Promise.resolve(jsonResponse(null));
      }
      return Promise.resolve(jsonResponse({
        reply: '**Title:** CV Masterclass **Format:** Virtual',
        draft: { title: 'CV Masterclass' },
        readyToCreate: false,
      }));
    });

    render(
      <MemoryRouter>
        <EventCreateChatPanel onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
      target: { value: 'CV masterclass' },
    });
    fireEvent.click(screen.getByLabelText('Send'));

    const titleLabel = await screen.findByText('Title:');
    expect(titleLabel.tagName).toBe('STRONG');
    expect(screen.getByText('Format:').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*Title:\*\*/)).not.toBeInTheDocument();
  });

  it('keeps the previous chat when the panel is reopened', () => {
    window.localStorage.setItem('mutale.eventCreateChat.v1', JSON.stringify({
      sessionId: 'sess-restore',
      messages: [
        { role: 'assistant', content: 'Welcome back.' },
        { role: 'user', content: 'Zambia QA workshop' },
      ],
      draft: { title: 'Zambia QA Workshop' },
      readyToCreate: false,
      created: null,
    }));
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(null));

    render(
      <MemoryRouter>
        <EventCreateChatPanel onClose={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Welcome back.')).toBeInTheDocument();
    expect(screen.getByText('Zambia QA workshop')).toBeInTheDocument();
    expect(screen.getByText('Zambia QA Workshop')).toBeInTheDocument();
  });

  it('sends the draft when creating so the server can insert it', async () => {
    global.fetch = vi.fn().mockImplementation((url, options = {}) => {
      if (String(url).includes('/events/chat/session')) {
        return Promise.resolve(jsonResponse(null));
      }
      if (String(url).includes('/events/chat/create')) {
        const body = JSON.parse(options.body || '{}');
        expect(body.confirm).toBe(true);
        expect(body.draft.title).toBe('Zambia QA Workshop');
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              event: { id: 'evt-1', title: 'Zambia QA Workshop', status: 'draft' },
              publicUrl: 'https://mutalemubanga.org/events/zambia-qa-workshop',
            },
          }),
        });
      }
      return Promise.resolve(jsonResponse({
        reply: 'Creating the event now.',
        confirmed: true,
        readyToCreate: true,
        draft: {
          title: 'Zambia QA Workshop',
          description: 'A one-day QA workshop.',
          location: 'Lusaka, Zambia',
          start_date: '2026-09-15',
          end_date: '2026-09-15',
          registration_deadline: '2026-09-10',
          registration_deadline_time: '17:00',
        },
      }));
    });

    render(
      <MemoryRouter>
        <EventCreateChatPanel onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
      target: { value: 'create it' },
    });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Draft event created')).toBeInTheDocument();
    });
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/events/chat/create'))).toBe(true);
  });
});
