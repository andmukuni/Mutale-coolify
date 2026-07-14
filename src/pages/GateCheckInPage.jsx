import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, ScanLine, ShieldCheck } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import { getAdminAuthHeaders, hasAdminAuthToken } from '../utils/authHeaders';
import TicketDocument from '../../shared/TicketDocument.jsx';
import { RECEIPT_LIGHT_FILL } from '../../shared/receiptTheme.js';

const API_BASE = getApiBase();

export default function GateCheckInPage() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError('');
      setResult(null);
      setTicket(null);

      const isAdmin = hasAdminAuthToken();
      const eventId = String(searchParams.get('event') || '').trim();

      try {
        if (isAdmin) {
          const checkRes = await fetch(`${API_BASE}/registrations/check-in`, {
            method: 'POST',
            headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              reference_code: code,
              ...(eventId ? { event_id: eventId } : {}),
            }),
          });
          const checkJson = await checkRes.json().catch(() => ({}));

          if (!cancelled && checkRes.ok && checkJson?.ok) {
            setResult({
              mode: 'checked_in',
              ...checkJson.data,
            });
            setLoading(false);
            return;
          }

          if (!cancelled && !checkRes.ok && checkRes.status !== 401 && checkRes.status !== 403) {
            const ticketRes = await fetch(`${API_BASE}/tickets/${encodeURIComponent(code || '')}`);
            const ticketJson = await ticketRes.json().catch(() => ({}));
            if (cancelled) return;

            if (!ticketRes.ok || !ticketJson?.ok) {
              setError(ticketJson?.message || checkJson?.message || 'Ticket not found.');
              setLoading(false);
              return;
            }

            setTicket(ticketJson.data);
            setResult({ mode: 'lookup_only', message: checkJson?.message || '' });
            setLoading(false);
            return;
          }
        }

        const ticketRes = await fetch(`${API_BASE}/tickets/${encodeURIComponent(code || '')}`);
        const ticketJson = await ticketRes.json().catch(() => ({}));
        if (cancelled) return;

        if (!ticketRes.ok || !ticketJson?.ok) {
          setError(ticketJson?.message || 'Ticket not found.');
          setLoading(false);
          return;
        }

        setTicket(ticketJson.data);
        if (isAdmin) {
          setResult({ mode: 'staff_required' });
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load ticket. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [code, searchParams]);

  const checkedIn = result?.mode === 'checked_in';
  const alreadyCheckedIn = Boolean(result?.already_checked_in);
  const attendeeName = result?.attendee_name || ticket?.attendee_name || 'Attendee';
  const viewModel = ticket?.viewModel || null;
  const valid = Boolean(ticket?.valid);

  return (
    <div className="min-h-[60vh] py-10 sm:py-14 px-4" style={{ backgroundColor: RECEIPT_LIGHT_FILL }}>
      <div className="max-w-2xl mx-auto space-y-5">
        {loading && (
          <div className="text-center py-16 space-y-3">
            <ScanLine size={32} className="mx-auto text-cyan-600 animate-pulse" />
            <p className="text-sm text-navy-500">Processing ticket…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 p-5 rounded-2xl bg-red-50 border border-red-200 text-red-700 max-w-md mx-auto">
            <XCircle size={20} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-base">Ticket unavailable</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        )}

        {!loading && checkedIn && (
          <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-8 text-center max-w-md mx-auto shadow-sm">
            <CheckCircle2 size={48} className="mx-auto text-green-600 mb-4" />
            <p className="text-xs font-bold uppercase tracking-widest text-green-700">Checked in</p>
            <h1 className="text-2xl font-bold text-navy-900 mt-2">{attendeeName}</h1>
            <p className="font-mono text-sm text-navy-600 mt-2">{result.reference_code || code}</p>
            <p className="text-sm text-green-800 mt-4">
              {alreadyCheckedIn
                ? 'This attendee was already checked in earlier.'
                : 'Welcome — enjoy the event!'}
            </p>
            {result.event_title && (
              <p className="text-sm text-navy-500 mt-2">{result.event_title}</p>
            )}
          </div>
        )}

        {!loading && !error && !checkedIn && ticket && (
          <>
            <div className={`rounded-2xl border p-5 text-sm max-w-md mx-auto ${
              !valid
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : ticket.checked_in
                  ? 'bg-green-50 border-green-200 text-green-900'
                  : 'bg-cyan-50 border-cyan-200 text-cyan-900'
            }`}>
              <div className="flex items-start gap-3">
                {!valid ? (
                  <XCircle size={20} className="shrink-0 mt-0.5" />
                ) : (
                  <ShieldCheck size={20} className="shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-base">
                    {!valid
                      ? 'Not valid for entry'
                      : ticket.checked_in
                        ? 'Already checked in'
                        : 'Valid for entry'}
                  </p>
                  <p className="mt-1 text-xs opacity-90">
                    {result?.mode === 'staff_required'
                      ? 'Present this QR to gate staff for check-in.'
                      : result?.message || 'Show this screen at the registration desk.'}
                  </p>
                  {ticket.checked_in_at && (
                    <p className="mt-1 text-xs opacity-90">
                      Checked in {new Date(ticket.checked_in_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {viewModel && valid && (
              <TicketDocument viewModel={viewModel} outerPadding />
            )}

            {result?.mode === 'staff_required' && (
              <p className="text-center text-sm text-navy-500">
                Gate staff:{' '}
                <Link to="/admin/login" className="text-cyan-700 font-medium hover:underline">
                  sign in as admin
                </Link>
                {' '}then scan again to check in.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
