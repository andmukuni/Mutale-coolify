import { describe, expect, it } from 'vitest';
import {
  createEmptyCvDraft,
  cvDraftHasContent,
  cvDraftToProfileUpdates,
  executeSiteChatTool,
  extractSiteAssistantReply,
  listMissingCvFields,
  mergeCvDraft,
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
});
