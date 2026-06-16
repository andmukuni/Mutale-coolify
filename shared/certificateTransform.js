/** @typedef {'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'} TransformHandleId */

export const TRANSFORM_HANDLES = [
  { id: 'nw', cursor: 'nwse-resize', top: '0%', left: '0%' },
  { id: 'n', cursor: 'ns-resize', top: '0%', left: '50%' },
  { id: 'ne', cursor: 'nesw-resize', top: '0%', left: '100%' },
  { id: 'e', cursor: 'ew-resize', top: '50%', left: '100%' },
  { id: 'se', cursor: 'nwse-resize', top: '100%', left: '100%' },
  { id: 's', cursor: 'ns-resize', top: '100%', left: '50%' },
  { id: 'sw', cursor: 'nesw-resize', top: '100%', left: '0%' },
  { id: 'w', cursor: 'ew-resize', top: '50%', left: '0%' },
];

const MIN_WIDTH = 0.04;
const MIN_HEIGHT = 0.025;

export function elementToBounds(element) {
  const x = Number(element.x) || 0.5;
  const y = Number(element.y) || 0.5;
  const w = Number(element.width) || 0.1;
  const h = Number(element.height) || 0.08;
  return {
    left: x - w / 2,
    top: y - h / 2,
    right: x + w / 2,
    bottom: y + h / 2,
  };
}

export function boundsToElementPatch(bounds) {
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

export function isCornerHandle(handle) {
  return handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw';
}

export function isTextLikeElement(element) {
  return element?.type === 'text' || element?.type === 'placeholder';
}

/**
 * Scale factor when resizing — corners scale proportionally (Photoshop-style).
 * @param {object} startBounds
 * @param {object} nextBounds
 * @param {TransformHandleId} handle
 */
export function computeResizeScale(startBounds, nextBounds, handle) {
  const startW = startBounds.right - startBounds.left;
  const startH = startBounds.bottom - startBounds.top;
  const newW = nextBounds.right - nextBounds.left;
  const newH = nextBounds.bottom - nextBounds.top;
  if (startW <= 0 || startH <= 0) return 1;

  const scaleW = newW / startW;
  const scaleH = newH / startH;

  if (isCornerHandle(handle)) {
    return Math.sqrt(scaleW * scaleH);
  }
  if (handle === 'e' || handle === 'w') {
    return scaleW;
  }
  return scaleH;
}

const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 120;

export const MM_PER_PT = 25.4 / 72;

/** Map design font size (pt) to canvas preview pixels. */
export function fontSizePtToPreviewPx(fontSizePt, canvasHeightMm, canvasPxHeight) {
  const pt = Number(fontSizePt) || 14;
  const mm = Number(canvasHeightMm) || 210;
  const px = Number(canvasPxHeight) || 400;
  return (pt * MM_PER_PT / mm) * px;
}

/** Scale font when width or height changes on one axis (edge handle / slider). */
export function scaleFontForAxisChange(startFontSize, startSize, nextSize) {
  const fs = Number(startFontSize) || 14;
  const ss = Number(startSize) || 0.1;
  if (ss <= 0) return fs;
  const scale = Number(nextSize) / ss;
  return clamp(Math.round(fs * scale * 10) / 10, MIN_FONT_SIZE, MAX_FONT_SIZE);
}

/**
 * Build resize patch including scaled fontSize for text/placeholder elements.
 * @param {object} startBounds
 * @param {TransformHandleId} handle
 * @param {{ x: number, y: number }} pointer
 * @param {{ startFontSize?: number, scaleFont?: boolean }} [opts]
 */
export function computeResizePatch(startBounds, handle, pointer, opts = {}) {
  const nextBounds = resizeBoundsFromHandle(startBounds, handle, pointer);
  const patch = boundsToElementPatch(nextBounds);

  if (!opts.scaleFont) return patch;

  const startFontSize = Number(opts.startFontSize) || 14;
  const scale = computeResizeScale(startBounds, nextBounds, handle);
  const fontSize = clamp(
    Math.round(startFontSize * scale * 10) / 10,
    MIN_FONT_SIZE,
    MAX_FONT_SIZE,
  );

  return { ...patch, fontSize };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resize bounding box by dragging a handle (opposite edge/corner stays fixed).
 * @param {object} startBounds
 * @param {TransformHandleId} handle
 * @param {{ x: number, y: number }} pointer
 */
export function resizeBoundsFromHandle(startBounds, handle, pointer) {
  const b = { ...startBounds };
  const px = pointer.x;
  const py = pointer.y;

  switch (handle) {
    case 'nw':
      b.left = clamp(px, 0.02, b.right - MIN_WIDTH);
      b.top = clamp(py, 0.02, b.bottom - MIN_HEIGHT);
      break;
    case 'n':
      b.top = clamp(py, 0.02, b.bottom - MIN_HEIGHT);
      break;
    case 'ne':
      b.right = clamp(px, b.left + MIN_WIDTH, 0.98);
      b.top = clamp(py, 0.02, b.bottom - MIN_HEIGHT);
      break;
    case 'e':
      b.right = clamp(px, b.left + MIN_WIDTH, 0.98);
      break;
    case 'se':
      b.right = clamp(px, b.left + MIN_WIDTH, 0.98);
      b.bottom = clamp(py, b.top + MIN_HEIGHT, 0.98);
      break;
    case 's':
      b.bottom = clamp(py, b.top + MIN_HEIGHT, 0.98);
      break;
    case 'sw':
      b.left = clamp(px, 0.02, b.right - MIN_WIDTH);
      b.bottom = clamp(py, b.top + MIN_HEIGHT, 0.98);
      break;
    case 'w':
      b.left = clamp(px, 0.02, b.right - MIN_WIDTH);
      break;
    default:
      break;
  }

  return b;
}

export function boxElementStyle(element) {
  const x = Number(element.x) || 0.5;
  const y = Number(element.y) || 0.5;
  const w = Number(element.width) || 0.1;
  const h = Number(element.height) || 0.08;
  return {
    left: `${(x - w / 2) * 100}%`,
    top: `${(y - h / 2) * 100}%`,
    width: `${w * 100}%`,
    height: `${h * 100}%`,
  };
}
