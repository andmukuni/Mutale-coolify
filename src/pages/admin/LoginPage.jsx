import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { LoadingButton } from '../../components/ui';
import adminLogo from '../../../Logo-Website-Mutale_White No Bg.png';

export default function LoginPage() {
  const { login, isAuthenticated, loginError, clearLoginError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const from = location.state?.from?.pathname || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  // Clear errors when inputs change
  useEffect(() => {
    if (loginError) clearLoginError();
  }, [email, password]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const success = await login(email, password);
    if (success) {
      toast.success('Signed in to admin.');
      navigate(from, { replace: true });
    }

    setIsLoading(false);
  };

  // Surface admin login errors as toasts (in addition to the inline banner).
  useEffect(() => {
    if (loginError) toast.error(loginError);
  }, [loginError, toast]);

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col">
      {/* Back to site link */}
      <div className="p-4 sm:p-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-navy-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to website
        </Link>
      </div>

      {/* Login form centered */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          {/* Logo / branding */}
          <div className="text-center mb-8">
            <img
              src={adminLogo}
              alt="Mutale Mubanga"
              className="h-16 w-auto mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
            <p className="text-navy-400 text-sm mt-1.5">
              Sign in to manage your portfolio content
            </p>
          </div>

          {/* Login card */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* Error message */}
            {loginError && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-red-500 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                {loginError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email field */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-navy-700 mb-1.5"
                >
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail size={16} className="text-navy-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    placeholder="admin@mutale.dev"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 placeholder-navy-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-colors"
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-navy-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock size={16} className="text-navy-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 placeholder-navy-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-navy-400 hover:text-navy-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <LoadingButton
                type="submit"
                loading={isLoading}
                loadingLabel="Signing in..."
                disabled={!email || !password}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-600/50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Sign in
              </LoadingButton>
            </form>

            {/* Footer note */}
            <div className="mt-6 pt-5 border-t border-navy-100">
              <p className="text-xs text-navy-400 text-center">
                Sign in with your administrator account
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-navy-500 mt-6">
            © {new Date().getFullYear()} Mutale Mubanga. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
