import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Calendar } from 'lucide-react';
import { PageHeader, DataTable, ConfirmDialog, StatusBadge } from '../../components/ui';
import { useCurrency } from '../../context/CurrencyContext';
import { useData } from '../../context/DataContext';
import { useProductTypes } from '../../context/ProductTypesContext';
import { useToast } from '../../context/ToastContext';
import { getProductTypeIcon } from '../../utils/productTypeIcons';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

// Stable colour palette indexed by sort_order. Keeps the visual rhythm of the
// old hand-tuned chip colours while supporting any dynamic type.
const CHIP_PALETTE = [
  'bg-cyan-50 text-cyan-700',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
  'bg-purple-50 text-purple-700',
  'bg-pink-50 text-pink-700',
  'bg-blue-50 text-blue-700',
  'bg-rose-50 text-rose-700',
  'bg-teal-50 text-teal-700',
  'bg-indigo-50 text-indigo-700',
  'bg-orange-50 text-orange-700',
  'bg-navy-100 text-navy-700',
];

function getChipClass(value) {
  // Deterministic hash to keep the same value -> colour mapping across renders.
  const s = String(value || 'other');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return CHIP_PALETTE[Math.abs(h) % CHIP_PALETTE.length];
}

const typeFilters = [
  { value: 'all',    label: 'All' },
  { value: 'book',   label: 'Books' },
  { value: 'merch',  label: 'Merch' },
  { value: 'event',  label: 'Event-linked' },
];

export default function BookListPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const { formatEventPrice } = useCurrency();
  const { events } = useData();
  const { productTypesByValue } = useProductTypes();
  const toast = useToast();
  const navigate = useNavigate();

  const eventMap = useMemo(() => {
    const map = {};
    for (const e of events) map[e.id] = e;
    return map;
  }, [events]);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/books`, {
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json();
      setProducts(json?.data || []);
    } catch { /* keep current */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/books/${deleteTarget}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json && json.ok === false)) {
        throw new Error(json?.message || 'Failed to delete product.');
      }
      setProducts(prev => prev.filter(b => b.id !== deleteTarget));
      setDeleteTarget(null);
      toast.success('Product deleted.');
    } catch (err) {
      toast.error(err?.message || 'Failed to delete product.');
    } finally { setDeleting(false); }
  };

  const filteredProducts = useMemo(() => {
    if (typeFilter === 'all') return products;
    if (typeFilter === 'book') return products.filter(p => (p.product_type || 'book') === 'book');
    if (typeFilter === 'merch') return products.filter(p => (p.product_type || 'book') !== 'book');
    if (typeFilter === 'event') return products.filter(p => Boolean(p.event_id));
    return products;
  }, [products, typeFilter]);

  const columns = [
    {
      key: 'cover_image',
      label: 'Cover',
      render: (val, row) => {
        const type = row.product_type || 'book';
        const meta = productTypesByValue?.[type];
        const Icon = getProductTypeIcon(meta?.icon);
        return (
          <div className="w-12 h-16 rounded-lg overflow-hidden bg-navy-100 border border-navy-200 flex items-center justify-center">
            {val ? (
              <img src={val} alt={row.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <Icon size={16} className="text-navy-300" />
            )}
          </div>
        );
      },
    },
    {
      key: 'title',
      label: 'Title',
      render: (val, row) => (
        <div>
          <span className="font-medium text-navy-800 max-w-xs truncate block">{val}</span>
          {(row.product_type || 'book') === 'book' && row.author && (
            <span className="text-xs text-navy-400">{row.author}</span>
          )}
          {row.tagline && (
            <span className="text-[11px] text-cyan-600">{row.tagline}</span>
          )}
        </div>
      ),
    },
    {
      key: 'product_type',
      label: 'Type',
      render: (val) => {
        const key = val || 'book';
        const meta = productTypesByValue?.[key];
        const Icon = getProductTypeIcon(meta?.icon);
        const label = meta?.label || key;
        return (
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${getChipClass(key)}`}>
            <Icon size={11} />
            {label}
          </span>
        );
      },
    },
    {
      key: 'event_id',
      label: 'Event',
      render: (val) => {
        if (!val) return <span className="text-xs text-navy-300">—</span>;
        const event = eventMap[val];
        return (
          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium max-w-[180px] truncate">
            <Calendar size={11} />
            <span className="truncate">{event ? event.title : 'Linked event'}</span>
          </span>
        );
      },
    },
    {
      key: 'price',
      label: 'Price',
      render: (val) => (
        <span className="font-medium text-navy-700">{formatEventPrice({ price: val, currency: 'ZMW' })}</span>
      ),
    },
    {
      key: 'stock',
      label: 'Stock',
      render: (val, row) => row.is_digital ? (
        <span className="text-xs text-emerald-600 font-medium">Digital</span>
      ) : (
        <span className={`text-xs font-medium ${val > 0 ? 'text-navy-600' : 'text-red-500'}`}>{val}</span>
      ),
    },
    {
      key: 'is_published',
      label: 'Status',
      render: (val) => (
        <StatusBadge status={val ? 'published' : 'draft'} />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_val, row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/admin/books/${row.id}/edit`); }}
            className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row.id); }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop Products"
        subtitle={`${filteredProducts.length} of ${products.length} item${products.length !== 1 ? 's' : ''}`}
        action={
          <Link
            to="/admin/books/new"
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Product
          </Link>
        }
      />

      {/* Type filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        {typeFilters.map(f => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTypeFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              typeFilter === f.value
                ? 'bg-cyan-600 text-white'
                : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-navy-400 text-sm">Loading products…</div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredProducts}
          onRowClick={(row) => navigate(`/admin/books/${row.id}/edit`)}
          emptyMessage="No products yet. Click Add Product to get started."
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Product"
        message="Are you sure you want to delete this product? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
