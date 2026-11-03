import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ fetchToken: vi.fn(), submit: vi.fn() }));

vi.mock('../utils/speakingApi', () => ({
  fetchEnquiryToken: mocks.fetchToken,
  submitSpeakingEnquiry: mocks.submit,
}));

import SpeakingEnquiryForm from '../components/speaking/SpeakingEnquiryForm';
import { enquiryReview, errorsForStep, firstStepWithErrors } from '../components/speaking/enquirySteps';

const SUCCESS = 'Availability will be confirmed separately — this is not yet a booking.';

const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Next|Back to review)/ }));
// A real click focuses the button too, which matters for where focus goes afterwards.
const send = () => {
  const button = screen.getByRole('button', { name: /Send enquiry/ });
  button.focus();
  fireEvent.click(button);
};
const stepHeading = (name) => screen.getByRole('heading', { level: 2, name });

function fillYou() {
  change(/Your name/, 'Andrew Mukuni');
  change(/Organisation/, 'Biomedical Society of Zambia');
  change(/Email address/, 'Andrew@Example.org');
}

function fillEvent() {
  change(/Event title/, 'Annual Scientific Conference');
  change(/^Proposed date/, '2027-03-04');
  change(/^Format/, 'online');
}

function fillRequest() {
  change(/Intended audience/, 'Laboratory managers');
  change(/Proposed topic/, 'Quality systems');
  change(/Role you have in mind/, 'keynote_speaker');
}

/** Completes the three steps, leaving the form on its review. */
function fillAll() {
  fillYou();
  next();
  fillEvent();
  next();
  fillRequest();
  next();
}

// The form holds a token back until it is 3.2 s old. Only Date is faked by
// default, so tests move the clock on instead of waiting, while Testing
// Library's own timers keep running.
const TOKEN_AGE_MS = 4_000;
const ageToken = () => vi.advanceTimersByTime(TOKEN_AGE_MS);
// Lets pending promises (such as the token request) settle.
const settle = () => act(async () => {});

async function renderForm() {
  render(<SpeakingEnquiryForm successMessage={SUCCESS} />);
  await settle();
  ageToken();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Invalid fields and new steps are scrolled into view; jsdom has no layout to scroll.
  Element.prototype.scrollIntoView = vi.fn();
  mocks.fetchToken.mockReset();
  mocks.submit.mockReset();
  mocks.fetchToken.mockResolvedValue('token-1');
  mocks.submit.mockResolvedValue({ acknowledgementSent: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SpeakingEnquiryForm — steps', () => {
  it('asks for one group of details at a time, with the progress marked', async () => {
    await renderForm();
    expect(stepHeading(/Step 1 of 4.*About you/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Event title/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send enquiry/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument();

    const progress = within(screen.getByRole('list', { name: 'Progress' }));
    expect(progress.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step');
    // Later steps can't be jumped to before the earlier ones are done.
    expect(progress.queryAllByRole('button')).toHaveLength(0);
  });

  it('checks a step before moving on, highlighting only that step’s missing fields', async () => {
    await renderForm();
    next();

    expect(await screen.findByText('Please check the highlighted fields.')).toBeInTheDocument();
    for (const label of [/Your name/, /Organisation/, /Email address/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(screen.getByLabelText(/Phone/)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/Your name/)).toHaveFocus();
    expect(stepHeading(/About you/)).toBeInTheDocument();

    fillYou();
    next();
    const heading = stepHeading(/Step 2 of 4.*The event/);
    expect(heading).toHaveFocus();
    expect(screen.queryByText('Please check the highlighted fields.')).not.toBeInTheDocument();

    next();
    for (const label of [/Event title/, /^Proposed date/, /^Format/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }
    fillEvent();
    next();

    next();
    for (const label of [/Intended audience/, /Proposed topic/, /Role you have in mind/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }
    for (const label of [/Audience size/, /Budget/, /Anything else/]) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('moves on with Enter, like the Next button', async () => {
    await renderForm();
    fillYou();
    fireEvent.submit(screen.getByLabelText(/Email address/).closest('form'));
    expect(stepHeading(/The event/)).toBeInTheDocument();
  });

  it('opens a new step without the site-wide “validated” mark that would show its empty fields as errors', async () => {
    await renderForm();
    fillYou();
    const form = screen.getByLabelText(/Email address/).closest('form');
    // What FormErrorHighlight adds on every submit, Next included.
    form.classList.add('was-validated');
    next();
    expect(form).not.toHaveClass('was-validated');
  });

  it('keeps what was typed when going back', async () => {
    await renderForm();
    fillYou();
    next();
    change(/Event title/, 'Annual Scientific Conference');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(stepHeading(/About you/)).toHaveFocus();
    expect(screen.getByLabelText(/Your name/)).toHaveValue('Andrew Mukuni');
    next();
    expect(screen.getByLabelText(/Event title/)).toHaveValue('Annual Scientific Conference');
  });

  it('accepts an enquiry without a date when the date is not decided', async () => {
    await renderForm();
    fillYou();
    next();
    fillEvent();
    change(/^Proposed date/, '');
    fireEvent.click(screen.getByLabelText('Date not decided yet'));
    expect(screen.getByLabelText(/^Proposed date/)).toBeDisabled();
    next();
    fillRequest();
    next();

    expect(within(screen.getByRole('region', { name: 'The event' })).getByText('Not decided yet')).toBeInTheDocument();
    send();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({ date_undecided: true });
  });

  it('asks for a location when the event is in person', async () => {
    await renderForm();
    fillYou();
    next();
    fillEvent();
    change(/^Format/, 'in_person');
    next();
    expect(await screen.findByText('Add the city or venue.')).toBeInTheDocument();
    expect(stepHeading(/The event/)).toBeInTheDocument();
  });

  it('rejects an end date before the start date', async () => {
    await renderForm();
    fillYou();
    next();
    fillEvent();
    change(/End date/, '2027-03-01');
    next();
    expect(await screen.findByText('End date must be on or after the start date.')).toBeInTheDocument();
  });
});

describe('SpeakingEnquiryForm — review', () => {
  it('shows everything entered before sending, and lets each part be edited', async () => {
    await renderForm();
    fillYou();
    next();
    fillEvent();
    next();
    fillRequest();
    change(/Audience size/, '150');
    next();

    expect(stepHeading(/Step 4 of 4.*Review and send/)).toHaveFocus();
    const you = within(screen.getByRole('region', { name: 'About you' }));
    expect(you.getByText('Andrew Mukuni')).toBeInTheDocument();
    expect(you.queryByText('Phone')).not.toBeInTheDocument();
    const event = within(screen.getByRole('region', { name: 'The event' }));
    expect(event.getByText('4 March 2027')).toBeInTheDocument();
    expect(event.getByText('Online')).toBeInTheDocument();
    const request = within(screen.getByRole('region', { name: 'What you have in mind' }));
    expect(request.getByText('Laboratory managers (about 150)')).toBeInTheDocument();
    expect(request.getByText('Keynote speaker')).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit The event' }));
    expect(stepHeading(/The event/)).toHaveFocus();
    change(/Event title/, 'Regional Quality Summit');
    // Once the review has been reached, the way forward leads straight back to it.
    fireEvent.click(screen.getByRole('button', { name: /Back to review/ }));
    expect(within(screen.getByRole('region', { name: 'The event' })).getByText('Regional Quality Summit')).toBeInTheDocument();
  });

  it('lets finished steps be reopened from the progress list', async () => {
    await renderForm();
    fillAll();
    const progress = within(screen.getByRole('list', { name: 'Progress' }));
    fireEvent.click(progress.getByRole('button', { name: /About you, completed/ }));
    expect(stepHeading(/About you/)).toBeInTheDocument();
  });
});

describe('SpeakingEnquiryForm — sending', () => {
  it('sends the form with its token and an empty spam trap, then confirms without promising availability', async () => {
    await renderForm();
    fillAll();
    send();

    const heading = await screen.findByRole('heading', { name: /your enquiry has been received/ });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText(SUCCESS)).toBeInTheDocument();
    expect(screen.getByText('A copy has been sent to Andrew@Example.org.')).toBeInTheDocument();

    const payload = mocks.submit.mock.calls[0][0];
    expect(payload).toMatchObject({
      form_token: 'token-1',
      leave_this_blank: '',
      organiser_name: 'Andrew Mukuni',
      event_title: 'Annual Scientific Conference',
      proposed_start_date: '2027-03-04',
      timezone: 'Africa/Lusaka',
      requested_role: 'keynote_speaker',
    });
  });

  it('says the enquiry was saved when the acknowledgement email could not be sent', async () => {
    mocks.submit.mockResolvedValue({ acknowledgementSent: false });
    await renderForm();
    fillAll();
    send();
    expect(await screen.findByText(/couldn’t send a confirmation email just now, but your enquiry has been saved/))
      .toBeInTheDocument();
  });

  it('opens the step with the server’s field errors, and keeps its token for the next try', async () => {
    const error = Object.assign(new Error('Please fix the highlighted fields.'), {
      fieldErrors: { email: 'Enter a valid email address.' },
    });
    mocks.submit.mockRejectedValueOnce(error);
    await renderForm();
    fillAll();
    send();

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(stepHeading(/About you/)).toBeInTheDocument();
    const email = screen.getByLabelText(/Email address/);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveFocus();

    // Sending again straight away is fine: the token is still valid and old enough.
    fireEvent.click(screen.getByRole('button', { name: /Back to review/ }));
    send();
    await screen.findByRole('heading', { name: /your enquiry has been received/ });
    expect(mocks.fetchToken).toHaveBeenCalledTimes(1);
    expect(mocks.submit.mock.calls.map(([payload]) => payload.form_token)).toEqual(['token-1', 'token-1']);
  });

  it('replaces a token the server turned away, quietly, keeping everything typed', async () => {
    mocks.fetchToken.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
    mocks.submit.mockRejectedValueOnce(Object.assign(
      new Error('This form has expired. Please press Send again.'),
      { fieldErrors: null, tokenRejected: true },
    ));
    await renderForm();
    fillAll();
    send();

    expect(await screen.findByRole('alert')).toHaveTextContent('Please press Send again.');
    expect(screen.getByText('Andrew Mukuni')).toBeInTheDocument();
    expect(screen.getByText('Quality systems')).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchToken).toHaveBeenCalledTimes(2));
    await settle();
    ageToken();

    send();
    await screen.findByRole('heading', { name: /your enquiry has been received/ });
    expect(mocks.submit.mock.calls.map(([payload]) => payload.form_token)).toEqual(['token-1', 'token-2']);
  });

  it('explains a failure without field errors, keeps the token, and returns focus to Send', async () => {
    mocks.submit.mockRejectedValueOnce(Object.assign(
      new Error('We couldn’t reach the server. Check your connection and try again.'),
      { fieldErrors: null, tokenRejected: false },
    ));
    await renderForm();
    fillAll();
    send();

    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t reach the server.');
    await waitFor(() => expect(screen.getByRole('button', { name: /Send enquiry/ })).toHaveFocus());
    expect(screen.getByText('Andrew Mukuni')).toBeInTheDocument();
    expect(mocks.fetchToken).toHaveBeenCalledTimes(1);
  });

  it('starts again at the first field after “Send another enquiry”, with a fresh token', async () => {
    await renderForm();
    fillAll();
    send();
    fireEvent.click(await screen.findByRole('button', { name: 'Send another enquiry' }));

    await waitFor(() => expect(screen.getByLabelText(/Your name/)).toHaveFocus());
    expect(screen.getByLabelText(/Your name/)).toHaveValue('');
    expect(stepHeading(/Step 1 of 4/)).toBeInTheDocument();
    expect(mocks.fetchToken).toHaveBeenCalledTimes(2);
  });

  it('keeps the spam trap out of reach of people and assistive technology, on every step', async () => {
    await renderForm();
    const checkTrap = () => {
      const trap = document.querySelector('input[name="leave_this_blank"]');
      expect(trap).toHaveAttribute('tabindex', '-1');
      expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    };
    checkTrap();
    fillAll();
    checkTrap();
  });
});

describe('SpeakingEnquiryForm — spam-protection timing', () => {
  // Every timer is faked here, so the hold before posting can be stepped through.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const sendNow = async () => {
    fillAll();
    send();
    await settle();
  };
  const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  it('holds a quick enquiry until its token is 3.2 seconds old, showing it as sending', async () => {
    render(<SpeakingEnquiryForm successMessage={SUCCESS} />);
    await settle();
    await sendNow();

    expect(screen.getByRole('button', { name: /Sending/ })).toBeDisabled();
    await advance(3_199);
    expect(mocks.submit).not.toHaveBeenCalled();
    await advance(1);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.submit.mock.calls[0][0].form_token).toBe('token-1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks again for a token that could not be fetched when the form loaded', async () => {
    mocks.fetchToken
      .mockRejectedValueOnce(new Error('We couldn’t reach the server. Check your connection and try again.'))
      .mockResolvedValueOnce('token-2');
    render(<SpeakingEnquiryForm successMessage={SUCCESS} />);
    await settle();
    // Nothing alarming before the visitor has even started.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await sendNow();
    expect(mocks.fetchToken).toHaveBeenCalledTimes(2);
    await advance(3_200);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.submit.mock.calls[0][0].form_token).toBe('token-2');
  });

  it('swaps a token that has been open for most of a day before sending', async () => {
    mocks.fetchToken.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
    render(<SpeakingEnquiryForm successMessage={SUCCESS} />);
    await settle();
    await advance(23 * 60 * 60 * 1000 + 1);

    await sendNow();
    expect(mocks.fetchToken).toHaveBeenCalledTimes(2);
    await advance(3_200);
    expect(mocks.submit.mock.calls[0][0].form_token).toBe('token-2');
  });
});

describe('enquirySteps', () => {
  it('finds the step an error belongs to, ignoring errors no step asks for', () => {
    expect(firstStepWithErrors({ topic: 'x', email: 'y' })).toBe(0);
    expect(firstStepWithErrors({ location: 'x' })).toBe(1);
    expect(firstStepWithErrors({ form_token: 'x' })).toBe(-1);
    expect(errorsForStep({ topic: 'x', email: 'y', budget: '' }, 2)).toEqual({ topic: 'x' });
  });

  it('leaves empty optional details out of the review', () => {
    const [you, event, request] = enquiryReview({
      organiser_name: 'A', organisation: 'B', email: 'a@b.org', phone: ' ',
      event_title: 'E', date_undecided: false, proposed_start_date: '2027-03-04', proposed_end_date: '2027-03-06',
      timezone: 'Africa/Lusaka', attendance_format: 'hybrid', location: 'Lusaka',
      audience: 'Managers', audience_size: '', topic: 'T', requested_role: 'not_sure', budget: '', message: 'Line 1\nLine 2',
    });
    expect(you.rows.map((row) => row.label)).toEqual(['Name', 'Organisation', 'Email']);
    expect(event.rows.find((row) => row.label === 'Proposed date').value).toBe('4–6 March 2027');
    expect(request.rows.map((row) => row.label)).toEqual(['Audience', 'Topic', 'Role', 'Anything else']);
    expect(request.rows.find((row) => row.label === 'Audience').value).toBe('Managers');
  });
});
