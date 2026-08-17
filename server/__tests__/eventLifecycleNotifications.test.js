import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLifecycleMessages,
  LIFECYCLE_KINDS,
  processEventLifecycleNotifications,
  remindersEnabled,
  shouldNotifyKind,
} from '../eventLifecycleNotifications.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const now = new Date('2026-08-13T16:00:00.000Z');

const liveEvent = {
  id: 'evt-1',
  title: 'QA Masterclass',
  slug: 'qa-masterclass',
  status: 'published',
  start_date: '2026-08-13',
  end_date: '2026-08-13',
  start_time: '15:00:00',
  end_time: '18:00:00',
  timezone: 'Africa/Lusaka',
};

const endedEvent = {
  ...liveEvent,
  id: 'evt-2',
  start_date: '2026-08-13',
  end_date: '2026-08-13',
  start_time: '09:00:00',
  end_time: '10:00:00',
};

const registration = {
  id: 'reg-1',
  event_id: 'evt-1',
  status: 'confirmed',
  payment_status: 'paid',
  user_name: 'Grace Tembo',
  user_email: 'grace@example.com',
  user_phone: '0971234567',
  reference_code: 'MM-ABC123',
};

function fakePool({ events = [], registrations = [], sent = [] } = {}) {
  return {
    query: vi.fn(async (sql, params = []) => {
      if (sql.includes('FROM events')) return [events];
      if (sql.includes('FROM event_registrations')) {
        return [registrations.filter((row) => row.event_id === params[0])];
      }
      if (sql.includes('FROM event_lifecycle_notifications')) {
        const match = sent.find((row) => row.registration_id === params[0] && row.kind === params[1]);
        return [match ? [match] : []];
      }
      return [{ affectedRows: 1 }];
    }),
  };
}

describe('event lifecycle notifications', () => {
  it('follows the email reminder setting', () => {
    expect(remindersEnabled({ notifications: { emailOnEventReminder: true } })).toBe(true);
    expect(remindersEnabled({ notifications: { emailOnEventReminder: false } })).toBe(false);
  });

  it('notifies started and ended from the event period, not historical events', () => {
    expect(shouldNotifyKind(liveEvent, 'started', now)).toBe(true);
    expect(shouldNotifyKind(liveEvent, 'ended', now)).toBe(false);
    expect(shouldNotifyKind(endedEvent, 'ended', now)).toBe(true);
    expect(shouldNotifyKind({
      ...endedEvent,
      start_date: '2026-01-01',
      end_date: '2026-01-01',
    }, 'ended', now)).toBe(false);
    expect(shouldNotifyKind({ ...liveEvent, status: 'cancelled' }, 'started', now)).toBe(false);
  });

  it('notifies starting soon only in the 15 minutes before start', () => {
    const fifteenBefore = new Date('2026-08-13T12:45:00.000Z');
    const sixteenBefore = new Date('2026-08-13T12:44:00.000Z');
    const atStart = new Date('2026-08-13T13:00:00.000Z');

    expect(shouldNotifyKind(liveEvent, LIFECYCLE_KINDS.startingSoon, fifteenBefore)).toBe(true);
    expect(shouldNotifyKind(liveEvent, LIFECYCLE_KINDS.started, fifteenBefore)).toBe(false);
    expect(shouldNotifyKind(liveEvent, LIFECYCLE_KINDS.startingSoon, sixteenBefore)).toBe(false);
    expect(shouldNotifyKind(liveEvent, LIFECYCLE_KINDS.startingSoon, atStart)).toBe(false);
    expect(shouldNotifyKind(liveEvent, LIFECYCLE_KINDS.started, atStart)).toBe(true);
    expect(shouldNotifyKind({ ...liveEvent, status: 'draft' }, LIFECYCLE_KINDS.startingSoon, fifteenBefore)).toBe(false);
  });

  it('fires the started notice at 19:30 Africa/Lusaka, not two hours later at 19:30 UTC', () => {
    const eveningEvent = {
      ...liveEvent,
      start_time: '19:30:00',
      end_time: '21:00:00',
      timezone: 'Africa/Lusaka',
    };
    const atLusakaStart = new Date('2026-08-13T17:30:00.000Z');
    const oneMinuteEarly = new Date('2026-08-13T17:29:00.000Z');
    const twoHoursLateUtc = new Date('2026-08-13T19:30:00.000Z');

    expect(shouldNotifyKind(eveningEvent, 'started', atLusakaStart)).toBe(true);
    expect(shouldNotifyKind(eveningEvent, 'started', oneMinuteEarly)).toBe(false);
    expect(shouldNotifyKind(eveningEvent, LIFECYCLE_KINDS.startingSoon, new Date('2026-08-13T17:15:00.000Z'))).toBe(true);
    expect(shouldNotifyKind(eveningEvent, LIFECYCLE_KINDS.startingSoon, oneMinuteEarly)).toBe(true);
    expect(shouldNotifyKind(eveningEvent, 'started', twoHoursLateUtc)).toBe(false);
    expect(shouldNotifyKind(eveningEvent, 'ended', twoHoursLateUtc)).toBe(true);
  });

  it('builds client email and SMS copy with ticket and event links', () => {
    const started = buildLifecycleMessages({
      event: liveEvent,
      registration,
      kind: 'started',
      appOrigin: 'https://mutalemubanga.org',
    });
    expect(started.to).toBe('grace@example.com');
    expect(started.smsTo).toBe('0971234567');
    expect(started.subject).toMatch(/has started/i);
    expect(started.smsMessage).toContain('has started');
    expect(started.smsMessage).toContain('/tickets/MM-ABC123');
    expect(started.text).toContain('/events/qa-masterclass');

    const ended = buildLifecycleMessages({
      event: endedEvent,
      registration: { ...registration, event_id: 'evt-2' },
      kind: 'ended',
      appOrigin: 'https://mutalemubanga.org',
    });
    expect(ended.subject).toMatch(/thank you/i);
    expect(ended.smsMessage).toContain('has ended');
  });

  it('builds the 15-minute reminder SMS with the production event link', () => {
    const reminder = buildLifecycleMessages({
      event: liveEvent,
      registration,
      kind: LIFECYCLE_KINDS.startingSoon,
      appOrigin: 'https://mutalemubanga.org',
    });
    expect(reminder.subject).toMatch(/starts in 15 minutes/i);
    expect(reminder.smsMessage).toContain('starts in 15 minutes');
    expect(reminder.smsMessage).toContain('https://mutalemubanga.org/tickets/MM-ABC123');
    expect(reminder.smsTo).toBe('0971234567');
  });

  it('uses APP_URL for SMS event links when appOrigin is omitted', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://mutalemubanga.org');
    vi.stubEnv('APP_ORIGIN', '');
    vi.stubEnv('VITE_APP_ORIGIN', '');
    vi.stubEnv('CORS_ORIGINS', 'https://mutalemubanga.org');

    const started = buildLifecycleMessages({
      event: liveEvent,
      registration,
      kind: 'started',
    });

    expect(started.smsMessage).toContain('https://mutalemubanga.org/tickets/MM-ABC123');
    expect(started.smsMessage).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(started.eventUrl).toBe('https://mutalemubanga.org/events/qa-masterclass');
    expect(started.text).toContain('https://mutalemubanga.org/events/qa-masterclass');
  });

  it('sends email plus companion SMS when an event has started', async () => {
    const sendEmailNotification = vi.fn().mockResolvedValue({
      status: 'sent',
      sms: [{ status: 'sent', recipient: '260971234567' }],
    });
    const pool = fakePool({ events: [liveEvent], registrations: [registration] });

    const summary = await processEventLifecycleNotifications(pool, {
      getSystemSettings: async () => ({ notifications: { emailOnEventReminder: true } }),
      sendEmailNotification,
      appOrigin: 'https://mutalemubanga.org',
    }, now);

    expect(summary).toMatchObject({ started: 1, ended: 0, emailed: 1, sms: 1, errors: 0 });
    expect(sendEmailNotification).toHaveBeenCalledWith(expect.objectContaining({
      to: 'grace@example.com',
      smsTo: '0971234567',
      kind: 'event_reminder',
      subject: 'QA Masterclass has started',
    }));
  });

  it('posts start notices for complimentary (free) registrations too', async () => {
    const sendEmailNotification = vi.fn().mockResolvedValue({
      status: 'sent',
      sms: [{ status: 'sent', recipient: '260971234567' }],
    });
    const pool = fakePool({
      events: [liveEvent],
      registrations: [{ ...registration, payment_status: 'not_required' }],
    });

    const summary = await processEventLifecycleNotifications(pool, {
      getSystemSettings: async () => ({ notifications: { emailOnEventReminder: true } }),
      sendEmailNotification,
      appOrigin: 'https://mutalemubanga.org',
    }, now);

    expect(summary).toMatchObject({ started: 1, emailed: 1, sms: 1, errors: 0 });
    expect(sendEmailNotification).toHaveBeenCalledWith(expect.objectContaining({
      to: 'grace@example.com',
      smsTo: '0971234567',
      kind: 'event_reminder',
    }));
  });

  it('sends the ended notice after the event period', async () => {
    const sendEmailNotification = vi.fn().mockResolvedValue({ status: 'sent', sms: [{ status: 'sent' }] });
    const pool = fakePool({
      events: [endedEvent],
      registrations: [{ ...registration, event_id: 'evt-2' }],
    });

    const summary = await processEventLifecycleNotifications(pool, {
      getSystemSettings: async () => ({ notifications: { emailOnEventReminder: true } }),
      sendEmailNotification,
      appOrigin: 'https://mutalemubanga.org',
    }, now);

    expect(summary.ended).toBe(1);
    expect(sendEmailNotification.mock.calls[0][0].subject).toMatch(/thank you/i);
  });

  it('does not resend a notice that already went out', async () => {
    const sendEmailNotification = vi.fn();
    const pool = fakePool({
      events: [liveEvent],
      registrations: [registration],
      sent: [{ registration_id: 'reg-1', kind: 'started' }],
    });

    const summary = await processEventLifecycleNotifications(pool, {
      getSystemSettings: async () => ({ notifications: { emailOnEventReminder: true } }),
      sendEmailNotification,
    }, now);

    expect(summary.skipped).toBe(1);
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  it('skips the job when reminders are disabled', async () => {
    const sendEmailNotification = vi.fn();
    const summary = await processEventLifecycleNotifications(fakePool({ events: [liveEvent] }), {
      getSystemSettings: async () => ({ notifications: { emailOnEventReminder: false } }),
      sendEmailNotification,
    }, now);

    expect(summary.skippedReason).toMatch(/disabled/i);
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  it('sends the 15-minute reminder SMS before the event starts', async () => {
    const sendEmailNotification = vi.fn().mockResolvedValue({
      status: 'sent',
      sms: [{ status: 'sent', recipient: '260971234567' }],
    });
    const pool = fakePool({ events: [liveEvent], registrations: [registration] });
    const fifteenBefore = new Date('2026-08-13T12:45:00.000Z');

    const summary = await processEventLifecycleNotifications(pool, {
      getSystemSettings: async () => ({ notifications: { emailOnEventReminder: true } }),
      sendEmailNotification,
      appOrigin: 'https://mutalemubanga.org',
    }, fifteenBefore);

    expect(summary).toMatchObject({ startingSoon: 1, started: 0, ended: 0, emailed: 1, sms: 1, errors: 0 });
    expect(sendEmailNotification).toHaveBeenCalledWith(expect.objectContaining({
      to: 'grace@example.com',
      smsTo: '0971234567',
      kind: 'event_reminder',
      templateSlug: 'event_starting_soon',
      subject: 'QA Masterclass starts in 15 minutes',
      smsMessage: expect.stringContaining('starts in 15 minutes'),
    }));
  });
});
