import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import { getSessionAuthHeaders } from '../utils/authHeaders';
import { useUserAuth } from '../context/UserAuthContext';
import { getSessionStatus, useTickingNow } from '../utils/eventSessions';
import SessionStatusBadge from './SessionStatusBadge';

const API_BASE = getApiBase();

const CARD_TONE = {
  passed: 'border-[#E76869]/25 bg-[#E76869]/10',
  in_progress: 'border-[#00A79D]/30 bg-[#00A79D]/10',
  upcoming: 'border-navy-50 bg-white',
};

export default function TicketSessionsPanel({
  eventId,
  event = {},
  registrationId,
  referenceCode,
  valid,
  sessions: sessionsProp,
}) {
  const { isUserAuthenticated } = useUserAuth();
  const [sessions, setSessions] = useState(sessionsProp || []);
  const [loading, setLoading] = useState(!sessionsProp?.length);
  const [joiningId, setJoiningId] = useState('');
  const [error, setError] = useState('');
  const now = useTickingNow();

  useEffect(() => {
    if (sessionsProp?.length) {
      setSessions(sessionsProp);
      setLoading(false);
      return;
    }
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}/sessions`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        setSessions(Array.isArray(json?.data) ? json.data : []);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, sessionsProp]);

  const canJoinSession = valid && (referenceCode || (isUserAuthenticated && registrationId));

  const handleJoin = async (sessionId) => {
    if (!canJoinSession) return;
    setJoiningId(sessionId);
    setError('');
    try {
      const url = referenceCode
        ? `${API_BASE}/tickets/${encodeURIComponent(referenceCode)}/sessions/${encodeURIComponent(sessionId)}/join`
        : `${API_BASE}/registrations/${encodeURIComponent(registrationId)}/sessions/${encodeURIComponent(sessionId)}/join`;

      const res = await fetch(url, {
        method: 'POST',
        headers: referenceCode
          ? { 'Content-Type': 'application/json' }
          : getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ join_source: 'ticket_page' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Could not join session.');
      const meetingUrl = String(json?.data?.meeting_url || '').trim();
      if (meetingUrl) window.open(meetingUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err?.message || 'Could not join session.');
    } finally {
      setJoiningId('');
    }
  };

  if (loading || sessions.length === 0) return null;

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4 space-y-3 max-w-md mx-auto">
      <h3 className="text-sm font-semibold text-navy-900">Series sessions</h3>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ul className="space-y-2">
        {sessions.map((session) => {
          const status = getSessionStatus(session, now, { event });
          const passed = status === 'passed';
          return (
          <li
            key={session.id}
            className={`flex items-center justify-between gap-3 text-sm border rounded-lg px-3 py-2 ${CARD_TONE[status] || CARD_TONE.upcoming}`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`font-medium ${passed ? 'text-navy-500' : 'text-navy-800'}`}>
                  {session.title || session.session_date}
                </p>
                <SessionStatusBadge status={status} />
              </div>
              <p className={`text-xs ${passed ? 'text-navy-400' : 'text-navy-500'}`}>
                {session.session_date}
                {session.start_time ? ` · ${String(session.start_time).slice(0, 5)}` : ''}
                {session.end_time ? ` – ${String(session.end_time).slice(0, 5)}` : ''}
                {` · ${event.timezone || 'Africa/Lusaka'}`}
              </p>
            </div>
            {canJoinSession ? (
              <button
                type="button"
                onClick={() => handleJoin(session.id)}
                disabled={joiningId === session.id}
                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600 disabled:opacity-50"
              >
                {joiningId === session.id ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                Join
              </button>
            ) : (
              <span className="text-xs text-navy-400">Ticket not valid</span>
            )}
          </li>
          );
        })}
      </ul>
    </div>
  );
}
