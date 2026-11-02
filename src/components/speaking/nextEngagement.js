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
