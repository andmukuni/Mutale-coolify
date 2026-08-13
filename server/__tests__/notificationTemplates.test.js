import { describe, expect, it } from 'vitest';
import {
  buildPersonTemplateVars,
  formatFirstNameSentenceCase,
  getSystemTemplate,
  renderTemplate,
} from '../../shared/notificationTemplates.js';
import { applyNotificationTemplates } from '../notificationTemplateService.js';

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
});
