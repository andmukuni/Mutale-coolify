import { describe, it, expect } from 'vitest';
import { sanitizeBlogHtml } from '../blogSanitize.js';

describe('sanitizeBlogHtml', () => {
  it('keeps blockquote attribution for the pull-quote card', () => {
    const html = '<blockquote class="blog-quote-card" data-author="Mutale Mubanga"><p>Systems do not fail.</p></blockquote>';
    const clean = sanitizeBlogHtml(html);
    expect(clean).toContain('data-author="Mutale Mubanga"');
    expect(clean).toContain('blog-quote-card');
    expect(clean).toContain('Systems do not fail.');
  });
});
