import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Video, CheckCircle2 } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { useData } from '../../context/DataContext';
import { Card, PageHeader, StatusBadge } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { isEventPast } from '../../utils/eventServices';
import { fetchEventAttendee } from '../../utils/attendeesApi';
import {
  formatTableDisplay,
  getFieldValue,
  hasAttended,
  resolveAttendeeFields,
} from '../../../shared/registrationAttendeeFields.js';

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

export default function AttendeeProfilePage() {
  const { id, registrationId } = useParams();
  const { events } = useData();
  const { getUserRegistrations } = useBooking();
  const event = events.find((item) => item.id === id);

  const [registration, setRegistration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!id || !registrationId) return;
      setLoading(true);
      setError('');
      try {
        const json = await fetchEventAttendee(id, registrationId);
        if (cancelled) return;
        setRegistration(json.data || null);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Attendee record not found.');
        setRegistration(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [id, registrationId]);

  const fields = useMemo(() => resolveAttendeeFields(registration ? [registration] : []), [registration]);
  const formFields = fields.filter((field) => field.group === 'form');
  const adminFields = fields.filter((field) => field.group === 'admin');

  const userRegs = getUserRegistrations(registration?.user_id || '');
  const enrichedHistory = userRegs
    .map((row) => ({
      ...row,
      event: events.find((item) => item.id === row.event_id) || null,
    }))
    .sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at));

  const attendedCount = enrichedHistory.filter(hasAttended).length;
  const activeCount = enrichedHistory.filter((row) => row.status !== 'cancelled').length;
  const upcomingCount = enrichedHistory.filter((row) => row.status !== 'cancelled' && row.event && !isEventPast(row.event)).length;
  const titleField = fields.find((field) => field.id === 'attendee_name');
  const title = registration ? formatTableDisplay(getFieldValue(registration, titleField)) : 'Attendee';

  if (loading) {
    return <p className="text-center py-20 text-navy-400">Loading attendee…</p>;
  }

  if (!event || !registration) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>{error || 'Attendee record not found.'}</p>
        <Link to={`/admin/events/${id}/attendees`} className="text-cyan-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Attendees
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={title}
        subtitle="Attendee profile"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Events', to: '/admin/events' },
          { label: event.title, to: `/admin/events/${event.id}` },
          { label: 'Attendees', to: `/admin/events/${event.id}/attendees` },
          { label: 'Profile' },
        ]}
        actions={(
          <Link
            to={`/admin/events/${event.id}/attendees`}
            className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700 px-4 py-2 rounded-xl transition-colors"
          >
            <ArrowLeft size={15} />
            Back to Attendees
          </Link>
        )}
      />

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2" title="Registration answers" subtitle="Information entered for this ticket">
          <FieldGrid fields={formFields} row={registration} />
        </Card>
        <Card title="Attendance snapshot" subtitle="Across loaded subscriptions">
          <div className="space-y-4">
            <Metric label="Total subscriptions" value={enrichedHistory.length} />
            <Metric label="Active" value={activeCount} />
            <Metric label="Upcoming" value={upcomingCount} />
            <Metric label="Marked attended" value={attendedCount} />
          </div>
        </Card>
      </div>

      <Card className="mb-6" title="Administrative information" subtitle="System fields for this registration">
        <FieldGrid fields={adminFields} row={registration} />
      </Card>

      <Card
        className="mb-6"
        title="This event — Join activity"
        subtitle="Recorded when the attendee joins or is checked in"
      >
        {hasAttended(registration) || Number(registration.join_count || 0) > 0 ? (
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <InfoBlock icon={CheckCircle2} label="First joined" value={formatDateTime(registration.attended_at) || '—'} />
            <InfoBlock icon={Video} label="Last joined" value={formatDateTime(registration.last_joined_at) || formatDateTime(registration.attended_at) || '—'} />
            <InfoBlock icon={Video} label="Total joins" value={`${Number(registration.join_count || 0)}${registration.join_source ? ` · ${registration.join_source}` : ''}`} />
          </div>
        ) : (
          <p className="text-sm text-navy-400">This attendee has not joined this event yet.</p>
        )}
      </Card>

      <Card title="Registration history" subtitle={`${enrichedHistory.length} total records`}>
        {enrichedHistory.length === 0 ? (
          <p className="text-sm text-navy-400 text-center py-4">No other registration history is loaded for this booking contact.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-100">
                  {['Event', 'Date', 'Reference', 'Status', 'Payment', 'Attended'].map((heading) => (
                    <th key={heading} className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider py-3 px-4 first:pl-0">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {enrichedHistory.map((row) => (
                  <tr key={row.id} className="hover:bg-navy-50/50 transition-colors">
                    <td className="py-3 px-4 first:pl-0">
                      <Link to={`/admin/events/${row.event_id}`} className="font-medium text-navy-900 hover:text-cyan-700 transition-colors">
                        {row.event_title}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-navy-500 text-xs">{row.event ? formatDate(row.event.start_date || row.event.date) : '—'}</td>
                    <td className="py-3 px-4 font-mono text-xs text-navy-600">{row.reference_code}</td>
                    <td className="py-3 px-4"><StatusBadge status={row.status} /></td>
                    <td className="py-3 px-4"><StatusBadge status={row.payment_status} /></td>
                    <td className="py-3 px-4 text-xs">
                      {hasAttended(row) ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 size={12} />
                          {formatDateTime(row.attended_at) || 'Joined'}
                        </span>
                      ) : (
                        <span className="text-navy-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function FieldGrid({ fields, row }) {
  return (
    <dl className="grid sm:grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.id} className="rounded-xl border border-navy-100 px-3 py-2">
          <dt className="text-xs text-navy-400">
            {field.label}
            {field.labelUncertain ? ' — label inferred from stored key' : ''}
          </dt>
          <dd className="text-sm font-medium text-navy-800 mt-1 whitespace-pre-wrap break-words">
            {formatTableDisplay(getFieldValue(row, field))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function InfoBlock({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-navy-50 text-navy-500"><Icon size={14} /></div>
      <div>
        <p className="text-xs text-navy-400">{label}</p>
        <p className="text-sm font-medium text-navy-800 mt-0.5">{value || '—'}</p>
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
