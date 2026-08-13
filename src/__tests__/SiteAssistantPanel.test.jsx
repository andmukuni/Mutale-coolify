import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SiteAssistantPanel from '../components/SiteAssistantPanel';

const navigate = vi.fn();

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getSessionAuthHeaders: (extra = {}) => extra,
}));
vi.mock('../utils/lencoCardPayment', () => ({
  runLencoCardWidget: vi.fn(),
}));
vi.mock('../context/UserAuthContext', () => ({
  useUserAuth: () => ({
    isUserAuthenticated: false,
    currentUser: null,
    applySessionUser: vi.fn(),
  }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

function jsonResponse(data) {
  return {
    ok: true,
    json: async () => ({ ok: true, data }),
  };
}

describe('SiteAssistantPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    navigate.mockReset();
    global.fetch = vi.fn();
  });

  it('shows the public welcome and CV prompt', () => {
    render(
      <MemoryRouter>
        <SiteAssistantPanel open onClose={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Ask Mutale')).toBeInTheDocument();
    expect(screen.getByText(/events, tickets, your account, or building a CV/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask about events, tickets, or start a cv/i)).toBeInTheDocument();
  });

  it('posts a confirm action and navigates when join is ready', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({
        reply: 'Would you like me to register you for the live event now?',
        ui: {
          kind: 'confirm',
          action: 'register',
          confirmLabel: 'Yes, register me',
          declineLabel: 'Not yet',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        reply: 'Taking you into the session now.',
        joinPath: '/events/hidden-sorrows/join?autoJoin=1',
        ui: null,
      }));

    render(
      <MemoryRouter>
        <SiteAssistantPanel open onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/ask about events, tickets, or start a cv/i), {
      target: { value: 'help me join the live event' },
    });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(screen.getByText('Yes, register me')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Yes, register me'));

    await waitFor(() => {
      expect(String(global.fetch.mock.calls[1][0])).toContain('/site-chat/action');
      expect(navigate).toHaveBeenCalledWith('/events/hidden-sorrows/join?autoJoin=1');
    });
  });
});
