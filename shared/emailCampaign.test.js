import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  missingRequiredMergeValues,
  normalizeCampaignEmail,
  renderMergeTemplate,
  sanitizeHttpUrl,
  sanitizeSegment,
  stripHeaderInjection,
} from './emailCampaign.js';

describe('campaign merge and segment helpers', () => {
  it('normalizes emails and strips header injection', () => {
    expect(normalizeCampaignEmail('  Ada@Example.com ')).toBe('ada@example.com');
    expect(stripHeaderInjection('Hello\r\nBcc: evil@example.com')).toBe('Hello Bcc: evil@example.com');
  });

  it('escapes HTML and URL merge values and applies fallbacks', () => {
    expect(renderMergeTemplate('Hi {{first_name}}', { first_name: '<b>Ada</b>' }, { mode: 'html' }))
      .toBe('Hi &lt;b&gt;Ada&lt;/b&gt;');
    expect(renderMergeTemplate('Hi {{first_name}}', {}, { mode: 'html' })).toBe('Hi there');
    expect(renderMergeTemplate('q={{full_name}}', { full_name: 'Ada Lovelace' }, { mode: 'url' }))
      .toBe('q=Ada%20Lovelace');
    expect(missingRequiredMergeValues('About {{event_title}}', {})).toEqual(['event_title']);
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeHttpUrl('https://mutalemubanga.org/events')).toContain('https://');
    expect(escapeHtml('<img src=x>')).toBe('&lt;img src=x&gt;');
  });

  it('drops unsupported segment filters such as country and tags', () => {
    const cleaned = sanitizeSegment({
      mode: 'filter',
      filters: { status: ['confirmed'], country: ['ZM'], tags: ['vip'] },
    });
    expect(cleaned.filters.status).toEqual(['confirmed']);
    expect(cleaned.filters.country).toBeUndefined();
    expect(cleaned.filters.tags).toBeUndefined();
  });
});
