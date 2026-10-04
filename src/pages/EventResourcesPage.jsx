import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getApiBase } from '../utils/apiBase';

const API_BASE = getApiBase();

export default function EventResourcesPage() {
  const { eventId, resourceId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [publicRows, setPublicRows] = useState([]);
  const [resource, setResource] = useState(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}/resources/public`);
        const listJson = await listRes.json().catch(() => ({}));
        if (!cancelled && listRes.ok && listJson.ok) setPublicRows(listJson.data || []);
        if (resourceId) {
          const query = token ? `?token=${encodeURIComponent(token)}` : '';
          const res = await fetch(`${API_BASE}/event-resources/${encodeURIComponent(resourceId)}${query}`);
          const json = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (res.status === 410) {
            setExpired(true);
            setError(json.message || 'This resource link has expired.');
            return;
          }
          if (!res.ok || !json.ok) throw new Error(json.message || 'This resource is not available.');
          setResource(json.data);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, resourceId, token]);

  const downloadHref = resourceId
    ? `${API_BASE}/event-resources/${encodeURIComponent(resourceId)}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`
    : '';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-navy-100 shadow-sm p-8 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Mutale Mubanga · Growing People.</p>
        <h1 className="text-xl font-semibold text-navy-900">{expired ? 'Link expired' : 'Event resources'}</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {resource && !expired && (
          <div className="space-y-2">
            <h2 className="font-semibold text-navy-800">{resource.title}</h2>
            <p className="text-sm text-navy-500">{resource.description}</p>
            <a href={downloadHref} className="inline-flex px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm">Download</a>
          </div>
        )}
        {!resourceId && (
          <ul className="divide-y divide-navy-100">
            {publicRows.map((row) => (
              <li key={row.id} className="py-3">
                <a href={`/resources/${eventId}/${row.id}`} className="font-semibold text-cyan-700">{row.title}</a>
                <p className="text-xs text-navy-400">{row.description}</p>
              </li>
            ))}
            {publicRows.length === 0 && <li className="text-sm text-navy-500">No public resources are published yet.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
