import { describe, expect, it } from 'vitest';
import { clampFreeImagePosition } from '../../shared/blogImageLayout.js';

describe('clampFreeImagePosition', () => {
  it('keeps image inside canvas bounds', () => {
    const result = clampFreeImagePosition({
      x: 95,
      y: 90,
      width: 280,
      height: 210,
      canvasWidth: 600,
      canvasHeight: 400,
    });

    const leftPx = (result.x / 100) * 600;
    const topPx = (result.y / 100) * 400;
    expect(leftPx + result.width).toBeLessThanOrEqual(600);
    expect(topPx + result.height).toBeLessThanOrEqual(400);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it('shrinks image when wider than canvas', () => {
    const result = clampFreeImagePosition({
      x: 0,
      y: 0,
      width: 900,
      height: 600,
      canvasWidth: 500,
      canvasHeight: 300,
    });
    expect(result.width).toBeLessThanOrEqual(500);
    expect(result.height).toBeLessThanOrEqual(300);
  });
});
