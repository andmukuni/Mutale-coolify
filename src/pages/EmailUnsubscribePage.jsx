import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getApiBase } from '../utils/apiBase';

const API_BASE = getApiBase();

export default function EmailUnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('This unsubscribe link is missing a token.');
  }, [token]);

  const confirm = async () => {
    setStatus('saving');
    try {
      const res = await fetch(`${API_BASE}/email/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.message || 'Unable to unsubscribe.');
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('ready');
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-navy-100 shadow-sm p-8 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Mutale Mubanga · Growing People.</p>
        <h1 className="text-xl font-semibold text-navy-900">Unsubscribe</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {status === 'done' ? (
          <p className="text-sm text-navy-600">You will no longer receive promotional event emails.</p>
        ) : (
          <>
            <p className="text-sm text-navy-600">This only stops promotional mail. Event service messages about a registration you already have may still be sent.</p>
            <button type="button" onClick={confirm} className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm">Confirm unsubscribe</button>
          </>
        )}
        <Link to="/email/preferences" className="text-sm text-cyan-700">Manage preferences</Link>
      </div>
    </div>
  );
}
