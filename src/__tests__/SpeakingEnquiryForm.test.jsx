import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ fetchToken: vi.fn(), submit: vi.fn() }));

vi.mock('../utils/speakingApi', () => ({
  fetchEnquiryToken: mocks.fetchToken,
  submitSpeakingEnquiry: mocks.submit,
}));

import SpeakingEnquiryForm from '../components/speaking/SpeakingEnquiryForm';

const SUCCESS = 'Availability will be confirmed separately — this is not yet a booking.';

const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillRequired() {
  change(/Your name/, 'Andrew Mukuni');
  change(/Organisation/, 'Biomedical Society of Zambia');
  change(/Email address/, 'Andrew@Example.org');
  change(/Event title/, 'Annual Scientific Conference');
  change(/^Proposed date/, '2027-03-04');
  change(/^Format/, 'online');
  change(/Intended audience/, 'Laboratory managers');
  change(/Proposed topic/, 'Quality systems');
  change(/Role you have in mind/, 'keynote_speaker');
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
  return screen.getByRole('button', { name: /Send enquiry/ });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Invalid fields are scrolled into view; jsdom has no layout to scroll.
  Element.prototype.scrollIntoView = vi.fn();
  mocks.fetchToken.mockReset();
  mocks.submit.mockReset();
  mocks.fetchToken.mockResolvedValue('token-1');
  mocks.submit.mockResolvedValue({ acknowledgementSent: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SpeakingEnquiryForm — validation', () => {
  it('highlights every missing required field and sends nothing', async () => {
    const submit = await renderForm();
    fireEvent.click(submit);

    expect(await screen.findByText('Please check the highlighted fields.')).toBeInTheDocument();
    for (const label of [/Your name/, /Organisation/, /Email address/, /Event title/, /^Proposed date/, /^Format/,
      /Intended audience/, /Proposed topic/, /Role you have in mind/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }
    for (const label of [/Phone/, /Audience size/, /Budget/, /Anything else/]) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('accepts an enquiry without a date when the date is not decided', async () => {
    const submit = await renderForm();
    fillRequired();
    change(/^Proposed date/, '');
    fireEvent.click(screen.getByLabelText('Date not decided yet'));
    expect(screen.getByLabelText(/^Proposed date/)).toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({ date_undecided: true });
  });

  it('asks for a location when the event is in person', async () => {
    const submit = await renderForm();
    fillRequired();
    change(/^Format/, 'in_person');
    fireEvent.click(submit);
    expect(await screen.findByText('Add the city or venue.')).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date', async () => {
    const submit = await renderForm();
    fillRequired();
    change(/End date/, '2027-03-01');
    fireEvent.click(submit);
    expect(await screen.findByText('End date must be on or after the start date.')).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});

describe('SpeakingEnquiryForm — sending', () => {
  it('sends the form with its token and an empty spam trap, then confirms without promising availability', async () => {
    const submit = await renderForm();
    fillRequired();
    fireEvent.click(submit);

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
    const submit = await renderForm();
    fillRequired();
    fireEvent.click(submit);
    expect(await screen.findByText(/couldn’t send a confirmation email just now, but your enquiry has been saved/))
      .toBeInTheDocument();
  });

  it('shows the server’s field errors and keeps its token for the next try', async () => {
    const error = Object.assign(new Error('Please fix the highlighted fields.'), {
      fieldErrors: { email: 'Enter a valid email address.' },
    });
    mocks.submit.mockRejectedValueOnce(error);
    const submit = await renderForm();
    fillRequired();
    fireEvent.click(submit);

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address/)).toHaveAttribute('aria-invalid', 'true');

    // Sending again straight away is fine: the token is still valid and old enough.
    fireEvent.click(submit);
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
    const submit = await renderForm();
    fillRequired();
    fireEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('Please press Send again.');
    expect(screen.getByLabelText(/Your name/)).toHaveValue('Andrew Mukuni');
    expect(screen.getByLabelText(/Proposed topic/)).toHaveValue('Quality systems');
    await waitFor(() => expect(mocks.fetchToken).toHaveBeenCalledTimes(2));
    await settle();
    ageToken();

    fireEvent.click(submit);
    await screen.findByRole('heading', { name: /your enquiry has been received/ });
    expect(mocks.submit.mock.calls.map(([payload]) => payload.form_token)).toEqual(['token-1', 'token-2']);
  });

  it('explains a failure without field errors, keeps the token, and returns focus to Send', async () => {
    mocks.submit.mockRejectedValueOnce(Object.assign(
      new Error('We couldn’t reach the server. Check your connection and try again.'),
      { fieldErrors: null, tokenRejected: false },
    ));
    const submit = await renderForm();
    fillRequired();
    fireEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t reach the server.');
    await waitFor(() => expect(submit).toHaveFocus());
    expect(screen.getByLabelText(/Your name/)).toHaveValue('Andrew Mukuni');
    expect(mocks.fetchToken).toHaveBeenCalledTimes(1);
  });

  it('puts focus on the first field after “Send another enquiry”, with a fresh token', async () => {
    const submit = await renderForm();
    fillRequired();
    fireEvent.click(submit);
    fireEvent.click(await screen.findByRole('button', { name: 'Send another enquiry' }));

    await waitFor(() => expect(screen.getByLabelText(/Your name/)).toHaveFocus());
    expect(screen.getByLabelText(/Your name/)).toHaveValue('');
    expect(mocks.fetchToken).toHaveBeenCalledTimes(2);
  });

  it('keeps the spam trap out of reach of people and assistive technology', async () => {
    await renderForm();
    const trap = document.querySelector('input[name="leave_this_blank"]');
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('SpeakingEnquiryForm — spam-protection timing', () => {
  // Every timer is faked here, so the hold before posting can be stepped through.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const sendNow = async () => {
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Send enquiry/ }));
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
    expect(screen.getByRole('button', { name: /Send enquiry/ })).toBeEnabled();

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
