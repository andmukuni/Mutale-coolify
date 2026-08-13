import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDraftDefaults,
  assertDraftReadyToCreate,
  createEmptyDraft,
  generateEventSlug,
  isConfirmIntent,
  isDeclineIntent,
  listMissingEventFields,
  mergeEventDraft,
  parseModelJson,
  processEventChatTurn,
  resetAllChatSessionsForTests,
} from '../eventChatService.js';

afterEach(() => {
  resetAllChatSessionsForTests();
});

describe('event chat draft helpers', () => {
  it('generates a slug from the title', () => {
    expect(generateEventSlug('ISO 15189 Workshop')).toBe('iso-15189-workshop');
  });

  it('merges answers and refreshes the slug when the title changes', () => {
    const merged = mergeEventDraft(createEmptyDraft(), {
      title: 'QA Seminar',
      location: 'Lusaka, Zambia',
      start_date: '2026-03-15',
      is_free: 'yes',
    });

    expect(merged.title).toBe('QA Seminar');
    expect(merged.slug).toBe('qa-seminar');
    expect(merged.location).toBe('Lusaka, Zambia');
    expect(merged.start_date).toBe('2026-03-15');
    expect(merged.is_free).toBe(true);
  });

  it('lists missing required fields until the draft is complete', () => {
    expect(listMissingEventFields(createEmptyDraft())).toEqual(expect.arrayContaining([
      'title',
      'description',
      'location',
      'start_date',
      'end_date',
      'registration_deadline',
      'registration_deadline_time',
    ]));

    const ready = applyDraftDefaults({
      title: 'Lab Workshop',
      description: 'A one-day readiness workshop.',
      location: 'Lusaka, Zambia',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      registration_deadline: '2026-08-28',
      registration_deadline_time: '17:00',
      is_free: true,
    });
    expect(listMissingEventFields(ready)).toEqual([]);
  });

  it('requires a price on paid events', () => {
    const missing = listMissingEventFields({
      title: 'Paid Training',
      description: 'Two-day training.',
      location: 'Lusaka',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      registration_deadline: '2026-08-20',
      registration_deadline_time: '12:00',
      is_free: false,
      price: 0,
    });
    expect(missing).toContain('price');
  });

  it('rejects an incomplete draft before create', () => {
    expect(() => assertDraftReadyToCreate({ title: 'Only a title' })).toThrow(/incomplete/i);
    try {
      assertDraftReadyToCreate({ title: 'Only a title' });
    } catch (error) {
      expect(error.code).toBe('INCOMPLETE_DRAFT');
      expect(error.missing.length).toBeGreaterThan(0);
    }
  });

  it('returns a normalized draft when create is allowed', () => {
    const prepared = assertDraftReadyToCreate({
      title: 'ISO Workshop',
      description: 'Hands-on accreditation prep.',
      location: 'Lusaka, Zambia',
      start_date: '2026-10-01',
      registration_deadline: '2026-09-20',
      registration_deadline_time: '17:00',
      is_free: true,
    });
    expect(prepared.slug).toBe('iso-workshop');
    expect(prepared.status).toBe('draft');
    expect(prepared.cover_image).toContain('unsplash.com');
    expect(prepared.end_date).toBe('2026-10-01');
  });
});

describe('confirm intent', () => {
  it('detects yes/create and not-yet answers', () => {
    expect(isConfirmIntent('yes')).toBe(true);
    expect(isConfirmIntent('Create it')).toBe(true);
    expect(isConfirmIntent('go ahead')).toBe(true);
    expect(isConfirmIntent('not yet')).toBe(false);
    expect(isDeclineIntent('no')).toBe(true);
    expect(isDeclineIntent('wait')).toBe(true);
    expect(isDeclineIntent('yes please')).toBe(false);
  });
});

describe('model JSON parsing', () => {
  it('reads JSON from a fenced reply', () => {
    const parsed = parseModelJson('```json\n{"reply":"When is it?","draft":{"title":"QA Clinic"}}\n```');
    expect(parsed.reply).toBe('When is it?');
    expect(parsed.draft.title).toBe('QA Clinic');
  });
});

describe('processEventChatTurn', () => {
  it('confirms create only when the draft is complete', async () => {
    const session = {
      messages: [],
      draft: {
        title: 'Ready Event',
        description: 'Full details.',
        location: 'Lusaka',
        start_date: '2026-11-01',
        end_date: '2026-11-01',
        registration_deadline: '2026-10-20',
        registration_deadline_time: '16:00',
        is_free: true,
      },
      awaitingConfirm: true,
      confirmed: false,
    };

    const result = await processEventChatTurn({
      session,
      userMessage: 'yes, create it',
      apiKey: 'test',
      openaiCall: async () => {
        throw new Error('OpenAI should not be called on confirm');
      },
    });

    expect(result.confirmed).toBe(true);
    expect(result.readyToCreate).toBe(true);
    expect(session.confirmed).toBe(true);
  });

  it('does not create when the confirmed draft is still incomplete', async () => {
    const session = {
      messages: [],
      draft: { title: 'Half done' },
      awaitingConfirm: true,
      confirmed: false,
    };

    const result = await processEventChatTurn({
      session,
      userMessage: 'yes',
      apiKey: 'test',
      openaiCall: async () => '{"reply":"unused"}',
    });

    expect(result.confirmed).toBe(false);
    expect(result.readyToCreate).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('merges a model draft without calling create', async () => {
    const session = {
      messages: [],
      draft: createEmptyDraft(),
      awaitingConfirm: false,
      confirmed: false,
    };

    const result = await processEventChatTurn({
      session,
      userMessage: 'A Lusaka ISO workshop next month',
      apiKey: 'test',
      openaiCall: async () => JSON.stringify({
        reply: 'What date should it run?',
        draft: {
          title: 'ISO 15189 Workshop',
          location: 'Lusaka, Zambia',
          category: 'Workshop',
        },
      }),
    });

    expect(result.confirmed).toBe(false);
    expect(result.draft.title).toBe('ISO 15189 Workshop');
    expect(result.draft.slug).toBe('iso-15189-workshop');
    expect(result.missing).toContain('start_date');
  });
});
