import { describe, expect, it } from 'vitest';
import { buildRegistrationEmailHtml, PUBLIC_WHITE_LOGO_PATH } from './registrationEmailHtml.js';

const sample = {
  recipientName: 'Mutale Mubanga',
  recipientEmail: 'admin@mutale.dev',
  eventTitle: 'Kids Leadership Adventures',
  eventDate: 'Sat, 15 June 2024',
  eventTime: '09:00 AM – 03:00 PM CAT',
  eventLocation: 'Lusaka, Zambia',
  referenceCode: 'KLA-2024-00125',
  accessPassUrl: 'https://mutalemubanga.org/tickets/KLA-2024-00125',
  logoUrl: `https://mutalemubanga.org${PUBLIC_WHITE_LOGO_PATH}`,
  brand: {
    name: 'Mutale Mubanga',
    tagline: 'Growing People.',
    websiteUrl: 'https://mutalemubanga.org',
  },
};

describe('buildRegistrationEmailHtml', () => {
  it('matches the confirmation screenshot copy and sections', () => {
    const html = buildRegistrationEmailHtml(sample);
    expect(html).toContain('You are registered!');
    expect(html).toContain('Registration<br/>Confirmed');
    expect(html).toContain('We look forward to welcoming you.');
    expect(html).toContain('Event Details');
    expect(html).toContain('Kids Leadership Adventures');
    expect(html).toContain('Sat, 15 June 2024');
    expect(html).toContain('09:00 AM – 03:00 PM CAT');
    expect(html).toContain('Lusaka, Zambia');
    expect(html).toContain('Registration ID');
    expect(html).toContain('KLA-2024-00125');
    expect(html).toContain('View Ticket');
    expect(html).toContain('We are excited to have you join us.');
    expect(html).toContain('Growing People.');
    expect(html).toContain('mutalemubanga.org');
  });

  it('uses the white site logo in the header', () => {
    const html = buildRegistrationEmailHtml(sample);
    expect(html).toContain(PUBLIC_WHITE_LOGO_PATH);
    expect(html).toContain('alt="Mutale Mubanga"');
    expect(html).not.toContain('>M</div>');
  });

  it('does not include the old status card or calendar pair', () => {
    const html = buildRegistrationEmailHtml(sample);
    expect(html).not.toContain('Registration Status');
    expect(html).not.toContain('ADD TO CALENDAR');
    expect(html).not.toContain('VIEW ACCESS PASS');
  });

  it('links the registrant email and ticket button', () => {
    const html = buildRegistrationEmailHtml(sample);
    expect(html).toContain('mailto:admin@mutale.dev');
    expect(html).toContain('https://mutalemubanga.org/tickets/KLA-2024-00125');
  });

  it('sits as a 600px centered card instead of stretching full width', () => {
    const html = buildRegistrationEmailHtml(sample);
    expect(html).toContain('max-width:600px');
    expect(html).toContain('width:100%;max-width:600px');
    expect(html).toContain('<center');
    expect(html).toContain('align="center"');
    expect(html).not.toContain('width:640px');
    expect(html).not.toContain('max-width:100%');
  });

  it('escapes HTML in the recipient name', () => {
    const html = buildRegistrationEmailHtml({
      ...sample,
      recipientName: '<script>alert(1)</script>',
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
