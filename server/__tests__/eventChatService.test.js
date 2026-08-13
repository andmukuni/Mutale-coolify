import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDraftDefaults,
  assertDraftReadyToCreate,
  buildSystemPrompt,
  callOpenAIEventChat,
  createEmptyDraft,
  EVENT_CREATE_PLAYBOOK,
  executeEventChatTool,
  extractAssistantReply,
  extractFunctionCalls,
  generateEventSlug,
  isCreateClaim,
  isConfirmIntent,
  isDeclineIntent,
  isPublicHttpUrl,
  isSmallTalk,
  listMissingEventFields,
  mergeEventDraft,
  parseModelJson,
  processEventChatTurn,
  resetAllChatSessionsForTests,
  shouldResearchWeb,
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

  it('leaves conversation drafts empty until the admin or model fills them', () => {
    const empty = createEmptyDraft();
    expect(empty.category).toBe('');
    expect(empty.event_mode).toBe('');
    expect(empty.is_free).toBeNull();
    expect(empty.timezone).toBe('');
    expect(empty.meeting_platform).toBe('');
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
    expect(isConfirmIntent('create the draft')).toBe(true);
    expect(isCreateClaim('I have created the draft.')).toBe(true);
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

  it('uses the model prose when JSON is missing or incomplete', () => {
    expect(extractAssistantReply('Welcome — tell me about the event.', null)).toBe(
      'Welcome — tell me about the event.',
    );
    expect(extractAssistantReply('```json\n{"draft":{"title":"X"}}\n```', { draft: { title: 'X' } })).toMatch(/tell me about the event/i);
  });
});

describe('small talk', () => {
  it('treats greetings as small talk and richer text as event input', () => {
    expect(isSmallTalk('hello')).toBe(true);
    expect(isSmallTalk('Good morning!')).toBe(true);
    expect(isSmallTalk('hello, ISO workshop in Lusaka next month')).toBe(false);
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
    expect(result.draft.category).toBe('Workshop');
    expect(result.draft.event_mode).toBe('');
    expect(result.draft.is_free).toBeNull();
  });

  it('does not invent draft fields from a greeting', async () => {
    const session = {
      messages: [],
      draft: createEmptyDraft(),
      awaitingConfirm: false,
      confirmed: false,
    };

    const result = await processEventChatTurn({
      session,
      userMessage: 'hello',
      apiKey: 'test',
      openaiCall: async () => JSON.stringify({
        reply: 'Hello — what event are you planning?',
        draft: {
          category: 'Workshop',
          event_mode: 'virtual',
          is_free: true,
        },
      }),
    });

    expect(result.reply).toBe('Hello — what event are you planning?');
    expect(result.draft.category).toBe('');
    expect(result.draft.event_mode).toBe('');
    expect(result.draft.is_free).toBeNull();
    expect(result.readyToCreate).toBe(false);
  });

  it('keeps a conversational reply when the model returns prose instead of JSON', async () => {
    const session = {
      messages: [],
      draft: createEmptyDraft(),
      awaitingConfirm: false,
      confirmed: false,
    };

    const result = await processEventChatTurn({
      session,
      userMessage: 'hello',
      apiKey: 'test',
      openaiCall: async () => 'Hi! Tell me about the event you have in mind.',
    });

    expect(result.reply).toBe('Hi! Tell me about the event you have in mind.');
    expect(result.draft.category).toBe('');
    expect(result.draft.is_free).toBeNull();
  });

  it('confirms create when the model marks the draft ready to save', async () => {
    const session = {
      messages: [],
      draft: createEmptyDraft(),
      awaitingConfirm: false,
      confirmed: false,
    };

    const result = await processEventChatTurn({
      session,
      userMessage: 'ISO 15189 workshop in Lusaka on 15 September 2026, free, registration closes 10 September at 17:00',
      apiKey: 'test',
      openaiCall: async () => JSON.stringify({
        reply: 'I have enough to save this as a draft.',
        create: true,
        draft: {
          title: 'ISO 15189 Readiness Workshop',
          description: 'A one-day laboratory accreditation workshop.',
          location: 'Lusaka, Zambia',
          start_date: '2026-09-15',
          end_date: '2026-09-15',
          registration_deadline: '2026-09-10',
          registration_deadline_time: '17:00',
          is_free: true,
        },
      }),
    });

    expect(result.confirmed).toBe(true);
    expect(result.readyToCreate).toBe(true);
    expect(session.confirmed).toBe(true);
    expect(result.draft.slug).toBe('iso-15189-readiness-workshop');
  });

  it('asks the model to research when the admin describes an event', async () => {
    const session = {
      messages: [],
      draft: createEmptyDraft(),
      awaitingConfirm: false,
      confirmed: false,
    };
    let received;

    await processEventChatTurn({
      session,
      userMessage: 'ISO 15189 workshop in Lusaka next month',
      apiKey: 'test',
      siteContext: {
        today: '2026-08-13',
        organizer: { name: 'Mutale Mubanga', location: 'Lusaka, Zambia' },
        events: [{ title: 'QA Clinic', category: 'Workshop', location: 'Lusaka', event_mode: 'in_person' }],
      },
      openaiCall: async (payload) => {
        received = payload;
        return JSON.stringify({
          reply: 'A one-day ISO 15189 readiness workshop is typical.',
          draft: { title: 'ISO 15189 Readiness Workshop', location: 'Lusaka, Zambia' },
        });
      },
    });

    expect(received.forceWebSearch).toBe(true);
    expect(received.messages[0].content).toMatch(/live research/i);
    expect(received.messages[0].content).toMatch(/ISO 15189/);
    expect(received.siteContext.organizer.name).toBe('Mutale Mubanga');
  });
});

describe('event chat research tools', () => {
  it('researches event descriptions but not greetings', () => {
    expect(shouldResearchWeb('hello')).toBe(false);
    expect(shouldResearchWeb('ISO 15189 workshop in Lusaka')).toBe(true);
  });

  it('embeds the create-event playbook in the system prompt', () => {
    const prompt = buildSystemPrompt({
      draft: createEmptyDraft(),
      missing: ['title'],
      research: true,
      siteContext: { today: '2026-08-13', organizer: { name: 'Mutale Mubanga' } },
    });
    expect(prompt).toContain(EVENT_CREATE_PLAYBOOK.slice(0, 40));
    expect(prompt).toMatch(/web_search|search_web/);
    expect(prompt).toMatch(/2026-08-13/);
    expect(prompt).toMatch(/\*\*Label:\*\*/);
  });

  it('blocks private browse URLs and serves form rules from the codebase', async () => {
    expect(isPublicHttpUrl('http://localhost/admin')).toBe(false);
    expect(isPublicHttpUrl('https://iso.org/standard/76677.html')).toBe(true);
    await expect(executeEventChatTool('get_event_create_rules')).resolves.toMatch(/registration_deadline/);
    await expect(executeEventChatTool('browse_url', { url: 'http://127.0.0.1/secret' })).resolves.toMatch(/not a public/i);
  });

  it('extracts function calls from a Responses payload', () => {
    const calls = extractFunctionCalls({
      output: [{
        type: 'function_call',
        name: 'search_web',
        call_id: 'call_1',
        arguments: '{"query":"ISO 15189 workshop agenda"}',
      }],
    });
    expect(calls).toEqual([{
      name: 'search_web',
      call_id: 'call_1',
      arguments: { query: 'ISO 15189 workshop agenda' },
    }]);
  });

  it('runs a function tool then returns the model reply', async () => {
    let round = 0;
    const fetchImpl = async (url, options = {}) => {
      if (!String(url).includes('/responses')) {
        throw new Error(`unexpected url ${url}`);
      }
      round += 1;
      if (round === 1) {
        return {
          ok: true,
          json: async () => ({
            id: 'resp_1',
            output: [{
              type: 'function_call',
              name: 'get_event_create_rules',
              call_id: 'call_1',
              arguments: '{}',
            }],
          }),
        };
      }
      const body = JSON.parse(options.body || '{}');
      expect(body.previous_response_id).toBe('resp_1');
      expect(body.input[0].output).toMatch(/ISO 15189/);
      return {
        ok: true,
        json: async () => ({
          output_text: '{"reply":"I checked the form rules.","draft":{"title":"ISO Workshop"}}',
        }),
      };
    };

    const text = await callOpenAIEventChat({
      apiKey: 'sk-test',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'ISO workshop' },
      ],
      fetchImpl,
    });

    expect(text).toContain('I checked the form rules.');
    expect(round).toBe(2);
  });
});
