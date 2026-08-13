import { useEffect, useState } from 'react';

export const SESSION_STATUS = {
  upcoming: 'upcoming',
  in_progress: 'in_progress',
  passed: 'passed',
};

export const SESSION_STATUS_META = {
  upcoming: { key: 'upcoming', label: 'Upcoming', color: '#141D45' },
  in_progress: { key: 'in_progress', label: 'In Progress', color: '#00A79D' },
  passed: { key: 'passed', label: 'Passed', color: '#E76869' },
};

export function sessionDateKey(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

export function sessionTimeKey(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

export function nowInZoneStamp(now = new Date(), timeZone = 'Africa/Lusaka') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'Africa/Lusaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function eventPeriodStamps(event = {}, timeZone = 'Africa/Lusaka') {
  const startDate = sessionDateKey(event.start_date || event.date);
  const endDate = sessionDateKey(event.end_date) || startDate;
  return {
    start: startDate ? `${startDate}T${sessionTimeKey(event.start_time) || '00:00'}` : '',
    end: endDate ? `${endDate}T${sessionTimeKey(event.end_time) || '23:59'}` : '',
    timeZone: event.timezone || timeZone || 'Africa/Lusaka',
  };
}

export function getSessionStatus(session = {}, now = new Date(), options = {}) {
  const event = options.event || {};
  const timeZone = options.timeZone || event.timezone || 'Africa/Lusaka';
  const nowStamp = nowInZoneStamp(now, timeZone);
  const period = eventPeriodStamps(event, timeZone);

  if (period.end && nowStamp > period.end) return 'passed';

  const dateKey = sessionDateKey(session.session_date);
  if (!dateKey || dateKey === 'undated') {
    if (period.start && nowStamp < period.start) return 'upcoming';
    return 'upcoming';
  }

  const start = sessionTimeKey(session.start_time) || '00:00';
  const eventEnd = sessionTimeKey(event.end_time);
  const sessionEnd = sessionTimeKey(session.end_time);
  const end = sessionEnd || (eventEnd && eventEnd > start ? eventEnd : '') || '23:59';
  const startStamp = `${dateKey}T${start}`;
  const endStamp = `${dateKey}T${end}`;

  if (nowStamp > endStamp) return SESSION_STATUS.passed;
  if (nowStamp < startStamp) return SESSION_STATUS.upcoming;
  return SESSION_STATUS.in_progress;
}

export function isSessionPassed(session = {}, now = new Date(), timeZoneOrOptions = 'Africa/Lusaka') {
  const options = typeof timeZoneOrOptions === 'string'
    ? { timeZone: timeZoneOrOptions }
    : (timeZoneOrOptions || {});
  return getSessionStatus(session, now, options) === 'passed';
}

export function countSessionStatuses(sessions = [], now = new Date(), options = {}) {
  const counts = { passed: 0, upcoming: 0, in_progress: 0, total: 0 };
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const status = getSessionStatus(session, now, options);
    counts.total += 1;
    if (counts[status] != null) counts[status] += 1;
  }
  return counts;
}

export function useTickingNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

export function groupSessionsByDate(sessions = []) {
  const groups = [];
  const index = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const key = sessionDateKey(session.session_date) || 'undated';
    if (!index.has(key)) {
      const group = { date: key, sessions: [] };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).sessions.push(session);
  }
  return groups;
}
