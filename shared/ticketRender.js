import { renderTicketDocumentHtml } from './ticketDocumentHtml.js';

/**
 * @param {object} viewModel
 * @param {{ outerPadding?: boolean }} [opts]
 * @returns {string}
 */
export function renderTicketMarkup(viewModel, { outerPadding = true } = {}) {
  const inner = renderTicketDocumentHtml(viewModel, { outerPadding });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;">${inner}</body></html>`;
}
