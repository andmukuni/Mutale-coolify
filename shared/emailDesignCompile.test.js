import { describe, expect, it } from 'vitest';
import { EMAIL_DESIGN_TEMPLATE_SEED } from './emailDesignTemplates.js';
import { collectRequiredDestinations, compileDesignToHtml, compileDesignToText } from './emailDesignCompile.js';

describe('email design compile', () => {
  it('seeds four Growing People templates', () => {
    expect(EMAIL_DESIGN_TEMPLATE_SEED.map((item) => item.slug)).toEqual([
      'event_update',
      'joining_instructions',
      'resources_delivery',
      'post_event_thanks',
    ]);
  });

  it('compiles branded HTML and escaped merge values', () => {
    const html = compileDesignToHtml({
      blocks: [
        { type: 'header' },
        { type: 'heading', text: '{{event_title}}' },
        { type: 'text', text: 'Hi {{first_name}}' },
        { type: 'button', label: 'Open', url: 'https://mutalemubanga.org/events' },
      ],
    }, { event_title: '<Summit>', first_name: 'Ada' }, { title: 'Test', previewText: 'Pre' });
    expect(html).toContain('#141D45');
    expect(html).toContain('#00A79D');
    expect(html).toContain('&lt;Summit&gt;');
    expect(html).not.toContain('<Summit>');
    expect(compileDesignToText({
      blocks: [{ type: 'heading', text: '{{event_title}}' }],
    }, { event_title: 'Summit' })).toContain('Summit');
  });

  it('flags missing destinations', () => {
    expect(collectRequiredDestinations({
      blocks: [{ type: 'button', label: 'Go', url: '' }],
    })).toContain('button_url');
  });
});
