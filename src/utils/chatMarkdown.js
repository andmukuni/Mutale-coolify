/**
 * Lightweight Markdown for event-assistant chat bubbles.
 * Handles **bold**, lists, and mashed-together **Label:** recap fields.
 */

export const CHAT_MARKDOWN_SANITIZE = {
  ALLOWED_TAGS: ['p', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'h3'],
  ALLOWED_ATTR: [],
};

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
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

/** Split inline **Label:** recaps and numbered agenda items onto their own lines. */
export function normalizeChatMarkdown(raw) {
  let text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  text = text.replace(/\s*\*\*([A-Za-z][A-Za-z0-9 /&'-]{0,40}):\*\*\s*/g, '\n\n**$1:** ');
  text = text.replace(/\s+(\d+)\.\s+(?=\*\*)/g, '\n$1. ');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function chatMarkdownToHtml(raw) {
  const text = normalizeChatMarkdown(raw);
  if (!text) return '';

  const parts = [];
  let listType = null;

  const closeList = () => {
    if (!listType) return;
    parts.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };

  const openList = (type) => {
    if (listType === type) return;
    closeList();
    parts.push(type === 'ol' ? '<ol>' : '<ul>');
    listType = type;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      closeList();
      parts.push(`<h3>${inlineMarkdownToHtml(heading[1])}</h3>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      openList('ol');
      parts.push(`<li>${inlineMarkdownToHtml(ordered[1])}</li>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      openList('ul');
      parts.push(`<li>${inlineMarkdownToHtml(bullet[1])}</li>`);
      continue;
    }

    closeList();
    parts.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
  }

  closeList();
  return parts.join('');
}
