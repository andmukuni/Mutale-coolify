import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventFormPage from '../pages/admin/EventFormPage';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: (extra = {}) => ({ Authorization: 'Bearer admin', ...extra }),
}));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../context/DataContext', () => ({
  useData: () => ({
    events: [],
    addEvent: vi.fn(),
    updateEvent: vi.fn(),
    isDataLoaded: true,
  }),
}));
vi.mock('../components/admin/event/EventSessionsPanel', () => ({
  default: () => null,
}));
vi.mock('../components/admin/EventPublicQrCard', () => ({
  default: () => null,
}));

function goToScheduleStep() {
  fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'Lab Workshop' } });
  fireEvent.change(screen.getByLabelText(/full description/i), {
    target: { value: 'A one-day workshop in Lusaka.' },
  });
  fireEvent.change(screen.getByPlaceholderText('https://...'), {
    target: { value: 'https://example.com/cover.jpg' },
  });
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
}

describe('EventFormPage physical location', () => {
  it('hides Venue, Location / City, and the map picker for virtual events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { video: {} } }),
    }));

    render(
      <MemoryRouter initialEntries={['/admin/events/new']}>
        <Routes>
          <Route path="/admin/events/new" element={<EventFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    goToScheduleStep();

    expect(screen.getByLabelText(/event mode/i)).toHaveValue('virtual');
    expect(screen.queryByLabelText(/^venue$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/location \/ city/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/look up venue on map/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/event mode/i), { target: { value: 'in_person' } });

    expect(screen.getByLabelText(/^venue$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location \/ city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/look up venue on map/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/event mode/i), { target: { value: 'hybrid' } });
    expect(screen.getByLabelText(/^venue$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/look up venue on map/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/event mode/i), { target: { value: 'virtual' } });

    expect(screen.queryByLabelText(/^venue$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/location \/ city/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/look up venue on map/i)).not.toBeInTheDocument();
  });
});
