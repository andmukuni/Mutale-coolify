import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CampaignAudienceSelector from '../components/admin/campaigns/CampaignAudienceSelector';

const skipped = (count, reason) =>
  Array.from({ length: count }, (_, i) => ({ email: `${reason}-${i}@example.org`, reason }));

function renderSelector({ type = 'regular', preview }) {
  render(
    <CampaignAudienceSelector
      directory={{ groups: [] }}
      event={null}
      type={type}
      audience={{ version: 2, include: [{ source: 'all_contacts' }], exclude: [] }}
      onChange={vi.fn()}
      segment={null}
      onSegmentChange={vi.fn()}
      preview={preview}
      onPreview={vi.fn()}
      disabled={false}
      busy={false}
    />,
  );
}

describe('CampaignAudienceSelector recipient summary', () => {
  it('explains why selected contacts will not receive a regular campaign', () => {
    renderSelector({
      preview: {
        included_count: 14,
        excluded_count: 122,
        selected_count: 136,
        source_counts: { 'all_contacts::all': 136 },
        excluded: [...skipped(119, 'no_marketing_consent'), ...skipped(2, 'unsubscribed'), ...skipped(1, 'hard_bounce')],
      },
    });

    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('of 136 selected')).toBeInTheDocument();
    expect(screen.getByText(/won.t receive this campaign/)).toHaveTextContent('136 selected · 122 won’t receive this campaign');

    const reasons = screen.getByRole('list', { name: /why people were skipped/i });
    expect(reasons).toHaveTextContent('119No marketing consent');
    expect(reasons).toHaveTextContent('2Unsubscribed');
    expect(reasons).toHaveTextContent('1Email bounced');
    expect(screen.getByText(/send an Event Notification instead/)).toBeInTheDocument();
  });

  it('tells event notification senders that registrants are always reached', () => {
    renderSelector({
      type: 'event_notification',
      preview: {
        included_count: 20,
        excluded_count: 3,
        selected_count: 23,
        excluded: skipped(3, 'no_marketing_consent'),
      },
    });
    expect(screen.getByText(/registered for this event always receive event notifications/)).toBeInTheDocument();
  });

  it('shows no breakdown when everyone selected will receive it', () => {
    renderSelector({
      preview: { included_count: 14, excluded_count: 0, selected_count: 14, excluded: [] },
    });
    expect(screen.queryByText(/won.t receive this campaign/)).not.toBeInTheDocument();
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });
});
