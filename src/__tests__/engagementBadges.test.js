import { describe, expect, it } from 'vitest';
import { engagementBadges } from '../components/speaking/engagementBadges';
import { previewEngagement } from '../../shared/speakingEngagements.js';

// The labels every engagement carries on its own page, and the admin preview's
// whitelist. (The wide homepage row card these lived beside was replaced by the
// homepage's next-engagement feature; see SpeakingExtras.test.jsx.)
const BASE = {
  id: 'spk-1',
  event_title: 'BMSZ2026 Scientific Conference',
  organiser: 'Biomedical Society of Zambia',
  event_type: 'conference',
  roles: ['speaker', 'facilitator'],
  session_title: 'Laboratory systems and health security',
  description: 'Speaking and facilitating sessions on laboratory systems.',
  start_date: '2099-12-02',
  end_date: '2099-12-03',
  session_date: '2099-12-02',
  session_start_time: '09:00:00',
  timezone: 'Africa/Lusaka',
  attendance_format: 'in_person',
  venue: 'Radisson Blu Mosi Oa Tunya',
  city: 'Livingstone',
  country: 'Zambia',
  audience_access: 'public',
  event_url: 'https://bmsz.org/conference',
  topics: ['Leadership'],
  media: [{ type: 'recording', url: 'https://video.example.org/talk', label: null }],
  participation_status: 'confirmed',
  event_status: 'scheduled',
  section: 'upcoming',
  in_progress: false,
};

describe('engagementBadges', () => {
  const labels = (engagement) => engagementBadges(engagement).map((b) => b.label);

  it('labels confirmed and invited upcoming engagements in text', () => {
    expect(labels(BASE)).toEqual(['Confirmed', 'Open to the public']);
    expect(labels({ ...BASE, participation_status: 'invited', audience_access: 'invitation_only' }))
      .toEqual(['Invited', 'Invitation only']);
  });

  it('never presents a cancelled engagement as confirmed', () => {
    expect(labels({ ...BASE, event_status: 'cancelled' })).toEqual(['Cancelled', 'Open to the public']);
    expect(labels({ ...BASE, event_status: 'cancelled', section: 'previous' })).not.toContain('Confirmed');
  });

  it('keeps the postponed label visible', () => {
    expect(labels({ ...BASE, event_status: 'postponed' })).toContain('Postponed');
  });

  it('marks an engagement in progress', () => {
    expect(labels({ ...BASE, in_progress: true })[0]).toBe('Happening now');
  });

  it('drops “Confirmed” from past engagements but keeps “Invited”, which never implies confirmation', () => {
    expect(labels({ ...BASE, section: 'previous' })).toEqual(['Open to the public']);
    expect(labels({ ...BASE, section: 'previous', participation_status: 'invited' }))
      .toEqual(['Invited', 'Open to the public']);
    expect(labels({ ...BASE, section: 'cancelled', event_status: 'cancelled', participation_status: 'invited' }))
      .toEqual(['Cancelled', 'Invited', 'Open to the public']);
  });
});

describe('previewEngagement', () => {
  it('previews admin form values with the same whitelist as the public API', () => {
    const preview = previewEngagement({
      ...BASE, event_url: 'https://bmsz.org', admin_notes: 'PRIVATE', start_date: '2099-12-02',
    });
    expect(preview).not.toHaveProperty('admin_notes');
    expect(preview.event_url).toBe('https://bmsz.org/');
    expect(preview.section).toBe('upcoming');
  });

  it('previews an invalid URL as no link, matching what would be saved', () => {
    expect(previewEngagement({ event_title: 'A', event_url: 'ftp://x' }).event_url).toBeNull();
  });
});
