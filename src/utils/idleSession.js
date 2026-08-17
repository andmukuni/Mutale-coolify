/**
 * Shared idle-session helpers.
 *
 * Form request timeouts (fetch abort, save errors) must not log anyone out.
 * Inactivity here is real idle time: no typing, clicks, or other input.
 * Returning to a background tab does not count as activity.
 */

export const LAST_ACTIVITY_STORAGE_KEY = 'mm_last_activity_at';

/** Real interaction, including filling a form. Intentionally omits mousemove. */
export const IDLE_ACTIVITY_EVENTS = ['keydown', 'mousedown', 'click', 'scroll', 'touchstart', 'input'];

export function readStoredLastActivityAt() {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
    if (raw == null || raw === '') return null;
    const ts = Number(raw);
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  } catch {
    return null;
  }
}

export function writeLastActivityAt(ts = Date.now()) {
  try {
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(ts));
  } catch {
    // ignore quota / private-mode failures
  }
  return ts;
}

export function clearLastActivityAt() {
  try {
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isIdleSessionExpired(timeoutMs, now = Date.now()) {
  const last = readStoredLastActivityAt();
  if (last == null) return false;
  return now - last >= Math.max(1, Number(timeoutMs) || 0);
}

export function remainingIdleMs(timeoutMs, now = Date.now()) {
  const last = readStoredLastActivityAt() ?? now;
  return Math.max(0, Math.max(1, Number(timeoutMs) || 0) - (now - last));
}
