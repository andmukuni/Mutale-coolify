import { describe, expect, it, vi } from 'vitest';
import {
  buildLifecycleMessages,
  processEventLifecycleNotifications,
  remindersEnabled,
  shouldNotifyKind,
} from '../eventLifecycleNotifications.js';

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
});
