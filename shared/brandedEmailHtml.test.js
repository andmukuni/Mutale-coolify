import { describe, expect, it } from 'vitest';
import {
  EMAIL_BRAND_COLORS,
  PUBLIC_WHITE_LOGO_PATH,
  buildBrandedEmailFromText,
  buildBrandedEmailHtml,
  wrapBrandedEmailHtml,
} from './brandedEmailHtml.js';

describe('branded email chrome', () => {
  it('uses navy, teal, and coral brand colours', () => {
    const html = buildBrandedEmailHtml({
      title: 'Confirm your email address',
      greeting: 'Hi Mutale,',
      bodyLines: ['Please confirm your email address.'],
      buttonText: 'Confirm email',
      buttonUrl: 'https://mutalemubanga.org/verify-email?token=demo',
    });

    expect(html).toContain(EMAIL_BRAND_COLORS.navy);
    expect(html).toContain(EMAIL_BRAND_COLORS.teal);
    expect(html).toContain(EMAIL_BRAND_COLORS.coral);
    expect(html).toContain('MUTALE');
    expect(html).toContain('MUBANGA');
    expect(html).toContain('Growing People.');
    expect(html).toContain('Confirm email');
    expect(html).toContain(PUBLIC_WHITE_LOGO_PATH);
    expect(html).not.toContain('#0891b2');
    expect(html).not.toContain('#0f172a');
  });

  it('renders a verification code box', () => {
    const html = buildBrandedEmailHtml({
      title: 'Your access code',
      greeting: 'Hi there,',
      bodyLines: ['Use this code on your ticket page.'],
      code: '482193',
    });
    expect(html).toContain('482193');
    expect(html).toContain('Verification code');
  });

  it('wraps plain text and linkifies URLs', () => {
    const html = buildBrandedEmailFromText({
      title: 'Registration Confirmed',
      text: 'Hi Mutale,\nView your ticket: https://mutalemubanga.org/tickets/MM-1',
    });
    expect(html).toContain('MUTALE');
    expect(html).toContain('href="https://mutalemubanga.org/tickets/MM-1"');
    expect(html).toContain('Hi Mutale,');
  });

  it('keeps the card at 600px so it does not fill the inbox', () => {
    const html = wrapBrandedEmailHtml({
      title: 'Confirm your email address',
      innerHtml: '<p>Body</p>',
    });
    expect(html).toContain('max-width:600px');
    expect(html).toContain('width:100%;max-width:600px');
    expect(html).toContain('<center');
    expect(html).not.toContain('width:640px');
  });

  it('escapes custom inner HTML titles', () => {
    const html = wrapBrandedEmailHtml({
      title: '<script>alert(1)</script>',
      innerHtml: '<p>Safe</p>',
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('<p>Safe</p>');
  });
});
