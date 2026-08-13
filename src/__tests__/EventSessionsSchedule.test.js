import { describe, expect, it } from 'vitest';
import {
  countSessionStatuses,
  getSessionStatus,
  groupSessionsByDate,
  isSessionPassed,
  sessionDateKey,
} from '../utils/eventSessions';

describe('event session schedule helpers', () => {
  it('normalizes date keys without timezone shift', () => {
    expect(sessionDateKey('2026-09-15')).toBe('2026-09-15');
    expect(sessionDateKey('2026-09-15T22:00:00.000Z')).toBe('2026-09-15');
  });

  it('groups sessions by date in order', () => {
    const groups = groupSessionsByDate([
      { id: 'a', title: 'Open', session_date: '2026-09-15', start_time: '09:00' },
      { id: 'b', title: 'Close', session_date: '2026-09-16', start_time: '09:00' },
      { id: 'c', title: 'Lab', session_date: '2026-09-15', start_time: '11:00' },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe('2026-09-15');
    expect(groups[0].sessions.map((item) => item.id)).toEqual(['a', 'c']);
    expect(groups[1].sessions.map((item) => item.id)).toEqual(['b']);
  });

  it('marks a session as passed after its end time in Africa/Lusaka', () => {
    const session = {
      session_date: '2026-08-13',
      start_time: '20:00',
      end_time: '20:05',
    };
    const beforeEnd = new Date('2026-08-13T18:04:00.000Z');
    const afterEnd = new Date('2026-08-13T18:06:00.000Z');
    expect(isSessionPassed(session, beforeEnd, 'Africa/Lusaka')).toBe(false);
    expect(isSessionPassed(session, afterEnd, 'Africa/Lusaka')).toBe(true);
  });

  it('counts passed and upcoming from the event period, not only session clocks', () => {
    const event = {
      start_date: '2026-08-10',
      end_date: '2026-08-12',
      start_time: '09:00',
      end_time: '17:00',
      timezone: 'Africa/Lusaka',
    };
    const sessions = [
      { id: 'past', session_date: '2026-08-11', start_time: '09:00', end_time: '11:00' },
      { id: 'after-event', session_date: '2026-08-13', start_time: '09:00', end_time: '11:00' },
    ];
    const afterEvent = new Date('2026-08-12T16:00:00.000Z');
    const counts = countSessionStatuses(sessions, afterEvent, { event });
    expect(counts).toEqual({ passed: 2, upcoming: 0, in_progress: 0, total: 2 });
    expect(getSessionStatus(sessions[1], afterEvent, { event })).toBe('passed');
  });

  it('keeps future sessions upcoming before the event starts', () => {
    const event = {
      start_date: '2026-09-15',
      end_date: '2026-09-16',
      start_time: '09:00',
      end_time: '17:00',
      timezone: 'Africa/Lusaka',
    };
    const session = { session_date: '2026-09-15', start_time: '09:00', end_time: '11:00' };
    const beforeEvent = new Date('2026-08-13T10:00:00.000Z');
    expect(getSessionStatus(session, beforeEvent, { event })).toBe('upcoming');
  });

  it('marks a session in progress while it is happening in the event timezone', () => {
    const event = {
      start_date: '2026-08-13',
      end_date: '2026-08-13',
      start_time: '08:00',
      end_time: '22:00',
      timezone: 'Africa/Lusaka',
    };
    const session = { session_date: '2026-08-13', start_time: '20:00', end_time: '21:00' };
    const during = new Date('2026-08-13T18:30:00.000Z');
    expect(getSessionStatus(session, during, { event })).toBe('in_progress');
  });
});
