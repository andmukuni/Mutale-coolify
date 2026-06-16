import { normalizeCvContent } from './cvContent.js';
import { renderCvHtmlFromContent } from './cvDocumentTemplates.js';

/**
 * @param {object} opts
 * @param {object} opts.user
 * @param {object[]} [opts.certificates]
 * @param {object[]} [opts.developmentEvents]
 * @param {string} [opts.templateId]
 * @param {string} [opts.profilePhotoUrl]
 */
export function renderCvDocumentHtml(opts = {}) {
  const content = normalizeCvContent({
    user: opts.user,
    certificates: opts.certificates,
    developmentEvents: opts.developmentEvents,
    profilePhotoUrl: opts.profilePhotoUrl,
  });
  return renderCvHtmlFromContent(content, opts.templateId);
}

// Re-export for tests and legacy imports
export { escapeHtml, formatCvDate, normalizeCvContent } from './cvContent.js';
