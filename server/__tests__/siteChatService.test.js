import { beforeEach, describe, expect, it } from 'vitest';
import {
  createEmptyCvDraft,
  cvDraftHasContent,
  cvDraftToProfileUpdates,
  executeSiteChatTool,
  exportSiteChatSession,
  extractSiteAssistantReply,
  getOrCreateSiteChatSession,
  listMissingCvFields,
  listMissingSignupFields,
  mergeCvDraft,
  mergeSignupDraft,
  processSiteChatTurn,
  redactSensitiveUserText,
  resetSiteChatSession,
  resolveEventAccess,
  sanitizePendingAction,
} from '../siteChatService.js';

describe('site chat CV draft', () => {
  it('merges profile and section fields', () => {
    const draft = mergeCvDraft(createEmptyCvDraft(), {
      name: 'Grace Tembo',
      profession: 'QA Officer',
      specialties: 'ISO 15189, EQA',
      experience: [{ company: 'UTH', title: 'Officer', startDate: '2022', current: true }],
    });
    expect(draft.name).toBe('Grace Tembo');
    expect(draft.specialties).toEqual(['ISO 15189', 'EQA']);
    expect(draft.experience[0].company).toBe('UTH');
    expect(cvDraftHasContent(draft)).toBe(true);
  });

  it('lists missing CV fields until the draft is usable', () => {
    expect(listMissingCvFields({})).toEqual([
      'name',
      'profession',
      'about',
      'experience_or_education',
    ]);
    expect(listMissingCvFields({
      name: 'Grace',
      profession: 'QA',
      about: 'Laboratory quality professional.',
      experience: [{ company: 'UTH', title: 'Officer' }],
    })).toEqual([]);
  });

  it('maps a draft onto profile update fields', () => {
    const updates = cvDraftToProfileUpdates({
      name: 'Grace Tembo',
      profession: 'QA Officer',
      about: 'Quality systems.',
      education: [{ institution: 'UNZA', degree: 'BSc' }],
    });
    expect(updates.name).toBe('Grace Tembo');
    expect(updates.cv_sections.education[0].institution).toBe('UNZA');
  });
});

describe('site chat tools', () => {
  it('returns a sign-in hint when no user is present', async () => {
    const result = await executeSiteChatTool('get_user_context', {}, {});
    expect(result).toMatch(/not signed in/i);
  });

  it('lists upcoming events for the assistant', async () => {
    const result = await executeSiteChatTool('list_upcoming_events', {}, {
      events: [{ title: 'QA Masterclass', slug: 'qa-masterclass', start_date: '2026-09-01', is_free: true, event_mode: 'virtual' }],
    });
    expect(result).toContain('/events/qa-masterclass');
    expect(result).toContain('Free');
  });

  it('lists published shop items', async () => {
    const result = await executeSiteChatTool('list_shop_items', {}, {
      books: [{ title: 'QA Handbook', slug: 'qa-handbook', price: 150, currency: 'ZMW', author: 'Mutale' }],
    });
    expect(result).toContain('/shop/qa-handbook');
    expect(result).toContain('QA Handbook');
  });

  it('extracts a readable reply from model JSON', () => {
    expect(extractSiteAssistantReply('{"reply":"Let us start your CV.","cvDraft":{}}', {
      reply: 'Let us start your CV.',
    })).toBe('Let us start your CV.');
  });

  it('describes event access without inventing a join link', async () => {
    const result = await executeSiteChatTool('get_event_access', { query: 'sorrows' }, {
      user: { registrations: [] },
      events: [{
        id: 'evt-1',
        title: 'Navigating the Hidden Sorrows of Leading',
        slug: 'hidden-sorrows',
        is_free: true,
        joinWindow: { allowed: true },
      }],
    });
    const parsed = JSON.parse(result);
    expect(parsed.nextAction).toBe('register');
    expect(parsed.event.slug).toBe('hidden-sorrows');
  });
});

describe('site chat pending actions', () => {
  const sessionId = 'action-session';

  beforeEach(() => {
    resetSiteChatSession('guest', sessionId);
  });

  it('lists missing signup fields and keeps passwords out of exports', () => {
    expect(listMissingSignupFields({})).toContain('email');
    const draft = mergeSignupDraft({}, {
      user_type: 'international',
      name: 'Grace',
      email: 'grace@example.com',
      whatsapp: '0970000000',
      password: 'secret123',
    });
    expect(listMissingSignupFields(draft)).toEqual([]);
    const session = getOrCreateSiteChatSession('guest', sessionId);
    session.signupDraft = draft;
    expect(exportSiteChatSession(session).signupDraft.password).toBeUndefined();
  });

  it('redacts a typed password and ignores unknown actions', () => {
    expect(redactSensitiveUserText('secret123', {
      pendingAction: { type: 'login' },
      signupDraft: { email: 'grace@example.com' },
    })).toBe('••••••••');
    expect(sanitizePendingAction({ type: 'delete_everything', password: 'x' })).toBeNull();
    expect(sanitizePendingAction({ type: 'register', eventSlug: 'live', password: 'x' }).eventSlug).toBe('live');
  });

  it('sends existing emails to login instead of signup', async () => {
    const result = await processSiteChatTurn({
      visitorId: 'guest',
      sessionId,
      message: 'grace@example.com',
      signedIn: false,
      toolContext: { emailExists: async () => true },
    });
    expect(result.pendingAction?.type).toBe('login');
    expect(result.executeAction).toBe(false);
    expect(result.reply).toMatch(/already has an account/i);
  });

  it('executes a pending action only after a clear yes', async () => {
    const session = getOrCreateSiteChatSession('guest', sessionId);
    session.pendingAction = { type: 'register', eventSlug: 'hidden-sorrows', eventTitle: 'Live' };

    const declined = await processSiteChatTurn({
      visitorId: 'guest',
      sessionId,
      message: 'not yet',
      signedIn: true,
    });
    expect(declined.executeAction).toBe(false);
    expect(session.pendingAction).toBeNull();

    session.pendingAction = { type: 'register', eventSlug: 'hidden-sorrows', eventTitle: 'Live' };
    const confirmed = await processSiteChatTurn({
      visitorId: 'guest',
      sessionId,
      message: 'yes',
      signedIn: true,
    });
    expect(confirmed.executeAction).toBe(true);
    expect(confirmed.pendingAction?.type).toBe('register');
  });

  it('resolves join as the next action when the user is already registered', () => {
    const access = resolveEventAccess({
      query: 'hidden-sorrows',
      signedIn: true,
      user: {
        email_verified: true,
        registrations: [{ slug: 'hidden-sorrows', payment_status: 'not_required' }],
      },
      events: [{
        slug: 'hidden-sorrows',
        title: 'Live',
        is_free: true,
        joinWindow: { allowed: true },
      }],
    });
    expect(access.nextAction).toBe('join');
    expect(access.canJoin).toBe(true);
  });
});
