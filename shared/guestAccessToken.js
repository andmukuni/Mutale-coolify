import { getEventTimeBounds } from './eventRegistration.js';

export const GUEST_JOIN_TOKEN_TYPE = 'guest_join';
export const GUEST_SURVEY_TOKEN_TYPE = 'guest_survey';

const DAY_SEC = 24 * 60 * 60;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function resolveGuestJoinExpirySec(event = {}) {
  const now = nowSec();
  const { end } = getEventTimeBounds(event);
  if (end && Number.isFinite(end.getTime())) {
    return Math.max(now + DAY_SEC, Math.floor(end.getTime() / 1000) + (2 * 60 * 60));
  }
  return now + (30 * DAY_SEC);
}

export function resolveGuestSurveyExpirySec(event = {}) {
  const now = nowSec();
  const { end } = getEventTimeBounds(event);
  if (end && Number.isFinite(end.getTime())) {
    return Math.max(now + DAY_SEC, Math.floor(end.getTime() / 1000) + (30 * DAY_SEC));
  }
  return now + (30 * DAY_SEC);
}

export function issueGuestAccessToken({
  registrationId,
  referenceCode,
  eventId,
  purpose,
  signJwtHmacSha256,
  authSecret,
  exp,
} = {}) {
  const type = String(purpose || '').trim();
  if (type !== GUEST_JOIN_TOKEN_TYPE && type !== GUEST_SURVEY_TOKEN_TYPE) {
    throw new Error('Invalid guest access token purpose.');
  }
  const iat = nowSec();
  return signJwtHmacSha256({
    sub: String(registrationId || ''),
    type,
    ref: String(referenceCode || '').trim(),
    evt: String(eventId || ''),
    iat,
    exp: Number(exp) || (iat + (14 * DAY_SEC)),
  }, authSecret);
}

export function verifyGuestAccessToken(token, {
  referenceCode,
  purpose,
  verifyJwtHmacSha256,
  authSecret,
} = {}) {
  const claims = verifyJwtHmacSha256(String(token || '').trim(), authSecret);
  if (!claims || claims.type !== purpose) return null;
  if (String(claims.ref || '') !== String(referenceCode || '').trim()) return null;
  if (claims.exp && Number(claims.exp) * 1000 < Date.now()) return null;
  return claims;
}

export function buildGuestTicketPath(referenceCode, suffix = '') {
  const ref = encodeURIComponent(String(referenceCode || '').trim());
  return `/tickets/${ref}${suffix}`;
}

export function buildGuestJoinUrl({ origin = '', referenceCode, token = '' } = {}) {
  const base = `${String(origin || '').replace(/\/$/, '')}${buildGuestTicketPath(referenceCode, '/join')}`;
  if (!token) return base;
  return `${base}?token=${encodeURIComponent(token)}`;
}

export function buildGuestSurveyUrl({ origin = '', referenceCode, token = '' } = {}) {
  const base = `${String(origin || '').replace(/\/$/, '')}${buildGuestTicketPath(referenceCode, '/survey')}`;
  if (!token) return base;
  return `${base}?token=${encodeURIComponent(token)}`;
}

export function issueGuestLinkBundle({
  registration,
  event,
  origin,
  signJwtHmacSha256,
  authSecret,
} = {}) {
  const referenceCode = String(registration?.reference_code || '').trim();
  const registrationId = String(registration?.id || '').trim();
  const eventId = String(event?.id || registration?.event_id || '').trim();
  const baseOrigin = String(origin || '').replace(/\/$/, '');
  const ticketUrl = referenceCode && baseOrigin
    ? `${baseOrigin}${buildGuestTicketPath(referenceCode)}`
    : '';

  if (!referenceCode || !registrationId || !signJwtHmacSha256 || !authSecret) {
    return {
      ticket_url: ticketUrl,
      join_url: referenceCode && baseOrigin ? buildGuestJoinUrl({ origin: baseOrigin, referenceCode }) : '',
      survey_url: referenceCode && baseOrigin ? buildGuestSurveyUrl({ origin: baseOrigin, referenceCode }) : '',
      join_token: '',
      survey_token: '',
    };
  }

  const joinToken = issueGuestAccessToken({
    registrationId,
    referenceCode,
    eventId,
    purpose: GUEST_JOIN_TOKEN_TYPE,
    signJwtHmacSha256,
    authSecret,
    exp: resolveGuestJoinExpirySec(event),
  });
  const surveyToken = issueGuestAccessToken({
    registrationId,
    referenceCode,
    eventId,
    purpose: GUEST_SURVEY_TOKEN_TYPE,
    signJwtHmacSha256,
    authSecret,
    exp: resolveGuestSurveyExpirySec(event),
  });

  return {
    ticket_url: ticketUrl,
    join_url: buildGuestJoinUrl({ origin: baseOrigin, referenceCode, token: joinToken }),
    survey_url: buildGuestSurveyUrl({ origin: baseOrigin, referenceCode, token: surveyToken }),
    join_token: joinToken,
    survey_token: surveyToken,
  };
}
