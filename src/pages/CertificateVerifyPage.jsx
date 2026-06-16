import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';

const API_BASE = getApiBase();

export default function CertificateVerifyPage() {
  const { code } = useParams();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/certificates/verify/${encodeURIComponent(code || '')}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setError(json?.message || 'Verification failed.');
          setResult(null);
          return;
        }
        setResult(json);
      } catch {
        if (!cancelled) {
          setError('Unable to verify certificate. Please try again later.');
          setResult(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void verify();
    return () => { cancelled = true; };
  }, [code]);

  const valid = Boolean(result?.valid);
  const data = result?.data;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-navy-100 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-cyan-50 text-cyan-700">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-navy-900">Certificate Verification</h1>
            <p className="text-sm text-navy-500">Confirm authenticity of an issued certificate</p>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-navy-500 animate-pulse">Verifying certificate…</p>
        )}

        {!loading && error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && result && (
          <div className="space-y-4">
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${valid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              {valid ? (
                <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={22} />
              ) : (
                <XCircle className="text-amber-600 shrink-0 mt-0.5" size={22} />
              )}
              <div>
                <p className={`font-semibold ${valid ? 'text-green-800' : 'text-amber-800'}`}>
                  {valid ? 'Valid certificate' : 'Certificate not found or revoked'}
                </p>
                <p className="text-sm text-navy-600 mt-1">
                  ID: <span className="font-mono">{code}</span>
                </p>
              </div>
            </div>

            {valid && data && (
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-navy-400 uppercase tracking-wide">Attendee</dt>
                  <dd className="font-medium text-navy-900">{data.attendeeName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-400 uppercase tracking-wide">Event</dt>
                  <dd className="font-medium text-navy-900">{data.eventTitle}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-400 uppercase tracking-wide">Issued</dt>
                  <dd className="font-medium text-navy-900">
                    {data.issuedAt ? new Date(data.issuedAt).toLocaleDateString('en-ZM', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    }) : '—'}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-navy-100 text-center">
          <Link to="/" className="text-sm text-cyan-700 hover:text-cyan-600 hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
