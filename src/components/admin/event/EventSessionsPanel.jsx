import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { getApiBase } from '../../../utils/apiBase';
import { getAdminAuthHeaders } from '../../../utils/authHeaders';
import { countSessionStatuses, getSessionStatus, useTickingNow } from '../../../utils/eventSessions';
import SessionStatusBadge from '../../SessionStatusBadge';

const API_BASE = getApiBase();

const emptySession = () => ({
  title: '',
  session_date: '',
  start_time: '',
  end_time: '',
  meeting_url: '',
});

function toDateInput(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return '';
}

function toTimeInput(value) {
  const match = String(value || '').trim().match(/^(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function sessionToDraft(session) {
  return {
    title: session.title || '',
    session_date: toDateInput(session.session_date),
    start_time: toTimeInput(session.start_time),
    end_time: toTimeInput(session.end_time),
    meeting_url: session.meeting_url || '',
  };
}

function formatCountLine(counts) {
  const parts = [];
  if (counts.passed) parts.push(`${counts.passed} passed`);
  if (counts.in_progress) parts.push(`${counts.in_progress} in progress`);
  if (counts.upcoming) parts.push(`${counts.upcoming} upcoming`);
  if (parts.length === 0) return counts.total ? `${counts.total} sessions` : '';
  return parts.join(' · ');
}

export default function EventSessionsPanel({ eventId, event = {} }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptySession());
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const now = useTickingNow();

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

  const resetForm = () => {
    setEditingId(null);
    setDraft(emptySession());
  };

  const handleEdit = (session) => {
    setError('');
    setEditingId(session.id);
    setDraft(sessionToDraft(session));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!draft.session_date) {
      setError('Session date is required.');
      return;
    }
    setSaving(true);
    setError('');
    const isEditing = Boolean(editingId);
    try {
      const url = isEditing
        ? `${API_BASE}/admin/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(editingId)}`
        : `${API_BASE}/admin/events/${encodeURIComponent(eventId)}/sessions`;
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || (isEditing ? 'Failed to update session.' : 'Failed to add session.'));
      }
      resetForm();
      await loadSessions();
    } catch (err) {
      setError(err?.message || (isEditing ? 'Failed to update session.' : 'Failed to add session.'));
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
      if (editingId === sessionId) resetForm();
      await loadSessions();
    } catch (err) {
      setError(err?.message || 'Failed to delete session.');
    }
  };

  const statusOptions = useMemo(() => ({ event }), [event]);
  const counts = useMemo(
    () => countSessionStatuses(sessions, now, statusOptions),
    [sessions, statusOptions, now],
  );
  const countLine = formatCountLine(counts);

  if (!eventId) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy-900">Master class sessions</h3>
        <p className="text-xs text-navy-500 mt-1">
          One registration covers all sessions (series pass). Attendance is tracked per session.
          Status follows the event period
          {event.start_date || event.date
            ? ` (${event.start_date || event.date}${event.end_date && event.end_date !== (event.start_date || event.date) ? ` – ${event.end_date}` : ''}).`
            : '.'}
        </p>
        {countLine ? (
          <p className="mt-2 text-xs font-semibold text-navy-700" data-testid="session-status-counts">
            {countLine}
          </p>
        ) : null}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-cyan-600" size={22} /></div>
      ) : (
        <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100">
          {sessions.length === 0 ? (
            <li className="px-4 py-6 text-sm text-navy-500 text-center">No sessions yet.</li>
          ) : sessions.map((session) => {
            const status = getSessionStatus(session, now, statusOptions);
            const passed = status === 'passed';
            const inProgress = status === 'in_progress';
            return (
            <li
              key={session.id}
              className={`px-4 py-3 flex items-start justify-between gap-3 first:rounded-t-xl last:rounded-b-xl ${
                editingId === session.id
                  ? 'bg-cyan-50/70'
                  : inProgress
                    ? 'session-card-live'
                    : passed
                      ? 'bg-[#E76869]/10'
                      : 'bg-white'
              }`}
            >
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${
                    inProgress ? 'text-white' : passed ? 'text-navy-500' : 'text-navy-900'
                  }`}>
                    {session.title || `Session ${session.session_date}`}
                  </p>
                  <SessionStatusBadge status={status} />
                </div>
                <p className={`text-xs ${
                  inProgress ? 'text-white/70' : passed ? 'text-navy-400' : 'text-navy-500'
                }`}>
                  {session.session_date}
                  {session.start_time ? ` · ${String(session.start_time).slice(0, 5)}` : ''}
                  {session.end_time ? ` – ${String(session.end_time).slice(0, 5)}` : ''}
                  {` · ${event.timezone || 'Africa/Lusaka'}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleEdit(session)}
                  className={`p-2 rounded-lg ${
                    inProgress
                      ? 'text-white/70 hover:text-white hover:bg-white/10'
                      : 'text-navy-400 hover:text-cyan-700 hover:bg-cyan-50'
                  }`}
                  aria-label="Edit session"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(session.id)}
                  className={`p-2 rounded-lg ${
                    inProgress
                      ? 'text-white/70 hover:text-red-200 hover:bg-white/10'
                      : 'text-navy-400 hover:text-red-600 hover:bg-red-50'
                  }`}
                  aria-label="Delete session"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSave} className="rounded-xl border border-navy-100 p-4 space-y-3 bg-navy-50/40">
        <p className="text-xs font-semibold text-navy-700">{editingId ? 'Edit session' : 'Add session'}</p>
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
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {editingId ? 'Save changes' : 'Add session'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm font-medium text-navy-600 hover:bg-navy-50"
            >
              <X size={14} />
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
