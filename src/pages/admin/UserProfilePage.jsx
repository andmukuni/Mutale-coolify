import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Link as LinkIcon,
  ExternalLink,
  Ticket,
  CalendarDays,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Download,
  Send,
  Printer,
  Shield,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { useData } from '../../context/DataContext';
import { Card, PageHeader, StatusBadge, Spinner } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { isEventPast } from '../../utils/eventServices';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { useToast } from '../../context/ToastContext';
import {
  fetchAdminUserCertificates,
  openCertificatePdf,
  resendCertificateEmail,
} from '../../utils/certificateApi';

const API_BASE = getApiBase();

export default function UserProfilePage() {
  const { id } = useParams();
  const { events } = useData();
  const { getUserRegistrations } = useBooking();

  const toast = useToast();
  const { hasPermission } = useAuth();
  const [user, setUser] = useState(null);
  const [allRoles, setAllRoles] = useState([]);
  const [assignedRoleIds, setAssignedRoleIds] = useState([]);
  const [rolesSaving, setRolesSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [certificates, setCertificates] = useState([]);
  const [certsLoading, setCertsLoading] = useState(true);
  const [resendingId, setResendingId] = useState('');

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('mm_admin_token') || '';
        const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.message || json.error || 'User not found.');
        }
        if (!cancelled) {
          setUser(json.data || null);
          const ids = (json.data?.admin_roles || []).map((r) => r.id);
          setAssignedRoleIds(ids);
        }
      } catch (e) {
        if (!cancelled) {
          setUser(null);
          setError(e?.message || 'Failed to load user.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!hasPermission('users.manage') && !hasPermission('rbac.manage')) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/rbac/roles`, { headers: getAdminAuthHeaders() });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && json?.ok) {
          setAllRoles(Array.isArray(json.data) ? json.data : []);
        }
      } catch {
        if (!cancelled) setAllRoles([]);
      }
    })();
    return () => { cancelled = true; };
  }, [hasPermission]);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    (async () => {
      setCertsLoading(true);
      try {
        const rows = await fetchAdminUserCertificates(id);
        if (!cancelled) setCertificates(rows);
      } catch {
        if (!cancelled) setCertificates([]);
      } finally {
        if (!cancelled) setCertsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>Loading user…</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>{error || 'User not found.'}</p>
        <Link to="/admin/users" className="text-cyan-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Users
        </Link>
      </div>
    );
  }

  const registrations = getUserRegistrations(user.id || '');
  const activeRegs = registrations.filter((r) => r.status !== 'cancelled');
  const cancelledRegs = registrations.filter((r) => r.status === 'cancelled');
  const attendedRegs = registrations.filter((r) => r.status === 'attended');
  const upcomingRegs = activeRegs.filter((r) => {
    const event = events.find((e) => e.id === r.event_id);
    return event && !isEventPast(event);
  });

  const engagementRate = activeRegs.length > 0
    ? Math.round((attendedRegs.length / activeRegs.length) * 100)
    : 0;

  const enrichedHistory = registrations
    .map((r) => ({
      ...r,
      event: events.find((e) => e.id === r.event_id) || null,
    }))
    .sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());

  const handleCertDownload = async (cert) => {
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

  const handleSaveAdminRoles = async () => {
    if (!id) return;
    setRolesSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/rbac/users/${encodeURIComponent(id)}/roles`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ role_ids: assignedRoleIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to save roles');
      toast.success('Admin roles updated. User should sign in again to refresh permissions.');
      setUser((prev) => (prev ? { ...prev, admin_roles: json.data?.roles || [], admin_permissions: json.data?.permissions || [] } : prev));
    } catch (err) {
      toast.error(err?.message || 'Could not save roles.');
    } finally {
      setRolesSaving(false);
    }
  };

  const handleCertResend = async (cert) => {
    setResendingId(cert.id);
    try {
      await resendCertificateEmail(cert.id);
      toast.success('Certificate email sent.');
    } catch (err) {
      toast.error(err?.message || 'Failed to resend email.');
    } finally {
      setResendingId('');
    }
  };

  return (
    <div>
      <PageHeader
        title={user.name || 'User Profile'}
        subtitle="CV & portfolio"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Users', to: '/admin/users' },
          { label: 'CV' },
        ]}
        actions={(
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700 px-4 py-2 rounded-xl transition-colors print:hidden"
            >
              <Printer size={15} />
              Print CV
            </button>
            <Link
              to="/admin/users"
              className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700 px-4 py-2 rounded-xl transition-colors print:hidden"
            >
              <ArrowLeft size={15} />
              Back to Users
            </Link>
          </div>
        )}
      />

      {(hasPermission('users.manage') || hasPermission('rbac.manage')) && allRoles.length > 0 && (
        <Card className="mb-6" title="Admin access roles" subtitle="RBAC roles for the admin dashboard">
          <div className="flex flex-wrap gap-3 mb-4">
            {allRoles.map((role) => (
              <label
                key={role.id}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-navy-200 text-sm cursor-pointer hover:bg-navy-50"
              >
                <input
                  type="checkbox"
                  checked={assignedRoleIds.includes(role.id)}
                  onChange={() => {
                    setAssignedRoleIds((prev) => (
                      prev.includes(role.id)
                        ? prev.filter((rid) => rid !== role.id)
                        : [...prev, role.id]
                    ));
                  }}
                />
                <Shield size={14} className="text-cyan-600" />
                {role.name}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSaveAdminRoles}
            disabled={rolesSaving}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-500 disabled:opacity-60"
          >
            {rolesSaving ? 'Saving…' : 'Save admin roles'}
          </button>
          {user.admin_permissions?.length > 0 && (
            <p className="text-xs text-navy-500 mt-3">
              Effective permissions: {user.admin_permissions.length} keys
            </p>
          )}
        </Card>
      )}

      <div id="admin-user-cv" className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2" title="User Portfolio" subtitle="CV profile — profession, about, and links">
          <div className="space-y-4 text-sm">
            <InfoRow icon={User} label="Full name" value={user.name} />
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={Phone} label="Phone" value={user.phone || 'Not provided'} />
            <InfoRow icon={Briefcase} label="What they do" value={user.profession || 'Not provided'} />
            <InfoRow icon={Building2} label="Organization" value={user.organization || 'Not provided'} />
            <InfoRow icon={CalendarDays} label="Joined" value={user.created_at ? formatDate(user.created_at.split('T')[0]) : '—'} />

            <div className="pt-2 border-t border-navy-100">
              <p className="text-xs text-navy-400 mb-1">About</p>
              <p className="text-sm text-navy-700 leading-relaxed">{user.about || 'No portfolio summary provided yet.'}</p>
            </div>

            <div className="pt-2 border-t border-navy-100">
              <p className="text-xs text-navy-400 mb-2">Specialties</p>
              <div className="flex flex-wrap gap-2">
                {(user.specialties || []).length > 0 ? (
                  user.specialties.map((item) => (
                    <span key={item} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-100">
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-navy-500">No specialties provided.</span>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-navy-100 grid sm:grid-cols-2 gap-3">
              {user.portfolio_url ? (
                <a
                  href={user.portfolio_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-cyan-700 hover:text-cyan-600"
                >
                  <LinkIcon size={14} />
                  View Portfolio
                </a>
              ) : (
                <p className="text-sm text-navy-500">Portfolio URL not set.</p>
              )}

              {user.linkedin_url ? (
                <a
                  href={user.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-cyan-700 hover:text-cyan-600"
                >
                  <ExternalLink size={14} />
                  View LinkedIn
                </a>
              ) : (
                <p className="text-sm text-navy-500">LinkedIn URL not set.</p>
              )}
            </div>
          </div>
        </Card>

        <Card title="Engagement" subtitle="Activity snapshot">
          <div className="space-y-3">
            <Metric label="Total registrations" value={registrations.length} icon={Ticket} />
            <Metric label="Upcoming" value={upcomingRegs.length} icon={CalendarDays} />
            <Metric label="Attended" value={attendedRegs.length} icon={CheckCircle} />
            <Metric label="Cancelled" value={cancelledRegs.length} icon={AlertCircle} />
            <Metric label="Engagement rate" value={`${engagementRate}%`} icon={CheckCircle} />
          </div>
        </Card>
      </div>

      <Card
        title="Certificates"
        subtitle={certsLoading ? 'Loading…' : `${certificates.length} issued certificate(s)`}
        className="mb-6"
      >
        {certsLoading ? (
          <p className="text-sm text-navy-400 text-center py-4">Loading certificates…</p>
        ) : certificates.length === 0 ? (
          <p className="text-sm text-navy-500 text-center py-4">
            No certificates yet. Issued automatically after attended events end.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-100">
                  {['Event', 'Code', 'Issued', 'Email', 'Actions'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider py-3 px-4 first:pl-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {certificates.map((cert) => (
                  <tr key={cert.id} className="hover:bg-navy-50/50 transition-colors">
                    <td className="py-3 px-4 first:pl-0 font-medium text-navy-800">{cert.event_title}</td>
                    <td className="py-3 px-4 font-mono text-xs text-cyan-700">{cert.certificate_code}</td>
                    <td className="py-3 px-4 text-navy-500 text-xs">
                      {cert.issued_at ? formatDate(String(cert.issued_at).split('T')[0]) : '—'}
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={cert.email_status || 'pending'} /></td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { void handleCertDownload(cert); }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100"
                        >
                          <Download size={12} />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleCertResend(cert); }}
                          disabled={resendingId === cert.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-navy-600 bg-navy-50 hover:bg-navy-100 disabled:opacity-50"
                        >
                          {resendingId === cert.id ? <Spinner size={12} /> : <Send size={12} />}
                          Resend
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Registration History" subtitle={`${enrichedHistory.length} total records`} className="print:break-before-page">
        {enrichedHistory.length === 0 ? (
          <p className="text-sm text-navy-400 text-center py-4">No engagement history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-100">
                  {['Event', 'Date', 'Reference', 'Status', 'Payment'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider py-3 px-4 first:pl-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {enrichedHistory.map((r) => (
                  <tr key={r.id} className="hover:bg-navy-50/50 transition-colors">
                    <td className="py-3 px-4 first:pl-0">
                      {r.event?.id ? (
                        <Link to={`/admin/events/${r.event.id}`} className="font-medium text-navy-900 hover:text-cyan-700 transition-colors">
                          {r.event_title}
                        </Link>
                      ) : (
                        <span className="font-medium text-navy-700">{r.event_title}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-navy-500 text-xs">
                      {r.event ? formatDate(r.event.start_date || r.event.date) : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-navy-600">{r.reference_code}</td>
                    <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                    <td className="py-3 px-4"><StatusBadge status={r.payment_status} /></td>
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

function InfoRow({ icon: Icon, label, value }) {
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

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center justify-between text-sm rounded-lg bg-navy-50 px-3 py-2">
      <span className="inline-flex items-center gap-2 text-navy-500">
        <Icon size={14} className="text-navy-400" />
        {label}
      </span>
      <span className="font-semibold text-navy-900">{value}</span>
    </div>
  );
}
