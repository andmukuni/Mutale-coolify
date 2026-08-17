import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LAST_ACTIVITY_STORAGE_KEY,
  clearLastActivityAt,
  isIdleSessionExpired,
  readStoredLastActivityAt,
  remainingIdleMs,
  writeLastActivityAt,
} from '../utils/idleSession';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

describe('idleSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('does not treat a missing timestamp as expired', () => {
    expect(readStoredLastActivityAt()).toBeNull();
    expect(isIdleSessionExpired(THIRTY_MINUTES_MS)).toBe(false);
  });

  it('expires only after the idle window with no recorded activity', () => {
    const now = Date.now();
    writeLastActivityAt(now - THIRTY_MINUTES_MS);
    expect(isIdleSessionExpired(THIRTY_MINUTES_MS, now)).toBe(true);
    expect(remainingIdleMs(THIRTY_MINUTES_MS, now)).toBe(0);
  });

  it('keeps the session alive while the person is still within the window', () => {
    const now = Date.now();
    writeLastActivityAt(now - 5 * 60 * 1000);
    expect(isIdleSessionExpired(THIRTY_MINUTES_MS, now)).toBe(false);
    expect(remainingIdleMs(THIRTY_MINUTES_MS, now)).toBe(25 * 60 * 1000);
  });

  it('clears the stored activity stamp', () => {
    writeLastActivityAt();
    expect(localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY)).toBeTruthy();
    clearLastActivityAt();
    expect(readStoredLastActivityAt()).toBeNull();
  });
});
