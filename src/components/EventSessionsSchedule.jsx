import { useEffect, useState } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import { formatDate, formatTime } from '../utils/helpers';
import {
  getSessionStatus,
  groupSessionsByDate,
  sessionDateKey,
} from '../utils/eventSessions';

const API_BASE = getApiBase();

export { sessionDateKey, groupSessionsByDate, isSessionPassed } from '../utils/eventSessions';

function formatSessionDate(value) {
  const key = sessionDateKey(value);
  if (!key || key === 'undated') return 'Date to be announced';
  return formatDate(`${key}T12:00:00`);
}

function formatSessionTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}:\d{2})/);
  return match ? formatTime(match[1]) : '';
}

const STATUS_STYLES = {
  passed: {
    dot: 'bg-navy-400',
    card: 'border-navy-200 bg-navy-100/90',
    title: 'text-navy-500',
    time: 'text-navy-400',
    clock: 'text-navy-400',
    badge: 'bg-navy-200 text-navy-600',
    label: 'Passed',
  },
  live: {
    dot: 'bg-emerald-500',
    card: 'border-emerald-200 bg-emerald-50/80',
    title: 'text-navy-900',
    time: 'text-navy-500',
    clock: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Live',
  },
  upcoming: {
    dot: 'bg-cyan-500',
    card: 'border-navy-100 bg-navy-50/60',
    title: 'text-navy-900',
    time: 'text-navy-500',
    clock: 'text-cyan-600',
    badge: '',
    label: '',
  },
};

export default function EventSessionsSchedule({ eventId, event = {}, timeZone }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(Boolean(eventId));
  const zone = timeZone || event.timezone || 'Africa/Lusaka';

  useEffect(() => {
    if (!eventId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}/sessions`, {
          cache: 'no-store',
        });
        const json = await response.json().catch(() => ({}));
        if (cancelled) return;
        setSessions(Array.isArray(json?.data) ? json.data : []);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  if (!eventId || loading || sessions.length === 0) return null;

  const days = groupSessionsByDate(sessions);

  return (
    <div className="bg-white rounded-2xl border border-navy-100 p-6 sm:p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-navy-900 flex items-center gap-2">
          <CalendarDays size={20} className="text-cyan-600" />
          Sessions
        </h2>
        <p className="mt-1 text-sm text-navy-500">
          One registration covers every session in this series.
        </p>
      </div>

      <ol className="space-y-6">
        {days.map((day, dayIndex) => (
          <li key={day.date}>
            <div className="mb-3 flex items-center gap-3">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-cyan-600 px-2 text-xs font-bold text-white">
                {dayIndex + 1}
              </span>
              <h3 className="text-sm font-semibold text-navy-900">
                {formatSessionDate(day.date)}
              </h3>
            </div>

            <ol className="relative ml-3.5 space-y-3 border-l border-cyan-100 pl-5">
              {day.sessions.map((session) => {
                const start = formatSessionTime(session.start_time);
                const end = formatSessionTime(session.end_time);
                const timeLabel = [start, end].filter(Boolean).join(' – ');
                const status = getSessionStatus(session, new Date(), { event, timeZone: zone });
                const style = STATUS_STYLES[status] || STATUS_STYLES.upcoming;
                return (
                  <li key={session.id} className="relative">
                    <span className={`absolute -left-[27px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-white shadow-sm ${style.dot}`} />
                    <div className={`rounded-xl border px-4 py-3 ${style.card}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className={`font-semibold ${style.title}`}>
                          {session.title || 'Session'}
                        </p>
                        {style.label ? (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.badge}`}>
                            {style.label}
                          </span>
                        ) : null}
                      </div>
                      {timeLabel ? (
                        <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium ${style.time}`}>
                          <Clock size={12} className={style.clock} />
                          {timeLabel}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
