/**
 * Speaking enquiries — invitations sent from the public Speaking page.
 * An enquiry is never an engagement: it is stored for review and can only
 * become a draft engagement through an explicit admin action.
 */
import {
  ATTENDANCE_FORMATS,
  DEFAULT_SPEAKING_TIMEZONE,
  SPEAKING_ROLES,
  isValidDateOnly,
  isValidTimeZone,
  optionLabel,
} from './speakingEngagements.js';

export const ENQUIRY_ROLE_OPTIONS = [...SPEAKING_ROLES, { value: 'not_sure', label: 'Not sure yet' }];
export const ENQUIRY_FORMAT_OPTIONS = [...ATTENDANCE_FORMATS, { value: 'undecided', label: 'Not decided yet' }];

export const ENQUIRY_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'In review' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'archived', label: 'Archived' },
];

export const ENQUIRY_LIMITS = {
  organiser_name: 120,
  organisation: 160,
  email: 190,
  phone: 40,
  event_title: 200,
  location: 200,
  audience: 300,
  audience_size: 60,
  topic: 300,
  budget: 120,
  message: 2000,
  admin_notes: 5000,
  reply_subject: 200,
  reply_message: 10000,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d][\d\s().-]{5,}$/;
const ROLE_VALUES = new Set(ENQUIRY_ROLE_OPTIONS.map((o) => o.value));
const FORMAT_VALUES = new Set(ENQUIRY_FORMAT_OPTIONS.map((o) => o.value));
const STATUS_VALUES = new Set(ENQUIRY_STATUSES.map((o) => o.value));

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'on', 'yes'].includes(String(value || '').trim().toLowerCase());
}

/**
 * Validate a public enquiry and return DB-ready columns. Every field except
 * the message is a single line, so line breaks and runs of spaces are
 * collapsed (they also end up in email subjects and the admin summary).
 * @returns {{ value: object, errors: Record<string, string> }}
 */
export function normalizeEnquiryInput(input = {}) {
  const errors = {};
  const text = (key, { required = false, label = 'This field', multiline = false } = {}) => {
    const raw = String(input[key] ?? '');
    const v = (multiline ? raw.replace(/\r\n?/g, '\n') : raw.replace(/\s+/g, ' ')).trim();
    if (required && !v) errors[key] = `${label} is required.`;
    else if (v.length > ENQUIRY_LIMITS[key]) errors[key] = `Use ${ENQUIRY_LIMITS[key]} characters or fewer.`;
    return v || null;
  };

  const organiserName = text('organiser_name', { required: true, label: 'Your name' });
  const organisation = text('organisation', { required: true, label: 'Organisation' });
  const email = text('email', { required: true, label: 'Email address' });
  if (email && !errors.email && !EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
  const phone = text('phone');
  if (phone && !errors.phone && !PHONE_PATTERN.test(phone)) errors.phone = 'Enter a valid phone number.';
  const eventTitle = text('event_title', { required: true, label: 'Event title' });

  const dateUndecided = toBoolean(input.date_undecided);
  let startDate = null;
  let endDate = null;
  if (!dateUndecided) {
    startDate = String(input.proposed_start_date ?? '').trim() || null;
    endDate = String(input.proposed_end_date ?? '').trim() || null;
    if (!startDate) errors.proposed_start_date = 'Add a proposed date, or tick “Date not decided yet”.';
    else if (!isValidDateOnly(startDate)) errors.proposed_start_date = 'Enter a valid date.';
    if (endDate && !isValidDateOnly(endDate)) errors.proposed_end_date = 'Enter a valid date.';
    else if (endDate && startDate && endDate < startDate) errors.proposed_end_date = 'End date must be on or after the start date.';
  }

  const rawZone = String(input.timezone ?? '').trim();
  if (rawZone && !isValidTimeZone(rawZone)) errors.timezone = 'Choose a valid time zone.';
  const timezone = rawZone && isValidTimeZone(rawZone) ? rawZone : DEFAULT_SPEAKING_TIMEZONE;

  const format = String(input.attendance_format ?? '').trim();
  if (!format) errors.attendance_format = 'Choose how the event will run.';
  else if (!FORMAT_VALUES.has(format)) errors.attendance_format = 'Choose one of the listed options.';
  const location = text('location');
  if ((format === 'in_person' || format === 'hybrid') && !location && !errors.location) {
    errors.location = 'Add the city or venue.';
  }

  const audience = text('audience', { required: true, label: 'Intended audience' });
  const audienceSize = text('audience_size');
  const topic = text('topic', { required: true, label: 'Proposed topic' });
  const role = String(input.requested_role ?? '').trim();
  if (!role) errors.requested_role = 'Choose the role you have in mind.';
  else if (!ROLE_VALUES.has(role)) errors.requested_role = 'Choose one of the listed options.';
  const budget = text('budget');
  const message = text('message', { multiline: true });

  return {
    value: {
      organiser_name: organiserName,
      organisation,
      email: email ? email.toLowerCase() : null,
      phone,
      event_title: eventTitle,
      proposed_start_date: startDate,
      proposed_end_date: endDate,
      date_undecided: dateUndecided ? 1 : 0,
      timezone,
      attendance_format: FORMAT_VALUES.has(format) ? format : null,
      location,
      audience,
      audience_size: audienceSize,
      topic,
      requested_role: ROLE_VALUES.has(role) ? role : null,
      budget,
      message,
    },
    errors,
  };
}

/** Admin edits to an enquiry: only its review status and private notes. */
export function normalizeEnquiryReview(input = {}) {
  const errors = {};
  const value = {};
  if (input.status !== undefined) {
    const status = String(input.status || '').trim();
    if (!STATUS_VALUES.has(status)) errors.status = 'Choose one of the listed statuses.';
    else value.status = status;
  }
  if (input.admin_notes !== undefined) {
    const notes = String(input.admin_notes || '').trim();
    if (notes.length > ENQUIRY_LIMITS.admin_notes) errors.admin_notes = `Use ${ENQUIRY_LIMITS.admin_notes} characters or fewer.`;
    else value.admin_notes = notes || null;
  }
  return { value, errors };
}

/** An admin's email reply to the organiser. */
export function normalizeEnquiryReply(input = {}) {
  const errors = {};
  const subject = String(input.subject ?? '').trim();
  const message = String(input.message ?? '').trim();
  if (!subject) errors.subject = 'Add a subject.';
  else if (subject.length > ENQUIRY_LIMITS.reply_subject) errors.subject = `Use ${ENQUIRY_LIMITS.reply_subject} characters or fewer.`;
  if (!message) errors.message = 'Write your reply.';
  else if (message.length > ENQUIRY_LIMITS.reply_message) errors.message = `Use ${ENQUIRY_LIMITS.reply_message} characters or fewer.`;
  return { value: { subject, message }, errors };
}

export function formatEnquiryDates(enquiry) {
  if (Number(enquiry?.date_undecided) === 1 || enquiry?.date_undecided === true || !enquiry?.proposed_start_date) {
    return 'Not decided yet';
  }
  const start = String(enquiry.proposed_start_date).slice(0, 10);
  const end = enquiry.proposed_end_date ? String(enquiry.proposed_end_date).slice(0, 10) : '';
  return end && end !== start ? `${start} to ${end}` : start;
}

// Titles people type before their name; the acknowledgement greets the person, not the title.
const HONORIFICS = new Set([
  'dr', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'mx', 'rev', 'revd', 'reverend', 'hon', 'honourable', 'sir', 'dame',
]);
const PLAIN_NAME = /^\p{L}[\p{L}\p{M}'’-]*$/u;

/**
 * First name for the acknowledgement greeting, or '' when there isn't a plain
 * one. Leading titles are skipped ("Prof Nkandu Luo" → "Nkandu"), and only a
 * word made of letters, hyphens and apostrophes is used, so nothing else typed
 * into the form ever reaches the organiser's inbox.
 */
export function greetingFirstName(fullName = '') {
  const words = String(fullName || '').trim().split(/\s+/);
  let index = 0;
  while (index < words.length && HONORIFICS.has(words[index].replace(/\.$/, '').toLowerCase())) index += 1;
  const first = words[index] || '';
  if (!first || first.length > 40 || !PLAIN_NAME.test(first)) return '';
  // "andrew" and "ANDREW" become "Andrew"; a mixed-case name such as "DeShawn" is kept as typed.
  if (first !== first.toLowerCase() && first !== first.toUpperCase()) return first;
  return `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}`;
}

/** "Hello Andrew," or, without a plain first name, "Hello,". */
export function enquiryGreeting(fullName = '') {
  const first = greetingFirstName(fullName);
  return first ? `Hello ${first},` : 'Hello,';
}

/** Plain-text summary for the admin alert and private notes. Never sent to the organiser. */
export function buildEnquirySummary(enquiry) {
  const format = optionLabel(ENQUIRY_FORMAT_OPTIONS, enquiry.attendance_format) || 'Not given';
  const lines = [
    `Organiser: ${enquiry.organiser_name}`,
    `Organisation: ${enquiry.organisation}`,
    `Email: ${enquiry.email}`,
    `Phone: ${enquiry.phone || 'Not given'}`,
    '',
    `Event: ${enquiry.event_title}`,
    `Proposed date: ${formatEnquiryDates(enquiry)} (${enquiry.timezone || DEFAULT_SPEAKING_TIMEZONE})`,
    `Format: ${format}${enquiry.location ? ` — ${enquiry.location}` : ''}`,
    `Intended audience: ${enquiry.audience}${enquiry.audience_size ? ` (about ${enquiry.audience_size})` : ''}`,
    `Proposed topic: ${enquiry.topic}`,
    `Requested role: ${optionLabel(ENQUIRY_ROLE_OPTIONS, enquiry.requested_role) || 'Not given'}`,
    `Budget or honorarium: ${enquiry.budget || 'Not given'}`,
  ];
  if (enquiry.message) lines.push('', 'Message:', enquiry.message);
  return lines.join('\n');
}
