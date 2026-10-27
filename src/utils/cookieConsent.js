/**
 * Visitor consent for non-essential browser storage and third-party lookups.
 * Strictly necessary storage (sign-in, tickets, this choice itself) never waits
 * for consent; "preferences" and "analytics" do. See /cookie-policy.
 */

export const CONSENT_STORAGE_KEY = 'mm_cookie_consent';
// Bump when the categories or what they cover change, so visitors are asked again.
export const CONSENT_VERSION = 1;
export const CONSENT_CHANGE_EVENT = 'mm:cookie-consent';
export const OPEN_COOKIE_SETTINGS_EVENT = 'mm:open-cookie-settings';

export const CONSENT_CATEGORIES = [
  {
    key: 'necessary',
    label: 'Strictly necessary',
    description:
      'Keeps you signed in, keeps your tickets and cart working, protects your account, and remembers the choices you make on this banner. These cannot be switched off.',
    locked: true,
  },
  {
    key: 'preferences',
    label: 'Preferences',
    description:
      'Looks up your approximate country from your IP address (through ipapi.co) so prices can be shown in your local currency.',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description:
      'Counts which pages are visited so we can see what is useful and improve the site.',
  },
];

let cached;

function read() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || 'null');
    if (!raw || raw.version !== CONSENT_VERSION) return null;
    return {
      version: CONSENT_VERSION,
      necessary: true,
      preferences: raw.preferences === true,
      analytics: raw.analytics === true,
      decidedAt: String(raw.decidedAt || ''),
    };
  } catch {
    return null;
  }
}

/** The saved decision, or null when the visitor has not chosen yet. */
export function getConsent() {
  if (cached === undefined) cached = typeof window === 'undefined' ? null : read();
  return cached;
}

export function hasConsent(category) {
  if (category === 'necessary') return true;
  return getConsent()?.[category] === true;
}

export function saveConsent({ preferences = false, analytics = false } = {}) {
  const next = {
    version: CONSENT_VERSION,
    necessary: true,
    preferences: Boolean(preferences),
    analytics: Boolean(analytics),
    decidedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
  if (!next.analytics) {
    // Withdrawing consent also removes what analytics already stored.
    try {
      window.localStorage.removeItem('mm_site_traffic');
    } catch {
      // Ignore storage errors.
    }
  }
  cached = next;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: next }));
  return next;
}

export function subscribeToConsent(listener) {
  const onChange = () => listener(getConsent());
  const onStorage = (event) => {
    if (event.key !== CONSENT_STORAGE_KEY) return;
    cached = read();
    listener(cached);
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Reopens the preferences dialog, e.g. from the footer's "Cookie settings" link. */
export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_COOKIE_SETTINGS_EVENT));
}

// Test helper: forget the in-memory copy so the next read hits storage.
export function resetConsentCacheForTests() {
  cached = undefined;
}
