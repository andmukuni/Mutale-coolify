import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SiteAssistantPanel from '../components/SiteAssistantPanel';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getSessionAuthHeaders: (extra = {}) => extra,
}));
vi.mock('../context/UserAuthContext', () => ({
  useUserAuth: () => ({
    isUserAuthenticated: false,
    currentUser: null,
    applySessionUser: vi.fn(),
  }),
}));

describe('SiteAssistantPanel', () => {
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
});
