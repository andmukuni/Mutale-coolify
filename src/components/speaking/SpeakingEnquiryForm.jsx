import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, Send } from 'lucide-react';
import FormField from '../ui/FormField';
import Spinner from '../ui/Spinner';
import { useFieldErrors } from '../../hooks/useFieldErrors';
import { fetchEnquiryToken, submitSpeakingEnquiry } from '../../utils/speakingApi';
import {
  ENQUIRY_FORMAT_OPTIONS,
  ENQUIRY_LIMITS,
  ENQUIRY_ROLE_OPTIONS,
  normalizeEnquiryInput,
} from '../../../shared/speakingEnquiries.js';
import { DEFAULT_SPEAKING_TIMEZONE } from '../../../shared/speakingEngagements.js';

// Must match ENQUIRY_HONEYPOT_FIELD on the server.
const HONEYPOT = 'leave_this_blank';

// The server turns away tokens under 3 seconds old (bots post at once) or over
// a day old. Sending waits out the first, with a little margin, and swaps a
// token near the second, so people never meet either.
const TOKEN_MIN_AGE_MS = 3_200;
const TOKEN_MAX_AGE_MS = 23 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const EMPTY = {
  organiser_name: '',
  organisation: '',
  email: '',
  phone: '',
  event_title: '',
  proposed_start_date: '',
  proposed_end_date: '',
  date_undecided: false,
  timezone: DEFAULT_SPEAKING_TIMEZONE,
  attendance_format: '',
  location: '',
  audience: '',
  audience_size: '',
  topic: '',
  requested_role: '',
  budget: '',
  message: '',
  [HONEYPOT]: '',
};

const TIME_ZONES = (() => {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  return [DEFAULT_SPEAKING_TIMEZONE, ...zones.filter((z) => z !== DEFAULT_SPEAKING_TIMEZONE)];
})();

const choose = (options, label) => [{ value: '', label }, ...options];

export default function SpeakingEnquiryForm({ successMessage }) {
  const { fieldErrors, setErrors, clearField, clearAll, rootRef } = useFieldErrors();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const successRef = useRef(null);
  // What takes focus once the form is back, if the button that had it was
  // disabled or replaced, so keyboard users keep their place.
  const focusNext = useRef('');

  // The spam-protection token, as a pending request for { value, receivedAt }.
  // Age is timed from when it arrived, so the visitor's clock can't skew it.
  // A request that fails is simply made again on the next Send.
  const tokenRequest = useRef(null);
  const requestToken = useCallback(() => {
    const pending = fetchEnquiryToken().then((value) => ({ value, receivedAt: Date.now() }));
    pending.catch(() => { if (tokenRequest.current === pending) tokenRequest.current = null; });
    tokenRequest.current = pending;
    return pending;
  }, []);

  const readyToken = async () => {
    let token = await (tokenRequest.current || requestToken());
    if (Date.now() - token.receivedAt > TOKEN_MAX_AGE_MS) token = await requestToken();
    const wait = token.receivedAt + TOKEN_MIN_AGE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    return token.value;
  };

  // Fetched as the form appears, so the wait has usually passed by the time anyone presses Send.
  useEffect(() => {
    requestToken();
  }, [requestToken]);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  useEffect(() => {
    if (!focusNext.current || submitting || sent) return;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost) rootRef.current?.querySelector(focusNext.current)?.focus();
    focusNext.current = '';
  }, [submitting, sent, rootRef]);

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target;
    clearField(name);
    if (name === 'date_undecided') {
      clearField('proposed_start_date');
      clearField('proposed_end_date');
    }
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const { errors } = normalizeEnquiryInput(form);
    if (Object.keys(errors).length) {
      setErrors(errors);
      setError('Please check the highlighted fields.');
      return;
    }
    clearAll();
    setSubmitting(true);
    try {
      const formToken = await readyToken();
      const result = await submitSpeakingEnquiry({ ...form, form_token: formToken });
      setSent({ email: form.email.trim(), acknowledged: result.acknowledgementSent !== false });
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
      // Invalid fields take focus themselves; otherwise focus returns to Send.
      if (err.fieldErrors) setErrors(err.fieldErrors);
      else focusNext.current = 'button[type="submit"]';
      // The token stays valid after other failures; a rejected one is replaced
      // quietly, keeping everything typed, ready for the next Send.
      if (err.tokenRejected) requestToken();
    } finally {
      setSubmitting(false);
    }
  };

  const startAnother = () => {
    focusNext.current = '[name="organiser_name"]';
    setSent(null);
    requestToken();
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-cyan-200 bg-white p-6 sm:p-8 text-center dark:border-cyan-500/30" role="status">
        <CheckCircle2 size={40} className="mx-auto text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
        <h3 ref={successRef} tabIndex={-1} className="mt-3 text-xl font-bold text-navy-900 focus:outline-none">
          Thank you — your enquiry has been received.
        </h3>
        <p className="mt-2 text-navy-600">{successMessage}</p>
        <p className="mt-2 text-sm text-navy-600">
          {sent.acknowledged
            ? `A copy has been sent to ${sent.email}.`
            : 'We couldn’t send a confirmation email just now, but your enquiry has been saved.'}
        </p>
        <button
          type="button"
          onClick={startAnother}
          className="mt-5 rounded-xl px-4 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  const needsLocation = form.attendance_format === 'in_person' || form.attendance_format === 'hybrid';

  return (
    <form ref={rootRef} onSubmit={handleSubmit} noValidate className="relative rounded-2xl border border-navy-100 bg-white p-5 sm:p-8">
      {/* Spam trap: hidden from people and assistive technology, filled only by bots. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name={HONEYPOT} tabIndex={-1} autoComplete="off" value={form[HONEYPOT]} onChange={handleChange} />
        </label>
      </div>

      <p className="mb-6 flex items-start gap-2 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-700">
        <Info size={16} className="mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
        <span>
          Sending this form does not confirm availability. You’ll receive an acknowledgement, and availability will be
          confirmed separately. Your details are used only to reply to this enquiry, never for mailing lists.
        </span>
      </p>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-navy-900">About you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Your name" name="organiser_name" value={form.organiser_name} onChange={handleChange} required maxLength={ENQUIRY_LIMITS.organiser_name} error={fieldErrors.organiser_name} />
          <FormField label="Organisation" name="organisation" value={form.organisation} onChange={handleChange} required maxLength={ENQUIRY_LIMITS.organisation} error={fieldErrors.organisation} />
          <FormField label="Email address" name="email" type="email" value={form.email} onChange={handleChange} required maxLength={ENQUIRY_LIMITS.email} error={fieldErrors.email} />
          <FormField label="Phone (optional)" name="phone" type="tel" value={form.phone} onChange={handleChange} maxLength={ENQUIRY_LIMITS.phone} error={fieldErrors.phone} />
        </div>
      </fieldset>

      <fieldset className="mt-8 space-y-4">
        <legend className="text-base font-semibold text-navy-900">About the event</legend>
        <FormField label="Event title" name="event_title" value={form.event_title} onChange={handleChange} required maxLength={ENQUIRY_LIMITS.event_title} error={fieldErrors.event_title} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Proposed date" name="proposed_start_date" type="date" value={form.proposed_start_date} onChange={handleChange} disabled={form.date_undecided} required={!form.date_undecided} error={fieldErrors.proposed_start_date} />
          <FormField label="End date (optional)" name="proposed_end_date" type="date" value={form.proposed_end_date} onChange={handleChange} disabled={form.date_undecided} helpText="For events over several days." error={fieldErrors.proposed_end_date} />
        </div>
        <label className="flex items-center gap-3 text-sm text-navy-700 cursor-pointer">
          <input
            type="checkbox"
            name="date_undecided"
            checked={form.date_undecided}
            onChange={handleChange}
            className="h-4 w-4 rounded border-navy-300 text-cyan-700 focus:ring-cyan-700"
          />
          Date not decided yet
        </label>
        <FormField label="Time zone" name="timezone" type="select" value={form.timezone} onChange={handleChange} options={TIME_ZONES} error={fieldErrors.timezone} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Format" name="attendance_format" type="select" value={form.attendance_format} onChange={handleChange} options={choose(ENQUIRY_FORMAT_OPTIONS, 'Choose…')} required error={fieldErrors.attendance_format} />
          <FormField
            label={needsLocation ? 'Location' : 'Location (optional)'}
            name="location"
            value={form.location}
            onChange={handleChange}
            required={needsLocation}
            maxLength={ENQUIRY_LIMITS.location}
            placeholder="City, country or venue"
            error={fieldErrors.location}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FormField label="Intended audience" name="audience" value={form.audience} onChange={handleChange} required maxLength={ENQUIRY_LIMITS.audience} placeholder="e.g. laboratory managers and quality officers" error={fieldErrors.audience} />
          <FormField label="Audience size (optional)" name="audience_size" value={form.audience_size} onChange={handleChange} maxLength={ENQUIRY_LIMITS.audience_size} placeholder="e.g. 150" error={fieldErrors.audience_size} />
        </div>
        <FormField label="Proposed topic" name="topic" textarea rows={2} value={form.topic} onChange={handleChange} required maxLength={ENQUIRY_LIMITS.topic} error={fieldErrors.topic} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Role you have in mind" name="requested_role" type="select" value={form.requested_role} onChange={handleChange} options={choose(ENQUIRY_ROLE_OPTIONS, 'Choose…')} required error={fieldErrors.requested_role} />
          <FormField label="Budget or honorarium (optional)" name="budget" value={form.budget} onChange={handleChange} maxLength={ENQUIRY_LIMITS.budget} error={fieldErrors.budget} />
        </div>
        <FormField label="Anything else (optional)" name="message" textarea rows={4} value={form.message} onChange={handleChange} maxLength={ENQUIRY_LIMITS.message} error={fieldErrors.message} />
      </fieldset>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"
      >
        {submitting ? <Spinner size={16} /> : <Send size={16} aria-hidden="true" />}
        {submitting ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  );
}
