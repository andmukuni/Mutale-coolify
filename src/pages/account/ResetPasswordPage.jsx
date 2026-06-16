import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useUserAuth } from '../../context/UserAuthContext';

export default function ResetPasswordPage() {
  const { resetPasswordWithToken } = useUserAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = String(params.get('token') || '').trim();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStatus({ type: '', message: '' });
  }, [password, confirm]);

  const validation = useMemo(() => {
    if (!token) return { ok: false, message: 'Reset token is missing. Please use the link from your email.' };
    if (!password || password.length < 6) return { ok: false, message: 'Password must be at least 6 characters.' };
    if (password !== confirm) return { ok: false, message: 'Passwords do not match.' };
    return { ok: true, message: '' };
  }, [token, password, confirm]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validation.ok) {
      setStatus({ type: 'error', message: validation.message });
      return;
    }

    setLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const result = await resetPasswordWithToken({ token, password });
      if (result?.ok) {
        setStatus({ type: 'success', message: result.message || 'Password updated. You can now log in.' });
        setTimeout(() => navigate('/account/login'), 900);
      } else {
        setStatus({ type: 'error', message: result?.message || 'Failed to reset password.' });
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
              <KeyRound size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-navy-900">Choose a new password</h1>
            <p className="text-navy-500 text-sm mt-2">
              Your reset link is valid for a limited time.
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

            {!token && (
              <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                Reset token is missing. Please open the link from your email again.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-navy-700 mb-1.5">
                  New password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-navy-700 mb-1.5">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600"
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!validation.ok || loading}
                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Updating…
                  </>
                ) : (
                  <>
                    <KeyRound size={16} />
                    Update password
                  </>
                )}
              </button>
            </form>

            <p className="text-xs text-navy-500 mt-5">
              After updating, you&rsquo;ll be redirected to login.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

