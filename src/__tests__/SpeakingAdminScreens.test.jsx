import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => {
  // A browser whose time-zone list lacks Asia/Kolkata and UTC (as some do).
  Intl.supportedValuesOf = () => ['Africa/Lusaka', 'Europe/London'];
  return {
    fetchOne: vi.fn(),
    fetchAll: vi.fn(),
    update: vi.fn(),
    hide: vi.fn(),
    upload: vi.fn(),
  };
});

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../context/ToastContext', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return { useToast: () => toast, toast };
});
vi.mock('../utils/speakingAdminApi', () => ({
  fetchSpeakingEngagement: mocks.fetchOne,
  fetchSpeakingEngagements: mocks.fetchAll,
  fetchSpeakingMetrics: vi.fn().mockRejectedValue(new Error('No metrics')),
  updateSpeakingEngagement: mocks.update,
  hideSpeakingEngagement: mocks.hide,
  uploadSpeakingImage: mocks.upload,
  createSpeakingEngagement: vi.fn(),
  deleteSpeakingEngagement: vi.fn(),
  duplicateSpeakingEngagement: vi.fn(),
  publishSpeakingEngagement: vi.fn(),
}));

import { toast } from '../context/ToastContext';
import SpeakingEngagementFormPage from '../pages/admin/SpeakingEngagementFormPage';
import SpeakingEngagementsListPage from '../pages/admin/SpeakingEngagementsListPage';
import { visibilitySummary } from '../utils/speakingAdminText';

const RECORD = {
  id: 'spk-1',
  event_title: 'BMSZ2026 Scientific Conference',
  organiser: 'Biomedical Society of Zambia',
  event_type: 'conference',
  roles: ['speaker'],
  start_date: '2027-12-02',
  end_date: '2027-12-03',
  dates_tbc: false,
  timezone: 'Africa/Lusaka',
  attendance_format: 'in_person',
  city: 'Livingstone',
  country: 'Zambia',
  audience_access: 'public',
  event_url: '',
  image_url: '',
  image_alt: '',
  participation_status: 'confirmed',
  event_status: 'scheduled',
  publication_state: 'published',
  featured: false,
  topics: [],
  media: [],
  admin_notes: '',
};

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

async function openForm(record = RECORD) {
  mocks.fetchOne.mockResolvedValue(record);
  render(
    <MemoryRouter initialEntries={[`/admin/speaking/${record.id}/edit`]}>
      <Routes>
        <Route path="/admin/speaking/:id/edit" element={<SpeakingEngagementFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.findByLabelText(/Event title/);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('visibilitySummary', () => {
  const past = { ...RECORD, start_date: '2020-03-04', end_date: null };

  it('suggests confirming a past engagement still marked Invited', () => {
    expect(visibilitySummary({ ...past, participation_status: 'invited' })).toBe(
      'Live on the website, under “Previous Engagements”, labelled “Invited”. If you spoke, mark it Confirmed.',
    );
  });

  it('names the cancelled section for a past cancellation', () => {
    expect(visibilitySummary({ ...past, event_status: 'cancelled' })).toBe('Live on the website, under “Cancelled engagements”.');
  });

  it('explains that a hidden declined engagement needs a new participation before republishing', () => {
    expect(visibilitySummary({ ...RECORD, publication_state: 'hidden', participation_status: 'declined' }))
      .toMatch(/change your participation before republishing/);
  });
});

describe('SpeakingEngagementFormPage', () => {
  it('keeps a saved time zone that this browser does not list, and offers UTC', async () => {
    await openForm({ ...RECORD, timezone: 'Asia/Kolkata' });
    const select = screen.getByLabelText('Event time zone');
    expect(select).toHaveValue('Asia/Kolkata');
    expect([...select.options].map((o) => o.value)).toEqual(['Asia/Kolkata', 'Africa/Lusaka', 'Europe/London', 'UTC']);
  });

  it('does not approve an event URL the server would reject as too long', async () => {
    await openForm();
    const url = screen.getByLabelText('Event website');
    fireEvent.change(url, { target: { value: `https://example.org/?q=${'a'.repeat(2100)}` } });
    expect(screen.getByText('This web address is too long.')).toBeInTheDocument();

    fireEvent.change(url, { target: { value: 'https://example.org/event' } });
    expect(screen.getByText('The Event website button on the engagement’s page will open https://example.org/event in a new tab.')).toBeInTheDocument();
  });

  it('keeps text typed while a save is in flight, and leaves it unsaved', async () => {
    const pending = deferred();
    mocks.update.mockReturnValue(pending.promise);
    await openForm();
    const description = screen.getByLabelText('Short public description');
    fireEvent.change(description, { target: { value: 'First draft.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(mocks.update).toHaveBeenCalledWith('spk-1', expect.objectContaining({ description: 'First draft.' }));

    fireEvent.change(description, { target: { value: 'First draft. And more.' } });
    await act(async () => { pending.resolve({ ...RECORD, description: 'First draft.' }); });

    expect(description).toHaveValue('First draft. And more.');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('warns that saving a published engagement as declined hides it, and says so when it does', async () => {
    mocks.update.mockImplementation(async (_id, form) => ({ ...RECORD, ...form, publication_state: 'hidden' }));
    await openForm();
    fireEvent.change(screen.getByLabelText('Your participation'), { target: { value: 'declined' } });
    expect(screen.getByText(/Saving as Declined takes this engagement off the website/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Changes saved. Declined engagements stay private, so it is now hidden from the website.',
    ));
    expect(screen.getByText(/Declined engagements stay private; change your participation before republishing/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Republish' })).toBeDisabled();
  });

  it('moves focus to the alt text after an image upload, and back to Upload after removing it', async () => {
    mocks.upload.mockResolvedValue('/uploads/speaking/logo.png');
    await openForm();
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText(/Image description/)).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.getByLabelText('Upload image')).toHaveFocus();
  });
});

describe('SpeakingEngagementsListPage', () => {
  it('keeps a row busy until its own action finishes, even when another finishes first', async () => {
    const other = { ...RECORD, id: 'spk-2', event_title: 'Youth Leadership Summit' };
    mocks.fetchAll.mockResolvedValue([RECORD, other]);
    const first = deferred();
    const second = deferred();
    mocks.hide.mockImplementation((id) => (id === 'spk-1' ? first.promise : second.promise));

    render(<MemoryRouter><SpeakingEngagementsListPage /></MemoryRouter>);
    const hideButton = async (title) => (await screen.findAllByRole('button', { name: `Hide ${title} from the website` }))[0];

    fireEvent.click(await hideButton(RECORD.event_title));
    fireEvent.click(await hideButton(other.event_title));
    await act(async () => { first.resolve({ ...RECORD, publication_state: 'hidden' }); });

    expect(await hideButton(other.event_title)).toBeDisabled();
    await act(async () => { second.resolve({ ...other, publication_state: 'hidden' }); });
    expect(mocks.hide).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('button', { name: `Republish ${other.event_title}` })[0]).toBeEnabled();
  });
});
