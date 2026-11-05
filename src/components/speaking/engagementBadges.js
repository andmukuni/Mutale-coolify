import {
  AUDIENCE_ACCESS_OPTIONS,
  PARTICIPATION_STATUSES,
  SPEAKING_EVENT_STATUSES,
  optionLabel,
} from '../../../shared/speakingEngagements.js';

/** Badges shown on a public card, in reading order. */
export function engagementBadges(engagement) {
  const badges = [];
  const status = engagement.event_status || 'scheduled';
  if (engagement.in_progress) badges.push({ tone: 'live', label: 'Happening now' });
  if (status !== 'scheduled') {
    badges.push({ tone: status, label: optionLabel(SPEAKING_EVENT_STATUSES, status) });
  }
  // "Invited" never implies confirmation, so it stays in every section, including
  // the past one, where an unconfirmed invitation mustn't read as a talk given.
  // "Confirmed" is dropped for past and cancelled engagements, which shouldn't
  // read as an upcoming confirmed appearance.
  const participation = engagement.participation_status;
  const past = engagement.section === 'previous' || engagement.section === 'cancelled';
  if (participation === 'invited' || (participation === 'confirmed' && status !== 'cancelled' && !past)) {
    badges.push({ tone: participation, label: optionLabel(PARTICIPATION_STATUSES, participation) });
  }
  if (engagement.audience_access && engagement.audience_access !== 'unspecified') {
    badges.push({ tone: 'access', label: optionLabel(AUDIENCE_ACCESS_OPTIONS, engagement.audience_access) });
  }
  return badges;
}

/**
 * The labels a listing shows: only those that set an engagement apart.
 * "Confirmed" and "Open to the public" describe most engagements, so they are
 * left to the engagement's own page, which shows every label. Postponed,
 * Cancelled, Invited, Invitation only and Happening now stay.
 */
export function listingBadges(engagement) {
  return engagementBadges(engagement).filter((badge) => badge.tone !== 'confirmed'
    && !(badge.tone === 'access' && engagement.audience_access === 'public'));
}

/** Labels for a past engagement's row: who could attend matters less once it is over. */
export function pastBadges(engagement) {
  return engagementBadges(engagement).filter((badge) => badge.tone !== 'access');
}
