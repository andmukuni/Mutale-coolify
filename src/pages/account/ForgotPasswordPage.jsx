import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { useUserAuth } from '../../context/UserAuthContext';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useUserAuth();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 3, [email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const result = await requestPasswordReset(email);
      if (result?.ok) {
        setStatus({ type: 'success', message: result.message || 'If that email exists, we sent a password reset link.' });
      } else {
        setStatus({ type: 'error', message: result?.message || 'Failed to request a reset link.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-50 flex flex-col">
      <div className="p-4 sm:p-6">
        <Link
          to="/account/login"
          className="inline-flex items-center gap-2 text-sm text-navy-500 hover:text-cyan-600 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Login
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-600 mb-4">
              <Send size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-navy-900">Reset your password</h1>
            <p className="text-navy-500 text-sm mt-2">
              Enter your email and we&rsquo;ll send you a reset link.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-navy-100 p-5 sm:p-8">
            {status.message && (
              <div
                role="status"
                aria-live="polite"
                className={[
                  'mb-5 p-3.5 rounded-xl text-sm',
                  status.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-700',
                ].join(' ')}
              >
                {status.message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-navy-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send reset link
                  </>
                )}
              </button>
            </form>

            <p className="text-xs text-navy-500 mt-5">
              If you don&rsquo;t see the email, check your spam folder.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

