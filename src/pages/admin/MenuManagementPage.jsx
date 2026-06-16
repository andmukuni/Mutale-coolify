import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Menu,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  Modal,
  FormField,
  ConfirmDialog,
  LoadingButton,
  Spinner,
  StatusBadge,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import {
  fetchMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  reorderMenuItems,
} from '../../utils/menuItemsApi';

const TABS = [
  { key: 'main', label: 'Main menu' },
  { key: 'footer', label: 'Footer' },
];

const emptyForm = {
  id: '',
  location: 'main',
  label: '',
  url: '/',
  parent_id: '',
  sort_order: 100,
  is_visible: true,
  badge: false,
  open_in_new_tab: false,
};

function flattenForDisplay(items, location) {
  const scoped = items
    .filter((item) => item.location === location)
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.label).localeCompare(String(b.label)));

  if (location === 'footer') {
    return scoped.filter((item) => !item.parent_id);
  }

  const roots = scoped.filter((item) => !item.parent_id);
  const rows = [];
  for (const root of roots) {
    rows.push({ ...root, depth: 0 });
    const children = scoped.filter((child) => child.parent_id === root.id);
    for (const child of children) {
      rows.push({ ...child, depth: 1 });
    }
  }
  return rows;
}

function siblingGroupKey(item) {
  return `${item.location}::${item.parent_id || ''}`;
}

export default function MenuManagementPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('main');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, row: null, busy: false });
  const [reordering, setReordering] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMenuItems({ includeHidden: true });
      setItems(data);
    } catch (err) {
      setError(err?.message || 'Failed to load menu items.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const displayRows = useMemo(
    () => flattenForDisplay(items, activeTab),
    [items, activeTab],
  );

  const parentOptions = useMemo(
    () => items.filter((item) => item.location === 'main' && !item.parent_id),
    [items],
  );

  const openCreate = () => {
    setEditing(null);
    const siblings = items.filter((item) => item.location === activeTab && !item.parent_id);
    setForm({
      ...emptyForm,
      location: activeTab,
      sort_order: (siblings.length + 1) * 10,
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      id: row.id,
      location: row.location,
      label: row.label || '',
      url: row.url || '/',
      parent_id: row.parent_id || '',
      sort_order: row.sort_order ?? 100,
      is_visible: row.is_visible !== false,
      badge: Boolean(row.badge),
      open_in_new_tab: Boolean(row.open_in_new_tab),
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.label.trim()) {
      setFormError('Label is required.');
      return;
    }
    if (!form.url.trim()) {
      setFormError('URL is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        location: form.location,
        label: form.label.trim(),
        url: form.url.trim(),
        parent_id: form.parent_id || null,
        sort_order: Number(form.sort_order) || 100,
        is_visible: form.is_visible,
        badge: form.badge,
        open_in_new_tab: form.open_in_new_tab,
      };

      if (editing) {
        await updateMenuItem(editing.id, payload);
        toast.success('Menu item updated.');
      } else {
        await createMenuItem(payload);
        toast.success('Menu item added.');
      }

      setModalOpen(false);
      await loadItems();
    } catch (err) {
      setFormError(err?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm.row) return;
    setConfirm((prev) => ({ ...prev, busy: true }));
    try {
      await deleteMenuItem(confirm.row.id);
      toast.success('Menu item removed.');
      setConfirm({ open: false, row: null, busy: false });
      await loadItems();
    } catch (err) {
      toast.error(err?.message || 'Delete failed.');
      setConfirm((prev) => ({ ...prev, busy: false }));
    }
  };

  const toggleVisibility = async (row) => {
    try {
      await updateMenuItem(row.id, { is_visible: !row.is_visible });
      toast.success(row.is_visible ? 'Menu item hidden.' : 'Menu item visible.');
      await loadItems();
    } catch (err) {
      toast.error(err?.message || 'Update failed.');
    }
  };

  const moveItem = async (row, direction) => {
    const siblings = items
      .filter((item) => siblingGroupKey(item) === siblingGroupKey(row))
      .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100));

    const index = siblings.findIndex((item) => item.id === row.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const reordered = [...siblings];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, removed);

    setReordering(true);
    try {
      await reorderMenuItems(row.location, reordered.map((item) => item.id));
      await loadItems();
    } catch (err) {
      toast.error(err?.message || 'Reorder failed.');
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu Management"
        subtitle="Manage main navigation and footer links. Reorder items and hide links without deleting them."
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Menu Management' },
        ]}
        actions={(
          <>
            <button
              type="button"
              onClick={() => void loadItems()}
              className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 px-4 py-2 rounded-xl"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl"
            >
              <Plus size={15} />
              Add link
            </button>
          </>
        )}
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-cyan-600 text-white'
                : 'bg-white border border-navy-200 text-navy-700 hover:bg-navy-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card
        title={activeTab === 'main' ? 'Main navigation' : 'Footer quick links'}
        subtitle={activeTab === 'main'
          ? 'Top-level items appear in the header. Sub-items appear under dropdown parents (e.g. Events).'
          : 'Links shown in the footer Quick Links column.'}
      >
        {loading ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-navy-500">No menu items yet. Add your first link.</p>
        ) : (
          <div className="space-y-2">
            {displayRows.map((row, index) => {
              const siblings = displayRows.filter((item) => siblingGroupKey(item) === siblingGroupKey(row));
              const siblingIndex = siblings.findIndex((item) => item.id === row.id);
              const canMoveUp = siblingIndex > 0;
              const canMoveDown = siblingIndex < siblings.length - 1;

              return (
                <div
                  key={row.id}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border px-4 py-3 ${
                    row.is_visible ? 'border-navy-100 bg-white' : 'border-navy-100 bg-navy-50/80 opacity-80'
                  }`}
                  style={{ marginLeft: row.depth ? `${row.depth * 1.25}rem` : 0 }}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Menu size={16} className="text-navy-300 mt-1 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-navy-900">{row.label}</p>
                        {row.badge && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-coral bg-coral/10 px-2 py-0.5 rounded-full">
                            Badge
                          </span>
                        )}
                        {row.parent_id && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-navy-400 bg-navy-100 px-2 py-0.5 rounded-full">
                            Sub-item
                          </span>
                        )}
                        <StatusBadge status={row.is_visible ? 'published' : 'draft'} />
                      </div>
                      <p className="text-xs text-navy-500 mt-0.5 truncate">{row.url}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 sm:ml-auto">
                    <button
                      type="button"
                      disabled={reordering || !canMoveUp}
                      onClick={() => void moveItem(row, 'up')}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-navy-600 hover:bg-navy-100 disabled:opacity-40"
                      aria-label="Move up"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={reordering || !canMoveDown}
                      onClick={() => void moveItem(row, 'down')}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-navy-600 hover:bg-navy-100 disabled:opacity-40"
                      aria-label="Move down"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleVisibility(row)}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-navy-600 hover:bg-navy-100"
                      aria-label={row.is_visible ? 'Hide item' : 'Show item'}
                      title={row.is_visible ? 'Hide on site' : 'Show on site'}
                    >
                      {row.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-cyan-700 hover:bg-cyan-50"
                      aria-label={`Edit ${row.label}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm({ open: true, row, busy: false })}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-red-600 hover:bg-red-50"
                      aria-label={`Delete ${row.label}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit menu link' : 'Add menu link'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>
          )}

          <FormField
            label="Label"
            value={form.label}
            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            required
            placeholder="About"
          />

          <FormField
            label="URL"
            value={form.url}
            onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
            required
            placeholder="/about"
            helpText="Internal paths (e.g. /blog) or full URLs (https://…)."
          />

          {activeTab === 'main' && (
            <FormField
              label="Parent item (optional)"
              type="select"
              value={form.parent_id}
              onChange={(e) => setForm((prev) => ({ ...prev, parent_id: e.target.value }))}
              options={[
                { value: '', label: 'Top-level link' },
                ...parentOptions
                  .filter((item) => item.id !== editing?.id)
                  .map((item) => ({ value: item.id, label: item.label })),
              ]}
              helpText="Choose a parent to create a dropdown sub-link (main menu only)."
            />
          )}

          {activeTab === 'main' && !form.parent_id && (
            <label className="inline-flex items-center gap-2 text-sm text-navy-700">
              <input
                type="checkbox"
                checked={Boolean(form.badge)}
                onChange={(e) => setForm((prev) => ({ ...prev, badge: e.target.checked }))}
              />
              Show highlight badge (e.g. Shop)
            </label>
          )}

          <label className="inline-flex items-center gap-2 text-sm text-navy-700">
            <input
              type="checkbox"
              checked={Boolean(form.open_in_new_tab)}
              onChange={(e) => setForm((prev) => ({ ...prev, open_in_new_tab: e.target.checked }))}
            />
            Open in new tab
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-navy-700">
            <input
              type="checkbox"
              checked={Boolean(form.is_visible)}
              onChange={(e) => setForm((prev) => ({ ...prev, is_visible: e.target.checked }))}
            />
            Visible on site
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-800"
            >
              Cancel
            </button>
            <LoadingButton
              type="submit"
              loading={saving}
              loadingLabel="Saving…"
              className="px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl"
            >
              {editing ? 'Save changes' : 'Add link'}
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirm.open}
        onClose={() => setConfirm({ open: false, row: null, busy: false })}
        onConfirm={() => void handleDelete()}
        title="Delete menu link?"
        message={confirm.row ? `Remove “${confirm.row.label}” from the menu.` : ''}
        confirmLabel="Delete"
        loading={confirm.busy}
      />
    </div>
  );
}
