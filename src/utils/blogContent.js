/**
 * Blog content helpers — HTML vs legacy Markdown, read time, editor prep.
 */

export function looksLikeHtml(content) {
  if (!content || typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (trimmed.startsWith('<')) return true;
  return /<(p|h[1-6]|ul|ol|li|img|div|br|strong|em|blockquote)\b/i.test(trimmed);
}

export function stripHtmlForReadTime(content) {
  if (!content || typeof content !== 'string') return '';
  return content
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdownToHtml(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

/** Convert legacy Markdown posts into basic HTML for the rich editor. */
export function markdownToEditorHtml(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';
  const lines = markdown.split('\n');
  const parts = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeList();
      parts.push(`<h2>${inlineMarkdownToHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('### ')) {
      closeList();
      parts.push(`<h3>${inlineMarkdownToHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('- ')) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${inlineMarkdownToHtml(trimmed.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(trimmed)) {
      closeList();
      const body = trimmed.replace(/^\d+\.\s/, '');
      parts.push(`<p>${inlineMarkdownToHtml(body)}</p>`);
    } else {
      closeList();
      parts.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
    }
  }
  closeList();
  return parts.join('');
}

export function prepareContentForEditor(content) {
  if (!content) return '';
  if (looksLikeHtml(content)) return content;
  return markdownToEditorHtml(content);
}

export { BLOG_SANITIZE_OPTIONS } from '../../shared/blogContent.js';
