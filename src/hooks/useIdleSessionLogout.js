import { useEffect, useRef } from 'react';
import {
  IDLE_ACTIVITY_EVENTS,
  clearLastActivityAt,
  isIdleSessionExpired,
  readStoredLastActivityAt,
  remainingIdleMs,
  writeLastActivityAt,
} from '../utils/idleSession';

/**
 * Logs the signed-in person out after true idle time.
 * Typing / clicking (including while filling a form) extends the session.
 * Tab focus and mouse movement do not.
 */
export function useIdleSessionLogout({ enabled, timeoutMs, onTimeout }) {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const timerRef = useRef(null);
  const watchdogRef = useRef(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const clearWatchdog = () => {
      if (watchdogRef.current) {
        window.clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
    };

    if (!enabled) {
      expiredRef.current = false;
      clearTimer();
      clearWatchdog();
      return undefined;
    }

    // Keep the expired guard across StrictMode's effect remount so we do not
    // treat a just-logged-out session as a fresh one.
    if (expiredRef.current) {
      return undefined;
    }

    const expire = () => {
      if (expiredRef.current) return;
      expiredRef.current = true;
      clearTimer();
      clearWatchdog();
      clearLastActivityAt();
      onTimeoutRef.current?.();
    };

    const schedule = () => {
      clearTimer();
      if (expiredRef.current) return;
      if (isIdleSessionExpired(timeoutMs)) {
        expire();
        return;
      }
      timerRef.current = window.setTimeout(expire, remainingIdleMs(timeoutMs));
    };

    const recordActivity = () => {
      if (expiredRef.current) return;
      writeLastActivityAt();
      schedule();
    };

    if (isIdleSessionExpired(timeoutMs)) {
      expire();
      return undefined;
    }

    if (readStoredLastActivityAt() == null) {
      writeLastActivityAt();
    }
    schedule();

    IDLE_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });

    const enforceOnReturn = () => {
      if (document.visibilityState === 'hidden') return;
      if (isIdleSessionExpired(timeoutMs)) expire();
      else schedule();
    };

    document.addEventListener('visibilitychange', enforceOnReturn);
    window.addEventListener('focus', enforceOnReturn);

    const watchdogEveryMs = Math.min(Math.max(Number(timeoutMs) || 0, 1000), 30_000);
    watchdogRef.current = window.setInterval(() => {
      if (isIdleSessionExpired(timeoutMs)) expire();
    }, watchdogEveryMs);

    return () => {
      IDLE_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      document.removeEventListener('visibilitychange', enforceOnReturn);
      window.removeEventListener('focus', enforceOnReturn);
      clearTimer();
      clearWatchdog();
    };
  }, [enabled, timeoutMs]);
}
