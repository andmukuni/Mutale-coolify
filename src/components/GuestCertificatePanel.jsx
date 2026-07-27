import { useState } from 'react';
import { Award, Download, Loader2, Mail } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';

const API_BASE = getApiBase();

export default function GuestCertificatePanel({ referenceCode, certificate }) {
  const [guestToken, setGuestToken] = useState(() => {
    try {
      return sessionStorage.getItem(`guest_ticket_token:${referenceCode}`) || '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!certificate) return null;

  const storeToken = (token) => {
    setGuestToken(token);
    try {
      sessionStorage.setItem(`guest_ticket_token:${referenceCode}`, token);
    } catch { /* ignore */ }
  };

  const sendCode = async () => {
    setBusy('send');
    setError('');
    setMessage('');
    try {
      const res = await fetch(
        `${API_BASE}/tickets/${encodeURIComponent(referenceCode)}/access-code`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Could not send code.');
      setMessage('Verification code sent to the email on your ticket.');
    } catch (err) {
      setError(err?.message || 'Could not send code.');
    } finally {
      setBusy('');
    }
  };

  const verifyCode = async () => {
    setBusy('verify');
    setError('');
    setMessage('');
    try {
      const res = await fetch(
        `${API_BASE}/tickets/${encodeURIComponent(referenceCode)}/verify-access-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.trim() }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Invalid code.');
      storeToken(json.guest_session_token);
      setMessage('Verified. You can download your certificate.');
      setCode('');
    } catch (err) {
      setError(err?.message || 'Invalid code.');
    } finally {
      setBusy('');
    }
  };

  const download = async () => {
    setBusy('download');
    setError('');
    try {
      const headers = guestToken ? { Authorization: `Bearer ${guestToken}` } : {};
      const res = await fetch(
        `${API_BASE}/tickets/${encodeURIComponent(referenceCode)}/certificate/download`,
        { headers },
      );
      if (res.status === 403) {
        setError('Verify your email with a code to download.');
        return;
      }
      if (!res.ok) throw new Error('Download failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certificate-${certificate.certificate_code || referenceCode}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || 'Download failed.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4 max-w-md mx-auto space-y-3">
      <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
        <Award size={16} />
        Certificate
      </h3>
      <p className="text-xs text-navy-600">
        Certificate {certificate.certificate_code} issued{' '}
        {certificate.issued_at ? new Date(certificate.issued_at).toLocaleDateString() : ''}.
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && <p className="text-xs text-green-700">{message}</p>}

      {!guestToken && (
        <div className="space-y-2 border-t border-navy-50 pt-3">
          <p className="text-xs text-navy-500">Verify the email on your ticket to download.</p>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={busy === 'send'}
            className="inline-flex items-center gap-2 text-xs font-medium text-cyan-700 disabled:opacity-50"
          >
            {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Send verification code
          </button>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              className="flex-1 rounded-lg border border-navy-100 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void verifyCode()}
              disabled={busy === 'verify' || !code.trim()}
              className="px-3 py-2 rounded-lg bg-navy-800 text-white text-xs font-medium disabled:opacity-50"
            >
              Verify
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void download()}
        disabled={busy === 'download'}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
      >
        {busy === 'download' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        Download PDF
      </button>
    </div>
  );
}
