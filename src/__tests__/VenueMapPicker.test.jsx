import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VenueMapPicker from '../components/admin/VenueMapPicker';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: (extra = {}) => ({ Authorization: 'Bearer admin', ...extra }),
}));

describe('VenueMapPicker', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('looks up places and inserts the selected pin', async () => {
    const onSelect = vi.fn();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: [{
          label: 'Mulungushi International Conference Centre, Lusaka, Zambia',
          venue: 'Mulungushi International Conference Centre',
          city: 'Lusaka, Zambia',
          lat: -15.4167,
          lng: 28.2833,
        }],
      }),
    });

    render(<MemoryRouter><VenueMapPicker onSelect={onSelect} /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/look up venue on map/i), {
      target: { value: 'Mulungushi' },
    });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));

    await waitFor(() => {
      expect(screen.getByText('Mulungushi International Conference Centre')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Mulungushi International Conference Centre'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      lat: -15.4167,
      lng: 28.2833,
      city: 'Lusaka, Zambia',
    }));
  });

  it('shows the OSM preview when a pin is already set', () => {
    render(
      <MemoryRouter>
        <VenueMapPicker
          locationLat={-15.4167}
          locationLng={28.2833}
          locationPlace="Mulungushi International Conference Centre, Lusaka"
          onClear={vi.fn()}
        />
      </MemoryRouter>,
    );

    const frame = screen.getByTitle('Venue map preview');
    expect(frame).toHaveAttribute('src', expect.stringContaining('openstreetmap.org'));
    expect(screen.getByRole('button', { name: /clear pin/i })).toBeInTheDocument();
  });
});
