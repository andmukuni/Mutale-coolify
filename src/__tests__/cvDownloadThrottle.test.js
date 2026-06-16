import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createThrottledAction } from '../utils/cvDownloadThrottle.js';

describe('createThrottledAction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores calls inside cooldown window', () => {
    const fn = vi.fn();
    const throttled = createThrottledAction(fn, 2000);

    expect(throttled('pdf')).toBe(true);
    expect(throttled('pdf')).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(throttled('pdf')).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
