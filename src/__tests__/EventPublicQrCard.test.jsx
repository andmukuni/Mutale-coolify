import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../shared/receiptQr.js', () => ({
  buildPublicEventPageUrl: vi.fn(() => 'https://mutale.test/events/demo-event'),
  buildPublicEventQrDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
}));

vi.mock('../utils/apiBase.js', () => ({
  getAppOrigin: () => 'https://mutale.test',
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import EventPublicQrCard from '../components/admin/EventPublicQrCard';

describe('EventPublicQrCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders QR and public link for an event', async () => {
    render(
      <EventPublicQrCard event={{ id: 'evt-1', slug: 'demo-event', title: 'Demo' }} />,
    );
    await waitFor(() => {
      expect(screen.getByAltText(/qr code for public event page/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/mutale\.test\/events\/demo-event/)).toBeInTheDocument();
    expect(screen.getByText(/scan for event details/i)).toBeInTheDocument();
  });

  it('copies the public link', async () => {
    render(
      <EventPublicQrCard event={{ id: 'evt-1', slug: 'demo-event' }} />,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://mutale.test/events/demo-event');
  });
});
