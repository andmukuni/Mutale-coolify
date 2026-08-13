import { describe, expect, it } from 'vitest';
import { groupSessionsByDate, sessionDateKey } from '../components/EventSessionsSchedule';

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
});
