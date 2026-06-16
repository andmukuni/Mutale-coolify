/**
 * Shared blog content constants (used by server sanitize + client editor).
 */

export const BLOG_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
    'strong', 'em', 'u', 's', 'a', 'img', 'br', 'blockquote', 'hr', 'span', 'div', 'mark',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'src', 'alt', 'data-align', 'data-layout', 'data-layer',
    'data-x', 'data-y', 'class', 'width', 'height', 'style', 'data-color',
  ],
};
