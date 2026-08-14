import { describe, expect, it } from 'vitest';
import {
  buildPersonTemplateVars,
  formatFirstNameSentenceCase,
  getSystemTemplate,
  renderTemplate,
} from '../../shared/notificationTemplates.js';
import {
  applyNotificationTemplates,
  buildTemplateTestContent,
  wrapTemplateEmailHtml,
} from '../notificationTemplateService.js';

describe('notification templates', () => {
  it('sentence-cases first names', () => {
    expect(formatFirstNameSentenceCase('ANDREW MUKUNI')).toBe('Andrew');
    expect(buildPersonTemplateVars('ANDREW MUKUNI').thank_you).toBe('Thank you, Andrew.');
  });

  it('renders placeholders', () => {
    expect(renderTemplate('Hi {{first_name}}. {{event_title}}.', {
      first_name: 'Ada',
      event_title: 'Summit',
    })).toBe('Hi Ada. Summit.');
  });

  it('renders the default ticket SMS from the catalog', async () => {
    const catalog = getSystemTemplate('ticket', 'sms');
    expect(catalog).toBeTruthy();
    const applied = await applyNotificationTemplates(null, {
      slug: 'ticket',
      vars: {
        thank_you: 'Thank you, Andrew.',
        event_title: 'Navigating the Hidden Sorrows of Leading',
        ticket_url: 'https://mutalemubanga.org/tickets/REG-1',
      },
      smsMessage: 'fallback',
    });
    expect(applied.smsMessage).toBe(
      'Thank you, Andrew. Navigating the Hidden Sorrows of Leading. View your ticket here: https://mutalemubanga.org/tickets/REG-1',
    );
  });

  it('renders a test send with sample values', () => {
    const rendered = buildTemplateTestContent({
      channel: 'sms',
      body: '{{thank_you}} {{event_title}}. View your ticket here: {{ticket_url}}',
    });
    expect(rendered.body).toContain('Thank you, Andrew.');
    expect(rendered.body).toContain('https://mutalemubanga.org/tickets/REG-DEMO');
  });

  it('wraps a test email in branded HTML with clickable links', () => {
    const html = wrapTemplateEmailHtml({
      subject: 'Your entry ticket: Summit',
      body: 'View your ticket here: https://mutalemubanga.org/tickets/REG-DEMO',
    });
    expect(html).toContain('Your entry ticket: Summit');
    expect(html).toContain('href="https://mutalemubanga.org/tickets/REG-DEMO"');
    expect(html).toContain('Mutale Mubanga');
  });
});
