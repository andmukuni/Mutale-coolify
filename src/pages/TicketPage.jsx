import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import TicketDocument from '../../shared/TicketDocument.jsx';
import TicketSessionsPanel from '../components/TicketSessionsPanel';
import { RECEIPT_LIGHT_FILL } from '../../shared/receiptTheme.js';

const API_BASE = getApiBase();

export default function TicketPage() {
  const { code } = useParams();
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(code || '')}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setError(json?.message || 'Ticket not found.');
          setTicket(null);
          return;
        }
        setTicket(json.data);
      } catch {
        if (!cancelled) {
          setError('Unable to load ticket. Please try again.');
          setTicket(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [code]);

  const valid = Boolean(ticket?.valid);
  const checkedIn = Boolean(ticket?.checked_in);
  const eventPath = ticket?.event_slug ? `/events/${ticket.event_slug}` : null;
  const viewModel = ticket?.viewModel || null;

  return (
    <div className="min-h-[60vh] py-10 sm:py-14 px-4" style={{ backgroundColor: RECEIPT_LIGHT_FILL }}>
      <div className="max-w-2xl mx-auto space-y-4">
        {loading && (
          <p className="text-sm text-navy-500 animate-pulse text-center py-12">Loading ticket…</p>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm max-w-md mx-auto">
            <XCircle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Ticket unavailable</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        {!loading && ticket && (
          <>
            <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm max-w-md mx-auto ${
              !valid
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : checkedIn
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-cyan-50 border-cyan-200 text-cyan-800'
            }`}>
              {!valid ? (
                <XCircle size={18} className="shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">
                  {!valid
                    ? 'Not valid for entry'
                    : checkedIn
                      ? 'Already checked in'
                      : 'Valid for entry'}
                </p>
                {!valid && (
                  <p className="mt-1 text-xs opacity-90">
                    This ticket may be cancelled or awaiting payment confirmation.
                  </p>
                )}
                {checkedIn && ticket.checked_in_at && (
                  <p className="mt-1 text-xs opacity-90">
                    Checked in {new Date(ticket.checked_in_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {viewModel && valid && (
              <TicketDocument viewModel={viewModel} outerPadding />
            )}

            <TicketSessionsPanel
              eventId={ticket.event_id}
              registrationId={ticket.registration_id}
              valid={valid}
            />

            {eventPath && (
              <div className="text-center pt-2">
                <Link
                  to={eventPath}
                  className="inline-block text-sm font-medium text-navy-600 hover:text-cyan-700 underline underline-offset-2"
                >
                  View event details
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
