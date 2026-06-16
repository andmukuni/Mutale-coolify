import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Card, FormField } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

export default function TransactionLedgerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ledgerData, setLedgerData] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/payments/lenco/dashboard`, {
          headers: getAdminAuthHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || json?.error || `Failed to load ledger (${res.status})`);
        }
        if (!cancelled) setLedgerData(json.data || null);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Unable to load transaction ledger.');
          setLedgerData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const transactions = useMemo(() => {
    const rows = ledgerData?.collections || [];
    const term = query.trim().toLowerCase();

    return rows.filter((row) => {
      const statusMatch = statusFilter === 'all' || String(row.status || '').toLowerCase() === statusFilter;
      if (!statusMatch) return false;
      if (!term) return true;

      const hay = [row.reference, row.customer, row.channel, row.id]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(term);
    });
  }, [ledgerData, query, statusFilter]);

  return (
    <div>
      <PageHeader
        title="Transaction Ledger"
        subtitle="Search and review internally stored payment transactions"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Finance' }, { label: 'Transaction Ledger' }]}
      />

      <Card
        title="Ledger"
        subtitle={`${transactions.length} transaction(s)`}
        actions={<Link to="/admin/settings" className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">Payment settings →</Link>}
      >
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <FormField
            label="Search"
            name="ledger-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Reference, customer, channel"
          />
          <FormField
            label="Status"
            name="status-filter"
            type="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'successful', label: 'Successful' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
          <div className="rounded-xl border border-navy-100 px-4 py-3 bg-navy-50/60">
            <p className="text-xs uppercase tracking-wide text-navy-400">Currency</p>
            <p className="text-sm font-semibold text-navy-800 mt-1">{ledgerData?.currency || 'ZMW'}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-navy-400">Loading transactions...</p>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-navy-400">No matching transactions found.</p>
        ) : (
          <div className="rounded-xl border border-navy-100 overflow-hidden">
            <div className="grid grid-cols-6 gap-3 px-4 py-2.5 bg-navy-50 text-[11px] uppercase tracking-wide font-semibold text-navy-500">
              <span>Reference</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Channel</span>
              <span>Customer</span>
              <span>Date</span>
            </div>
            {transactions.map((tx) => (
              <div key={tx.id || tx.reference} className="grid grid-cols-6 gap-3 px-4 py-3 border-t border-navy-50 text-sm">
                <span className="text-navy-700 truncate">{tx.reference || '—'}</span>
                <span className="text-navy-700 font-medium">{formatMoney(tx.amount, tx.currency || ledgerData?.currency)}</span>
                <span><StatusPill status={tx.status} /></span>
                <span className="capitalize text-navy-600 truncate">{String(tx.channel || 'unknown').replace(/_/g, ' ')}</span>
                <span className="text-navy-600 truncate">{tx.customer || '—'}</span>
                <span className="text-xs text-navy-500">{tx.createdAt ? formatDate(tx.createdAt) : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusPill({ status }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const style = normalized === 'successful'
    ? 'bg-green-50 text-green-700 border-green-200'
    : normalized === 'pending'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : normalized === 'failed'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-navy-50 text-navy-600 border-navy-200';

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${style}`}>
      {normalized}
    </span>
  );
}

function formatMoney(value, currency = 'ZMW') {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return `0 ${currency}`;

  try {
    return new Intl.NumberFormat('en-ZM', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
