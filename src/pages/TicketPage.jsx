import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Calendar, MapPin } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import TicketDocument from '../../shared/TicketDocument.jsx';
import TicketSessionsPanel from '../components/TicketSessionsPanel';
import GuestTicketJoinPanel from '../components/GuestTicketJoinPanel';
import GuestTicketForumPanel from '../components/GuestTicketForumPanel';
import GuestCertificatePanel from '../components/GuestCertificatePanel';
import { RECEIPT_LIGHT_FILL } from '../../shared/receiptTheme.js';

const API_BASE = getApiBase();

function formatEventSchedule(event = {}) {
  const parts = [];
  if (event.start_date) {
    parts.push(new Date(String(event.start_date).split('T')[0]).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }));
  }
  if (event.start_time) {
    const time = String(event.start_time).slice(0, 5);
    parts.push(time);
  }
  return parts.join(' · ');
}

export default function TicketPage() {
  const { code } = useParams();
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [portal, setPortal] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const ref = encodeURIComponent(code || '');
        const [ticketRes, portalRes] = await Promise.all([
          fetch(`${API_BASE}/tickets/${ref}`),
          fetch(`${API_BASE}/tickets/${ref}/portal`),
        ]);
        const ticketJson = await ticketRes.json().catch(() => ({}));
        const portalJson = await portalRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!ticketRes.ok || !ticketJson?.ok) {
          setError(ticketJson?.message || 'Ticket not found.');
          setTicket(null);
          setPortal(null);
          return;
        }
        setTicket(ticketJson.data);
        setPortal(portalRes.ok && portalJson?.ok ? portalJson.data : null);
      } catch {
        if (!cancelled) {
          setError('Unable to load ticket. Please try again.');
          setTicket(null);
          setPortal(null);
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
  const eventInfo = portal?.event || {};
  const canJoin = Boolean(portal?.can_join ?? ticket?.can_join);
  const canForum = Boolean(portal?.can_access_forum ?? ticket?.can_access_forum);

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
                {portal?.attendance?.join_count > 0 && (
                  <p className="mt-1 text-xs opacity-90">
                    Joined live {portal.attendance.join_count} time(s)
                  </p>
                )}
              </div>
            </div>

            {viewModel && valid && (
              <TicketDocument viewModel={viewModel} outerPadding />
            )}

            {(eventInfo.title || eventInfo.description) && (
              <div className="rounded-xl border border-navy-100 bg-white p-4 max-w-md mx-auto space-y-2">
                <h3 className="text-sm font-semibold text-navy-900">Event details</h3>
                {eventInfo.title && (
                  <p className="text-sm font-medium text-navy-800">{eventInfo.title}</p>
                )}
                {formatEventSchedule(eventInfo) && (
                  <p className="text-xs text-navy-600 flex items-center gap-1.5">
                    <Calendar size={14} />
                    {formatEventSchedule(eventInfo)}
                  </p>
                )}
                {eventInfo.location && (
                  <p className="text-xs text-navy-600 flex items-center gap-1.5">
                    <MapPin size={14} />
                    {eventInfo.location}
                  </p>
                )}
                {eventInfo.description && (
                  <p className="text-xs text-navy-600 leading-relaxed">{eventInfo.description}</p>
                )}
              </div>
            )}

            <GuestTicketJoinPanel
              referenceCode={code}
              canJoin={canJoin}
              joinWindow={portal?.join_window}
            />

            <TicketSessionsPanel
              eventId={ticket.event_id}
              registrationId={ticket.registration_id}
              referenceCode={code}
              valid={valid}
              sessions={portal?.sessions}
            />

            <GuestTicketForumPanel referenceCode={code} enabled={canForum} />

            <GuestCertificatePanel
              referenceCode={code}
              certificate={portal?.certificate}
            />

            {eventPath && (
              <div className="text-center pt-2">
                <Link
                  to={eventPath}
                  className="inline-block text-sm font-medium text-navy-600 hover:text-cyan-700 underline underline-offset-2"
                >
                  View full event page
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
