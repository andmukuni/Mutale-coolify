import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Clock,
  CalendarDays,
  Download,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, FormField, AdminStatCard, DataTable, StatusBadge, Spinner } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import {
  fetchAdminCertificates,
  fetchAdminCertificateStats,
  openCertificatePdf,
  resendCertificateEmail,
} from '../../utils/certificateApi';

export default function CertificatesListPage() {
  const { events } = useData();
  const toast = useToast();
  const [certificates, setCertificates] = useState([]);
  const [stats, setStats] = useState({ total: 0, emailed: 0, pendingEmail: 0, eventsCovered: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [emailFilter, setEmailFilter] = useState('all');
  const [resendingId, setResendingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, statData] = await Promise.all([
        fetchAdminCertificates({
          q: query.trim() || undefined,
          event_id: eventFilter !== 'all' ? eventFilter : undefined,
          email_status: emailFilter !== 'all' ? emailFilter : undefined,
        }),
        fetchAdminCertificateStats(),
      ]);
      setCertificates(rows);
      setStats(statData);
    } catch (err) {
      setError(err?.message || 'Failed to load certificates.');
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  }, [query, eventFilter, emailFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const eventOptions = useMemo(() => [
    { value: 'all', label: 'All events' },
    ...events.map((e) => ({ value: e.id, label: e.title })),
  ], [events]);

  const handleDownload = async (cert) => {
    try {
      await openCertificatePdf(
        cert,
        getAdminAuthHeaders(),
        `Certificate-${cert.certificate_code}.pdf`,
      );
    } catch (err) {
      toast.error(err?.message || 'Download failed.');
    }
  };

  const handleResend = async (cert) => {
    setResendingId(cert.id);
    try {
      await resendCertificateEmail(cert.id);
      toast.success('Certificate email sent.');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Failed to resend email.');
    } finally {
      setResendingId('');
    }
  };

  const columns = [
    {
      key: 'certificate_code',
      label: 'Code',
      render: (val) => <span className="font-mono text-xs text-navy-700">{val}</span>,
    },
    {
      key: 'event_title',
      label: 'Event',
      render: (val, row) => (
        <Link to={`/admin/events/${row.event_id}`} className="font-medium text-navy-800 hover:text-cyan-700">
          {val}
        </Link>
      ),
    },
    {
      key: 'attendee_name',
      label: 'Attendee',
      render: (val, row) => (
        <div>
          <Link to={`/admin/users/${row.user_id}`} className="font-medium text-navy-800 hover:text-cyan-700">
            {val}
          </Link>
          {row.attendee_email && (
            <p className="text-xs text-navy-400 mt-0.5">{row.attendee_email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'issued_at',
      label: 'Issued',
      render: (val) => (
        <span className="text-xs text-navy-500">
          {val ? formatDate(String(val).split('T')[0]) : '—'}
        </span>
      ),
    },
    {
      key: 'email_status',
      label: 'Email',
      render: (val) => <StatusBadge status={val || 'pending'} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_val, row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { void handleDownload(row); }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100"
          >
            <Download size={13} />
            PDF
          </button>
          <button
            type="button"
            onClick={() => { void handleResend(row); }}
            disabled={resendingId === row.id}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-navy-600 bg-navy-50 hover:bg-navy-100 disabled:opacity-50"
          >
            {resendingId === row.id ? <Spinner size={12} /> : <Send size={13} />}
            Resend
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Certificates"
        subtitle="Attendance certificates issued after events end"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Certificates' },
        ]}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <AdminStatCard label="Total Issued" value={stats.total} icon={Award} color="cyan" loading={loading} />
        <AdminStatCard label="Emailed" value={stats.emailed} icon={CheckCircle2} color="green" loading={loading} />
        <AdminStatCard label="Pending Email" value={stats.pendingEmail} icon={Clock} color="amber" loading={loading} />
        <AdminStatCard label="Events Covered" value={stats.eventsCovered} icon={CalendarDays} color="blue" loading={loading} />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card
        title="All Certificates"
        subtitle={loading ? 'Loading…' : `${certificates.length} certificate(s)`}
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="lg:col-span-2">
            <FormField
              label="Search"
              name="cert-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code, name, email, or event…"
            />
          </div>
          <FormField
            label="Event"
            name="cert-event-filter"
            type="select"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            options={eventOptions}
          />
          <FormField
            label="Email status"
            name="cert-email-filter"
            type="select"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'sent', label: 'Sent' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
              { value: 'skipped', label: 'Skipped' },
            ]}
          />
        </div>

        <DataTable
          columns={columns}
          data={certificates}
          loading={loading}
          emptyTitle="No certificates yet"
          emptyDescription="Certificates are issued automatically for attended registrations after events end."
        />
      </Card>
    </div>
  );
}
