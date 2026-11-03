import {
  ENQUIRY_FORMAT_OPTIONS,
  ENQUIRY_ROLE_OPTIONS,
} from '../../../shared/speakingEnquiries.js';
import { formatEngagementDateRange, optionLabel } from '../../../shared/speakingEngagements.js';

/**
 * The steps of the "Invite Me to Speak" form, in order. Each lists the fields it
 * asks for, so validation can be run one step at a time and an error found on
 * sending can be shown on the step where the field is. The last step is the review.
 */
export const ENQUIRY_STEPS = [
  { id: 'you', title: 'About you', fields: ['organiser_name', 'organisation', 'email', 'phone'] },
  {
    id: 'event',
    title: 'The event',
    fields: ['event_title', 'proposed_start_date', 'proposed_end_date', 'date_undecided', 'timezone', 'attendance_format', 'location'],
  },
  {
    id: 'request',
    title: 'What you have in mind',
    fields: ['audience', 'audience_size', 'topic', 'requested_role', 'budget', 'message'],
  },
  { id: 'review', title: 'Review and send', fields: [] },
];

export const REVIEW_STEP = ENQUIRY_STEPS.length - 1;

/** The errors that belong to one step. */
export function errorsForStep(errors, index) {
  const fields = new Set(ENQUIRY_STEPS[index]?.fields || []);
  return Object.fromEntries(Object.entries(errors || {}).filter(([key, message]) => message && fields.has(key)));
}

/** The first step with an error, or -1 when none of the errors belongs to a step. */
export function firstStepWithErrors(errors) {
  return ENQUIRY_STEPS.findIndex((_, index) => Object.keys(errorsForStep(errors, index)).length > 0);
}

const given = (value) => String(value ?? '').trim();

function proposedDates(form) {
  if (form.date_undecided || !given(form.proposed_start_date)) return 'Not decided yet';
  return formatEngagementDateRange({
    start_date: form.proposed_start_date,
    end_date: given(form.proposed_end_date) || null,
    dates_tbc: false,
  });
}

/**
 * What the visitor entered, grouped by step, for the review. Optional fields
 * left empty are left out rather than shown as blanks.
 * @returns {{ step: number, title: string, rows: { label: string, value: string }[] }[]}
 */
export function enquiryReview(form) {
  const rows = (pairs) => pairs.filter(([, value]) => given(value)).map(([label, value]) => ({ label, value: given(value) }));
  const size = given(form.audience_size);
  return [
    {
      step: 0,
      rows: rows([
        ['Name', form.organiser_name],
        ['Organisation', form.organisation],
        ['Email', form.email],
        ['Phone', form.phone],
      ]),
    },
    {
      step: 1,
      rows: rows([
        ['Event', form.event_title],
        ['Proposed date', proposedDates(form)],
        ['Time zone', form.timezone],
        ['Format', optionLabel(ENQUIRY_FORMAT_OPTIONS, form.attendance_format)],
        ['Location', form.location],
      ]),
    },
    {
      step: 2,
      rows: rows([
        ['Audience', given(form.audience) && size ? `${given(form.audience)} (about ${size})` : form.audience],
        ['Topic', form.topic],
        ['Role', optionLabel(ENQUIRY_ROLE_OPTIONS, form.requested_role)],
        ['Budget or honorarium', form.budget],
        ['Anything else', form.message],
      ]),
    },
  ].map((section) => ({ ...section, title: ENQUIRY_STEPS[section.step].title }));
}
