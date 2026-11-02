import { getApiBase } from './apiBase';
import { hasConsent } from './cookieConsent';

/**
 * Count a Speaking page action (event-website click, profile download, …).
 * Counting is analytics, so nothing is sent until the visitor has accepted
 * analytics cookies, and a failure never gets in the visitor's way.
 */
export function trackSpeaking(metric, engagementId = '') {
  if (!hasConsent('analytics')) return;
  try {
    fetch(`${getApiBase()}/speaking/metrics`, {
      method: 'POST',
      // Survives the page being left, e.g. when a link replaces the tab.
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric, engagement_id: engagementId }),
    }).catch(() => {});
  } catch {
    // Counting is best effort.
  }
}
