import { describe, it, expect } from 'vitest';
import { buildEventSharePayload } from '../utils/shareEvent.js';

describe('buildEventSharePayload', () => {
  it('includes event details and register URL', () => {
    const payload = buildEventSharePayload(
      {
        title: 'QA Workshop',
        start_date: '2026-06-01',
        start_time: '09:00',
        location: 'Lusaka',
        category: 'Training',
        is_free: true,
      },
      'https://mutale.dev/events/qa-workshop',
    );

    expect(payload.title).toBe('QA Workshop');
    expect(payload.url).toBe('https://mutale.dev/events/qa-workshop');
    expect(payload.text).toContain('QA Workshop');
    expect(payload.text).toContain('register now');
    expect(payload.text).toContain('https://mutale.dev/events/qa-workshop');
    expect(payload.text).toContain('Free');
  });
});

describe('buildEventSharePayload for online events', () => {
  it('says Online event instead of a leftover city', () => {
    const payload = buildEventSharePayload(
      { title: 'QA Webinar', start_date: '2026-06-01', event_mode: 'virtual', location: 'Lusaka' },
      'https://mutale.dev/events/qa-webinar',
    );

    expect(payload.text).toContain('Online event');
    expect(payload.text).not.toContain('Lusaka');
  });
});
