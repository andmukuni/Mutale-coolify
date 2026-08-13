import { describe, expect, it } from 'vitest';
import { chatMarkdownToHtml, normalizeChatMarkdown } from '../utils/chatMarkdown';

describe('chatMarkdown', () => {
  it('renders **bold** as strong, not leftover asterisks', () => {
    const html = chatMarkdownToHtml('**Title:** CV masterclass');
    expect(html).toContain('<strong>Title:</strong> CV masterclass');
    expect(html).not.toContain('**Title:**');
  });

  it('splits mashed **Label:** recap fields onto separate lines', () => {
    const normalized = normalizeChatMarkdown(
      'Here is the outline: **Title:** CV Masterclass **Category:** Masterclass **Format:** Virtual',
    );
    expect(normalized).toContain('**Title:** CV Masterclass');
    expect(normalized).toContain('\n\n**Category:** Masterclass');
    expect(normalized).toContain('\n\n**Format:** Virtual');

    const html = chatMarkdownToHtml(normalized);
    expect(html.match(/<p>/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('<strong>Category:</strong>');
  });

  it('turns numbered **agenda** items into a list', () => {
    const html = chatMarkdownToHtml(
      '**Agenda:** 1. **Intro (19:30–19:45):** Overview. 2. **Structure (19:45–20:30):** Layout.',
    );
    expect(html).toContain('<ol>');
    expect(html).toContain('<li><strong>Intro (19:30–19:45):</strong> Overview.</li>');
    expect(html).toContain('<li><strong>Structure (19:45–20:30):</strong> Layout.</li>');
  });

  it('escapes HTML in the source text', () => {
    const html = chatMarkdownToHtml('Use <script>alert(1)</script> and **safe**');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>safe</strong>');
    expect(html).not.toContain('<script>');
  });

  it('turns markdown links into safe anchors', () => {
    const html = chatMarkdownToHtml('Open [My CV](/account/cv) or [the site](https://mutalemubanga.org).');
    expect(html).toContain('href="/account/cv"');
    expect(html).toContain('href="https://mutalemubanga.org/"');
    expect(chatMarkdownToHtml('[x](javascript:alert(1))')).not.toContain('javascript:');
  });
});
