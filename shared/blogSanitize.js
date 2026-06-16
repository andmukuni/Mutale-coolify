import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { BLOG_SANITIZE_OPTIONS } from './blogContent.js';
import { sanitizeBlogImageStyle } from './blogImageLayout.js';

const purify = DOMPurify(new JSDOM('').window);

purify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName !== 'style') return;
  if (node.tagName !== 'DIV' || !node.getAttribute('class')?.includes('blog-image-free')) {
    data.keepAttr = false;
    return;
  }
  data.attrValue = sanitizeBlogImageStyle(data.attrValue);
  if (!data.attrValue) data.keepAttr = false;
});

const SERVER_BLOG_OPTIONS = {
  ...BLOG_SANITIZE_OPTIONS,
  ALLOWED_ATTR: [...BLOG_SANITIZE_OPTIONS.ALLOWED_ATTR, 'style'],
};

/**
 * @param {unknown} html
 * @returns {string}
 */
export function sanitizeBlogHtml(html) {
  return purify.sanitize(String(html ?? ''), SERVER_BLOG_OPTIONS);
}
