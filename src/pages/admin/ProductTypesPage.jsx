import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import {
  PageHeader,
  DataTable,
  Modal,
  FormField,
  ConfirmDialog,
  StatusBadge,
  LoadingButton,
  Spinner,
} from '../../components/ui';
import { useProductTypes } from '../../context/ProductTypesContext';
import { useToast } from '../../context/ToastContext';
import {
  PRODUCT_TYPE_ICON_CHOICES,
  getProductTypeIcon,
} from '../../utils/productTypeIcons';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

const emptyForm = {
  id: '',
  value: '',
  label: '',
  icon: 'box',
  default_category: '',
  sort_order: 100,
  is_active: true,
};

function slugify(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\- ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

export default function ProductTypesPage() {
  const { productTypes, loaded, reload } = useProductTypes();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // CRUD modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [confirm, setConfirm] = useState({ open: false, row: null, busy: false });

  // Track whether user has touched the value field so auto-slug only fires
  // while the field is "untouched". Edits never auto-slug.
  const [valueDirty, setValueDirty] = useState(false);

  const fetchTypes = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/product-types?all=1`, {
        cache: 'no-store',
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Failed to load product types.');
      }
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load product types.');
      setRows(productTypes); // graceful fallback to cached
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-seed local rows if the context hot-reloads
  useEffect(() => {
    if (loaded && rows.length === 0) setRows(productTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.label).localeCompare(String(b.label))),
    [rows],
  );

  // ─── modal helpers ────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setFormError('');
    setValueDirty(false);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      id: row.id,
      value: row.value || '',
      label: row.label || '',
      icon: row.icon || 'box',
      default_category: row.default_category || '',
      sort_order: Number(row.sort_order ?? 100),
      is_active: row.is_active !== false && row.is_active !== 0,
    });
    setFormError('');
    setValueDirty(true);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError('');
  };

  const handleLabelChange = (e) => {
    const nextLabel = e.target.value;
    setForm((prev) => ({
      ...prev,
      label: nextLabel,
      // auto-derive value while user hasn't manually edited it (and on create only)
      value: !editing && !valueDirty ? slugify(nextLabel) : prev.value,
    }));
  };

  const handleValueChange = (e) => {
    setValueDirty(true);
    setForm((prev) => ({ ...prev, value: slugify(e.target.value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.label.trim()) {
      setFormError('Label is required.');
      return;
    }
    if (!form.value.trim()) {
      setFormError('Value is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        value: form.value.trim(),
        label: form.label.trim(),
        icon: form.icon,
        default_category: form.default_category.trim() || null,
        sort_order: Number(form.sort_order) || 100,
        is_active: form.is_active ? 1 : 0,
      };
      const url = editing
        ? `${API_BASE}/product-types/${encodeURIComponent(editing.id)}`
        : `${API_BASE}/product-types`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Failed to save product type.');
      }
      await fetchTypes();
      await reload({ includeInactive: false });
      setModalOpen(false);
      toast.success(editing ? `Updated "${payload.label}".` : `Added "${payload.label}".`);
      setEditing(null);
    } catch (err) {
      setFormError(err?.message || 'Failed to save.');
      toast.error(err?.message || 'Failed to save product type.');
    } finally {
      setSaving(false);
    }
  };

  // ─── delete ───────────────────────────────────────────────────────
  const askDelete = (row) => setConfirm({ open: true, row, busy: false });
  const cancelDelete = () => {
    if (confirm.busy) return;
    setConfirm({ open: false, row: null, busy: false });
  };

  const confirmDelete = async () => {
    if (!confirm.row) return;
    setConfirm((s) => ({ ...s, busy: true }));
    setError('');
    try {
      const res = await fetch(
        `${API_BASE}/product-types/${encodeURIComponent(confirm.row.id)}`,
        { method: 'DELETE', headers: getAdminAuthHeaders() },
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        const msg = json?.message || 'Cannot delete — product type is in use.';
        setError(msg);
        toast.error(msg);
        setConfirm({ open: false, row: null, busy: false });
        return;
      }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Failed to delete product type.');
      }
      await fetchTypes();
      await reload();
      toast.success(`Deleted "${confirm.row.label}".`);
      setConfirm({ open: false, row: null, busy: false });
    } catch (err) {
      const msg = err?.message || 'Failed to delete.';
      setError(msg);
      toast.error(msg);
      setConfirm({ open: false, row: null, busy: false });
    }
  };

  // ─── render ───────────────────────────────────────────────────────
  const columns = [
    {
      key: 'icon',
      label: 'Icon',
      render: (_v, row) => {
        const Icon = getProductTypeIcon(row.icon);
        return (
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-navy-50 text-navy-700">
            <Icon size={18} />
          </div>
        );
      },
    },
    {
      key: 'label',
      label: 'Label',
      render: (_v, row) => (
        <div>
          <p className="font-medium text-navy-900">{row.label}</p>
          {row.default_category && (
            <p className="text-xs text-navy-400 mt-0.5">Default: {row.default_category}</p>
          )}
        </div>
      ),
    },
    {
      key: 'value',
      label: 'Value',
      render: (v) => (
        <code className="px-2 py-1 rounded bg-navy-50 text-navy-700 text-xs font-mono">{v}</code>
      ),
    },
    {
      key: 'sort_order',
      label: 'Sort',
      render: (v) => <span className="text-sm text-navy-600">{v ?? 100}</span>,
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (_v, row) => (
        <StatusBadge
          status={row.is_active !== false && row.is_active !== 0 ? 'active' : 'inactive'}
        />
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_v, row) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-navy-600 hover:bg-navy-100"
            aria-label={`Edit ${row.label}`}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => askDelete(row)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-red-600 hover:bg-red-50"
            aria-label={`Delete ${row.label}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const PreviewIcon = getProductTypeIcon(form.icon);

  return (
    <div>
      <PageHeader
        title="Product Types"
        subtitle="Manage the dynamic catalogue used by the product form"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Shop' },
          { label: 'Product Types' },
        ]}
        actions={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchTypes}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-white border border-navy-200 hover:border-cyan-400 text-navy-700 hover:text-cyan-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? <Spinner size={15} /> : <RefreshCw size={15} />}
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              Add Type
            </button>
          </div>
        )}
      />

      {error && (
        <div className="mb-5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={sortedRows}
        loading={loading}
        emptyTitle="No product types yet"
        emptyDescription="Add your first product type to start tagging products."
        emptyAction={(
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Add Type
          </button>
        )}
      />

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit ${editing.label}` : 'Add Product Type'}
        subtitle={editing ? 'Update label, icon or sort order.' : 'Create a new product type for the shop.'}
        size="lg"
        footer={(
          <>
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-100 transition-colors"
            >
              Cancel
            </button>
            <LoadingButton
              type="submit"
              form="product-type-form"
              loading={saving}
              loadingLabel="Saving..."
              className="px-5 py-2 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {editing ? 'Save Changes' : 'Create Type'}
            </LoadingButton>
          </>
        )}
      >
        <form id="product-type-form" onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
              {formError}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              label="Label"
              name="label"
              value={form.label}
              onChange={handleLabelChange}
              placeholder="e.g. Mug"
              required
              helpText="Shown to admins and customers."
            />
            <FormField
              label="Value"
              name="value"
              value={form.value}
              onChange={handleValueChange}
              placeholder="auto-derived from label"
              required
              helpText="Lowercase identifier saved on each product."
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1.5">Icon</label>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-16 h-16 rounded-2xl border border-navy-200 bg-navy-50 flex items-center justify-center text-navy-700">
                <PreviewIcon size={28} />
              </div>
              <div className="flex-1">
                <select
                  value={form.icon}
                  onChange={(e) => setForm((prev) => ({ ...prev, icon: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {PRODUCT_TYPE_ICON_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label} ({choice.value})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-navy-400">
                  Curated set — only listed icons render correctly across the shop.
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              label="Default Category"
              name="default_category"
              value={form.default_category}
              onChange={(e) => setForm((prev) => ({ ...prev, default_category: e.target.value }))}
              placeholder="e.g. Apparel"
              helpText="Pre-fills the product form's Category field when this type is picked."
            />
            <FormField
              label="Sort Order"
              name="sort_order"
              type="number"
              min={0}
              max={999}
              value={String(form.sort_order)}
              onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
              helpText="Lower numbers appear first."
            />
          </div>

          <label className="flex items-center gap-3 text-sm text-navy-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
            />
            <span>
              <span className="font-medium">Active</span>
              <span className="block text-xs text-navy-400">Inactive types are hidden from the product form.</span>
            </span>
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirm.open}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        title="Delete product type"
        message={confirm.row
          ? `Delete "${confirm.row.label}"? Products that still reference it will block this action.`
          : 'Delete this product type?'}
        confirmLabel="Delete"
        loading={confirm.busy}
      />
    </div>
  );
}
