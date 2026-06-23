import { lazy } from 'react';

/**
 * Lazy-load a route chunk with retries — helps when a dynamic import fails
 * transiently on client-side navigation (CDN hiccup, stale deploy, etc.).
 */
export function lazyWithRetry(importFn, retries = 3, intervalMs = 800) {
  return lazy(() => new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      importFn()
        .then(resolve)
        .catch((error) => {
          if (remaining <= 1) {
            reject(error);
            return;
          }
          window.setTimeout(() => attempt(remaining - 1), intervalMs);
        });
    };
    attempt(retries);
  }));
}
