import { describe, it, expect } from 'vitest';
import {
  elementToBounds,
  boundsToElementPatch,
  resizeBoundsFromHandle,
  computeResizeScale,
  computeResizePatch,
  fontSizePtToPreviewPx,
  scaleFontForAxisChange,
} from './certificateTransform.js';

describe('certificateTransform', () => {
  it('converts element to bounds and back', () => {
    const el = { x: 0.5, y: 0.5, width: 0.4, height: 0.2 };
    const bounds = elementToBounds(el);
    expect(bounds.left).toBeCloseTo(0.3);
    expect(bounds.right).toBeCloseTo(0.7);
    const patch = boundsToElementPatch(bounds);
    expect(patch.x).toBeCloseTo(0.5);
    expect(patch.width).toBeCloseTo(0.4);
  });

  it('resizes from se handle', () => {
    const start = { left: 0.3, top: 0.3, right: 0.7, bottom: 0.5 };
    const next = resizeBoundsFromHandle(start, 'se', { x: 0.8, y: 0.6 });
    expect(next.right).toBeCloseTo(0.8);
    expect(next.bottom).toBeCloseTo(0.6);
    expect(next.left).toBeCloseTo(0.3);
    expect(next.top).toBeCloseTo(0.3);
  });

  it('resizes from w handle keeping east edge', () => {
    const start = { left: 0.3, top: 0.3, right: 0.7, bottom: 0.5 };
    const next = resizeBoundsFromHandle(start, 'w', { x: 0.2, y: 0.4 });
    expect(next.left).toBeCloseTo(0.2);
    expect(next.right).toBeCloseTo(0.7);
  });

  it('scales font proportionally on corner resize', () => {
    const start = { left: 0.3, top: 0.3, right: 0.5, bottom: 0.42 };
    const patch = computeResizePatch(start, 'se', { x: 0.7, y: 0.54 }, {
      scaleFont: true,
      startFontSize: 20,
    });
    expect(patch.width).toBeGreaterThan(0.15);
    expect(patch.fontSize).toBeGreaterThan(20);
  });

  it('uses proportional scale for corners', () => {
    const start = { left: 0, top: 0, right: 0.2, bottom: 0.1 };
    const next = { left: 0, top: 0, right: 0.4, bottom: 0.2 };
    const scale = computeResizeScale(start, next, 'se');
    expect(scale).toBeCloseTo(2);
  });

  it('maps pt font size to preview pixels', () => {
    const px = fontSizePtToPreviewPx(12, 210, 420);
    expect(px).toBeCloseTo(12 * (25.4 / 72) / 210 * 420, 1);
  });

  it('scales font when width slider changes', () => {
    const next = scaleFontForAxisChange(12, 0.28, 0.56);
    expect(next).toBeCloseTo(24, 1);
  });
});
