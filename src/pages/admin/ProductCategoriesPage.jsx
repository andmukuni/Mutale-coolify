import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
import { useProductCategories } from '../../context/ProductCategoriesContext';
import { useToast } from '../../context/ToastContext';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

const SCOPE_OPTIONS = [
  { value: 'merch', label: 'Merchandise' },
  { value: 'book', label: 'Books' },
  { value: 'both', label: 'Books & merchandise' },
];

const emptyForm = {
  id: '',
  name: '',
  scope: 'merch',
  sort_order: 100,
  is_active: true,
};

function scopeLabel(scope) {
  return SCOPE_OPTIONS.find((opt) => opt.value === scope)?.label || scope;
}

export default function ProductCategoriesPage() {
  const location = useLocation();
  const { categories, loaded, reload } = useProductCategories();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, row: null, busy: false });

  const fetchCategories = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/product-categories?all=1`, {
        cache: 'no-store',
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Failed to load categories.');
      }
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load categories.');
      setRows(categories);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCategories();
  }, [location.pathname]);

  useEffect(() => {
    if (loaded && rows.length === 0) setRows(categories);
  }, [loaded, categories, rows.length]);

  const sortedRows = useMemo(
    () => [...rows].sort(
      (a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.name).localeCompare(String(b.name)),
    ),
    [rows],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      id: row.id,
      name: row.name || '',
      scope: row.scope || 'merch',
      sort_order: Number(row.sort_order ?? 100),
      is_active: row.is_active !== false && row.is_active !== 0,
    });
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        scope: form.scope,
        sort_order: Number(form.sort_order) || 100,
        is_active: form.is_active ? 1 : 0,
      };
      const url = editing
        ? `${API_BASE}/product-categories/${encodeURIComponent(editing.id)}`
        : `${API_BASE}/product-categories`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Failed to save category.');
      }
      await fetchCategories();
      await reload({ includeInactive: true });
      setModalOpen(false);
      toast.success(editing ? `Updated "${payload.name}".` : `Added "${payload.name}".`);
      setEditing(null);
    } catch (err) {
      setFormError(err?.message || 'Failed to save.');
      toast.error(err?.message || 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

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
        `${API_BASE}/product-categories/${encodeURIComponent(confirm.row.id)}`,
        { method: 'DELETE', headers: getAdminAuthHeaders() },
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        const msg = json?.message || 'Cannot delete — category is in use.';
        setError(msg);
        toast.error(msg);
        setConfirm({ open: false, row: null, busy: false });
        return;
      }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Failed to delete category.');
      }
      await fetchCategories();
      await reload({ includeInactive: true });
      toast.success(`Deleted "${confirm.row.name}".`);
      setConfirm({ open: false, row: null, busy: false });
    } catch (err) {
      const msg = err?.message || 'Failed to delete.';
      setError(msg);
      toast.error(msg);
      setConfirm({ open: false, row: null, busy: false });
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (_v, row) => (
        <div>
          <p className="font-medium text-navy-900">{row.name}</p>
          <p className="text-xs text-navy-400 mt-0.5">Saved on products as &quot;{row.name}&quot;</p>
        </div>
      ),
    },
    {
      key: 'scope',
      label: 'Used for',
      render: (_v, row) => (
        <span className="inline-flex rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700">
          {scopeLabel(row.scope)}
        </span>
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
        <StatusBadge status={row.is_active !== false && row.is_active !== 0 ? 'active' : 'inactive'} />
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
            aria-label={`Edit ${row.name}`}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => askDelete(row)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-red-600 hover:bg-red-50"
            aria-label={`Delete ${row.name}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Product Categories"
        subtitle="Manage category options shown on the add/edit product form"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Shop' },
          { label: 'Categories' },
        ]}
        actions={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchCategories}
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
              Add Category
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
        emptyTitle="No categories yet"
        emptyDescription="Add categories for books and merchandise products."
        emptyAction={(
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Add Category
          </button>
        )}
      />

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit ${editing.name}` : 'Add Category'}
        subtitle="Categories appear in the product form dropdown."
        size="md"
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
              form="product-category-form"
              loading={saving}
              loadingLabel="Saving..."
              className="px-5 py-2 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {editing ? 'Save Changes' : 'Create Category'}
            </LoadingButton>
          </>
        )}
      >
        <form id="product-category-form" onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
              {formError}
            </div>
          )}

          <FormField
            label="Name"
            name="name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Apparel"
            required
            helpText="Shown in the category dropdown when adding products."
          />

          <FormField
            label="Used for"
            name="scope"
            type="select"
            value={form.scope}
            onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value }))}
            options={SCOPE_OPTIONS}
            helpText="Book categories appear for book products; merchandise categories for other product types."
          />

          <FormField
            label="Sort Order"
            name="sort_order"
            type="number"
            min={0}
            max={999}
            value={String(form.sort_order)}
            onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
            helpText="Lower numbers appear first in dropdowns."
          />

          <label className="flex items-center gap-3 text-sm text-navy-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
            />
            <span>
              <span className="font-medium">Active</span>
              <span className="block text-xs text-navy-400">Inactive categories are hidden from the product form.</span>
            </span>
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirm.open}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        title="Delete category"
        message={confirm.row
          ? `Delete "${confirm.row.name}"? Products using it will block this action.`
          : 'Delete this category?'}
        confirmLabel="Delete"
        loading={confirm.busy}
      />
    </div>
  );
}
