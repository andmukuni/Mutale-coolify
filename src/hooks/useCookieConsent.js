import { useSyncExternalStore } from 'react';
import { getConsent, subscribeToConsent } from '../utils/cookieConsent';

/** Current consent decision (null until the visitor chooses); re-renders on change. */
export default function useCookieConsent() {
  return useSyncExternalStore(subscribeToConsent, getConsent, () => null);
}
