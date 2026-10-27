import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CampaignsListPage from '../pages/admin/CampaignsListPage';

const campaigns = [
  {
    id: 'cmp-draft',
    name: 'Trying the footer',
    subject: '',
    state: 'draft',
    campaign_type: 'regular',
    created_at: '2026-10-27 08:00:00',
    recipients: 0,
  },
  {
    id: 'cmp-sent',
    name: 'Thank you',
    subject: 'Thanks for coming',
    state: 'completed',
    campaign_type: 'regular',
    created_at: '2026-10-14 08:00:00',
    send_started_at: '2026-10-15 08:00:00',
    recipients: 19,
    sent: 19,
  },
];

vi.mock('../context/DataContext', () => ({ useData: () => ({ events: [] }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../context/ToastContext', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return { ToastProvider: ({ children }) => children, useToast: () => toast, toast };
});
vi.mock('../utils/emailCampaignsApi', () => ({
  fetchCampaigns: vi.fn(async ({ archived } = {}) => ({
    data: archived
      ? [{ ...campaigns[0], id: 'cmp-deleted', name: 'Old draft', archived_at: '2026-10-20 08:00:00' }]
      : campaigns,
  })),
  createCampaign: vi.fn(),
  duplicateCampaign: vi.fn(),
}));
vi.mock('../utils/campaignWorkspaceApi', () => ({
  campaignAction: vi.fn(),
  campaignPreview: vi.fn(),
}));

function renderList(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/campaigns" element={<CampaignsListPage />} />
        <Route path="/admin/campaigns/:id" element={<p>Opened editor</p>} />
        <Route path="/admin/campaigns/:id/report" element={<p>Opened report</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function firstTableRow() {
  const table = await screen.findByRole('table');
  return within(table).getAllByRole('row')[1];
}

describe('CampaignsListPage rows', () => {
  it('opens a draft in the editor when any part of its row is clicked', async () => {
    renderList('/admin/campaigns');
    const row = await firstTableRow();
    fireEvent.click(within(row).getAllByRole('cell')[1]);
    expect(await screen.findByText('Opened editor')).toBeInTheDocument();
  });

  it('opens a sent campaign at its report', async () => {
    renderList('/admin/campaigns?tab=sent');
    const row = await firstTableRow();
    fireEvent.click(within(row).getAllByRole('cell')[1]);
    expect(await screen.findByText('Opened report')).toBeInTheDocument();
  });

  it('opens the actions menu without leaving the list', async () => {
    renderList('/admin/campaigns');
    const row = await firstTableRow();
    fireEvent.click(within(row).getByRole('button', { name: /actions for/i }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.queryByText('Opened editor')).not.toBeInTheDocument();
  });

  it('opens a campaign from its mobile card', async () => {
    renderList('/admin/campaigns');
    await screen.findByRole('table');
    const card = screen.getAllByRole('listitem').find((item) => item.textContent.includes('Trying the footer'));
    fireEvent.click(within(card).getByText('Draft'));
    expect(await screen.findByText('Opened editor')).toBeInTheDocument();
  });

  it('keeps deleted campaigns from opening on click', async () => {
    renderList('/admin/campaigns?view=deleted');
    const row = await firstTableRow();
    expect(row).toHaveTextContent('Old draft');
    fireEvent.click(within(row).getAllByRole('cell')[1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Opened editor')).not.toBeInTheDocument();
  });
});
