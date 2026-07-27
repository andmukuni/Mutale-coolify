import { useState } from 'react';
import { Loader2, Video, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getApiBase } from '../utils/apiBase';

const API_BASE = getApiBase();

export default function GuestTicketJoinPanel({ referenceCode, canJoin, joinWindow }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!referenceCode || !canJoin) {
    const reason = joinWindow?.reason || 'Live join is not available for this ticket right now.';
    return (
      <div className="rounded-xl border border-navy-100 bg-white p-4 max-w-md mx-auto">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
          <Video size={16} />
          Join live
        </h3>
        <p className="text-xs text-navy-500 mt-2">{reason}</p>
      </div>
    );
  }

  const handleQuickJoin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE}/tickets/${encodeURIComponent(referenceCode)}/join-auth`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Could not join meeting.');

      const joinUrl = String(json?.auth?.joinUrl || json?.auth?.roomUrl || '').trim();
      if (joinUrl) {
        window.open(joinUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      window.location.href = `/tickets/${encodeURIComponent(referenceCode)}/join`;
    } catch (err) {
      setError(err?.message || 'Could not join meeting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4 max-w-md mx-auto space-y-3">
      <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
        <Video size={16} />
        Join live
      </h3>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleQuickJoin()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
          Join meeting
        </button>
        <Link
          to={`/tickets/${encodeURIComponent(referenceCode)}/join`}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm text-cyan-700 hover:text-cyan-600"
        >
          <ExternalLink size={14} />
          Full-screen join
        </Link>
      </div>
    </div>
  );
}
