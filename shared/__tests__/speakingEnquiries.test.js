import { describe, expect, it } from 'vitest';
import {
  buildEnquirySummary,
  enquiryGreeting,
  greetingFirstName,
  normalizeEnquiryInput,
} from '../speakingEnquiries.js';
import { getSystemTemplate, renderTemplate } from '../notificationTemplates.js';

const ENQUIRY = {
  organiser_name: 'Andrew Mukuni',
  organisation: 'Biomedical Society of Zambia',
  email: 'andrew@example.org',
  event_title: 'Annual Scientific Conference',
  proposed_start_date: '2027-03-04',
  attendance_format: 'online',
  audience: 'Laboratory managers',
  topic: 'Quality systems that last',
  requested_role: 'keynote_speaker',
};

describe('normalizeEnquiryInput', () => {
  it('collapses line breaks and runs of spaces in single-line fields, keeping the message as written', () => {
    const { value, errors } = normalizeEnquiryInput({
      ...ENQUIRY,
      organiser_name: '  Andrew \n Mukuni ',
      event_title: 'Conference\r\nStatus:\tpayment overdue',
      topic: 'Quality\n\nsystems',
      message: 'First line.\r\n\r\nSecond line.',
    });
    expect(errors).toEqual({});
    expect(value.organiser_name).toBe('Andrew Mukuni');
    expect(value.event_title).toBe('Conference Status: payment overdue');
    expect(value.topic).toBe('Quality systems');
    expect(value.message).toBe('First line.\n\nSecond line.');
  });

  it('counts the length after collapsing', () => {
    const { errors } = normalizeEnquiryInput({ ...ENQUIRY, event_title: `Summit${' '.repeat(400)}2027` });
    expect(errors.event_title).toBeUndefined();
  });
});

describe('acknowledgement greeting', () => {
  it('greets by a plain first name, skipping titles', () => {
    expect(greetingFirstName('andrew mukuni')).toBe('Andrew');
    expect(greetingFirstName('ANDREW MUKUNI')).toBe('Andrew');
    expect(greetingFirstName('Prof Nkandu Luo')).toBe('Nkandu');
    expect(greetingFirstName('Dr. Rev. Mutinta Hamweene')).toBe('Mutinta');
    expect(greetingFirstName('Hon Mary-Jane Phiri')).toBe('Mary-Jane');
    expect(greetingFirstName('Zoë O’Neil')).toBe('Zoë');
    expect(greetingFirstName('DeShawn Banda')).toBe('DeShawn');
  });

  it('falls back to "Hello," when there is no plain name to use', () => {
    for (const name of ['', 'Dr', 'Mr & Mrs Banda', 'https://evil.example/login', 'Win$$$ now', 'x'.repeat(41)]) {
      expect(greetingFirstName(name), name).toBe('');
      expect(enquiryGreeting(name), name).toBe('Hello,');
    }
    expect(enquiryGreeting('Prof Nkandu Luo')).toBe('Hello Nkandu,');
  });
});

describe('speaking_enquiry_ack template', () => {
  const template = getSystemTemplate('speaking_enquiry_ack', 'email');
  const placeholders = [...`${template.subject} ${template.body}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);

  it('says the enquiry was received, that availability is confirmed separately, and promises nothing', () => {
    const text = renderTemplate(template.body, { greeting: 'Hello Andrew,' });
    expect(renderTemplate(template.subject, {})).toBe('We received your speaking enquiry');
    expect(text).toBe(
      'Hello Andrew,\n\nThank you for inviting Mutale Mubanga to speak. Your enquiry has been received.\n\n'
      + 'Availability will be confirmed separately. This email is an acknowledgement only and does not confirm participation.',
    );
  });

  it('uses no placeholder that could carry what the visitor typed', () => {
    expect(placeholders).toEqual(['greeting']);
  });

  it('leaves the full enquiry to the admin alert', () => {
    const admin = getSystemTemplate('speaking_enquiry_admin', 'email');
    expect(admin.body).toContain('{{enquiry_summary}}');
    expect(buildEnquirySummary(ENQUIRY)).toContain('Proposed topic: Quality systems that last');
  });
});
