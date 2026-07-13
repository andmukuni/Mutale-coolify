import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, MapPin, Ticket, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import { formatDate } from '../utils/helpers';
import TicketQrDisplay from '../components/TicketQrDisplay';

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

  return (
    <div className="min-h-[60vh] bg-navy-50/60 py-10 sm:py-14 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl border border-navy-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-navy-900 to-navy-800 text-white px-6 py-5">
            <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Ticket size={14} />
              Event Ticket
            </div>
            <h1 className="text-xl font-bold leading-snug">
              {ticket?.event_title || 'Event ticket'}
            </h1>
          </div>

          <div className="p-6 space-y-5">
            {loading && (
              <p className="text-sm text-navy-500 animate-pulse text-center py-8">Loading ticket…</p>
            )}

            {!loading && error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <XCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Ticket unavailable</p>
                  <p className="mt-1">{error}</p>
                </div>
              </div>
            )}

            {!loading && ticket && (
              <>
                <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
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
                  </div>
                </div>

                {valid && (
                  <div className="flex justify-center py-2">
                    <TicketQrDisplay
                      referenceCode={ticket.reference_code}
                      attendeeName={ticket.attendee_name}
                      size={200}
                    />
                  </div>
                )}

                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-navy-500">Attendee</span>
                    <span className="font-medium text-navy-900 text-right">{ticket.attendee_name || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-navy-500">Reference</span>
                    <span className="font-mono font-semibold text-navy-900">{ticket.reference_code}</span>
                  </div>
                  {ticket.event_date && (
                    <div className="flex items-center gap-2 text-navy-600">
                      <Calendar size={14} className="text-navy-400 shrink-0" />
                      {formatDate(ticket.event_date.split('T')[0])}
                      {ticket.event_time ? ` · ${ticket.event_time}` : ''}
                    </div>
                  )}
                  {ticket.event_location && (
                    <div className="flex items-center gap-2 text-navy-600">
                      <MapPin size={14} className="text-navy-400 shrink-0" />
                      {ticket.event_location}
                    </div>
                  )}
                  {checkedIn && ticket.checked_in_at && (
                    <div className="flex items-center gap-2 text-green-700 text-xs">
                      <Clock size={13} />
                      Checked in {new Date(ticket.checked_in_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {eventPath && (
                  <Link
                    to={eventPath}
                    className="block w-full text-center bg-white border border-navy-200 hover:bg-navy-50 text-navy-700 font-medium py-2.5 rounded-xl transition-colors text-sm"
                  >
                    View event details
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
