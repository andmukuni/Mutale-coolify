import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';

const API_BASE = getApiBase();

function formatForumDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function GuestTicketForumPanel({ referenceCode, enabled }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState('');

  const loadTopics = useCallback(async () => {
    if (!referenceCode || !enabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(referenceCode)}/forum/topics`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Could not load forum.');
      setTopics(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err?.message || 'Could not load forum.');
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, referenceCode]);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch(
        `${API_BASE}/tickets/${encodeURIComponent(referenceCode)}/forum/topics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), body: body.trim() }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Could not post topic.');
      setTitle('');
      setBody('');
      setInfo(json.pending_moderation ? 'Topic submitted for moderation.' : 'Topic posted.');
      await loadTopics();
    } catch (err) {
      setError(err?.message || 'Could not post topic.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!enabled) return null;

  return (
    <div id="forum" className="rounded-xl border border-navy-100 bg-white p-4 max-w-md mx-auto space-y-4 scroll-mt-20">
      <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
        <MessageSquare size={16} />
        Event forum
      </h3>

      {loading && <p className="text-xs text-navy-500 animate-pulse">Loading forum…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {info && <p className="text-xs text-green-700">{info}</p>}

      {!loading && topics.length === 0 && (
        <p className="text-xs text-navy-500">No topics yet. Start the conversation.</p>
      )}

      <ul className="space-y-3">
        {topics.map((topic) => (
          <li key={topic.id} className="border border-navy-50 rounded-lg p-3">
            <p className="text-sm font-medium text-navy-900">{topic.title}</p>
            <p className="text-xs text-navy-500 mt-1">
              {topic.user_name} · {formatForumDate(topic.created_at)}
            </p>
            <p className="text-sm text-navy-700 mt-2 whitespace-pre-wrap">{topic.body}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 border-t border-navy-50 pt-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Topic title"
          maxLength={200}
          className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Your message"
          rows={3}
          maxLength={5000}
          className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim() || !body.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-800 text-white text-sm font-medium disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Post topic
        </button>
      </form>
    </div>
  );
}
