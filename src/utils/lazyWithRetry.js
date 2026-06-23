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
          const message = String(error?.message || error || '');
          const isChunkLoadError = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed/i.test(message);
          if (isChunkLoadError && !sessionStorage.getItem('lazy-chunk-reload')) {
            sessionStorage.setItem('lazy-chunk-reload', '1');
            window.location.assign(window.location.href);
            return;
          }
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
