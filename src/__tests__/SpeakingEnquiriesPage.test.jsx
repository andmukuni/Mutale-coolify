import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const ENQUIRY = {
  id: 'spq-1',
  organiser_name: 'Andrew Mukuni',
  organisation: 'Biomedical Society of Zambia',
  email: 'andrew@example.org',
  phone: null,
  event_title: 'Annual Scientific Conference',
  proposed_start_date: '2027-03-04',
  proposed_end_date: null,
  date_undecided: false,
  timezone: 'Africa/Lusaka',
  attendance_format: 'online',
  location: null,
  audience: 'Laboratory managers',
  audience_size: null,
  topic: 'Quality systems',
  requested_role: 'keynote_speaker',
  budget: null,
  message: null,
  status: 'new',
  admin_notes: null,
  engagement_id: null,
  admin_email_status: 'sent',
  ack_email_status: 'sent',
  replied_at: null,
  created_at: '2026-11-01 08:30:00',
};

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), reply: vi.fn(), update: vi.fn() }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../context/ToastContext', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return { ToastProvider: ({ children }) => children, useToast: () => toast, toast };
});
vi.mock('../utils/speakingAdminApi', () => ({
  fetchSpeakingEnquiries: mocks.fetch,
  replyToSpeakingEnquiry: mocks.reply,
  updateSpeakingEnquiry: mocks.update,
  deleteSpeakingEnquiry: vi.fn(),
  createDraftFromSpeakingEnquiry: vi.fn(),
  announceEnquiriesChanged: vi.fn(),
}));

import SpeakingEnquiriesPage from '../pages/admin/SpeakingEnquiriesPage';

async function openEnquiry() {
  render(<MemoryRouter><SpeakingEnquiriesPage /></MemoryRouter>);
  const [view] = await screen.findAllByRole('button', { name: 'View enquiry from Andrew Mukuni' });
  fireEvent.click(view);
  return screen.findByRole('dialog', { name: ENQUIRY.event_title });
}

beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue([ENQUIRY]);
  mocks.reply.mockReset().mockResolvedValue({ ...ENQUIRY, status: 'reviewing', replied_at: '2026-11-02 09:15:00' });
  mocks.update.mockReset();
});

describe('SpeakingEnquiriesPage — replying', () => {
  it('opens a reply addressed to the organiser, and needs a message before sending', async () => {
    const dialog = await openEnquiry();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reply' }));

    const composer = within(dialog).getByRole('region', { name: 'Reply to the organiser' });
    expect(composer).toHaveTextContent('To Andrew Mukuni <andrew@example.org>');
    expect(within(composer).getByLabelText('Subject')).toHaveValue('Re: Annual Scientific Conference');

    fireEvent.click(within(composer).getByRole('button', { name: /Send reply/ }));
    expect(await within(composer).findByText('Write your reply.')).toBeInTheDocument();
    expect(mocks.reply).not.toHaveBeenCalled();
  });

  it('sends the reply, closes the composer, and follows the new status without unsaved changes', async () => {
    const dialog = await openEnquiry();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reply' }));
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Could we speak next week?' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Send reply/ }));

    await waitFor(() => expect(mocks.reply).toHaveBeenCalledWith('spq-1', {
      subject: 'Re: Annual Scientific Conference',
      message: 'Could we speak next week?',
    }));
    expect(await within(dialog).findByText('Last reply sent 2026-11-02 09:15.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('region', { name: 'Reply to the organiser' })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Status')).toHaveValue('reviewing');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getAllByText('Replied').length).toBeGreaterThan(0);
  });
});
