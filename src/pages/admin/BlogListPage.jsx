import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, DataTable, ConfirmDialog } from '../../components/ui';
import { formatDate } from '../../utils/helpers';

export default function BlogListPage() {
  const { blogPosts, deleteBlogPost } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteBlogPost(deleteTarget);
      setDeleteTarget(null);
      toast.success('Blog post deleted.');
    } catch (err) {
      toast.error(err?.message || 'Failed to delete blog post.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'image',
      label: 'Image',
      render: (val, row) => (
        <div className="w-16 h-10 rounded-lg overflow-hidden bg-navy-100 border border-navy-200">
          {val ? (
            <img src={val} alt={row.title} className="w-full h-full object-cover" loading="lazy" />
          ) : null}
        </div>
      ),
    },
    {
      key: 'title',
      label: 'Title',
      render: (val) => (
        <span className="font-medium text-navy-800 max-w-xs truncate block">
          {val}
        </span>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (val) => (
        <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-medium">
          {val}
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      render: (val) => (
        <span className="text-navy-500">{formatDate(val)}</span>
      ),
    },
    {
      key: 'readTime',
      label: 'Read Time',
      render: (val) => (
        <span className="text-navy-400 text-xs">{val}</span>
      ),
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
              navigate(`/admin/blog/${row.id}/edit`);
            }}
            className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 transition-colors"
            aria-label="Edit post"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row.id);
            }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600 transition-colors"
            aria-label="Delete post"
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
        title="Blog Posts"
        subtitle={`${blogPosts.length} total posts`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Blog Posts' },
        ]}
        actions={
          <Link
            to="/admin/blog/new"
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            New Post
          </Link>
        }
      />

      <DataTable
        columns={columns}
        data={blogPosts}
        onRowClick={(row) => navigate(`/admin/blog/${row.id}/edit`)}
        emptyTitle="No blog posts yet"
        emptyDescription="Create your first article to get started."
        emptyAction={
          <Link
            to="/admin/blog/new"
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Create Post
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
        title="Delete Blog Post"
        message="Are you sure you want to delete this blog post? This action cannot be undone."
        confirmLabel="Delete Post"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
