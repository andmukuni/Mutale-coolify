import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileUser, Eye, Download } from 'lucide-react';
import { PageHeader, Card, FormField, AdminStatCard } from '../../components/ui';
import CvPreviewModal from '../../components/admin/CvPreviewModal';
import { formatDate } from '../../utils/helpers';
import { formatCvDisplayId } from '../../../shared/cvDisplay.js';
import { fetchAdminCvList, fetchAdminCvDocument } from '../../utils/cvAdminApi.js';
import { openCvForPrint } from '../../utils/cvGenerator.js';

function UnlockBadge({ record }) {
  const hasPayment = Boolean(record.payment_reference);
  const status = String(record.payment_status || '').toLowerCase();
  if (!hasPayment) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-teal-50 text-teal-700 border-teal-200">
        Free download
      </span>
    );
  }
  const paid = ['successful', 'success', 'succeeded', 'completed', 'paid'].includes(status);
  const cls = paid
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';
  const label = paid ? 'Paid download' : (status || 'Payment');
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${cls}`}>
      {label}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="animate-pulse h-12 bg-navy-50 rounded-lg" />
      ))}
    </div>
  );
}

export default function CvsPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [unlockFilter, setUnlockFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [previewRecord, setPreviewRecord] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchAdminCvList();
        if (!cancelled) setRecords(data);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Unable to load CVs.');
          setRecords([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  const kpis = useMemo(() => {
    const paid = records.filter((r) => {
      const s = String(r.payment_status || '').toLowerCase();
      return r.payment_reference && ['successful', 'success', 'succeeded', 'completed', 'paid'].includes(s);
    });
    const free = records.filter((r) => !r.payment_reference).length;
    const revenue = paid.reduce((sum, r) => sum + Number(r.payment_amount || 0), 0);
    return { total: records.length, paid: paid.length, free, revenue };
  }, [records]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return records.filter((r) => {
      const hasPayment = Boolean(r.payment_reference);
      if (unlockFilter === 'paid' && !hasPayment) return false;
      if (unlockFilter === 'free' && hasPayment) return false;

      if (fromTime || toTime) {
        const t = new Date(r.unlocked_at || 0).getTime();
        if (fromTime && t < fromTime) return false;
        if (toTime && t > toTime) return false;
      }

      if (!term) return true;
      const hay = [
        r.user_name,
        r.user_email,
        r.user_phone,
        r.profession,
        r.payment_reference,
        formatCvDisplayId(r.id, r.unlocked_at),
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(term);
    });
  }, [records, query, unlockFilter, dateFrom, dateTo]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setUnlockFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  const openPreview = useCallback(async (record) => {
    setPreviewRecord(record);
    setPreviewDoc(null);
    setPreviewLoading(true);
    try {
      const doc = await fetchAdminCvDocument(record.id);
      setPreviewDoc(doc);
    } catch (err) {
      setError(err?.message || 'Could not load CV preview.');
      setPreviewRecord(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleDownload = useCallback(async (record) => {
    try {
      const doc = await fetchAdminCvDocument(record.id);
      openCvForPrint({
        user: doc.user,
        certificates: doc.certificates || [],
        developmentEvents: doc.developmentEvents || [],
      });
    } catch (err) {
      setError(err?.message || 'Could not open CV.');
    }
  }, []);

  return (
    <div>
      <PageHeader
        title="CVs"
        subtitle="Users who unlocked CV downloads — preview and print profile CVs"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'System' },
          { label: 'CVs' },
        ]}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <AdminStatCard
          label="Total CVs"
          value={kpis.total}
          icon={FileUser}
          color="cyan"
          subtitle="Download-enabled accounts"
        />
        <AdminStatCard
          label="Paid downloads"
          value={kpis.paid}
          icon={FileUser}
          color="green"
          subtitle="Completed CV payments"
        />
        <AdminStatCard
          label="Free downloads"
          value={kpis.free}
          icon={FileUser}
          color="navy"
          subtitle="No payment record"
        />
        <AdminStatCard
          label="Revenue (ZMW)"
          value={`K ${kpis.revenue.toFixed(2)}`}
          icon={FileUser}
          color="cyan"
          subtitle="From paid CV downloads"
        />
      </div>

      <Card
        title="Generated CVs"
        subtitle={loading ? 'Loading…' : `${filtered.length} of ${records.length} CV(s)`}
        actions={
          (query || unlockFilter !== 'all' || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-cyan-600 hover:text-cyan-700"
            >
              Clear filters
            </button>
          )
        }
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="lg:col-span-2">
            <FormField
              label="Search"
              name="cv-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, email, phone, CV ref, payment ref…"
            />
          </div>
          <FormField
            label="Download type"
            name="cv-unlock-filter"
            type="select"
            value={unlockFilter}
            onChange={(e) => setUnlockFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'paid', label: 'Paid' },
              { value: 'free', label: 'Free / waived' },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <FormField
              label="From"
              name="cv-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <FormField
              label="To"
              name="cv-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>
        )}

        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 && !error ? (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-navy-50 mb-3">
              <FileUser size={20} className="text-navy-300" />
            </div>
            <p className="text-sm font-medium text-navy-700">No CVs found</p>
            <p className="text-xs text-navy-400 mt-1">
              CVs appear when users pay for downloads (or get free downloads) on their profile.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-50 text-[11px] uppercase tracking-wide font-semibold text-navy-500">
                  <th className="text-left px-4 py-3">CV Ref</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Profession</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Unlocked</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Amount</th>
                  <th className="text-left px-4 py-3">Payment ref</th>
                  <th className="text-left px-4 py-3">Payment</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {filtered.map((r) => {
                  const cvRef = formatCvDisplayId(r.id, r.unlocked_at);
                  const amount = Number(r.payment_amount || 0);
                  return (
                    <tr key={r.id} className="hover:bg-navy-50/40 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-navy-800 whitespace-nowrap">
                        {cvRef}
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="font-medium text-navy-800 truncate">{r.user_name || '—'}</p>
                        <p className="text-[11px] text-navy-400 truncate">{r.user_email || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-navy-600 max-w-[160px] truncate">
                        {r.profession || '—'}
                      </td>
                      <td className="px-4 py-3 text-navy-500 whitespace-nowrap text-xs">
                        {formatDate((r.unlocked_at || '').split('T')[0])}
                      </td>
                      <td className="px-4 py-3 font-semibold text-navy-800 whitespace-nowrap">
                        {r.payment_reference && amount > 0
                          ? `K ${amount.toFixed(2)}`
                          : <span className="text-teal-700 font-medium">Free</span>}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-navy-600 truncate max-w-[140px]">
                        {r.payment_reference || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <UnlockBadge record={r} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void openPreview(r)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 transition-all"
                          >
                            <Eye size={12} />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownload(r)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-navy-700 border border-navy-200 hover:border-cyan-300 transition-all"
                            title="Print / save as PDF"
                          >
                            <Download size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {previewRecord && (
        <CvPreviewModal
          record={previewRecord}
          cvDocument={previewDoc}
          loading={previewLoading}
          onClose={() => {
            setPreviewRecord(null);
            setPreviewDoc(null);
          }}
        />
      )}
    </div>
  );
}
