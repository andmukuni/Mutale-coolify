import { normalizeCampaignEmail, sanitizeSegment } from '../shared/emailCampaign.js';
import { evaluateRecipientEligibility } from './emailConsentService.js';

function registrationEmail(row) {
  return normalizeCampaignEmail(row.user_email || row.booked_for_email || '');
}

function registrationName(row) {
  return String(row.booked_for_name || row.user_name || '').trim();
}

export async function loadEventRegistrations(pool, eventId) {
  const [rows] = await pool.query(
    `SELECT id, event_id, user_id, user_name, user_email, booked_for_name, booked_for_email,
            status, payment_status, registration_type, attendee_type, attended_at, created_at, reference_code
     FROM event_registrations WHERE event_id = ?`,
    [eventId],
  );
  return rows || [];
}

export function registrationMatchesSegment(row, segment) {
  const spec = sanitizeSegment(segment);
  if (spec.mode === 'selected') {
    return spec.registration_ids.includes(String(row.id));
  }
  const filters = spec.filters || {};
  if (!filters.include_cancelled && String(row.status || '') === 'cancelled') return false;
  if (Array.isArray(filters.status) && filters.status.length && !filters.status.includes(String(row.status || ''))) {
    return false;
  }
  if (Array.isArray(filters.payment_status) && filters.payment_status.length
    && !filters.payment_status.includes(String(row.payment_status || ''))) {
    return false;
  }
  if (Array.isArray(filters.registration_type) && filters.registration_type.length
    && !filters.registration_type.includes(String(row.registration_type || ''))) {
    return false;
  }
  if (Array.isArray(filters.attendee_type) && filters.attendee_type.length
    && !filters.attendee_type.includes(String(row.attendee_type || 'adult'))) {
    return false;
  }
  if (filters.attended === 'yes' && !row.attended_at) return false;
  if (filters.attended === 'no' && row.attended_at) return false;
  if (filters.registered_from && String(row.created_at || '') < String(filters.registered_from)) return false;
  if (filters.registered_to && String(row.created_at || '').slice(0, 10) > String(filters.registered_to)) return false;
  return true;
}

export async function previewCampaignAudience(pool, { eventId, segment, purpose = 'event_service' }) {
  const rows = await loadEventRegistrations(pool, eventId);
  const seen = new Map();
  const included = [];
  const excluded = [];

  for (const row of rows) {
    const email = registrationEmail(row);
    if (!email) {
      excluded.push({ registration_id: row.id, email: '', reason: 'missing_email' });
      continue;
    }
    if (!registrationMatchesSegment(row, segment)) {
      excluded.push({ registration_id: row.id, email, reason: 'outside_segment' });
      continue;
    }
    if (seen.has(email)) {
      excluded.push({ registration_id: row.id, email, reason: 'duplicate_email' });
      continue;
    }
    const gate = await evaluateRecipientEligibility(pool, { email, purpose });
    if (gate.blocked) {
      excluded.push({ registration_id: row.id, email, reason: gate.reason });
      continue;
    }
    seen.set(email, row);
    included.push({
      registration_id: row.id,
      email,
      name: registrationName(row),
      reference_code: row.reference_code || '',
    });
  }

  return {
    included_count: included.length,
    excluded_count: excluded.length,
    included,
    excluded,
    count_may_change: true,
  };
}

export function previouslyIncludedEmails(existingRows = []) {
  return new Set(
    existingRows
      .filter((row) => Number(row.included) === 1)
      .map((row) => normalizeCampaignEmail(row.email_normalized)),
  );
}
