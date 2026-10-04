import { EMAIL_BRAND_COLORS, EMAIL_CARD_WIDTH, escapeHtml as escapeBrandHtml } from './brandedEmailHtml.js';
import { escapeHtml, renderMergeTemplate, sanitizeHttpUrl } from './emailCampaign.js';

const NAVY = EMAIL_BRAND_COLORS.navyText;
const TEAL = EMAIL_BRAND_COLORS.teal;
const CORAL = EMAIL_BRAND_COLORS.coral;
const GRAY = EMAIL_BRAND_COLORS.gray;

export function normalizeDesignDocument(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const blocks = Array.isArray(incoming.blocks) ? incoming.blocks.map(normalizeBlock) : [];
  return {
    version: 1,
    grapes: incoming.grapes && typeof incoming.grapes === 'object' ? incoming.grapes : null,
    blocks: blocks.length ? blocks : defaultBlocks(),
  };
}

export function defaultBlocks() {
  return [
    { id: 'blk-header', type: 'header' },
    { id: 'blk-heading', type: 'heading', text: '{{event_title}}' },
    { id: 'blk-text', type: 'text', text: 'Hi {{first_name}},\n\nWe have an update for you.' },
    { id: 'blk-event', type: 'event_details' },
    { id: 'blk-button', type: 'button', label: 'View event', url: '{{resource_page_url}}' },
    { id: 'blk-footer', type: 'footer' },
  ];
}

function normalizeBlock(block, index = 0) {
  const item = block && typeof block === 'object' ? block : {};
  return {
    id: String(item.id || `blk-${index}`),
    type: String(item.type || 'text'),
    text: item.text || '',
    label: item.label || '',
    url: item.url || '',
    src: item.src || '',
    alt: item.alt || '',
    resource_id: item.resource_id || '',
    resource_title: item.resource_title || '',
    resource_description: item.resource_description || '',
    resource_meta: item.resource_meta || '',
    columns: Array.isArray(item.columns) ? item.columns.map((col) => String(col || '')) : ['', ''],
  };
}

export function compileDesignToHtml(design, vars = {}, options = {}) {
  const doc = normalizeDesignDocument(design);
  const inner = doc.blocks.map((block) => renderBlock(block, vars, options)).join('');
  return wrapEmailDocument(inner, options);
}

export function compileDesignToText(design, vars = {}) {
  const doc = normalizeDesignDocument(design);
  return doc.blocks.map((block) => renderBlockText(block, vars)).filter(Boolean).join('\n\n');
}

function merge(text, vars, mode = 'text') {
  return renderMergeTemplate(text, vars, { mode });
}

function renderBlock(block, vars, options) {
  switch (block.type) {
    case 'header':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:16px 16px 0 0"><tr><td style="padding:22px 28px;color:#fff;font-family:Montserrat,Arial,sans-serif;font-size:16px;font-weight:800">MUTALE <span style="color:${TEAL}">MUBANGA</span><div style="font-size:12px;font-weight:500;color:#d5deea;margin-top:4px">Growing People.</div></td></tr></table>`;
    case 'heading':
      return `<h1 style="margin:0 0 14px;color:${NAVY};font-size:24px;line-height:1.3;font-family:Montserrat,Arial,sans-serif">${merge(block.text || 'Update', vars, 'html')}</h1>`;
    case 'text':
      return `<p style="margin:0 0 14px;color:${GRAY};font-size:15px;line-height:1.65;font-family:Arial,Helvetica,sans-serif">${merge(block.text, vars, 'html').replace(/\n/g, '<br/>')}</p>`;
    case 'image': {
      const src = sanitizeHttpUrl(merge(block.src, vars, 'text'));
      if (!src) return '';
      return `<img src="${escapeBrandHtml(src)}" alt="${merge(block.alt || 'Image', vars, 'html')}" width="540" style="display:block;width:100%;max-width:540px;height:auto;border:0;margin:0 0 16px" />`;
    }
    case 'button': {
      const href = sanitizeHttpUrl(merge(block.url, vars, 'text')) || options.fallbackUrl || '';
      if (!href) return '';
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="background:${TEAL};border-radius:10px"><a href="${escapeBrandHtml(href)}" style="display:inline-block;padding:12px 20px;color:#fff;text-decoration:none;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700">${merge(block.label || 'Open', vars, 'html')}</a></td></tr></table>`;
    }
    case 'divider':
      return `<hr style="border:0;border-top:1px solid #e6ebf0;margin:8px 0 18px" />`;
    case 'spacer':
      return `<div style="height:18px;line-height:18px">&nbsp;</div>`;
    case 'columns':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${(block.columns || ['', '']).slice(0, 2).map((col) => `<td width="50%" valign="top" style="padding:0 8px 16px 0;color:${GRAY};font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">${merge(col, vars, 'html').replace(/\n/g, '<br/>')}</td>`).join('')}</tr></table>`;
    case 'event_details':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6f6;border-radius:12px;margin:0 0 18px"><tr><td style="padding:16px;color:${NAVY};font-family:Arial,Helvetica,sans-serif"><div style="font-weight:800;margin-bottom:6px">${merge('{{event_title}}', vars, 'html')}</div><div style="color:${GRAY};font-size:14px">${merge('{{event_when}}', vars, 'html')}</div><div style="color:${GRAY};font-size:14px;margin-top:4px">${merge('{{venue_or_join}}', vars, 'html')}</div><div style="color:${GRAY};font-size:13px;margin-top:8px">Ref {{registration_ref}}</div></td></tr></table>`;
    case 'resource_card': {
      const href = sanitizeHttpUrl(merge(block.url || '{{resource_page_url}}', vars, 'text'));
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6ebf0;border-radius:12px;margin:0 0 18px"><tr><td style="padding:16px;font-family:Arial,Helvetica,sans-serif"><div style="font-weight:800;color:${NAVY}">${merge(block.resource_title || 'Event resource', vars, 'html')}</div><div style="color:${GRAY};font-size:14px;margin:6px 0 10px">${merge(block.resource_description, vars, 'html')}</div><div style="color:${GRAY};font-size:12px">${merge(block.resource_meta, vars, 'html')}</div>${href ? `<a href="${escapeBrandHtml(href)}" style="display:inline-block;margin-top:10px;color:${TEAL};font-weight:700;text-decoration:none">Download</a>` : ''}</td></tr></table>`;
    }
    case 'footer':
      return `<p style="margin:22px 0 0;color:${GRAY};font-size:12px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">Mutale Mubanga · Growing People.<br/>Manage preferences: ${linkOrText(vars.preferences_url)}<br/>${vars.unsubscribe_url ? `Unsubscribe: ${escapeHtml(vars.unsubscribe_url)}` : ''}<br/><span style="color:${CORAL}">This message was sent for a Mutale event.</span></p>`;
    default:
      return '';
  }
}

function linkOrText(url) {
  const href = sanitizeHttpUrl(url);
  return href ? escapeHtml(href) : 'your registration email';
}

function renderBlockText(block, vars) {
  switch (block.type) {
    case 'header':
      return 'Mutale Mubanga — Growing People.';
    case 'heading':
    case 'text':
      return merge(block.text, vars, 'text');
    case 'button':
      return `${merge(block.label || 'Open', vars, 'text')}: ${merge(block.url, vars, 'text')}`;
    case 'event_details':
      return [merge('{{event_title}}', vars), merge('{{event_when}}', vars), merge('{{venue_or_join}}', vars), `Ref ${merge('{{registration_ref}}', vars)}`].filter(Boolean).join('\n');
    case 'resource_card':
      return [merge(block.resource_title || 'Event resource', vars), merge(block.resource_description, vars), merge(block.url || '{{resource_page_url}}', vars)].filter(Boolean).join('\n');
    case 'columns':
      return (block.columns || []).map((col) => merge(col, vars, 'text')).filter(Boolean).join('\n');
    case 'footer':
      return ['Mutale Mubanga · Growing People.', vars.preferences_url, vars.unsubscribe_url].filter(Boolean).join('\n');
    default:
      return '';
  }
}

function wrapEmailDocument(inner, options = {}) {
  const width = options.width || EMAIL_CARD_WIDTH;
  const preview = escapeBrandHtml(options.previewText || '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeBrandHtml(options.title || 'Mutale')}</title></head><body style="margin:0;padding:0;background:#eef2f5">
${preview ? `<div style="display:none;max-height:0;overflow:hidden">${preview}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${width}px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:0 0 28px">${inner}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function collectRequiredDestinations(design) {
  const doc = normalizeDesignDocument(design);
  const missing = [];
  for (const block of doc.blocks) {
    if (block.type === 'button' && !String(block.url || '').trim()) missing.push('button_url');
    if (block.type === 'image' && !String(block.src || '').trim()) missing.push('image_src');
  }
  return [...new Set(missing)];
}

export function collectResourceIds(design) {
  const doc = normalizeDesignDocument(design);
  return [...new Set(doc.blocks
    .filter((block) => block.type === 'resource_card' && String(block.resource_id || '').trim())
    .map((block) => String(block.resource_id)))];
}

export const GROWING_PEOPLE_BLOCK_TYPES = [
  { type: 'header', label: 'Logo / header' },
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Rich text' },
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Button' },
  { type: 'divider', label: 'Divider' },
  { type: 'spacer', label: 'Spacer' },
  { type: 'columns', label: 'Two columns' },
  { type: 'event_details', label: 'Event details' },
  { type: 'resource_card', label: 'Resource card' },
  { type: 'footer', label: 'Footer' },
];
