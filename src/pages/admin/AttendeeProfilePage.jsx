import { Link, useParams } from 'react-router-dom';
import { Mail, User, BadgeCheck, CalendarDays, Clock3, Ticket, ArrowLeft, Video, CheckCircle2 } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { useData } from '../../context/DataContext';
import { Card, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { isEventPast } from '../../utils/eventServices';

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function hasAttended(reg) {
  return Boolean(reg?.attended_at) || String(reg?.status || '').toLowerCase() === 'attended';
}

export default function AttendeeProfilePage() {
  const { id, registrationId } = useParams();
  const { events } = useData();
  const { getEventRegistrations, getUserRegistrations } = useBooking();

  const event = events.find((e) => e.id === id);
  const eventRegs = getEventRegistrations(id || '');
  const registration = eventRegs.find((r) => r.id === registrationId);

  if (!event || !registration) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>Attendee record not found.</p>
        <Link to={`/admin/events/${id}/attendees`} className="text-cyan-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Attendees
        </Link>
      </div>
    );
  }

  const userRegs = getUserRegistrations(registration.user_id || '');
  const enrichedHistory = userRegs
    .map((r) => ({
      ...r,
      event: events.find((e) => e.id === r.event_id) || null,
    }))
    .sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at));

  const attendedCount = enrichedHistory.filter(hasAttended).length;
  const activeCount = enrichedHistory.filter((r) => r.status !== 'cancelled').length;
  const upcomingCount = enrichedHistory.filter((r) => r.status !== 'cancelled' && r.event && !isEventPast(r.event)).length;

  const firstJoinedAt = formatDateTime(registration.attended_at);
  const lastJoinedAt = formatDateTime(registration.last_joined_at);
  const joinCount = Number(registration.join_count || 0);

  return (
    <div>
      <PageHeader
        title={registration.user_name}
        subtitle="Attendee Profile"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Events', to: '/admin/events' },
          { label: event.title, to: `/admin/events/${event.id}` },
          { label: 'Attendees', to: `/admin/events/${event.id}/attendees` },
          { label: 'Profile' },
        ]}
        actions={
          <Link
            to={`/admin/events/${event.id}/attendees`}
            className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700 px-4 py-2 rounded-xl transition-colors"
          >
            <ArrowLeft size={15} />
            Back to Attendees
          </Link>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2" title="Subscriber Details" subtitle="Contact and latest registration">
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <InfoRow icon={User} label="Full name" value={registration.user_name} />
            <InfoRow icon={Mail} label="Email" value={registration.user_email} />
            {registration.booked_for_name ? (
              <InfoRow
                icon={User}
                label="Ticket for"
                value={`${registration.booked_for_name}${registration.booked_for_relation ? ` (${registration.booked_for_relation})` : ''}`}
              />
            ) : null}
            <InfoRow icon={Ticket} label="Reference" value={registration.reference_code} mono />
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-navy-50 text-navy-500"><BadgeCheck size={14} /></div>
              <div>
                <p className="text-xs text-navy-400">Status</p>
                <div className="mt-1"><StatusBadge status={registration.status} /></div>
              </div>
            </div>
            <InfoRow
              icon={CalendarDays}
              label="Registered"
              value={formatDate((registration.registered_at || '').split('T')[0])}
            />
            <InfoRow icon={Clock3} label="Payment" value={registration.payment_status?.replace('_', ' ')} />
          </div>
        </Card>

        <Card title="Attendance Snapshot" subtitle="Across all subscriptions">
          <div className="space-y-4">
            <Metric label="Total subscriptions" value={enrichedHistory.length} />
            <Metric label="Active" value={activeCount} />
            <Metric label="Upcoming" value={upcomingCount} />
            <Metric label="Marked attended" value={attendedCount} />
          </div>
        </Card>
      </div>

      <Card
        className="mb-6"
        title="This event — Join activity"
        subtitle="Recorded when the attendee clicks 'Join Meeting Now'"
      >
        {hasAttended(registration) || joinCount > 0 ? (
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <InfoRow
              icon={CheckCircle2}
              label="First joined"
              value={firstJoinedAt || '—'}
            />
            <InfoRow
              icon={Clock3}
              label="Last joined"
              value={lastJoinedAt || firstJoinedAt || '—'}
            />
            <InfoRow
              icon={Video}
              label="Total joins"
              value={`${joinCount}${registration.join_source ? ` · ${registration.join_source}` : ''}`}
            />
          </div>
        ) : (
          <p className="text-sm text-navy-400">
            This attendee has not joined this event yet.
          </p>
        )}
      </Card>

      <Card title="Registration History" subtitle={`${enrichedHistory.length} total records`}>
        {enrichedHistory.length === 0 ? (
          <p className="text-sm text-navy-400 text-center py-4">No registration history found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-100">
                  {['Event', 'Date', 'Reference', 'Status', 'Payment', 'Attended'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider py-3 px-4 first:pl-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {enrichedHistory.map((r) => {
                  const rowAttended = hasAttended(r);
                  const rowFirstJoin = formatDateTime(r.attended_at);
                  return (
                    <tr key={r.id} className="hover:bg-navy-50/50 transition-colors">
                      <td className="py-3 px-4 first:pl-0">
                        <Link to={`/admin/events/${r.event_id}`} className="font-medium text-navy-900 hover:text-cyan-700 transition-colors">
                          {r.event_title}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-navy-500 text-xs">{r.event ? formatDate(r.event.start_date || r.event.date) : '—'}</td>
                      <td className="py-3 px-4 font-mono text-xs text-navy-600">{r.reference_code}</td>
                      <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                      <td className="py-3 px-4"><StatusBadge status={r.payment_status} /></td>
                      <td className="py-3 px-4 text-xs">
                        {rowAttended ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 size={12} />
                            {rowFirstJoin || 'Joined'}
                          </span>
                        ) : (
                          <span className="text-navy-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-navy-50 text-navy-500"><Icon size={14} /></div>
      <div>
        <p className="text-xs text-navy-400">{label}</p>
        <p className={`text-sm font-medium text-navy-800 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-navy-500">{label}</span>
      <span className="font-semibold text-navy-900">{value}</span>
    </div>
  );
}
