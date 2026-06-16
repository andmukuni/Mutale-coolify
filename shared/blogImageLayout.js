/** @typedef {'flow' | 'free'} BlogImageLayout */
/** @typedef {'behind' | 'front' | 'inline'} BlogImageLayer */

export const BLOG_IMAGE_LAYERS = [
  { id: 'inline', label: 'Inline wrap' },
  { id: 'behind', label: 'Behind text' },
  { id: 'front', label: 'In front' },
];

export function clampPercent(n, fallback = 0, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  const ceiling = Number.isFinite(max) ? max : 100;
  return Math.min(ceiling, Math.max(0, v));
}

const EDITOR_CANVAS_PADDING_PX = 4;

/**
 * Keep a free-positioned image fully inside the editor canvas.
 * @param {{ x?: number, y?: number, width?: number, height?: number, canvasWidth?: number, canvasHeight?: number, padding?: number }} opts
 */
export function clampFreeImagePosition(opts = {}) {
  const padding = Number.isFinite(opts.padding) ? opts.padding : EDITOR_CANVAS_PADDING_PX;
  const canvasWidth = Math.max(1, Number(opts.canvasWidth) || 600);
  const canvasHeight = Math.max(1, Number(opts.canvasHeight) || 360);

  let width = Math.max(80, Number(opts.width) || 280);
  let height = Math.max(60, Number(opts.height) || Math.round(width * 0.75));

  const maxWidth = Math.max(80, canvasWidth - padding * 2);
  if (width > maxWidth) {
    const scale = maxWidth / width;
    width = Math.round(maxWidth);
    height = Math.max(60, Math.round(height * scale));
  }

  const maxHeight = Math.max(60, canvasHeight - padding * 2);
  if (height > maxHeight) {
    const scale = maxHeight / height;
    height = Math.round(maxHeight);
    width = Math.max(80, Math.round(width * scale));
  }

  const maxX = width >= canvasWidth - padding * 2
    ? 0
    : ((canvasWidth - width - padding) / canvasWidth) * 100;
  const maxY = height >= canvasHeight - padding * 2
    ? 0
    : ((canvasHeight - height - padding) / canvasHeight) * 100;

  return {
    x: clampPercent(opts.x, 0, maxX),
    y: clampPercent(opts.y, 0, maxY),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function layerZIndex(layer) {
  if (layer === 'behind') return 0;
  if (layer === 'front') return 3;
  return 1;
}

/**
 * @param {Record<string, unknown>} attrs
 */
export function buildBlogImageWrapperStyle(attrs) {
  if (attrs.layout !== 'free') return '';
  const x = clampPercent(attrs.x, 10);
  const y = clampPercent(attrs.y, 10);
  const width = Number(attrs.width);
  const z = layerZIndex(String(attrs.layer || 'front'));
  const parts = [
    'position:absolute',
    `left:${x}%`,
    `top:${y}%`,
    `z-index:${z}`,
    'margin:0',
    'padding:0',
    'height:0',
    'overflow:visible',
    'line-height:0',
  ];
  if (Number.isFinite(width) && width > 0) {
    parts.push(`width:${Math.round(width)}px`);
  }
  return parts.join(';');
}

/**
 * Strip unsafe CSS — only allow blog image positioning rules.
 * @param {string} style
 */
export function sanitizeBlogImageStyle(style) {
  const raw = String(style || '').trim();
  if (!raw) return '';
  const allowed = new Set([
    'position', 'left', 'top', 'right', 'bottom', 'width', 'height',
    'z-index', 'margin', 'padding', 'overflow', 'line-height', 'max-width',
  ]);
  const out = [];
  for (const chunk of raw.split(';')) {
    const piece = chunk.trim();
    if (!piece) continue;
    const idx = piece.indexOf(':');
    if (idx < 0) continue;
    const prop = piece.slice(0, idx).trim().toLowerCase();
    const val = piece.slice(idx + 1).trim();
    if (!allowed.has(prop) || !val) continue;
    if (/expression|url\s*\(|javascript:/i.test(val)) continue;
    out.push(`${prop}:${val}`);
  }
  return out.join(';');
}
