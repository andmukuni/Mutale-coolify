import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Receipt,
  Eye,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { PageHeader, Card, FormField, AdminStatCard } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import ReceiptPreviewModal from '../../components/admin/ReceiptPreviewModal';

const API_BASE = getApiBase();
const PAID_STATUSES = ['paid', 'not_required', 'waived'];

export default function PaymentsHistoryPage() {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewReg, setPreviewReg] = useState(null);

  // Filters
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/registrations`, {
          headers: getAdminAuthHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || json?.error || `Failed to load payments (${res.status})`);
        }
        if (!cancelled) setRegistrations(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Unable to load payment history.');
          setRegistrations([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // KPI computations
  const kpis = useMemo(() => {
    const totalRevenue = registrations.reduce((sum, r) => {
      if (PAID_STATUSES.includes(String(r.payment_status || '').toLowerCase())) {
        return sum + Number(r.amount_zmw ?? r.amount ?? 0);
      }
      return sum;
    }, 0);
    const successful = registrations.filter(r => PAID_STATUSES.includes(String(r.payment_status || '').toLowerCase())).length;
    const pending = registrations.filter(r => ['pending', 'unpaid'].includes(String(r.payment_status || '').toLowerCase())).length;
    const failed = registrations.filter(r => String(r.payment_status || '').toLowerCase() === 'failed').length;
    return { totalRevenue, successful, pending, failed };
  }, [registrations]);

  // Filtered rows
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toTime = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;

    return registrations.filter((r) => {
      const status = String(r.payment_status || '').toLowerCase();
      const method = String(r.payment_method || '').toLowerCase();

      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (methodFilter !== 'all' && method !== methodFilter) return false;

      if (fromTime || toTime) {
        const regTime = new Date(r.registered_at || r.created_at || 0).getTime();
        if (fromTime && regTime < fromTime) return false;
        if (toTime && regTime > toTime) return false;
      }

      if (!term) return true;
      const hay = [r.user_name, r.user_email, r.event_title, r.reference_code, r.payment_reference, r.booked_for_name]
        .map(v => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(term);
    });
  }, [registrations, query, statusFilter, methodFilter, dateFrom, dateTo]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setStatusFilter('all');
    setMethodFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  return (
    <div>
      <PageHeader
        title="Payments History"
        subtitle="All payments across all users — search, filter, and view receipts"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'System' },
          { label: 'Payments History' },
        ]}
      />

      {/* KPI grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <AdminStatCard
          label="Total Revenue (ZMW)"
          value={`K ${kpis.totalRevenue.toFixed(2)}`}
          icon={TrendingUp}
          color="cyan"
          subtitle="Sum of successful payments"
        />
        <AdminStatCard
          label="Successful Payments"
          value={kpis.successful}
          icon={CheckCircle2}
          color="green"
          subtitle="Paid, complimentary, or waived"
        />
        <AdminStatCard
          label="Pending / Unpaid"
          value={kpis.pending}
          icon={Clock}
          color="amber"
          subtitle="Awaiting payment confirmation"
        />
        <AdminStatCard
          label="Failed"
          value={kpis.failed}
          icon={XCircle}
          color="red"
          subtitle="Payments that did not complete"
        />
      </div>

      {/* Filter card */}
      <Card
        title="All Payments"
        subtitle={loading ? 'Loading…' : `${filtered.length} of ${registrations.length} payment(s)`}
        actions={
          (query || statusFilter !== 'all' || methodFilter !== 'all' || dateFrom || dateTo) && (
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-cyan-600 hover:text-cyan-700"
            >
              Clear filters
            </button>
          )
        }
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <div className="lg:col-span-2">
            <FormField
              label="Search"
              name="payment-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="User, email, event, or reference…"
            />
          </div>
          <FormField
            label="Status"
            name="payment-status-filter"
            type="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all',          label: 'All statuses' },
              { value: 'paid',         label: 'Paid' },
              { value: 'not_required', label: 'Complimentary' },
              { value: 'waived',       label: 'Waived' },
              { value: 'pending',      label: 'Pending' },
              { value: 'unpaid',       label: 'Unpaid' },
              { value: 'failed',       label: 'Failed' },
            ]}
          />
          <FormField
            label="Method"
            name="payment-method-filter"
            type="select"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            options={[
              { value: 'all',           label: 'All methods' },
              { value: 'mobile_money',  label: 'Mobile Money' },
              { value: 'card',          label: 'Card' },
              { value: 'free',          label: 'Free' },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <FormField
              label="From"
              name="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <FormField
              label="To"
              name="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-navy-50 mb-3">
              <Receipt size={20} className="text-navy-300" />
            </div>
            <p className="text-sm font-medium text-navy-700">No payments match these filters</p>
            <p className="text-xs text-navy-400 mt-1">Try adjusting your search or clearing filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-50 text-[11px] uppercase tracking-wide font-semibold text-navy-500">
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Event</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Amount</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Method</th>
                  <th className="text-left px-4 py-3">Reference</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {filtered.map((r) => {
                  const isPaid = PAID_STATUSES.includes(String(r.payment_status || '').toLowerCase());
                  const amount = Number(r.amount_zmw ?? r.amount ?? 0);
                  return (
                    <tr key={r.id} className="hover:bg-navy-50/40 transition-colors">
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium text-navy-800 truncate">{r.user_name || '—'}</p>
                        <p className="text-[11px] text-navy-400 truncate">{r.user_email || '—'}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-navy-700 line-clamp-2 leading-snug">{r.event_title || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-navy-500 whitespace-nowrap text-xs">
                        {formatDate((r.registered_at || '').split('T')[0])}
                      </td>
                      <td className="px-4 py-3 font-semibold text-navy-800 whitespace-nowrap">
                        {amount > 0 ? `K ${amount.toFixed(2)}` : <span className="text-green-600 font-medium">Free</span>}
                      </td>
                      <td className="px-4 py-3 text-navy-600 capitalize whitespace-nowrap text-xs">
                        {r.payment_method ? String(r.payment_method).replace(/_/g, ' ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-navy-600 truncate max-w-[140px]">
                        {r.reference_code || r.payment_reference || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={r.payment_status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setPreviewReg(r)}
                          disabled={!isPaid}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 hover:border-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          title={isPaid ? 'View receipt' : 'Receipt only available for paid registrations'}
                        >
                          <Eye size={12} />
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {previewReg && (
        <ReceiptPreviewModal
          registration={previewReg}
          onClose={() => setPreviewReg(null)}
        />
      )}
    </div>
  );
}

function PaymentStatusBadge({ status = '' }) {
  const s = String(status).toLowerCase();
  const map = {
    paid:         { label: 'Paid',          cls: 'bg-green-50 text-green-700 border-green-200' },
    not_required: { label: 'Complimentary', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    waived:       { label: 'Waived',        cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    unpaid:       { label: 'Unpaid',        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    pending:      { label: 'Pending',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    failed:       { label: 'Failed',        cls: 'bg-red-50 text-red-700 border-red-200' },
  };
  const { label, cls } = map[s] || { label: status || '—', cls: 'bg-navy-50 text-navy-600 border-navy-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="animate-pulse h-12 bg-navy-50 rounded-lg" />
      ))}
    </div>
  );
}
