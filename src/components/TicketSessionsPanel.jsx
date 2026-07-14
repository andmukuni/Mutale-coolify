import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import { getSessionAuthHeaders } from '../utils/authHeaders';
import { useUserAuth } from '../context/UserAuthContext';

const API_BASE = getApiBase();

export default function TicketSessionsPanel({ eventId, registrationId, valid }) {
  const { isUserAuthenticated } = useUserAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
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
  }, [eventId]);

  const handleJoin = async (sessionId) => {
    if (!registrationId || !valid) return;
    setJoiningId(sessionId);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE}/registrations/${encodeURIComponent(registrationId)}/sessions/${encodeURIComponent(sessionId)}/join`,
        {
          method: 'POST',
          headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ join_source: 'ticket_page' }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Could not join session.');
      const url = String(json?.data?.meeting_url || '').trim();
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
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
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center justify-between gap-3 text-sm border border-navy-50 rounded-lg px-3 py-2">
            <div>
              <p className="font-medium text-navy-800">{session.title || session.session_date}</p>
              <p className="text-xs text-navy-500">{session.session_date}</p>
            </div>
            {isUserAuthenticated && valid ? (
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
              <span className="text-xs text-navy-400">Sign in as purchaser to join</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
