/**
 * Certificate eligibility helpers (server copy — do not import from src/ on cPanel).
 */

export { getEventTimeBounds, isEventEnded } from '../shared/eventRegistration.js';

export function isRegistrationEligibleForCertificate(reg) {
  if (!reg) return false;
  const status = String(reg.status || '').toLowerCase();
  if (status === 'cancelled') return false;
  const attended = status === 'attended' || Boolean(reg.attended_at);
  return attended;
}
