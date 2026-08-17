/**
 * Pure eligibility helpers for event certificates (shared by tests + client).
 * Server uses server/certificateEligibility.js (cPanel deploy excludes src/).
 */

export { getEventTimeBounds, isEventEnded } from '../../shared/eventRegistration.js';

export function isRegistrationEligibleForCertificate(reg) {
  if (!reg) return false;
  const status = String(reg.status || '').toLowerCase();
  if (status === 'cancelled') return false;
  const attended = status === 'attended' || Boolean(reg.attended_at);
  return attended;
}
