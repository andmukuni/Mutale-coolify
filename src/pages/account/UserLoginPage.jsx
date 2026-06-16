import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, ArrowLeft, UserPlus, RefreshCw } from 'lucide-react';
import { useUserAuth } from '../../context/UserAuthContext';
import { useToast } from '../../context/ToastContext';
import { getApiBase } from '../../utils/apiBase';
import siteLogo from '../../../Logo-Website-Mutale_Main - Navy and Teal.png';

const API_BASE = getApiBase();

export default function UserLoginPage() {
  const { userLogin, isUserAuthenticated, authError, authLoading, clearAuthError } = useUserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  // After login, return to intended page (or account)
  const from = location.state?.from?.pathname || '/account/my-events';

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resendStatus, setResendStatus] = useState('');
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    if (isUserAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isUserAuthenticated, navigate, from]);

  useEffect(() => {
    if (authError) clearAuthError();
    setUnverified(false);
    setResendStatus('');
  }, [form.email, form.password]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await userLogin({ email: form.email, password: form.password });
    if (result?.unverified) {
      setUnverified(true);
      toast.warning('Please verify your email to continue.');
    } else if (result?.ok) {
      toast.success('Welcome back!');
    }
    // Auth errors are surfaced via the authError useEffect below.
  };

  // Surface authError changes as toasts (in addition to the inline banner).
  useEffect(() => {
    if (authError) toast.error(authError);
  }, [authError, toast]);

  const handleResend = async () => {
    setResendLoading(true);
    setResendStatus('');
    try {
      const res = await fetch(`${API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      });
      const json = await res.json().catch(() => ({}));
      setResendStatus(json.message || 'Verification email sent.');
      toast.success(json.message || 'Verification email sent.');
    } catch {
      setResendStatus('Failed to resend. Please try again.');
      toast.error('Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-50 flex flex-col">
      <div className="p-4 sm:p-6">
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-sm text-navy-500 hover:text-cyan-600 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Events
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          {/* Heading */}
          <div className="text-center mb-8">
            <img
              src={siteLogo}
              alt="Mutale Mubanga"
              className="h-16 w-auto mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-navy-900">Sign in to your account</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-navy-100 p-5 sm:p-8">
            {authError && !unverified && (
              <div role="alert" aria-live="assertive" className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                <span className="shrink-0">⚠</span>
                {authError}
              </div>
            )}

            {unverified && (
              <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <p className="font-semibold mb-1">Email not verified</p>
                <p className="mb-3">Please check your inbox and click the confirmation link before logging in.</p>
                {resendStatus ? (
                  <p className="text-green-700 font-medium">{resendStatus}</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendLoading}
                    className="inline-flex items-center gap-1.5 text-cyan-700 font-medium hover:underline disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={resendLoading ? 'animate-spin' : ''} />
                    {resendLoading ? 'Sending…' : 'Resend confirmation email'}
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
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
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-navy-700">
                    Password
                  </label>
                  <Link
                    to="/account/forgot-password"
                    className="text-xs font-medium text-cyan-700 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={form.password}
                    onChange={handleChange}
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

              <button
                type="submit"
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors"
              >
                {authLoading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <User size={16} />
                    Sign In
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-navy-100">
              <p className="text-xs text-navy-500 text-center mb-3">
                Don&rsquo;t have an account yet?
              </p>
              <Link
                to="/account/register"
                state={{ from: location.state?.from }}
                className="w-full inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                <UserPlus size={16} />
                Register New Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
