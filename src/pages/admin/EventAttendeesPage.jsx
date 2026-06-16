import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users, Download, CheckCircle2, Video } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useBooking } from '../../context/BookingContext';
import { PageHeader, Card } from '../../components/ui';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { formatDate } from '../../utils/helpers';

function formatJoinTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function hasAttended(reg) {
  return Boolean(reg?.attended_at) || String(reg?.status || '').toLowerCase() === 'attended';
}

export default function EventAttendeesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { events } = useData();
  const { getEventRegistrations } = useBooking();

  const event = events.find(e => e.id === id);
  const registrations = getEventRegistrations(id);
  const active = registrations.filter(r => r.status !== 'cancelled');
  const attendedRegs = active.filter(hasAttended);

  if (!event) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>Event not found.</p>
        <Link to="/admin/events" className="text-cyan-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Events
        </Link>
      </div>
    );
  }

  const handleExport = () => {
    const rows = [
      ['Name', 'Email', 'Booked for', 'Relation', 'Reference', 'Type', 'Status', 'Payment', 'Registered At', 'First Joined', 'Last Joined', 'Join Count'],
      ...registrations.map(r => [
        r.user_name,
        r.user_email,
        r.booked_for_name || '',
        r.booked_for_relation || '',
        r.reference_code,
        r.registration_type,
        r.status,
        r.payment_status,
        formatDate((r.registered_at || '').split('T')[0]),
        r.attended_at ? new Date(r.attended_at).toISOString() : '',
        r.last_joined_at ? new Date(r.last_joined_at).toISOString() : '',
        Number(r.join_count || 0),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendees-${event.slug || event.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalActive = active.length;
  const totalAttended = attendedRegs.length;
  const attendanceRate = totalActive > 0 ? Math.round((totalAttended / totalActive) * 100) : 0;

  return (
    <div>
      <PageHeader
        title={`Attendees — ${event.title}`}
        subtitle={`${totalActive} confirmed / ${registrations.length} total registrations`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Events', to: '/admin/events' },
          { label: 'Attendees' },
        ]}
        actions={
          registrations.length > 0 && (
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700 px-4 py-2 rounded-xl transition-colors"
            >
              <Download size={15} />
              Export CSV
            </button>
          )
        }
      />

      {/* Quick stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile
          icon={Users}
          label="Registered"
          value={totalActive}
          tone="navy"
        />
        <StatTile
          icon={CheckCircle2}
          label="Attended"
          value={totalAttended}
          tone="emerald"
        />
        <StatTile
          icon={Video}
          label="Attendance"
          value={`${attendanceRate}%`}
          tone="cyan"
        />
        <StatTile
          icon={Users}
          label="Cancelled"
          value={registrations.length - totalActive}
          tone="rose"
        />
      </div>

      <Card>
        {registrations.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No registrations yet"
            description="Attendees will appear here once people register for this event."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-100">
                  {['Payer', 'Email', 'Booked for', 'Reference', 'Status', 'Payment', 'Attended', 'Joins', 'Registered'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider py-3 px-4 first:pl-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {registrations.map(reg => {
                  const attended = hasAttended(reg);
                  const firstJoin = formatJoinTimestamp(reg.attended_at);
                  const lastJoin = formatJoinTimestamp(reg.last_joined_at);
                  return (
                    <tr
                      key={reg.id}
                      onClick={() => navigate(`/admin/events/${id}/attendees/${reg.id}`)}
                      className="hover:bg-navy-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 first:pl-0 font-medium text-navy-900">{reg.user_name}</td>
                      <td className="py-3 px-4 text-navy-500">{reg.user_email}</td>
                      <td className="py-3 px-4 text-navy-700 text-xs max-w-[140px]">
                        {reg.booked_for_name
                          ? (
                            <>
                              {reg.booked_for_name}
                              {reg.booked_for_relation ? ` (${reg.booked_for_relation})` : ''}
                            </>
                            )
                          : <span className="text-navy-400">Self</span>}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-navy-600">{reg.reference_code}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={reg.status} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={reg.payment_status} />
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {attended ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 size={12} />
                              {firstJoin || 'Joined'}
                            </span>
                            {lastJoin && lastJoin !== firstJoin && (
                              <span className="text-navy-400">Last: {lastJoin}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-navy-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-navy-600 font-medium tabular-nums">
                        {Number(reg.join_count || 0)}
                      </td>
                      <td className="py-3 px-4 text-navy-400 text-xs">
                        {reg.registered_at ? formatDate(reg.registered_at.split('T')[0]) : '—'}
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

function StatTile({ icon: Icon, label, value, tone = 'navy' }) {
  const tones = {
    navy: 'bg-white border-navy-100 text-navy-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
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
