import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Card, FormField, LoadingButton } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

const defaultAccountForm = {
  alias: '',
  bankCode: '',
  bankName: '',
  accountNumber: '',
  accountName: '',
  currency: 'ZMW',
  isDefault: true,
};

const defaultSettlementForm = {
  settlementAccountId: '',
  amount: '',
  narration: 'Collection settlement',
};

export default function PayoutsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [bankList, setBankList] = useState([]);
  const [settlementAccounts, setSettlementAccounts] = useState([]);
  const [settlements, setSettlements] = useState([]);

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [accountForm, setAccountForm] = useState(defaultAccountForm);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const [settlementForm, setSettlementForm] = useState(defaultSettlementForm);
  const [settling, setSettling] = useState(false);
  const [settleMessage, setSettleMessage] = useState('');

  const fetchAll = useCallback(async () => {
    setPageLoading(true);
    setPageError('');

    try {
      const [dashboardRes, banksRes, accountsRes, settlementsRes] = await Promise.all([
        fetch(`${API_BASE}/payments/lenco/dashboard`, { headers: getAdminAuthHeaders() }),
        fetch(`${API_BASE}/payments/lenco/banks`, { headers: getAdminAuthHeaders() }),
        fetch(`${API_BASE}/finance/settlement-accounts`, { headers: getAdminAuthHeaders() }),
        fetch(`${API_BASE}/finance/settlements`, { headers: getAdminAuthHeaders() }),
      ]);

      const [dashboardJson, banksJson, accountsJson, settlementsJson] = await Promise.all([
        dashboardRes.json().catch(() => ({})),
        banksRes.json().catch(() => ({})),
        accountsRes.json().catch(() => ({})),
        settlementsRes.json().catch(() => ({})),
      ]);

      if (!dashboardRes.ok || !dashboardJson?.ok) {
        throw new Error(dashboardJson?.message || dashboardJson?.error || 'Failed to load dashboard.');
      }
      if (!banksRes.ok || !banksJson?.ok) {
        throw new Error(banksJson?.message || banksJson?.error || 'Failed to load bank list.');
      }
      if (!accountsRes.ok || !accountsJson?.ok) {
        throw new Error(accountsJson?.message || accountsJson?.error || 'Failed to load settlement accounts.');
      }
      if (!settlementsRes.ok || !settlementsJson?.ok) {
        throw new Error(settlementsJson?.message || settlementsJson?.error || 'Failed to load settlements.');
      }

      const accounts = accountsJson?.data || [];
      setDashboard(dashboardJson?.data || null);
      setBankList(banksJson?.data || []);
      setSettlementAccounts(accounts);
      setSettlements(settlementsJson?.data || []);

      setSettlementForm((prev) => ({
        ...prev,
        settlementAccountId: prev.settlementAccountId || accounts[0]?.id || '',
      }));
    } catch (error) {
      setPageError(error?.message || 'Failed to load payouts data.');
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(() => {
      if (cancelled) {
        setPageLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [fetchAll]);

  const selectedBankName = useMemo(
    () => bankList.find((b) => b.code === accountForm.bankCode)?.name || '',
    [bankList, accountForm.bankCode],
  );

  const normalizedAccountNumber = accountForm.accountNumber.replace(/\s+/g, '');

  const lookupIsFresh = Boolean(
    lookupResult
    && lookupResult.bankCode === accountForm.bankCode
    && lookupResult.accountNumber === normalizedAccountNumber,
  );

  const canSaveSettlementAccount = Boolean(
    accountForm.alias.trim()
    && accountForm.bankCode
    && normalizedAccountNumber
    && accountForm.accountName.trim()
    && lookupIsFresh,
  );

  const accountChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === 'bankCode' || name === 'accountNumber') {
      setLookupResult(null);
      setLookupMessage('');
    }

    setAccountForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'bankCode'
        ? {
          bankName: bankList.find((b) => b.code === value)?.name || '',
          accountName: '',
        }
        : {}),
      ...(name === 'accountNumber' ? { accountName: '' } : {}),
    }));
  };

  const settlementChange = (e) => {
    const { name, value } = e.target;
    setSettlementForm((prev) => ({ ...prev, [name]: value }));
  };

  const lookupBankAccount = async () => {
    if (!accountForm.bankCode || !normalizedAccountNumber) {
      setLookupMessage('Select a bank and provide account number first.');
      return;
    }

    setLookupLoading(true);
    setLookupMessage('');

    try {
      const response = await fetch(`${API_BASE}/payments/lenco/bank-lookup`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          bankCode: accountForm.bankCode,
          accountNumber: normalizedAccountNumber,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'Bank lookup failed');
      }

      setAccountForm((prev) => ({
        ...prev,
        accountName: json?.data?.accountName || prev.accountName,
        bankName: json?.data?.bankName || selectedBankName,
        accountNumber: json?.data?.accountNumber || normalizedAccountNumber,
        alias: prev.alias || (json?.data?.accountName || '').slice(0, 40),
      }));

      setLookupResult({
        accountName: json?.data?.accountName || '',
        accountNumber: json?.data?.accountNumber || normalizedAccountNumber,
        bankCode: json?.data?.bankCode || accountForm.bankCode,
        bankName: json?.data?.bankName || selectedBankName,
      });

      setLookupMessage(`Lookup successful: ${json?.data?.accountName || 'Account verified'}`);
    } catch (error) {
      setLookupResult(null);
      setLookupMessage(error?.message || 'Unable to verify bank account.');
    } finally {
      setLookupLoading(false);
    }
  };

  const saveSettlementAccount = async (e) => {
    e.preventDefault();
    setSavingAccount(true);
    setLookupMessage('');

    try {
      if (!accountForm.accountName.trim()) {
        throw new Error('Please run bank lookup before saving this account.');
      }

      const payload = {
        ...accountForm,
        bankName: accountForm.bankName || selectedBankName,
      };

      const response = await fetch(`${API_BASE}/finance/settlement-accounts`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'Failed to save settlement account.');
      }

      setAccountForm(defaultAccountForm);
  setLookupResult(null);
      await fetchAll();
      setLookupMessage('Settlement account added successfully.');
    } catch (error) {
      setLookupMessage(error?.message || 'Failed to save settlement account.');
    } finally {
      setSavingAccount(false);
    }
  };

  const initiateSettlement = async (e) => {
    e.preventDefault();
    setSettling(true);
    setSettleMessage('');

    try {
      const payload = {
        settlementAccountId: settlementForm.settlementAccountId,
        amount: Number(settlementForm.amount || 0),
        narration: settlementForm.narration,
      };

      const response = await fetch(`${API_BASE}/finance/settlements`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'Settlement request failed.');
      }

      setSettleMessage('Settlement initiated successfully.');
      setSettlementForm((prev) => ({ ...prev, amount: '' }));
      await fetchAll();
    } catch (error) {
      setSettleMessage(error?.message || 'Unable to initiate settlement.');
      await fetchAll();
    } finally {
      setSettling(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Payouts"
        subtitle="Settle collections to your verified bank account"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Finance' }, { label: 'Payouts' }]}
      />

      {pageError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="Available for Settlement" subtitle="Current Lenco wallet balance">
          {pageLoading ? (
            <p className="text-sm text-navy-400">Loading balance...</p>
          ) : (
            <div>
              <p className="text-3xl font-bold text-navy-900">
                {formatMoney(dashboard?.balances?.available, dashboard?.currency)}
              </p>
              <p className="text-xs text-navy-500 mt-1">
                Ledger: {formatMoney(dashboard?.balances?.ledger, dashboard?.currency)} • Mode: {dashboard?.mode || '—'}
              </p>
            </div>
          )}
        </Card>

        <Card title="Settlement Accounts" subtitle={`${settlementAccounts.length} saved account(s)`}>
          {settlementAccounts.length === 0 ? (
            <p className="text-sm text-navy-400">No settlement account added yet.</p>
          ) : (
            <div className="space-y-2">
              {settlementAccounts.slice(0, 4).map((acc) => (
                <div key={acc.id} className="rounded-xl border border-navy-100 px-3 py-2">
                  <p className="text-sm font-medium text-navy-800">{acc.alias} {acc.is_default ? <span className="text-xs text-cyan-600">(Default)</span> : null}</p>
                  <p className="text-xs text-navy-500">{acc.bank_name} • {acc.account_number} • {acc.account_name}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid xl:grid-cols-2 gap-6 mb-6">
        <Card title="Add Settlement Account" subtitle="Bank lookup is required before saving">
          <form onSubmit={saveSettlementAccount} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Alias" name="alias" value={accountForm.alias} onChange={accountChange} placeholder="Main settlement account" required />
              <FormField
                label="Bank"
                name="bankCode"
                type="select"
                value={accountForm.bankCode}
                onChange={accountChange}
                required
                options={[{ value: '', label: bankList.length ? 'Select bank' : 'No banks available' }, ...bankList.map((b) => ({ value: b.code, label: `${b.name} (${b.code})` }))]}
              />

              <div>
                <label htmlFor="accountNumber" className="block text-sm font-medium text-navy-700 mb-1.5">
                  Account Number <span className="text-red-400">*</span>
                </label>
                <input
                  id="accountNumber"
                  name="accountNumber"
                  value={accountForm.accountNumber}
                  onChange={accountChange}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-navy-900 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="Enter account number"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-navy-400">Select bank + account number, then lookup.</p>
                  <LoadingButton
                    type="button"
                    onClick={lookupBankAccount}
                    loading={lookupLoading}
                    loadingLabel="Looking up..."
                    disabled={savingAccount}
                    className="border border-cyan-200 text-cyan-700 hover:bg-cyan-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Lookup
                  </LoadingButton>
                </div>
              </div>

              <FormField label="Currency" name="currency" value={accountForm.currency} onChange={accountChange} required />
            </div>

            <FormField
              label="Account Owner"
              name="accountName"
              value={accountForm.accountName}
              onChange={accountChange}
              placeholder="Auto-filled after successful lookup"
              disabled
              required
            />

            {lookupResult && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <p className="font-medium">Verified Account Details</p>
                <p className="mt-1">Owner: <span className="font-semibold">{lookupResult.accountName}</span></p>
                <p>Bank: {lookupResult.bankName || selectedBankName} ({lookupResult.bankCode})</p>
                <p>Account: {lookupResult.accountNumber}</p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-navy-700">
              <input
                type="checkbox"
                name="isDefault"
                checked={Boolean(accountForm.isDefault)}
                onChange={accountChange}
                className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
              />
              Set as default settlement account
            </label>

            {lookupMessage && (
              <div className={`rounded-xl border px-3 py-2 text-sm ${lookupMessage.toLowerCase().includes('success') ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {lookupMessage}
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <LoadingButton
                type="button"
                onClick={lookupBankAccount}
                loading={lookupLoading}
                loadingLabel="Looking up..."
                disabled={savingAccount}
                className="border border-cyan-200 text-cyan-700 hover:bg-cyan-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                Bank Lookup
              </LoadingButton>
              <LoadingButton
                type="submit"
                loading={savingAccount}
                loadingLabel="Saving..."
                disabled={lookupLoading || !canSaveSettlementAccount}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                Save Settlement Account
              </LoadingButton>
            </div>
          </form>
        </Card>

        <Card title="Settle Collections" subtitle="Transfer funds to selected settlement account">
          <form onSubmit={initiateSettlement} className="space-y-4">
            <FormField
              label="Settlement Account"
              name="settlementAccountId"
              type="select"
              value={settlementForm.settlementAccountId}
              onChange={settlementChange}
              required
              options={[
                { value: '', label: settlementAccounts.length ? 'Select account' : 'No accounts available' },
                ...settlementAccounts.map((acc) => ({ value: acc.id, label: `${acc.alias} • ${acc.bank_name} • ${acc.account_number}` })),
              ]}
            />
            <FormField label="Amount" name="amount" type="number" value={settlementForm.amount} onChange={settlementChange} required helpText={`Available: ${formatMoney(dashboard?.balances?.available, dashboard?.currency)}`} />
            <FormField label="Narration" name="narration" value={settlementForm.narration} onChange={settlementChange} />

            {settleMessage && (
              <div className={`rounded-xl border px-3 py-2 text-sm ${settleMessage.toLowerCase().includes('success') ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {settleMessage}
              </div>
            )}

            <LoadingButton
              type="submit"
              loading={settling}
              loadingLabel="Processing settlement..."
              disabled={!settlementAccounts.length}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              Settle Collection
            </LoadingButton>
          </form>
        </Card>
      </div>

      <Card title="Recent Settlements" subtitle="Latest payout attempts and statuses">
        {settlements.length === 0 ? (
          <p className="text-sm text-navy-400">No settlements yet.</p>
        ) : (
          <div className="rounded-xl border border-navy-100 overflow-hidden">
            <div className="grid grid-cols-6 gap-3 px-4 py-2.5 bg-navy-50 text-[11px] uppercase tracking-wide font-semibold text-navy-500">
              <span>Reference</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Account</span>
              <span>Narration</span>
              <span>Date</span>
            </div>
            {settlements.slice(0, 12).map((row) => (
              <div key={row.id} className="grid grid-cols-6 gap-3 px-4 py-3 border-t border-navy-50 text-sm">
                <span className="text-navy-700 truncate">{row.reference}</span>
                <span className="text-navy-700 font-medium">{formatMoney(row.amount, row.currency)}</span>
                <span><StatusPill status={row.status} /></span>
                <span className="text-navy-600 truncate">{row.settlement_account_alias || row.settlement_account_id}</span>
                <span className="text-navy-500 truncate">{row.narration || '—'}</span>
                <span className="text-xs text-navy-500">{formatDate(row.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusPill({ status }) {
  const normalized = String(status || 'pending').toLowerCase();
  const style = normalized === 'successful'
    ? 'bg-green-50 text-green-700 border-green-200'
    : normalized === 'pending'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200';

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
