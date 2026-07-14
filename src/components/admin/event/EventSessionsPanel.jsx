import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { getApiBase } from '../../../utils/apiBase';
import { getAdminAuthHeaders } from '../../../utils/authHeaders';

const API_BASE = getApiBase();

const emptySession = () => ({
  title: '',
  session_date: '',
  start_time: '',
  end_time: '',
  meeting_url: '',
});

export default function EventSessionsPanel({ eventId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptySession());
  const [error, setError] = useState('');

  const loadSessions = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/sessions`, {
        headers: getAdminAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to load sessions.');
      setSessions(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load sessions.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!draft.session_date) {
      setError('Session date is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/sessions`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to add session.');
      setDraft(emptySession());
      await loadSessions();
    } catch (err) {
      setError(err?.message || 'Failed to add session.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sessionId) => {
    if (!window.confirm('Delete this session?')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to delete session.');
      await loadSessions();
    } catch (err) {
      setError(err?.message || 'Failed to delete session.');
    }
  };

  if (!eventId) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy-900">Master class sessions</h3>
        <p className="text-xs text-navy-500 mt-1">
          One registration covers all sessions (series pass). Attendance is tracked per session.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-cyan-600" size={22} /></div>
      ) : (
        <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100 overflow-hidden">
          {sessions.length === 0 ? (
            <li className="px-4 py-6 text-sm text-navy-500 text-center">No sessions yet.</li>
          ) : sessions.map((session) => (
            <li key={session.id} className="px-4 py-3 flex items-start justify-between gap-3 bg-white">
              <div>
                <p className="text-sm font-medium text-navy-900">{session.title || `Session ${session.session_date}`}</p>
                <p className="text-xs text-navy-500">
                  {session.session_date}
                  {session.start_time ? ` · ${String(session.start_time).slice(0, 5)}` : ''}
                  {session.end_time ? ` – ${String(session.end_time).slice(0, 5)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(session.id)}
                className="p-2 text-navy-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                aria-label="Delete session"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="rounded-xl border border-navy-100 p-4 space-y-3 bg-navy-50/40">
        <p className="text-xs font-semibold text-navy-700">Add session</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Session title (optional)"
            className="px-3 py-2 rounded-lg border border-navy-200 text-sm"
          />
          <input
            type="date"
            value={draft.session_date}
            onChange={(e) => setDraft((d) => ({ ...d, session_date: e.target.value }))}
            required
            className="px-3 py-2 rounded-lg border border-navy-200 text-sm"
          />
          <input
            type="time"
            value={draft.start_time}
            onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-navy-200 text-sm"
          />
          <input
            type="time"
            value={draft.end_time}
            onChange={(e) => setDraft((d) => ({ ...d, end_time: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-navy-200 text-sm"
          />
        </div>
        <input
          type="url"
          value={draft.meeting_url}
          onChange={(e) => setDraft((d) => ({ ...d, meeting_url: e.target.value }))}
          placeholder="Optional per-session meeting URL"
          className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add session
        </button>
      </form>
    </div>
  );
}
