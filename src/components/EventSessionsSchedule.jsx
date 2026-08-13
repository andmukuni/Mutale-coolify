import { useEffect, useState } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import { formatDate, formatTime } from '../utils/helpers';
import {
  getSessionStatus,
  groupSessionsByDate,
  sessionDateKey,
  useTickingNow,
} from '../utils/eventSessions';
import SessionStatusBadge from './SessionStatusBadge';

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

export default function EventSessionsSchedule({ eventId, event = {}, timeZone }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(Boolean(eventId));
  const now = useTickingNow();
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
                const status = getSessionStatus(session, now, { event, timeZone: zone });
                return (
                  <li key={session.id} className="relative">
                    <span className="absolute -left-[27px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-cyan-500 shadow-sm" />
                    <div className="rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-navy-900">
                          {session.title || 'Session'}
                        </p>
                        <SessionStatusBadge status={status} />
                      </div>
                      {timeLabel ? (
                        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-navy-500">
                          <Clock size={12} className="text-cyan-600" />
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
