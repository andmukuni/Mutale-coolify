import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ticket,
  Download,
  QrCode,
  ExternalLink,
  Search,
  CheckCircle2,
  Users,
  Eye,
} from 'lucide-react';
import StatusBadge from '../../ui/StatusBadge';
import { LoadingButton } from '../../ui';
import { formatDate, formatTime } from '../../../utils/helpers';
import { getAppOrigin } from '../../../utils/apiBase';
import { useToast } from '../../../context/ToastContext';
import { downloadTicketPdfFromServer } from '../../../utils/ticketPdfDownload.js';
import { downloadTicketQrPng } from '../../../../shared/ticketDocument.js';
import TicketPreviewModal from '../TicketPreviewModal.jsx';

function hasCheckedIn(reg) {
  return Boolean(reg?.attended_at) || String(reg?.status || '').toLowerCase() === 'attended';
}

function isPaidTicket(reg) {
  const pay = String(reg?.payment_status || '').toLowerCase();
  return ['paid', 'not_required', 'waived'].includes(pay);
}

function formatAmount(reg) {
  const amount = Number(reg?.amount_zmw ?? reg?.amount ?? 0);
  const currency = String(reg?.currency || 'ZMW').toUpperCase();
  if (amount <= 0) return 'Free';
  return `${currency} ${amount.toFixed(2)}`;
}

export default function EventTicketsPanel({ event, registrations = [] }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [busyRef, setBusyRef] = useState('');
  const [previewReg, setPreviewReg] = useState(null);

  const soldTickets = useMemo(() => (
    registrations
      .filter((reg) => String(reg.status || '').toLowerCase() !== 'cancelled')
      .sort((a, b) => new Date(b.registered_at || b.created_at || 0) - new Date(a.registered_at || a.created_at || 0))
  ), [registrations]);

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return soldTickets;
    return soldTickets.filter((reg) => {
      const hay = [
        reg.reference_code,
        reg.user_name,
        reg.user_email,
        reg.booked_for_name,
        reg.booked_for_email,
        reg.booked_for_phone,
        reg.payment_reference,
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [query, soldTickets]);

  const paidCount = soldTickets.filter(isPaidTicket).length;
  const checkedInCount = soldTickets.filter(hasCheckedIn).length;
  const revenueZmw = soldTickets.reduce((sum, reg) => {
    if (!isPaidTicket(reg)) return sum;
    return sum + Number(reg.amount_zmw ?? reg.amount ?? 0);
  }, 0);

  const handleDownloadTicket = async (reg) => {
    const ref = String(reg.reference_code || '').trim();
    if (!ref) return;
    setBusyRef(`${ref}-pdf`);
    try {
      await downloadTicketPdfFromServer(reg);
      toast.success('Ticket PDF downloaded.');
    } catch (error) {
      toast.error(error?.message || 'Could not download ticket.');
    } finally {
      setBusyRef('');
    }
  };

  const handleDownloadQr = async (reg) => {
    const ref = String(reg.reference_code || '').trim();
    if (!ref) return;
    setBusyRef(`${ref}-qr`);
    try {
      await downloadTicketQrPng(ref, getAppOrigin());
      toast.success('QR code downloaded.');
    } catch (error) {
      toast.error(error?.message || 'Could not download QR code.');
    } finally {
      setBusyRef('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={Ticket} label="Tickets sold" value={soldTickets.length} tone="cyan" />
        <StatTile icon={CheckCircle2} label="Paid / confirmed" value={paidCount} tone="emerald" />
        <StatTile icon={Users} label="Checked in" value={checkedInCount} tone="navy" />
        <StatTile icon={Ticket} label="Revenue (ZMW)" value={revenueZmw.toFixed(2)} tone="indigo" />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or reference…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-navy-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
          />
        </div>
        <Link
          to={`/admin/events/${event.id}/check-in`}
          className="inline-flex items-center justify-center gap-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl transition-colors shrink-0"
        >
          <QrCode size={15} />
          Gate check-in
        </Link>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="text-center py-10 text-sm text-navy-500">
          {soldTickets.length === 0
            ? 'No tickets sold yet. Sales appear here after registrations are completed.'
            : 'No tickets match your search.'}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-navy-100">
                {['Reference', 'Attendee', 'Purchased by', 'Amount', 'Payment', 'Check-in', 'Sold', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider py-3 px-3 first:pl-0 last:pr-0"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {filteredTickets.map((reg) => {
                const attendee = String(reg.booked_for_name || '').trim() || String(reg.user_name || '').trim() || '—';
                const ref = String(reg.reference_code || '').trim();
                const checkedIn = hasCheckedIn(reg);
                const pdfBusy = busyRef === `${ref}-pdf`;
                const qrBusy = busyRef === `${ref}-qr`;

                return (
                  <tr key={reg.id || ref} className="hover:bg-navy-50/40">
                    <td className="py-3 px-3 first:pl-0 font-mono text-xs text-navy-700">{ref || '—'}</td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-navy-900">{attendee}</p>
                      {reg.booked_for_email && (
                        <p className="text-xs text-navy-500">{reg.booked_for_email}</p>
                      )}
                      {reg.booked_for_phone && (
                        <p className="text-xs text-navy-400">{reg.booked_for_phone}</p>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <p className="text-navy-800">{reg.user_name || '—'}</p>
                      <p className="text-xs text-navy-500">{reg.user_email || ''}</p>
                    </td>
                    <td className="py-3 px-3 text-navy-700 whitespace-nowrap">{formatAmount(reg)}</td>
                    <td className="py-3 px-3">
                      <StatusBadge status={reg.payment_status} />
                    </td>
                    <td className="py-3 px-3">
                      {checkedIn ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 size={12} />
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-navy-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-navy-500 whitespace-nowrap">
                      {reg.registered_at ? formatDate(String(reg.registered_at).split('T')[0]) : '—'}
                    </td>
                    <td className="py-3 px-3 last:pr-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <LoadingButton
                          type="button"
                          loading={false}
                          loadingLabel=""
                          onClick={() => setPreviewReg(reg)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700"
                          title="Preview ticket"
                          aria-label="Preview ticket"
                        >
                          <Eye size={15} />
                        </LoadingButton>
                        <LoadingButton
                          type="button"
                          loading={pdfBusy}
                          loadingLabel=""
                          onClick={() => { void handleDownloadTicket(reg); }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700"
                          title="Download ticket PDF"
                          aria-label="Download ticket PDF"
                        >
                          <Download size={15} />
                        </LoadingButton>
                        <LoadingButton
                          type="button"
                          loading={qrBusy}
                          loadingLabel=""
                          onClick={() => { void handleDownloadQr(reg); }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700"
                          title="Download QR PNG"
                          aria-label="Download QR PNG"
                        >
                          <QrCode size={15} />
                        </LoadingButton>
                        {ref && (
                          <a
                            href={`/tickets/${encodeURIComponent(ref)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-cyan-700 hover:bg-cyan-50 border border-transparent hover:border-cyan-200"
                            title="Open ticket page"
                            aria-label="Open ticket page"
                          >
                            <ExternalLink size={15} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {event && (
        <p className="text-xs text-navy-500">
          Event: {event.title}
          {(event.start_date || event.date) && (
            <> · {formatDate(event.start_date || event.date)}</>
          )}
          {event.start_time && <> · {formatTime(event.start_time)}</>}
        </p>
      )}

      {previewReg && (
        <TicketPreviewModal
          registration={previewReg}
          event={event}
          onClose={() => setPreviewReg(null)}
        />
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone = 'navy' }) {
  const tones = {
    navy: 'bg-white border-navy-100 text-navy-700',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  };
  return (
    <div className={`rounded-xl border ${tones[tone]} p-4`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-80 mb-1.5">
        <Icon size={13} />
        {label}
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
