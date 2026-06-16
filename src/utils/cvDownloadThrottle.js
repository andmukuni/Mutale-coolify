import { useCallback, useRef } from 'react';

const DEFAULT_COOLDOWN_MS = 2000;

/**
 * Returns a stable callback that ignores re-entry until cooldownMs elapses.
 * @param {(...args: unknown[]) => void} fn
 * @param {number} [cooldownMs]
 */
export function useThrottledCallback(fn, cooldownMs = DEFAULT_COOLDOWN_MS) {
  const lastRunRef = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback((...args) => {
    const now = Date.now();
    if (now - lastRunRef.current < cooldownMs) return;
    lastRunRef.current = now;
    fnRef.current(...args);
  }, [cooldownMs]);
}

/**
 * @param {number} [cooldownMs]
 */
export function createThrottledAction(fn, cooldownMs = DEFAULT_COOLDOWN_MS) {
  let lastRun = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastRun < cooldownMs) return false;
    lastRun = now;
    fn(...args);
    return true;
  };
}
