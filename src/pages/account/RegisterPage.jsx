import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, ArrowLeft, UserPlus, CheckCircle, RefreshCw, MessageCircle, CreditCard, Globe } from 'lucide-react';
import { useUserAuth } from '../../context/UserAuthContext';
import { useToast } from '../../context/ToastContext';
import { getApiBase } from '../../utils/apiBase';
import siteLogo from '../../../Logo-Website-Mutale_Main - Navy and Teal.png';

const API_BASE = getApiBase();

export default function RegisterPage() {
  const { register, isUserAuthenticated, authError, authLoading, clearAuthError } = useUserAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/account/my-events';

  const [tab, setTab] = useState('local');
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '', password: '', confirm: '' });
  const [nrcParts, setNrcParts] = useState(['', '', '']); // [6 digits, 2 digits, 1 digit]
  const nrcRefs = [useRef(null), useRef(null), useRef(null)];
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupInfo, setLookupInfo] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState('');

  useEffect(() => {
    if (isUserAuthenticated) navigate(from, { replace: true });
  }, [isUserAuthenticated, navigate, from]);

  useEffect(() => {
    if (authError) clearAuthError();
  }, [form.email, form.password, form.whatsapp]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabSwitch = (newTab) => {
    if (newTab === tab) return;
    setTab(newTab);
    setLookupInfo('');
    setLookupError('');
    setErrors({});
    if (newTab === 'international') {
      setNrcParts(['', '', '']);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Full name is required.';
    if (!form.email.trim()) e.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Please enter a valid email address.';
    if (!form.whatsapp.trim()) e.whatsapp = 'WhatsApp number is required.';
    if (tab === 'local') {
      if (!nrcParts[0] || nrcParts[0].length < 6 || !nrcParts[1] || nrcParts[1].length < 2 || !nrcParts[2] || nrcParts[2].length < 1) {
        e.nrc = 'Complete NRC number is required (e.g. 123456/78/1).';
      }
    }
    if (form.password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match.';
    return e;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (errors[name]) setErrors(p => ({ ...p, [name]: '' }));
    setForm(p => ({ ...p, [name]: value }));
  };

  const handleNrcPartChange = (index, value) => {
    const digits = value.replace(/[^0-9]/g, '');
    const maxLens = [6, 2, 1];
    const clamped = digits.slice(0, maxLens[index]);
    setNrcParts(prev => { const next = [...prev]; next[index] = clamped; return next; });
    if (errors.nrc) setErrors(p => ({ ...p, nrc: '' }));
    setLookupError(''); setLookupInfo('');
    // Auto-advance to next segment when full
    if (clamped.length === maxLens[index] && index < 2) {
      nrcRefs[index + 1].current?.focus();
    }
  };

  const handleNrcKeyDown = (index, e) => {
    // Backspace on empty segment → go to previous
    if (e.key === 'Backspace' && !nrcParts[index] && index > 0) {
      e.preventDefault();
      nrcRefs[index - 1].current?.focus();
    }
  };

  const handleNrcLookup = async () => {
    const nrc = nrcParts.join('/');
    if (!nrcParts[0]) { setErrors(p => ({ ...p, nrc: 'NRC number is required.' })); return; }

    setLookupLoading(true);
    setLookupError('');
    setLookupInfo('');

    try {
      const res = await fetch(`${API_BASE}/nrc/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nrc_number: nrc }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'NRC verification failed. Please enter your full name manually.');
      }
      const fullName = String(json?.data?.fullName || '').trim();
      if (!fullName) throw new Error('No name returned for this NRC. Please enter your full name manually.');

      setForm(p => ({ ...p, name: fullName }));
      setLookupInfo(`Verified: ${fullName}`);
      setErrors(p => ({ ...p, name: '', nrc: '' }));
    } catch (error) {
      setLookupError(error.message || 'Unable to verify NRC right now.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const result = await register({
      name: form.name,
      email: form.email,
      phone: form.whatsapp,
      whatsapp: form.whatsapp,
      password: form.password,
      user_type: tab,
      nrc_id: tab === 'local' ? nrcParts.join('/') : '',
    });
    if (result?.ok) {
      setRegisteredEmail(form.email);
      toast.success('Account created — check your inbox to verify.');
    }
  };

  useEffect(() => {
    if (authError) toast.error(authError);
  }, [authError, toast]);

  const fieldClass = (err) =>
    `w-full py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
      err ? 'border-red-300 bg-red-50 text-red-900' : 'border-navy-200 bg-navy-50 text-navy-900'
    }`;

  return (
    <div className="min-h-screen bg-navy-50 flex flex-col">
      <div className="p-4 sm:p-6">
        <Link to="/events" className="inline-flex items-center gap-2 text-sm text-navy-500 hover:text-cyan-600 transition-colors">
          <ArrowLeft size={15} /> Back to Events
        </Link>
      </div>

      {registeredEmail ? (
        <div className="flex-1 flex items-center justify-center px-4 pb-16">
          <div className="w-full max-w-md text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 mb-5">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-navy-900 mb-2">Check your inbox!</h2>
            <p className="text-navy-600 text-sm mb-1">We sent a confirmation link to</p>
            <p className="font-semibold text-cyan-700 mb-5">{registeredEmail}</p>
            <p className="text-navy-500 text-sm mb-6">
              Click the link in the email to verify your address and activate your account. The link expires in 24 hours.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
              <p className="font-semibold mb-1">Didn&rsquo;t receive the email?</p>
              <p className="mb-3 text-amber-700">Check your spam/junk folder. If it&rsquo;s not there, click below to resend.</p>
              {resendStatus ? (
                <p className="text-green-700 font-medium">{resendStatus}</p>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    setResendLoading(true); setResendStatus('');
                    try {
                      const res = await fetch(`${API_BASE}/auth/resend-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: registeredEmail }) });
                      const json = await res.json().catch(() => ({}));
                      setResendStatus(json.message || 'Verification email sent! Check your inbox.');
                    } catch { setResendStatus('Failed to resend. Please try again.'); }
                    finally { setResendLoading(false); }
                  }}
                  disabled={resendLoading}
                  className="inline-flex items-center gap-1.5 text-cyan-700 font-medium hover:underline disabled:opacity-60"
                >
                  <RefreshCw size={13} className={resendLoading ? 'animate-spin' : ''} />
                  {resendLoading ? 'Sending…' : 'Resend confirmation email'}
                </button>
              )}
            </div>
            <Link to="/account/login" className="inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-6 py-3 rounded-xl transition-colors">
              Go to Login
            </Link>
          </div>
        </div>
      ) : (

      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src={siteLogo}
              alt="Mutale Mubanga"
              className="h-16 w-auto mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-navy-900">Create your account</h1>
            <p className="text-navy-500 text-sm mt-2">
              Already have an account?{' '}
              <Link to="/account/login" state={{ from: location.state?.from }} className="text-cyan-600 font-medium hover:underline">Sign in</Link>
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-navy-100 p-5 sm:p-8">
            {/* ── Tab Switcher ── */}
            <div className="flex rounded-xl bg-navy-50 border border-navy-200 p-1 mb-6">
              <button type="button" onClick={() => handleTabSwitch('local')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'local' ? 'bg-cyan-600 text-white shadow-sm' : 'text-navy-600 hover:text-navy-900'}`}>
                <CreditCard size={15} /> Local (Zambian)
              </button>
              <button type="button" onClick={() => handleTabSwitch('international')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'international' ? 'bg-cyan-600 text-white shadow-sm' : 'text-navy-600 hover:text-navy-900'}`}>
                <Globe size={15} /> International
              </button>
            </div>

            {authError && (
              <div role="alert" aria-live="assertive" className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                <span className="shrink-0">⚠</span> {authError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* NRC (Zambian only) */}
              {tab === 'local' && (
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">
                    NRC Number <span className="text-red-400">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex items-center gap-0 flex-1">
                      <div className="relative flex-[6]">
                        <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                        <input ref={nrcRefs[0]} type="text" inputMode="numeric" autoComplete="off" maxLength={6}
                          value={nrcParts[0]} onChange={e => handleNrcPartChange(0, e.target.value)}
                          onKeyDown={e => handleNrcKeyDown(0, e)}
                          placeholder="123456"
                          className={`${fieldClass(errors.nrc)} pl-9 pr-1 text-center tracking-widest font-mono`} />
                      </div>
                      <span className={`text-xl font-bold mx-1 select-none ${nrcParts[0].length === 6 && !nrcParts[1] ? 'text-cyan-500 animate-pulse' : 'text-navy-300'}`}>/</span>
                      <div className="relative flex-[2]">
                        <input ref={nrcRefs[1]} type="text" inputMode="numeric" autoComplete="off" maxLength={2}
                          value={nrcParts[1]} onChange={e => handleNrcPartChange(1, e.target.value)}
                          onKeyDown={e => handleNrcKeyDown(1, e)}
                          placeholder="78"
                          className={`${fieldClass(errors.nrc)} px-1 text-center tracking-widest font-mono`} />
                      </div>
                      <span className={`text-xl font-bold mx-1 select-none ${nrcParts[1].length === 2 && !nrcParts[2] ? 'text-cyan-500 animate-pulse' : 'text-navy-300'}`}>/</span>
                      <div className="relative flex-[1]">
                        <input ref={nrcRefs[2]} type="text" inputMode="numeric" autoComplete="off" maxLength={1}
                          value={nrcParts[2]} onChange={e => handleNrcPartChange(2, e.target.value)}
                          onKeyDown={e => handleNrcKeyDown(2, e)}
                          placeholder="1"
                          className={`${fieldClass(errors.nrc)} px-1 text-center tracking-widest font-mono`} />
                      </div>
                    </div>
                    <button type="button" onClick={handleNrcLookup} disabled={lookupLoading || !(nrcParts[0] && nrcParts[1] && nrcParts[2])}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors w-full sm:w-auto">
                      {lookupLoading ? 'Verifying…' : 'Verify NRC'}
                    </button>
                  </div>
                  {errors.nrc && <p className="mt-1 text-xs text-red-500">{errors.nrc}</p>}
                  {!errors.nrc && lookupError && <p className="mt-1 text-xs text-red-500">{lookupError}</p>}
                  {!errors.nrc && !lookupError && lookupInfo && <p className="mt-1 text-xs text-emerald-600">{lookupInfo}</p>}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-navy-700 mb-1.5">Full name <span className="text-red-400">*</span></label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input id="name" name="name" type="text" autoComplete="name" required value={form.name} onChange={handleChange} placeholder="Your full name" className={`${fieldClass(errors.name)} pl-10 pr-4`} />
                </div>
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              {/* WhatsApp */}
              <div>
                <label htmlFor="whatsapp" className="block text-sm font-medium text-navy-700 mb-1.5">WhatsApp number <span className="text-red-400">*</span></label>
                <div className="relative">
                  <MessageCircle size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input id="whatsapp" name="whatsapp" type="tel" autoComplete="tel" required value={form.whatsapp} onChange={handleChange}
                    placeholder={tab === 'local' ? 'e.g. 0977123456' : 'e.g. +1234567890'}
                    className={`${fieldClass(errors.whatsapp)} pl-10 pr-4`} />
                </div>
                {errors.whatsapp && <p className="mt-1 text-xs text-red-500">{errors.whatsapp}</p>}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-navy-700 mb-1.5">Email address <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input id="email" name="email" type="email" autoComplete="email" required value={form.email} onChange={handleChange} placeholder="you@example.com" className={`${fieldClass(errors.email)} pl-10 pr-4`} />
                </div>
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-navy-700 mb-1.5">Password <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={form.password} onChange={handleChange} placeholder="Min. 6 characters" className={`${fieldClass(errors.password)} pl-10 pr-10`} />
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-navy-700 mb-1.5">Confirm password <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input id="confirm" name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={form.confirm} onChange={handleChange} placeholder="Repeat password" className={`${fieldClass(errors.confirm)} pl-10 pr-4`} />
                </div>
                {errors.confirm && <p className="mt-1 text-xs text-red-500">{errors.confirm}</p>}
              </div>

              <button type="submit" disabled={authLoading}
                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors">
                {authLoading ? (
                  <><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account…</>
                ) : (
                  <><UserPlus size={16} /> Create Account</>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
