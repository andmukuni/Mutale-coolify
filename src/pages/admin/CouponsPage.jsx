import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Percent, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, StatusBadge, LoadingButton, Spinner } from '../../components/ui';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { formatDate } from '../../utils/helpers';
import { getEventDisplayStatus } from '../../utils/eventServices';

const API_BASE = getApiBase();

const emptyForm = {
  event_id: '',
  code: '',
  label: '',
  discount_type: 'percent',
  discount_value: '',
  max_redemptions: '',
  max_per_user: '1',
  valid_from: '',
  valid_until: '',
};

function formatDiscount(coupon) {
  const value = Number(coupon.discount_value || 0);
  return coupon.discount_type === 'fixed' ? `ZMW ${value.toFixed(2)}` : `${value}%`;
}

function normalizeCouponPayload(form) {
  const payload = {
    code: form.code.trim(),
    label: form.label.trim() || undefined,
    discount_type: form.discount_type,
    discount_value: Number(form.discount_value),
    max_per_user: Number(form.max_per_user || 1),
  };

  if (form.max_redemptions.trim()) payload.max_redemptions = Number(form.max_redemptions);
  if (form.valid_from.trim()) payload.valid_from = form.valid_from.trim();
  if (form.valid_until.trim()) payload.valid_until = form.valid_until.trim();

  return payload;
}

export default function CouponsPage() {
  const { events } = useData();
  const toast = useToast();
  const [couponsByEvent, setCouponsByEvent] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);

  const paidEvents = useMemo(
    () => events.filter((event) => !event.is_free && Number(event.price || 0) > 0),
    [events],
  );

  const eventById = useMemo(() => {
    const map = new Map();
    events.forEach((event) => map.set(String(event.id), event));
    return map;
  }, [events]);

  const coupons = useMemo(() => (
    Object.entries(couponsByEvent).flatMap(([eventId, rows]) => (
      (rows || []).map((coupon) => ({ ...coupon, event_id: eventId }))
    ))
  ), [couponsByEvent]);

  const activeCount = coupons.filter((coupon) => coupon.active).length;
  const redemptionsCount = coupons.reduce((sum, coupon) => sum + Number(coupon.redemptions_count || 0), 0);

  const loadCoupons = async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        paidEvents.map(async (event) => {
          const response = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(event.id)}/coupons`, {
            headers: getAdminAuthHeaders(),
          });
          const json = await response.json().catch(() => ({}));
          if (!response.ok || !json?.ok) {
            throw new Error(json?.message || `Failed to load coupons for ${event.title}`);
          }
          return [String(event.id), Array.isArray(json.data) ? json.data : []];
        }),
      );
      setCouponsByEvent(Object.fromEntries(results));
    } catch (err) {
      setCouponsByEvent({});
      setError(err?.message || 'Failed to load coupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (paidEvents.length === 0) {
      setCouponsByEvent({});
      setLoading(false);
      return;
    }

    void loadCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidEvents.map((event) => event.id).join('|')]);

  useEffect(() => {
    if (!form.event_id && paidEvents[0]?.id) {
      setForm((prev) => ({ ...prev, event_id: paidEvents[0].id }));
    }
  }, [form.event_id, paidEvents]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.event_id) return;

    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(form.event_id)}/coupons`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(normalizeCouponPayload(form)),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Could not create coupon.');
      }

      setForm((prev) => ({
        ...emptyForm,
        event_id: prev.event_id,
        discount_type: 'percent',
        max_per_user: '1',
      }));
      await loadCoupons();
      toast.success('Coupon created.');
    } catch (err) {
      setError(err?.message || 'Failed to create coupon.');
      toast.error(err?.message || 'Failed to create coupon.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (coupon) => {
    setError('');
    try {
      const response = await fetch(
        `${API_BASE}/admin/events/${encodeURIComponent(coupon.event_id)}/coupons/${encodeURIComponent(coupon.id)}`,
        {
          method: 'PATCH',
          headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ active: !coupon.active }),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Could not update coupon.');
      }
      await loadCoupons();
      toast.success(coupon.active ? 'Coupon disabled.' : 'Coupon enabled.');
    } catch (err) {
      setError(err?.message || 'Failed to update coupon.');
      toast.error(err?.message || 'Failed to update coupon.');
    }
  };

  const handleDelete = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;

    setError('');
    try {
      const response = await fetch(
        `${API_BASE}/admin/events/${encodeURIComponent(coupon.event_id)}/coupons/${encodeURIComponent(coupon.id)}`,
        {
          method: 'DELETE',
          headers: getAdminAuthHeaders(),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Could not delete coupon.');
      }
      await loadCoupons();
      toast.success(`Coupon ${coupon.code} deleted.`);
    } catch (err) {
      setError(err?.message || 'Failed to delete coupon.');
      toast.error(err?.message || 'Failed to delete coupon.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Coupon Management"
        subtitle={`${coupons.length} total coupons`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Coupon Management' },
        ]}
        actions={(
          <button
            type="button"
            onClick={loadCoupons}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-white border border-navy-200 hover:border-cyan-400 text-navy-700 hover:text-cyan-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner size={15} /> : <RefreshCw size={15} />}
            Refresh
          </button>
        )}
      />

      {error && (
        <div className="mb-5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-xs text-navy-400">Total coupons</p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{coupons.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-navy-400">Active coupons</p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{activeCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-navy-400">Redemptions</p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{redemptionsCount}</p>
        </Card>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <Card
          title="Coupons"
          subtitle="Active and archived discount codes"
          actions={<Percent size={16} className="text-navy-400" />}
        >
          {loading ? (
            <p className="text-sm text-navy-500">Loading coupons...</p>
          ) : coupons.length === 0 ? (
            <p className="text-sm text-navy-500">No coupons yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-navy-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy-50 text-left border-b border-navy-100">
                    <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Code</th>
                    <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Event</th>
                    <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Discount</th>
                    <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Uses</th>
                    <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Validity</th>
                    <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase w-[96px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {coupons.map((coupon) => {
                    const event = eventById.get(String(coupon.event_id));
                    return (
                      <tr key={coupon.id} className="bg-white hover:bg-navy-50/50">
                        <td className="py-2.5 px-3">
                          <p className="font-mono font-semibold text-navy-900">{coupon.code}</p>
                          {coupon.label && <p className="text-xs text-navy-400 mt-0.5">{coupon.label}</p>}
                        </td>
                        <td className="py-2.5 px-3 min-w-[220px]">
                          {event ? (
                            <Link to={`/admin/events/${event.id}`} className="font-medium text-navy-800 hover:text-cyan-700">
                              {event.title}
                            </Link>
                          ) : (
                            <span className="text-navy-500">Unknown event</span>
                          )}
                          {event && (
                            <div className="mt-1 flex items-center gap-2">
                              <StatusBadge status={getEventDisplayStatus(event)} />
                              <span className="text-xs text-navy-400">{formatDate(event.start_date || event.date)}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-navy-700 font-medium">{formatDiscount(coupon)}</td>
                        <td className="py-2.5 px-3 text-navy-600 text-xs">
                          {coupon.redemptions_count}{coupon.max_redemptions != null ? ` / ${coupon.max_redemptions}` : ''}
                          <br />
                          max {coupon.max_per_user}/subscriber
                        </td>
                        <td className="py-2.5 px-3 text-navy-600 text-xs">
                          {coupon.valid_from ? formatDate(coupon.valid_from) : 'Any time'}
                          {' - '}
                          {coupon.valid_until ? formatDate(coupon.valid_until) : 'No end'}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => handleToggle(coupon)}
                            className={`text-xs font-medium px-2 py-1 rounded-lg capitalize ${coupon.active ? 'bg-green-100 text-green-800' : 'bg-navy-100 text-navy-600'}`}
                          >
                            {coupon.active ? 'active' : 'disabled'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(coupon)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-red-600 hover:bg-red-50"
                            aria-label={`Delete coupon ${coupon.code}`}
                          >
                            <Trash2 size={15} />
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

        <Card title="Create Coupon" subtitle="Add a discount code">
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-xs text-navy-600">
              Event
              <select
                required
                value={form.event_id}
                onChange={(e) => setForm((prev) => ({ ...prev, event_id: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
              >
                {paidEvents.length === 0 && <option value="">No paid events</option>}
                {paidEvents.map((event) => (
                  <option key={event.id} value={event.id}>{event.title}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-navy-600">
              Code
              <input
                required
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm font-mono uppercase"
                placeholder="EARLY2026"
                maxLength={64}
              />
            </label>

            <label className="block text-xs text-navy-600">
              Label
              <input
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                placeholder="Early bird"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-navy-600">
                Type
                <select
                  value={form.discount_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, discount_type: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">ZMW</option>
                </select>
              </label>
              <label className="block text-xs text-navy-600">
                Value
                <input
                  required
                  type="number"
                  min={form.discount_type === 'percent' ? '1' : '0'}
                  max={form.discount_type === 'percent' ? '100' : undefined}
                  step="0.01"
                  value={form.discount_value}
                  onChange={(e) => setForm((prev) => ({ ...prev, discount_value: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-navy-600">
                Total cap
                <input
                  type="number"
                  min="1"
                  value={form.max_redemptions}
                  onChange={(e) => setForm((prev) => ({ ...prev, max_redemptions: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                  placeholder="Unlimited"
                />
              </label>
              <label className="block text-xs text-navy-600">
                Per subscriber
                <input
                  type="number"
                  min="1"
                  value={form.max_per_user}
                  onChange={(e) => setForm((prev) => ({ ...prev, max_per_user: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-navy-600">
                Valid from
                <input
                  type="date"
                  value={form.valid_from}
                  onChange={(e) => setForm((prev) => ({ ...prev, valid_from: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                />
              </label>
              <label className="block text-xs text-navy-600">
                Valid until
                <input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm((prev) => ({ ...prev, valid_until: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                />
              </label>
            </div>

            <LoadingButton
              type="submit"
              loading={saving}
              loadingLabel="Saving..."
              icon={Plus}
              iconSize={15}
              spinnerSize={15}
              disabled={paidEvents.length === 0}
              className="w-full text-sm font-medium px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              Add Coupon
            </LoadingButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
