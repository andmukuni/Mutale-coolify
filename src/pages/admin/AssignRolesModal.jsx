import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { Modal, Spinner } from '../../components/ui';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

export default function AssignRolesModal({ isOpen, onClose, user, onSaved }) {
  const [allRoles, setAllRoles] = useState([]);
  const [assignedRoleIds, setAssignedRoleIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !user?.id) return undefined;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError('');
      setAssignedRoleIds((user.admin_roles || []).map((r) => r.id));

      try {
        const [rolesRes, userRes] = await Promise.all([
          fetch(`${API_BASE}/admin/rbac/roles`, { headers: getAdminAuthHeaders() }),
          fetch(`${API_BASE}/admin/users/${encodeURIComponent(user.id)}`, {
            cache: 'no-store',
            headers: getAdminAuthHeaders(),
          }),
        ]);
        const rolesJson = await rolesRes.json().catch(() => ({}));
        const userJson = await userRes.json().catch(() => ({}));

        if (cancelled) return;
        if (!rolesRes.ok || !rolesJson?.ok) {
          throw new Error(rolesJson?.message || 'Failed to load roles.');
        }
        setAllRoles(Array.isArray(rolesJson.data) ? rolesJson.data : []);

        if (userRes.ok && userJson?.ok) {
          const ids = (userJson.data?.admin_roles || []).map((r) => r.id);
          setAssignedRoleIds(ids);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Could not load roles.');
          setAllRoles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [isOpen, user?.id, user?.admin_roles]);

  const toggleRole = (roleId) => {
    setAssignedRoleIds((prev) => (
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    ));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/rbac/users/${encodeURIComponent(user.id)}/roles`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ role_ids: assignedRoleIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to save roles.');

      onSaved?.({
        id: user.id,
        admin_roles: json.data?.roles || [],
      });
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not save roles.');
    } finally {
      setSaving(false);
    }
  };

  const legacyAdmin = user?.role === 'admin' && assignedRoleIds.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign admin roles"
      subtitle={user ? `${user.name || 'User'} · ${user.email || ''}` : ''}
      size="md"
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-navy-200 text-sm text-navy-700 hover:bg-navy-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-500 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save roles'}
          </button>
        </div>
      )}
    >
      {error && (
        <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {legacyAdmin && (
        <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          This account has legacy <strong>admin</strong> access (all permissions) until you assign RBAC roles here.
        </p>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : allRoles.length === 0 ? (
        <p className="text-sm text-navy-500 py-4">No roles found. Seed defaults from Access control first.</p>
      ) : (
        <div className="space-y-2 max-h-[min(50vh,320px)] overflow-y-auto pr-1">
          {allRoles.map((role) => (
            <label
              key={role.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-navy-100 hover:bg-navy-50/80 cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={assignedRoleIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-navy-900">
                  <Shield size={14} className="text-cyan-600 shrink-0" />
                  {role.name}
                </span>
                <span className="text-[11px] text-navy-400 font-mono block">{role.slug}</span>
                {role.description && (
                  <span className="text-xs text-navy-500 block mt-0.5">{role.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      <p className="text-xs text-navy-400 mt-4">
        The user should sign in again after saving so their session picks up new permissions.
      </p>
    </Modal>
  );
}
