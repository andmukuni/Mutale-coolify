import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), reply: vi.fn(), update: vi.fn(), createDraft: vi.fn() }));

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
  createDraftFromSpeakingEnquiry: mocks.createDraft,
  announceEnquiriesChanged: vi.fn(),
}));

import SpeakingEnquiriesPage from '../pages/admin/SpeakingEnquiriesPage';

async function openEnquiry() {
  render(
    <MemoryRouter initialEntries={['/admin/speaking-enquiries']}>
      <Routes>
        <Route path="/admin/speaking-enquiries" element={<SpeakingEnquiriesPage />} />
        <Route path="/admin/speaking/:id/edit" element={<p>Draft engagement editor</p>} />
      </Routes>
    </MemoryRouter>,
  );
  const [view] = await screen.findAllByRole('button', { name: 'View enquiry from Andrew Mukuni' });
  fireEvent.click(view);
  return screen.findByRole('dialog', { name: ENQUIRY.event_title });
}

beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue([ENQUIRY]);
  mocks.reply.mockReset().mockResolvedValue({ ...ENQUIRY, status: 'reviewing', replied_at: '2026-11-02 09:15:00' });
  mocks.update.mockReset();
  mocks.createDraft.mockReset();
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

describe('SpeakingEnquiriesPage — focus', () => {
  it('moves focus into the reply, and back to Reply when it is cancelled', async () => {
    const dialog = await openEnquiry();
    const reply = within(dialog).getByRole('button', { name: 'Reply' });
    fireEvent.click(reply);

    expect(within(dialog).getByLabelText('Subject')).toHaveFocus();
    expect(reply).toBeEnabled();
    expect(reply).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).queryByRole('region', { name: 'Reply to the organiser' })).not.toBeInTheDocument();
    expect(reply).toHaveFocus();
  });
});

describe('SpeakingEnquiriesPage — status and notes', () => {
  it('treats notes as saved when the server trims trailing whitespace', async () => {
    mocks.update.mockImplementation(async (_id, payload) => ({ ...ENQUIRY, ...payload, admin_notes: payload.admin_notes.trim() }));
    const dialog = await openEnquiry();
    fireEvent.change(within(dialog).getByLabelText('Private notes'), { target: { value: 'Fee agreed\n' } });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    fireEvent.click(save);

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('spq-1', { status: 'new', admin_notes: 'Fee agreed\n' }));
    await waitFor(() => expect(save).toBeDisabled());
    expect(within(dialog).getByLabelText('Private notes')).toHaveValue('Fee agreed');
  });

  it('saves unsaved status and notes before creating the draft engagement', async () => {
    mocks.update.mockImplementation(async (_id, payload) => ({ ...ENQUIRY, ...payload }));
    mocks.createDraft.mockResolvedValue({
      engagement: { id: 'spk-9' },
      enquiry: { ...ENQUIRY, status: 'accepted', admin_notes: 'Fee agreed', engagement_id: 'spk-9' },
    });
    const dialog = await openEnquiry();
    fireEvent.change(within(dialog).getByLabelText('Status'), { target: { value: 'accepted' } });
    fireEvent.change(within(dialog).getByLabelText('Private notes'), { target: { value: 'Fee agreed' } });
    expect(within(dialog).getByText('Your status and notes are saved before the draft engagement opens.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /Create draft engagement/ }));

    expect(await screen.findByText('Draft engagement editor')).toBeInTheDocument();
    expect(mocks.update).toHaveBeenCalledWith('spq-1', { status: 'accepted', admin_notes: 'Fee agreed' });
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.createDraft.mock.invocationCallOrder[0]);
  });

  it('does not create the draft when saving the status and notes fails', async () => {
    mocks.update.mockRejectedValue(new Error('Failed to update the enquiry.'));
    const dialog = await openEnquiry();
    fireEvent.change(within(dialog).getByLabelText('Private notes'), { target: { value: 'Fee agreed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draft engagement/ }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Private notes')).toHaveValue('Fee agreed');
  });

  it('shows the server error on the notes field when saving fails', async () => {
    const error = Object.assign(new Error('Check the highlighted fields.'), {
      fieldErrors: { admin_notes: 'Use 5000 characters or fewer.' },
    });
    mocks.update.mockRejectedValue(error);
    const dialog = await openEnquiry();
    const notes = within(dialog).getByLabelText(/Private notes/);
    fireEvent.change(notes, { target: { value: 'Too long' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Use 5000 characters or fewer.')).toBeInTheDocument();
    expect(notes).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(notes, { target: { value: 'Shorter' } });
    expect(within(dialog).queryByText('Use 5000 characters or fewer.')).not.toBeInTheDocument();
  });

  it('closes only the delete confirmation on Escape, keeping unsaved notes', async () => {
    const dialog = await openEnquiry();
    fireEvent.change(within(dialog).getByLabelText('Private notes'), { target: { value: 'Call back Tuesday' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('dialog', { name: 'Delete enquiry' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete enquiry' })).not.toBeInTheDocument());
    const still = screen.getByRole('dialog', { name: ENQUIRY.event_title });
    expect(within(still).getByLabelText('Private notes')).toHaveValue('Call back Tuesday');
  });

  it('pairs every term with its definition directly inside the list', async () => {
    const dialog = await openEnquiry();
    const term = within(dialog).getByText('Proposed topic');
    expect(term.tagName).toBe('DT');
    expect(term.parentElement.parentElement.tagName).toBe('DL');
    expect(term.parentElement).toHaveClass('sm:col-span-2');
  });
});

describe('SpeakingEnquiriesPage — email problems', () => {
  it('explains a skipped acknowledgement separately from a failed email', async () => {
    mocks.fetch.mockResolvedValue([{ ...ENQUIRY, ack_email_status: 'limited' }]);
    const dialog = await openEnquiry();
    expect(within(dialog).getByText(/hourly limit on acknowledgement emails was\s+reached/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Check Settings → Email/)).not.toBeInTheDocument();
  });

  it('still points to the email settings when a message failed', async () => {
    mocks.fetch.mockResolvedValue([{ ...ENQUIRY, admin_email_status: 'failed', ack_email_status: 'limited' }]);
    const dialog = await openEnquiry();
    expect(within(dialog).getByText(/Email could not be sent for the admin notification\. Check Settings → Email/)).toBeInTheDocument();
    expect(within(dialog).getByText(/hourly limit on acknowledgement emails/)).toBeInTheDocument();
  });
});
