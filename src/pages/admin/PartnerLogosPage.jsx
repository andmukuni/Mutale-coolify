import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  Modal,
  FormField,
  ConfirmDialog,
  LoadingButton,
  Spinner,
  StatusBadge,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import {
  fetchPartnerLogos,
  createPartnerLogo,
  updatePartnerLogo,
  deletePartnerLogo,
  uploadPartnerLogoFile,
} from '../../utils/partnerLogosApi';

const emptyForm = {
  id: '',
  name: '',
  logo_url: '',
  website_url: '',
  sort_order: 100,
  is_active: true,
};

export default function PartnerLogosPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, row: null, busy: false });

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPartnerLogos({ includeInactive: true });
      setRows(data);
    } catch (err) {
      setError(err?.message || 'Failed to load partner logos.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, sort_order: (rows.length + 1) * 10 });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      id: row.id,
      name: row.name || '',
      logo_url: row.logo_url || '',
      website_url: row.website_url || '',
      sort_order: row.sort_order ?? 100,
      is_active: row.is_active !== false,
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setFormError('');
    try {
      const url = await uploadPartnerLogoFile(file);
      setForm((prev) => ({ ...prev, logo_url: url }));
      toast.success('Logo uploaded.');
    } catch (err) {
      setFormError(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Organization name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        logo_url: form.logo_url,
        website_url: form.website_url.trim(),
        sort_order: Number(form.sort_order) || 100,
        is_active: form.is_active,
      };

      if (editing) {
        await updatePartnerLogo(editing.id, payload);
        toast.success('Partner logo updated.');
      } else {
        await createPartnerLogo(payload);
        toast.success('Partner logo added.');
      }

      setModalOpen(false);
      await loadRows();
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
      await deletePartnerLogo(confirm.row.id);
      toast.success('Partner logo removed.');
      setConfirm({ open: false, row: null, busy: false });
      await loadRows();
    } catch (err) {
      toast.error(err?.message || 'Delete failed.');
      setConfirm((prev) => ({ ...prev, busy: false }));
    }
  };

  const columns = [
    {
      key: 'logo',
      label: 'Logo',
      render: (_v, row) => (
        row.logo_url ? (
          <img
            src={resolveMediaUrl(row.logo_url)}
            alt=""
            className="h-10 w-auto max-w-[120px] object-contain"
          />
        ) : (
          <span className="text-xs text-navy-400 italic">No logo</span>
        )
      ),
    },
    {
      key: 'name',
      label: 'Organization',
      render: (_v, row) => (
        <div>
          <p className="font-medium text-navy-900">{row.name}</p>
          {row.website_url && (
            <a
              href={row.website_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:text-cyan-600 mt-0.5"
            >
              <ExternalLink size={12} />
              Website
            </a>
          )}
        </div>
      ),
    },
    {
      key: 'sort_order',
      label: 'Order',
      render: (_v, row) => <span className="tabular-nums text-navy-600">{row.sort_order}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_v, row) => (
        <StatusBadge status={row.is_active ? 'published' : 'draft'} />
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (_v, row) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600"
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirm({ open: true, row, busy: false })}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Logos"
        subtitle="Manage organization logos shown on the home page “Mutale has worked with” section."
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Partner Logos' },
        ]}
        actions={(
          <>
            <button
              type="button"
              onClick={() => void loadRows()}
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
              Add partner
            </button>
          </>
        )}
      />

      <Card
        title="Home page partners"
        subtitle="Upload PNG, JPEG, or WebP logos. Lower sort order appears first."
        actions={(
          <Link to="/" target="_blank" className="text-xs font-medium text-cyan-700 hover:text-cyan-600">
            Preview home page →
          </Link>
        )}
      >
        {loading ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            emptyTitle="No partner logos yet"
            emptyDescription="Add your first organization to show on the home page."
          />
        )}
        <p className="text-xs text-navy-500 mt-4">
          Section heading text is edited under{' '}
          <Link to="/admin/website-pages" className="text-cyan-700 hover:text-cyan-600 font-medium">
            Website Pages → Home
          </Link>
          .
        </p>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit partner logo' : 'Add partner logo'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>
          )}

          <FormField
            label="Organization name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
            placeholder="Africa CDC"
          />

          <div>
            <span className="block text-sm font-medium text-navy-700 mb-2">Logo image</span>
            <div className="flex flex-wrap items-center gap-4">
              {form.logo_url ? (
                <img
                  src={resolveMediaUrl(form.logo_url)}
                  alt=""
                  className="h-14 w-auto max-w-[160px] object-contain border border-navy-100 rounded-lg p-2 bg-white"
                />
              ) : (
                <div className="h-14 w-28 rounded-lg border border-dashed border-navy-200 flex items-center justify-center text-xs text-navy-400">
                  No logo
                </div>
              )}
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-cyan-700 hover:text-cyan-600 cursor-pointer">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void handleLogoUpload(e)}
                  />
                  {uploading ? 'Uploading…' : 'Upload logo'}
                </label>
                {form.logo_url && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, logo_url: '' }))}
                    className="block text-xs text-red-600 hover:text-red-700"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <FormField
            label="Website URL (optional)"
            value={form.website_url}
            onChange={(e) => setForm((prev) => ({ ...prev, website_url: e.target.value }))}
            placeholder="https://example.org"
          />

          <FormField
            label="Sort order"
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
            helpText="Lower numbers appear first."
          />

          <label className="inline-flex items-center gap-2 text-sm text-navy-700">
            <input
              type="checkbox"
              checked={Boolean(form.is_active)}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
            />
            Show on home page
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
              {editing ? 'Save changes' : 'Add partner'}
            </LoadingButton>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirm.open}
        onClose={() => setConfirm({ open: false, row: null, busy: false })}
        onConfirm={() => void handleDelete()}
        title="Delete partner logo?"
        message={confirm.row ? `Remove “${confirm.row.name}” from the home page.` : ''}
        confirmLabel="Delete"
        loading={confirm.busy}
      />
    </div>
  );
}
