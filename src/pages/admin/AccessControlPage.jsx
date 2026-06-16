import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, Plus, RefreshCw, Trash2, Save, Users } from 'lucide-react';
import { PageHeader, Card, FormField, Spinner } from '../../components/ui';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { useToast } from '../../context/ToastContext';
import { ADMIN_PERMISSIONS } from '../../../shared/rbacPermissions.js';

const API_BASE = getApiBase();

function groupPermissions(list) {
  const map = new Map();
  for (const p of list) {
    const g = p.group || 'General';
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(p);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export default function AccessControlPage() {
  const toast = useToast();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ slug: '', name: '', description: '' });

  const permissionGroups = useMemo(() => groupPermissions(ADMIN_PERMISSIONS), []);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/rbac/roles`, { headers: getAdminAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to load roles');
      const list = Array.isArray(json.data) ? json.data : [];
      setRoles(list);
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
        setDraft({ ...list[0], permissions: [...(list[0].permissions || [])] });
      }
    } catch (err) {
      toast.error(err?.message || 'Could not load roles.');
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const selectRole = (role) => {
    setSelectedId(role.id);
    setDraft({ ...role, permissions: [...(role.permissions || [])] });
    setCreateOpen(false);
  };

  const togglePermission = (key) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const set = new Set(prev.permissions || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, permissions: [...set] };
    });
  };

  const handleSave = async () => {
    if (!draft?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/rbac/roles/${encodeURIComponent(draft.id)}`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          slug: draft.slug,
          permissions: draft.permissions,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Save failed');
      toast.success('Role updated. Users may need to sign in again to refresh permissions.');
      await loadRoles();
      if (json.data) selectRole(json.data);
    } catch (err) {
      toast.error(err?.message || 'Could not save role.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newRole.slug.trim() || !newRole.name.trim()) {
      toast.error('Slug and name are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/rbac/roles`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...newRole,
          slug: newRole.slug.trim().toLowerCase().replace(/\s+/g, '_'),
          permissions: [],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Create failed');
      toast.success('Role created.');
      setNewRole({ slug: '', name: '', description: '' });
      setCreateOpen(false);
      await loadRoles();
      if (json.data) selectRole(json.data);
    } catch (err) {
      toast.error(err?.message || 'Could not create role.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    if (role.is_system) {
      toast.error('System roles cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete role "${role.name}"? Users will lose these permissions.`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/rbac/roles/${encodeURIComponent(role.id)}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Delete failed');
      toast.success('Role deleted.');
      setSelectedId('');
      setDraft(null);
      await loadRoles();
    } catch (err) {
      toast.error(err?.message || 'Could not delete role.');
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch(`${API_BASE}/admin/rbac/seed`, {
        method: 'POST',
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Seed failed');
      toast.success(json.message || 'RBAC seeded.');
      await loadRoles();
    } catch (err) {
      toast.error(err?.message || 'Could not seed RBAC.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access control"
        subtitle="Roles and permissions for the admin dashboard (RBAC)"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'System' },
          { label: 'Access control' },
        ]}
        action={(
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-navy-200 text-sm text-navy-700 hover:bg-navy-50"
            >
              <RefreshCw size={14} className={seeding ? 'animate-spin' : ''} />
              Seed defaults
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium"
            >
              <Plus size={14} />
              New role
            </button>
          </div>
        )}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 p-4">
          <h3 className="text-sm font-semibold text-navy-800 mb-3 flex items-center gap-2">
            <Shield size={16} />
            Roles
          </h3>
          {loading ? (
            <div className="py-8 flex justify-center"><Spinner /></div>
          ) : (
            <ul className="space-y-1">
              {roles.map((role) => (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => selectRole(role)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedId === role.id
                        ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                        : 'hover:bg-navy-50 text-navy-700'
                    }`}
                  >
                    <span className="font-medium block">{role.name}</span>
                    <span className="text-[11px] text-navy-400 font-mono">{role.slug}</span>
                    {role.is_system && (
                      <span className="text-[10px] uppercase tracking-wide text-amber-700">System</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2 p-4">
          {createOpen ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-navy-800">Create role</h3>
              <FormField label="Slug" name="role-slug" value={newRole.slug} onChange={(e) => setNewRole((p) => ({ ...p, slug: e.target.value }))} placeholder="e.g. marketing_lead" />
              <FormField label="Name" name="role-name" value={newRole.name} onChange={(e) => setNewRole((p) => ({ ...p, name: e.target.value }))} />
              <FormField label="Description" name="role-desc" value={newRole.description} onChange={(e) => setNewRole((p) => ({ ...p, description: e.target.value }))} />
              <div className="flex gap-2">
                <button type="button" onClick={handleCreate} disabled={saving} className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium">Create</button>
                <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-lg border border-navy-200 text-sm">Cancel</button>
              </div>
            </div>
          ) : draft ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-navy-900">{draft.name}</h3>
                  <p className="text-xs text-navy-500 font-mono">{draft.slug}</p>
                  {draft.description && <p className="text-sm text-navy-600 mt-1">{draft.description}</p>}
                </div>
                <div className="flex gap-2">
                  {!draft.is_system && (
                    <button
                      type="button"
                      onClick={() => handleDelete(draft)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs hover:bg-red-50"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-500 disabled:opacity-60"
                  >
                    <Save size={12} />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {!draft.is_system && (
                <FormField
                  label="Display name"
                  name="edit-name"
                  value={draft.name}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                />
              )}

              <div className="border-t border-navy-100 pt-4">
                <p className="text-sm font-medium text-navy-800 mb-3">Permissions ({draft.permissions?.length || 0})</p>
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                  {permissionGroups.map(([group, perms]) => (
                    <div key={group}>
                      <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">{group}</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {perms.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-start gap-2 text-sm text-navy-700 cursor-pointer rounded-lg border border-navy-100 px-3 py-2 hover:bg-navy-50"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={draft.permissions?.includes(perm.key)}
                              onChange={() => togglePermission(perm.key)}
                            />
                            <span>
                              <span className="font-medium block">{perm.name}</span>
                              <span className="text-[10px] font-mono text-navy-400">{perm.key}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-navy-400 flex items-center gap-1">
                <Users size={12} />
                Assign roles to users from the Users table profile (coming soon: inline on user edit).
              </p>
            </div>
          ) : (
            <p className="text-sm text-navy-500 py-12 text-center">Select a role or seed defaults to get started.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
