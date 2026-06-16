import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, DataTable, ConfirmDialog } from '../../components/ui';

export default function PublicationsListPage() {
  const { publications, deletePublication } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setError('');
      await deletePublication(deleteTarget);
      setDeleteTarget(null);
      toast.success('Publication deleted.');
    } catch (err) {
      const msg = err?.message || 'Failed to delete publication.';
      setError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (val) => <span className="font-medium text-navy-800 max-w-sm truncate block">{val}</span>,
    },
    {
      key: 'authors',
      label: 'Authors',
      render: (val) => <span className="text-navy-600 text-xs max-w-xs truncate block">{val}</span>,
    },
    {
      key: 'journal',
      label: 'Journal',
      render: (val) => <span className="text-navy-500">{val || '-'}</span>,
    },
    {
      key: 'year',
      label: 'Year',
      render: (val) => <span className="text-navy-500">{val || '-'}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_val, row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/admin/publications/${row.id}/edit`);
            }}
            className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 transition-colors"
            aria-label="Edit publication"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row.id);
            }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600 transition-colors"
            aria-label="Delete publication"
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
        title="Publications"
        subtitle={`${publications.length} total publications`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Publications' },
        ]}
        actions={
          <Link
            to="/admin/publications/new"
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            New Publication
          </Link>
        }
      />

      {error && (
        <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={publications}
        onRowClick={(row) => navigate(`/admin/publications/${row.id}/edit`)}
        emptyTitle="No publications yet"
        emptyDescription="Add your first publication to display it on the website."
        emptyAction={
          <Link
            to="/admin/publications/new"
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Create Publication
          </Link>
        }
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => {
          if (deleting) return;
          setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        title="Delete Publication"
        message="Are you sure you want to delete this publication? This action cannot be undone."
        confirmLabel="Delete Publication"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
