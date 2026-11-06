import { isValidDateOnly, todayInTimeZone } from '../../../shared/speakingEngagements.js';

/**
 * The engagement to promote: the featured one if it is upcoming, otherwise the
 * next upcoming one. Only confirmed, scheduled appearances qualify, so the
 * homepage never advertises an invitation, a postponement or a cancellation.
 */
export function pickNextEngagement({ upcoming = [] } = {}) {
  const eligible = upcoming.filter((e) => e.participation_status === 'confirmed'
    && (e.event_status || 'scheduled') === 'scheduled');
  return eligible.find((e) => e.featured) || eligible[0] || null;
}

// Further off than this, a countdown says little.
const COUNTDOWN_MAX_DAYS = 90;

/**
 * How soon the engagement starts, counted in whole days in the event's own time
 * zone: "Happening now", "Today", "Tomorrow", "In 12 days", or '' when it's
 * undated or more than three months away.
 */
export function countdownLabel(engagement, now = new Date()) {
  if (engagement?.in_progress) return 'Happening now';
  if (engagement?.dates_tbc || !isValidDateOnly(engagement?.start_date)) return '';
  const today = todayInTimeZone(engagement.timezone, now);
  const days = Math.round((Date.parse(`${engagement.start_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days < 0 || days > COUNTDOWN_MAX_DAYS) return '';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
