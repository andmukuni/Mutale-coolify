import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Users, UserPlus, Pencil, Trash2, Eye, Shield } from 'lucide-react';
import { Card, PageHeader, ConfirmDialog } from '../../components/ui';
import EmptyState from '../../components/EmptyState';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import UserFormModal from './UserFormModal';
import AssignRolesModal from './AssignRolesModal';

const API_BASE = getApiBase();

export default function UsersListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canAssignRoles = hasPermission('users.manage') || hasPermission('rbac.manage');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  // Modal / dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [rolesTarget, setRolesTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/admin/users`, {
          cache: 'no-store',
          headers: getAdminAuthHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(json.message || json.error || `Failed to load users (${res.status})`);
        }
        setUsers(Array.isArray(json.data) ? json.data : []);
      } catch (e) {
        if (cancelled) return;
        setUsers([]);
        setError(e?.message || 'Unable to load users from the server.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const sortedUsers = useMemo(() => [...users].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  }), [users]);

  const handleExport = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'Role', 'Verified', 'Created'],
      ...sortedUsers.map((user) => [
        user.name || '—',
        user.email || '—',
        user.phone || '—',
        user.role || 'user',
        user.email_verified ? 'yes' : 'no',
        user.created_at ? formatDate(user.created_at.split('T')[0]) : '—',
      ]),
    ];

    const csv = rows.map((row) => row.map((val) => `"${String(val).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users-table.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const showFlash = (msg, variant = 'success') => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(''), 3500);
    if (variant === 'error') toast.error(msg);
    else toast.success(msg);
  };

  const handleAdd = () => {
    setEditingUser(null);
    setFormOpen(true);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormOpen(true);
  };

  const handleSaved = (saved) => {
    if (!saved?.id) return;
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === saved.id);
      if (exists) return prev.map((u) => (u.id === saved.id ? saved : u));
      return [saved, ...prev];
    });
    showFlash(editingUser ? 'User updated successfully.' : 'User created successfully.');
  };

  const handleRolesSaved = ({ id, admin_roles: adminRoles }) => {
    if (!id) return;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, admin_roles: adminRoles || [] } : u)));
    showFlash('Admin roles updated.');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'Failed to delete user.');
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      showFlash('User deleted.');
    } catch (e) {
      const msg = e?.message || 'Failed to delete user.';
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Users Table"
        subtitle={loading ? 'Loading…' : `${sortedUsers.length} registered users (from database)`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Users' },
        ]}
        actions={(
          <div className="flex items-center gap-2">
            {sortedUsers.length > 0 && !loading && (
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700 px-4 py-2 rounded-xl transition-colors"
              >
                <Download size={15} />
                Export CSV
              </button>
            )}
            <button
              onClick={handleAdd}
              className="inline-flex items-center gap-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl transition-colors"
            >
              <UserPlus size={15} />
              Add User
            </button>
          </div>
        )}
      />

      {actionMessage && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionMessage}
        </div>
      )}

      <Card>
        {error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-navy-500 py-8 text-center">Loading users…</p>
        ) : sortedUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users yet"
            description="Click Add User to create the first account, or wait for new self-registrations."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-100">
                  {['Name', 'Email', 'Phone', 'Role', ...(canAssignRoles ? ['Access roles'] : []), 'Verified', 'Created', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className={`text-xs font-semibold text-navy-400 uppercase tracking-wider py-3 px-4 first:pl-0 ${h === 'Actions' ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {sortedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-navy-50/50 transition-colors"
                  >
                    <td className="py-3 px-4 first:pl-0 font-medium text-navy-900">{user.name || '—'}</td>
                    <td className="py-3 px-4 text-navy-600">{user.email || '—'}</td>
                    <td className="py-3 px-4 text-navy-600">{user.phone || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        user.role === 'admin'
                          ? 'bg-purple-50 text-purple-700 border border-purple-100'
                          : 'bg-navy-50 text-navy-600 border border-navy-100'
                      }`}>
                        {user.role || 'user'}
                      </span>
                    </td>
                    {canAssignRoles && (
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(user.admin_roles || []).length > 0 ? (
                            user.admin_roles.map((r) => (
                              <span
                                key={r.id}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-50 text-cyan-800 border border-cyan-100"
                              >
                                {r.name}
                              </span>
                            ))
                          ) : user.role === 'admin' ? (
                            <span className="text-[11px] text-navy-400 italic">Legacy admin</span>
                          ) : (
                            <span className="text-[11px] text-navy-300">—</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.email_verified
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {user.email_verified ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-navy-400 text-xs">
                      {user.created_at ? formatDate(user.created_at.split('T')[0]) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/users/${user.id}`)}
                          className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 transition-colors"
                          title="View profile"
                        >
                          <Eye size={14} />
                        </button>
                        {canAssignRoles && (
                          <button
                            type="button"
                            onClick={() => setRolesTarget(user)}
                            className="p-1.5 rounded-lg hover:bg-purple-50 text-navy-400 hover:text-purple-700 transition-colors"
                            title="Assign admin roles"
                          >
                            <Shield size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEdit(user)}
                          className="p-1.5 rounded-lg hover:bg-cyan-50 text-navy-400 hover:text-cyan-700 transition-colors"
                          title="Edit user"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDeleteError(''); setDeleteTarget(user); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UserFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        user={editingUser}
      />

      <AssignRolesModal
        isOpen={Boolean(rolesTarget)}
        onClose={() => setRolesTarget(null)}
        user={rolesTarget}
        onSaved={handleRolesSaved}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
        onConfirm={handleDelete}
        title="Delete user"
        message={deleteError
          ? deleteError
          : `Are you sure you want to delete ${deleteTarget?.name || 'this user'}? This action cannot be undone and will permanently remove their account.`}
        confirmLabel="Delete user"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
