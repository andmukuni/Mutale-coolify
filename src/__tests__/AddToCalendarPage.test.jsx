import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import AddToCalendarPage from '../pages/AddToCalendarPage';

vi.mock('../utils/apiBase', () => ({
  getApiBase: () => 'http://test.api',
  getAppOrigin: () => 'https://mutalemubanga.org',
}));

describe('AddToCalendarPage', () => {
  it('lets the buyer choose Google, Outlook, Yahoo, or Apple Calendar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          id: 'evt-1',
          slug: 'interview-masterclass',
          title: 'Interview Masterclass',
          start_date: '2026-08-15',
          start_time: '09:00:00',
          end_time: '11:00:00',
          timezone: 'Africa/Lusaka',
          location: 'Online',
        },
      }),
    }));

    render(
      <MemoryRouter initialEntries={['/events/interview-masterclass/calendar']}>
        <Routes>
          <Route path="/events/:slug/calendar" element={<AddToCalendarPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Interview Masterclass')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /google calendar/i })).toHaveAttribute(
      'href',
      expect.stringContaining('calendar.google.com'),
    );
    expect(screen.getByRole('link', { name: /outlook.com/i })).toHaveAttribute(
      'href',
      expect.stringContaining('outlook.live.com'),
    );
    expect(screen.getByRole('link', { name: /yahoo calendar/i })).toHaveAttribute(
      'href',
      expect.stringContaining('calendar.yahoo.com'),
    );
    expect(screen.getByRole('button', { name: /apple calendar/i })).toBeInTheDocument();
  });
});
