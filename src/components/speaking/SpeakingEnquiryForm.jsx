import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Info, Send } from 'lucide-react';
import FormField from '../ui/FormField';
import Spinner from '../ui/Spinner';
import { useFieldErrors } from '../../hooks/useFieldErrors';
import { FORM_VALIDATED_CLASS } from '../../utils/formFieldHighlight';
import { fetchEnquiryToken, submitSpeakingEnquiry } from '../../utils/speakingApi';
import {
  ENQUIRY_FORMAT_OPTIONS,
  ENQUIRY_LIMITS,
  ENQUIRY_ROLE_OPTIONS,
  normalizeEnquiryInput,
} from '../../../shared/speakingEnquiries.js';
import { DEFAULT_SPEAKING_TIMEZONE } from '../../../shared/speakingEngagements.js';
import {
  ENQUIRY_STEPS,
  REVIEW_STEP,
  enquiryReview,
  errorsForStep,
  firstStepWithErrors,
} from './enquirySteps';

// Must match ENQUIRY_HONEYPOT_FIELD on the server.
const HONEYPOT = 'leave_this_blank';

// The server turns away tokens under 3 seconds old (bots post at once) or over
// a day old. Sending waits out the first, with a little margin, and swaps a
// token near the second, so people never meet either.
const TOKEN_MIN_AGE_MS = 3_200;
const TOKEN_MAX_AGE_MS = 23 * 60 * 60 * 1000;

const CHECK_FIELDS = 'Please check the highlighted fields.';
// The sticky site header covers about this much of the top of the window.
const HEADER_CLEARANCE_PX = 72;

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

function Notice() {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-700">
      <Info size={16} className="mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
      <span>
        Sending this form does not confirm availability. You’ll receive an acknowledgement, and availability will be
        confirmed separately. Your details are used only to reply to this enquiry, never for mailing lists.
      </span>
    </p>
  );
}

/**
 * Where the visitor is in the form. Steps already reached can be opened again;
 * steps ahead can't be skipped to until the ones before them are complete.
 */
function StepProgress({ current, furthest, onSelect }) {
  return (
    <ol aria-label="Progress" className="grid grid-cols-4 gap-2 sm:gap-3">
      {ENQUIRY_STEPS.map((item, index) => {
        const done = index < current;
        const active = index === current;
        const content = (
          <>
            <span className={`block h-1.5 rounded-full ${index <= current ? 'bg-cyan-700' : 'bg-navy-100'}`} aria-hidden="true" />
            <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  done
                    ? 'bg-cyan-700 text-white'
                    : active
                      ? 'text-cyan-800 ring-2 ring-inset ring-cyan-700 dark:text-cyan-300'
                      : 'bg-navy-50 text-navy-600'
                }`}
                aria-hidden="true"
              >
                {done ? <Check size={12} strokeWidth={3} /> : index + 1}
              </span>
              {/* Phones show the numbers alone; the step's heading names it. */}
              <span className={`sr-only sm:not-sr-only ${active ? 'text-navy-900' : 'text-navy-600'}`}>
                {item.title}
                {done && <span className="sr-only">, completed</span>}
              </span>
            </span>
          </>
        );
        const reachable = !active && index <= furthest;
        return (
          <li key={item.id} aria-current={active ? 'step' : undefined}>
            {reachable ? (
              <button
                type="button"
                onClick={() => onSelect(index)}
                className="block w-full rounded-md text-left hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"
              >
                {content}
              </button>
            ) : (
              <div>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Review({ form, onEdit }) {
  return (
    <div className="space-y-4">
      {enquiryReview(form).map((section) => (
        <section key={section.step} aria-label={section.title} className="rounded-xl border border-navy-100 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-navy-900">{section.title}</h3>
            <button
              type="button"
              onClick={() => onEdit(section.step)}
              className="rounded-sm text-sm font-semibold text-cyan-800 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 dark:text-cyan-300"
            >
              Edit{' '}
              <span className="sr-only">{section.title}</span>
            </button>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
            {section.rows.map(({ label, value }) => (
              <Fragment key={label}>
                <dt className="text-navy-600">{label}</dt>
                <dd className="whitespace-pre-line wrap-anywhere text-navy-900">{value}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * The "Invite Me to Speak" form, one step at a time: about you, the event,
 * what you have in mind, then a review before sending. Each step is checked
 * before the next one opens, and nothing is sent until the visitor presses Send.
 */
export default function SpeakingEnquiryForm({ successMessage }) {
  const { fieldErrors, setErrors, clearField, clearAll, rootRef } = useFieldErrors();
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const successRef = useRef(null);
  const stepHeading = useRef(null);
  // Set when a step opens normally, so focus moves to its heading. A step
  // opened to show an error leaves focus to the invalid field instead.
  const announceStep = useRef(false);
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

  // A new step starts at its heading, with the top of the form in view.
  useEffect(() => {
    if (!announceStep.current) return;
    announceStep.current = false;
    // Next submits the form, which the site-wide highlighter (FormErrorHighlight)
    // marks as validated; left on, the new step's empty required fields would
    // show as errors before the visitor has typed anything.
    rootRef.current?.classList.remove(FORM_VALIDATED_CLASS);
    const top = rootRef.current?.getBoundingClientRect().top ?? 0;
    if (top < HEADER_CLEARANCE_PX) rootRef.current?.scrollIntoView?.({ block: 'start' });
    stepHeading.current?.focus({ preventScroll: true });
  }, [step, rootRef]);

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target;
    clearField(name);
    if (name === 'date_undecided') {
      clearField('proposed_start_date');
      clearField('proposed_end_date');
    }
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  /** Opens the step with errors and highlights them there; true if there were any. */
  const showErrors = (errors) => {
    const index = firstStepWithErrors(errors);
    if (index === -1) return false;
    setStep(index);
    setErrors(errorsForStep(errors, index));
    return true;
  };

  // Moving on checks every step before the one asked for, so none can be skipped.
  const goTo = (target) => {
    setError('');
    if (target > step) {
      const { errors } = normalizeEnquiryInput(form);
      const blocking = Object.fromEntries(
        ENQUIRY_STEPS.slice(0, target).flatMap((_, index) => Object.entries(errorsForStep(errors, index))),
      );
      if (showErrors(blocking)) {
        setError(CHECK_FIELDS);
        return;
      }
    }
    clearAll();
    announceStep.current = true;
    setStep(target);
    setFurthest((value) => Math.max(value, target));
  };

  // Once the review has been reached, editing an earlier step returns straight to it.
  const nextStep = furthest === REVIEW_STEP ? REVIEW_STEP : step + 1;

  const handleSubmit = async (event) => {
    event.preventDefault();
    // Enter in a field moves on, like the Next button, until the last step.
    if (step < REVIEW_STEP) {
      goTo(nextStep);
      return;
    }
    setError('');
    const { errors } = normalizeEnquiryInput(form);
    if (showErrors(errors)) {
      setError(CHECK_FIELDS);
      return;
    }
    clearAll();
    setSubmitting(true);
    try {
      const formToken = await readyToken();
      const result = await submitSpeakingEnquiry({ ...form, form_token: formToken });
      setSent({ email: form.email.trim(), acknowledged: result.acknowledgementSent !== false });
      setForm(EMPTY);
      setStep(0);
      setFurthest(0);
    } catch (err) {
      setError(err.message);
      // Invalid fields take focus themselves, on their own step; otherwise focus returns to Send.
      if (!(err.fieldErrors && showErrors(err.fieldErrors))) focusNext.current = 'button[type="submit"]';
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
        <h2 ref={successRef} tabIndex={-1} className="mt-3 text-xl font-bold text-navy-900 focus:outline-none">
          Thank you — your enquiry has been received.
        </h2>
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
  const field = (name) => ({ name, value: form[name], onChange: handleChange, error: fieldErrors[name] });

  return (
    <form ref={rootRef} onSubmit={handleSubmit} noValidate className="relative rounded-2xl border border-navy-100 bg-white p-5 sm:p-8">
      {/* Spam trap: hidden from people and assistive technology, filled only by bots. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name={HONEYPOT} tabIndex={-1} autoComplete="off" value={form[HONEYPOT]} onChange={handleChange} />
        </label>
      </div>

      <StepProgress current={step} furthest={furthest} onSelect={goTo} />

      <h2 ref={stepHeading} tabIndex={-1} className="mt-7 text-xl font-bold text-navy-900 focus:outline-none">
        <span className="block text-xs font-semibold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">
          Step {step + 1} of {ENQUIRY_STEPS.length}
          <span className="sr-only">:</span>
        </span>
        {' '}
        {ENQUIRY_STEPS[step].title}
      </h2>

      <div className="mt-5 space-y-4">
        {step === 0 && (
          <>
            <Notice />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Your name" {...field('organiser_name')} required maxLength={ENQUIRY_LIMITS.organiser_name} autoComplete="name" />
              <FormField label="Organisation" {...field('organisation')} required maxLength={ENQUIRY_LIMITS.organisation} autoComplete="organization" />
              <FormField label="Email address" {...field('email')} type="email" required maxLength={ENQUIRY_LIMITS.email} autoComplete="email" />
              <FormField label="Phone (optional)" {...field('phone')} type="tel" maxLength={ENQUIRY_LIMITS.phone} autoComplete="tel" />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <FormField label="Event title" {...field('event_title')} required maxLength={ENQUIRY_LIMITS.event_title} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Proposed date" {...field('proposed_start_date')} type="date" disabled={form.date_undecided} required={!form.date_undecided} />
              <FormField label="End date (optional)" {...field('proposed_end_date')} type="date" disabled={form.date_undecided} helpText="For events over several days." />
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
            <FormField label="Time zone" {...field('timezone')} type="select" options={TIME_ZONES} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Format" {...field('attendance_format')} type="select" options={choose(ENQUIRY_FORMAT_OPTIONS, 'Choose…')} required />
              <FormField
                label={needsLocation ? 'Location' : 'Location (optional)'}
                {...field('location')}
                required={needsLocation}
                maxLength={ENQUIRY_LIMITS.location}
                placeholder="City, country or venue"
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <FormField label="Intended audience" {...field('audience')} required maxLength={ENQUIRY_LIMITS.audience} placeholder="e.g. laboratory managers and quality officers" />
              <FormField label="Audience size (optional)" {...field('audience_size')} maxLength={ENQUIRY_LIMITS.audience_size} placeholder="e.g. 150" />
            </div>
            <FormField label="Proposed topic" {...field('topic')} textarea rows={2} required maxLength={ENQUIRY_LIMITS.topic} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Role you have in mind" {...field('requested_role')} type="select" options={choose(ENQUIRY_ROLE_OPTIONS, 'Choose…')} required />
              <FormField label="Budget or honorarium (optional)" {...field('budget')} maxLength={ENQUIRY_LIMITS.budget} />
            </div>
            <FormField label="Anything else (optional)" {...field('message')} textarea rows={4} maxLength={ENQUIRY_LIMITS.message} />
          </>
        )}

        {step === REVIEW_STEP && (
          <>
            <p className="text-sm text-navy-600">Check your details before sending. Nothing is sent until you press Send enquiry.</p>
            <Review form={form} onEdit={goTo} />
            <Notice />
          </>
        )}
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200" role="alert">
          {error}
        </p>
      )}

      {/* Enter in a field presses the one submit button, wherever it sits. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-navy-100 pt-6">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>
        ) : <span />}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"
        >
          {step === REVIEW_STEP ? (
            <>
              {submitting ? <Spinner size={16} /> : <Send size={16} aria-hidden="true" />}
              {submitting ? 'Sending…' : 'Send enquiry'}
            </>
          ) : (
            <>
              {furthest === REVIEW_STEP ? 'Back to review' : 'Next'}
              <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
