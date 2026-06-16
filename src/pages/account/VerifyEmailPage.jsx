import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import { getApiBase } from '../../utils/apiBase';

const API_BASE = getApiBase();

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState(() => token ? 'loading' : 'error');
  const [message, setMessage] = useState(() => token ? '' : 'No verification token found. Please use the link from your email.');

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    fetch(`${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(json => {
        if (json.ok) {
          setStatus('success');
          setMessage(json.message || 'Email confirmed! You can now log in.');
        } else {
          setStatus('error');
          setMessage(json.message || 'Verification failed.');
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setStatus('error');
        setMessage('Unable to connect. Please try again.');
      });

    return () => controller.abort();
  }, [token]);

  return (
    <div className="min-h-screen bg-navy-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-sm border border-navy-100 p-8">
        {status === 'loading' && (
          <>
            <Loader size={40} className="mx-auto text-cyan-600 animate-spin mb-4" />
            <h2 className="text-xl font-bold text-navy-900">Verifying your email…</h2>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-navy-900 mb-2">Email confirmed!</h2>
            <p className="text-navy-600 text-sm mb-6">{message}</p>
            <Link
              to="/account/login"
              className="inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-6 py-3 rounded-xl transition-colors"
            >
              Sign In
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 mb-4">
              <XCircle size={32} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-navy-900 mb-2">Verification failed</h2>
            <p className="text-navy-600 text-sm mb-6">{message}</p>
            <Link
              to="/account/register"
              className="inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-6 py-3 rounded-xl transition-colors"
            >
              Register Again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
