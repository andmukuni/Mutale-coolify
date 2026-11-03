import { safeExternalUrl } from '../../../shared/safeUrl.js';
import { canAddToCalendar } from '../../../shared/speakingCalendar.js';
import { MEDIA_TYPES } from '../../../shared/speakingEngagements.js';

const KNOWN_TYPES = new Set(MEDIA_TYPES.map((t) => t.value));

/** Media items worth showing: known type and a safe external address. */
export function publicMediaItems(engagement) {
  return (Array.isArray(engagement?.media) ? engagement.media : [])
    .map((item) => ({ ...item, url: safeExternalUrl(item?.url) }))
    .filter((item) => item.url && KNOWN_TYPES.has(item.type));
}

/** Whether a card has any separate actions: media links or Add to calendar. */
export function hasEngagementActions(engagement) {
  return publicMediaItems(engagement).length > 0 || canAddToCalendar(engagement);
}
