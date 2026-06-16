import { describe, it, expect } from 'vitest';
import {
  looksLikeHtml,
  stripHtmlForReadTime,
  markdownToEditorHtml,
  prepareContentForEditor,
} from '../utils/blogContent';

describe('blogContent', () => {
  it('detects HTML content', () => {
    expect(looksLikeHtml('<p>Hello</p>')).toBe(true);
    expect(looksLikeHtml('## Heading\n\nParagraph')).toBe(false);
  });

  it('strips HTML for read time', () => {
    const plain = stripHtmlForReadTime('<p>Hello <strong>world</strong></p>');
    expect(plain).toBe('Hello world');
  });

  it('converts basic markdown to HTML for the editor', () => {
    const html = markdownToEditorHtml('## Title\n\n- **Bold** item');
    expect(html).toContain('<h2>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>Bold</strong>');
  });

  it('prepareContentForEditor leaves HTML unchanged', () => {
    const html = '<p>Already HTML</p>';
    expect(prepareContentForEditor(html)).toBe(html);
  });

  it('prepareContentForEditor converts markdown', () => {
    const result = prepareContentForEditor('## Hello');
    expect(result).toContain('<h2>');
  });
});
