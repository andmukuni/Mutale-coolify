import { useEffect, useMemo, useState, useCallback } from 'react';
import { Receipt, Eye, FileText } from 'lucide-react';
import { PageHeader, Card, FormField, AdminStatCard } from '../../components/ui';
import ReceiptPreviewModal from '../../components/admin/ReceiptPreviewModal';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import {
  formatReceiptDisplayNumber,
  getReceiptSubjectTitle,
  resolveReceiptType,
} from '../../utils/receiptGenerator';

const API_BASE = getApiBase();

function PaymentStatusBadge({ status = '' }) {
  const s = String(status).toLowerCase();
  const map = {
    paid: { label: 'Paid', cls: 'bg-green-50 text-green-700 border-green-200' },
    not_required: { label: 'Complimentary', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    waived: { label: 'Waived', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
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
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="animate-pulse h-12 bg-navy-50 rounded-lg" />
      ))}
    </div>
  );
}

function ReceiptKindBadge({ record }) {
  const kind = resolveReceiptType(record);
  const cls = kind === 'cv'
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : kind === 'product'
      ? 'bg-purple-50 text-purple-700 border-purple-200'
      : 'bg-cyan-50 text-cyan-700 border-cyan-200';
  const label = kind === 'cv' ? 'CV' : kind === 'product' ? 'Product' : 'Event';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewReg, setPreviewReg] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const headers = getAdminAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/receipts`, { headers });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || json?.error || 'Failed to load receipts.');
        }
        if (!cancelled) {
          setReceipts(Array.isArray(json.data) ? json.data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Unable to load receipts.');
          setReceipts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const kpis = useMemo(() => {
    const totalAmount = receipts.reduce(
      (sum, r) => sum + Number(r.amount_zmw ?? r.amount ?? 0),
      0,
    );
    const paidCount = receipts.filter((r) => String(r.payment_status).toLowerCase() === 'paid').length;
    const eventCount = receipts.filter((r) => resolveReceiptType(r) === 'event').length;
    const productCount = receipts.length - eventCount;
    return { total: receipts.length, totalAmount, paidCount, eventCount, productCount };
  }, [receipts]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return receipts.filter((r) => {
      const status = String(r.payment_status || '').toLowerCase();
      if (statusFilter !== 'all' && status !== statusFilter) return false;

      const kind = resolveReceiptType(r);
      if (kindFilter !== 'all' && kind !== kindFilter) return false;

      if (fromTime || toTime) {
        const regTime = new Date(r.registered_at || r.created_at || 0).getTime();
        if (fromTime && regTime < fromTime) return false;
        if (toTime && regTime > toTime) return false;
      }

      if (!term) return true;
      const hay = [
        r.user_name,
        r.user_email,
        getReceiptSubjectTitle(r),
        r.reference_code,
        r.payment_reference,
        formatReceiptDisplayNumber(r),
        kind,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(term);
    });
  }, [receipts, query, statusFilter, kindFilter, dateFrom, dateTo]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setStatusFilter('all');
    setKindFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  return (
    <div>
      <PageHeader
        title="Receipts"
        subtitle="Event and shop receipts — search, preview, and download PDFs from the preview"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'System' },
          { label: 'Receipts' },
        ]}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <AdminStatCard
          label="Total Receipts"
          value={kpis.total}
          icon={Receipt}
          color="cyan"
          subtitle="Paid, complimentary, and waived"
        />
        <AdminStatCard
          label="Event Receipts"
          value={kpis.eventCount}
          icon={FileText}
          color="cyan"
          subtitle="Paid event registrations"
        />
        <AdminStatCard
          label="Product Receipts"
          value={kpis.productCount}
          icon={FileText}
          color="green"
          subtitle="Paid shop orders"
        />
        <AdminStatCard
          label="Total (ZMW)"
          value={`K ${kpis.totalAmount.toFixed(2)}`}
          icon={Receipt}
          color="navy"
          subtitle="Sum of receipt amounts"
        />
      </div>

      <Card
        title="All Receipts"
        subtitle={loading ? 'Loading…' : `${filtered.length} of ${receipts.length} receipt(s)`}
        actions={
          (query || statusFilter !== 'all' || kindFilter !== 'all' || dateFrom || dateTo) && (
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <div className="lg:col-span-2">
            <FormField
              label="Search"
              name="receipt-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="User, email, item, reference, receipt no…"
            />
          </div>
          <FormField
            label="Kind"
            name="receipt-kind-filter"
            type="select"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'event', label: 'Event' },
              { value: 'product', label: 'Product' },
              { value: 'cv', label: 'CV' },
            ]}
          />
          <FormField
            label="Payment"
            name="receipt-status-filter"
            type="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'paid', label: 'Paid' },
              { value: 'not_required', label: 'Complimentary' },
              { value: 'waived', label: 'Waived' },
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
            <p className="text-sm font-medium text-navy-700">No receipts found</p>
            <p className="text-xs text-navy-400 mt-1">
              Receipts appear for paid events and paid shop orders (or complimentary / waived).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-50 text-[11px] uppercase tracking-wide font-semibold text-navy-500">
                  <th className="text-left px-4 py-3">Receipt No.</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Item</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Amount</th>
                  <th className="text-left px-4 py-3">Reference</th>
                  <th className="text-left px-4 py-3">Kind</th>
                  <th className="text-left px-4 py-3">Payment</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {filtered.map((r) => {
                  const amount = Number(r.amount_zmw ?? r.amount ?? 0);
                  const receiptNo = formatReceiptDisplayNumber(r);
                  return (
                    <tr key={r.id} className="hover:bg-navy-50/40 transition-colors">
                      <td className="px-4 py-3 text-xs text-navy-800 whitespace-nowrap">
                        {receiptNo}
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="font-medium text-navy-800 truncate">{r.user_name || '—'}</p>
                        <p className="text-[11px] text-navy-400 truncate">{r.user_email || '—'}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-navy-700 line-clamp-2 leading-snug">{getReceiptSubjectTitle(r)}</p>
                      </td>
                      <td className="px-4 py-3 text-navy-500 whitespace-nowrap text-xs">
                        {formatDate((r.registered_at || '').split('T')[0])}
                      </td>
                      <td className="px-4 py-3 font-semibold text-navy-800 whitespace-nowrap">
                        {amount > 0 ? `K ${amount.toFixed(2)}` : <span className="text-green-600 font-medium">Free</span>}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-navy-600 truncate max-w-[140px]">
                        {r.reference_code || r.payment_reference || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ReceiptKindBadge record={r} />
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={r.payment_status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPreviewReg(r)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 transition-all"
                        >
                          <Eye size={12} />
                          View
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
