import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  data: { profile: {}, updateProfile: vi.fn() },
  upload: vi.fn(),
}));

vi.mock('../context/DataContext', () => ({ useData: () => mocks.data }));
vi.mock('../context/ToastContext', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return { useToast: () => toast };
});

import SectionEditorDrawer from '../components/admin/sections/SectionEditorDrawer';

const SECTION = {
  id: 'speaking.hero',
  page: 'Speaking',
  name: 'Introduction banner',
  type: 'static',
  toggleable: false,
  fields: [
    { key: 'heroTitle', label: 'Heading', type: 'text', path: 'websitePages.speaking.heroTitle' },
    {
      key: 'speakerProfileFile',
      label: 'Speaker profile (PDF)',
      type: 'file',
      accept: 'application/pdf',
      upload: mocks.upload,
      path: 'websitePages.speaking.speakerProfileFile',
    },
    { key: 'heroPortraitImage', label: 'Portrait', type: 'image', path: 'websitePages.speaking.heroPortraitImage' },
  ],
};

const profileWith = (heroTitle) => ({ websitePages: { speaking: { heroTitle, speakerProfileFile: '' } } });

const drawer = () => (
  <MemoryRouter>
    <SectionEditorDrawer section={SECTION} isOpen onClose={vi.fn()} />
  </MemoryRouter>
);

const pdf = () => new File(['%PDF'], 'profile.pdf', { type: 'application/pdf' });

beforeEach(() => {
  mocks.data.profile = profileWith('Conversations that Create Change');
  mocks.data.updateProfile = vi.fn().mockResolvedValue(undefined);
  mocks.upload.mockReset().mockResolvedValue('/uploads/speaking/profile.pdf');
});

describe('SectionEditorDrawer — uploads', () => {
  it('keeps the file and image inputs reachable by keyboard and screen readers', () => {
    render(drawer());
    const fileInput = screen.getByLabelText('Upload file: Speaker profile (PDF)');
    const imageInput = screen.getByLabelText('Upload image: Portrait');
    for (const input of [fileInput, imageInput]) {
      expect(input).toHaveClass('sr-only');
      expect(input).not.toHaveClass('hidden');
      input.focus();
      expect(input).toHaveFocus();
    }
  });

  it('keeps an uploaded file and typed text when the profile refreshes in the background', async () => {
    const { rerender } = render(drawer());
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'My new heading' } });
    fireEvent.change(screen.getByLabelText('Upload file: Speaker profile (PDF)'), { target: { files: [pdf()] } });
    expect(await screen.findByText('profile.pdf')).toBeInTheDocument();

    // A background refresh hands the drawer a new profile object.
    mocks.data.profile = profileWith('Conversations that Create Change');
    rerender(drawer());

    expect(screen.getByText('profile.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('Heading')).toHaveValue('My new heading');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.data.updateProfile).toHaveBeenCalledTimes(1));
    expect(mocks.data.updateProfile.mock.calls[0][0].websitePages.speaking).toMatchObject({
      heroTitle: 'My new heading',
      speakerProfileFile: '/uploads/speaking/profile.pdf',
    });
  });

  it('waits for an upload to finish before saving', async () => {
    let finish;
    mocks.upload.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(drawer());
    fireEvent.change(screen.getByLabelText('Upload file: Speaker profile (PDF)'), { target: { files: [pdf()] } });

    const save = screen.getByRole('button', { name: 'Save changes' });
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByRole('status')).toHaveTextContent('Wait for the upload to finish before saving.');

    await act(async () => { finish('/uploads/speaking/profile.pdf'); });
    expect(save).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('removes an uploaded file', async () => {
    mocks.data.profile = { websitePages: { speaking: { speakerProfileFile: '/uploads/speaking/old.pdf' } } };
    render(drawer());
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('old.pdf')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Speaker profile (PDF)' }));
    expect(within(dialog).getByText('No file')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Upload file: Speaker profile (PDF)')).toBeInTheDocument();
  });
});
