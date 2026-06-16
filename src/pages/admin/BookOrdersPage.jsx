import { useState, useEffect, useCallback } from 'react';
import { Package, ChevronDown, Truck, CheckCircle, Clock, XCircle } from 'lucide-react';
import { PageHeader, Card, StatusBadge, Spinner } from '../../components/ui';
import { useCurrency } from '../../context/CurrencyContext';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

const STATUS_OPTIONS = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

const statusMeta = {
  pending: { color: 'text-amber-600 bg-amber-50', icon: Clock },
  processing: { color: 'text-blue-600 bg-blue-50', icon: Package },
  shipped: { color: 'text-indigo-600 bg-indigo-50', icon: Truck },
  delivered: { color: 'text-green-600 bg-green-50', icon: CheckCircle },
  cancelled: { color: 'text-red-600 bg-red-50', icon: XCircle },
};

export default function BookOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const { formatEventPrice } = useCurrency();

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/books/orders`, {
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json();
      setOrders(json?.data || []);
    } catch { /* keep current */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      await fetch(`${API_BASE}/books/orders/${orderId}/status`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: newStatus }),
      });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch { /* silent */ }
    finally { setUpdatingId(null); }
  };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    revenue: orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total || 0), 0),
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Book Orders" subtitle={`${stats.total} order${stats.total !== 1 ? 's' : ''}`} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Pending', value: stats.pending, className: 'text-amber-600' },
          { label: 'Shipped', value: stats.shipped, className: 'text-indigo-600' },
          { label: 'Delivered', value: stats.delivered, className: 'text-green-600' },
          { label: 'Revenue', value: formatEventPrice({ price: stats.revenue, currency: 'ZMW' }), className: 'text-cyan-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-navy-100 p-4">
            <p className="text-xs text-navy-500">{s.label}</p>
            <p className={`text-lg font-bold mt-1 ${s.className}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="text-center py-12 text-navy-400 text-sm">Loading orders…</div>
      ) : orders.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Package size={36} className="text-navy-300 mx-auto mb-3" />
            <p className="text-sm text-navy-500">No orders yet.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const items = Array.isArray(order.items) ? order.items : [];
            const expanded = expandedId === order.id;
            const meta = statusMeta[order.status] || statusMeta.pending;
            const StatusIcon = meta.icon;

            return (
              <div key={order.id} className="bg-white rounded-xl border border-navy-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(prev => prev === order.id ? null : order.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-navy-50/50 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${meta.color}`}>
                    <StatusIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy-800 truncate">
                      {order.user_name || 'Guest'} — <span className="font-mono text-xs text-navy-500">{order.id}</span>
                    </p>
                    <p className="text-xs text-navy-400 mt-0.5">
                      {items.length} item{items.length !== 1 ? 's' : ''} · {formatEventPrice({ price: order.total, currency: 'ZMW' })} · {formatDate(order.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                  <ChevronDown size={16} className={`text-navy-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="border-t border-navy-100 px-5 py-4 space-y-4">
                    {/* Items */}
                    <div>
                      <p className="text-xs font-semibold text-navy-500 uppercase mb-2">Items</p>
                      <div className="space-y-2">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <div className="w-8 h-10 rounded bg-navy-100 overflow-hidden shrink-0">
                              {item.cover_image ? (
                                <img src={item.cover_image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-navy-300"><Package size={12} /></div>
                              )}
                            </div>
                            <span className="flex-1 text-navy-700 truncate">{item.title}</span>
                            <span className="text-navy-500">x{item.quantity}</span>
                            <span className="font-medium text-navy-800">{formatEventPrice({ price: item.price * item.quantity, currency: 'ZMW' })}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-navy-400">Email</p>
                        <p className="text-navy-700 font-medium">{order.user_email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-navy-400">Shipping Zone</p>
                        <p className="text-navy-700 font-medium capitalize">{order.shipping_zone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-navy-400">Shipping Cost</p>
                        <p className="text-navy-700 font-medium">{formatEventPrice({ price: order.shipping_cost, currency: 'ZMW' })}</p>
                      </div>
                      <div>
                        <p className="text-navy-400">Payment</p>
                        <p className="text-navy-700 font-medium capitalize">{order.payment_status || 'unpaid'}</p>
                      </div>
                    </div>

                    {order.notes && (
                      <div className="text-xs">
                        <p className="text-navy-400">Notes</p>
                        <p className="text-navy-600 mt-0.5">{order.notes}</p>
                      </div>
                    )}

                    {/* Status update */}
                    <div className="flex items-center gap-3 pt-2 border-t border-navy-100">
                      <label className="text-xs font-medium text-navy-500">Update Status:</label>
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        disabled={updatingId === order.id}
                        className="text-xs rounded-lg border border-navy-200 px-2 py-1.5 text-navy-700"
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                      {updatingId === order.id && <Spinner size={14} className="text-navy-400" />}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
