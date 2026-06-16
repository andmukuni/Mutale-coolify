import { useEffect, useMemo, useState } from 'react';
import { Modal, FormField, Spinner } from '../../components/ui';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const USER_TYPE_OPTIONS = [
  { value: 'local', label: 'Local' },
  { value: 'international', label: 'International' },
];

function buildInitialForm(user) {
  return {
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    whatsapp: user?.whatsapp || '',
    role: user?.role || 'user',
    user_type: user?.user_type || 'local',
    profession: user?.profession || '',
    organization: user?.organization || '',
    nrc_id: user?.nrc_id || '',
    password: '',
    email_verified: user?.email_verified ? true : (user ? false : true),
  };
}

export default function UserFormModal({ isOpen, onClose, onSaved, user = null }) {
  const isEditing = Boolean(user?.id);
  const [form, setForm] = useState(() => buildInitialForm(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialForm(user));
      setError('');
      setFieldErrors({});
    }
  }, [isOpen, user]);

  const title = useMemo(() => (isEditing ? 'Edit User' : 'Add User'), [isEditing]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.email.trim()) errors.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email.';
    if (!isEditing && (!form.password || form.password.length < 6)) {
      errors.password = 'Password must be at least 6 characters.';
    }
    if (isEditing && form.password && form.password.length < 6) {
      errors.password = 'New password must be at least 6 characters.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim(),
        role: form.role,
        user_type: form.user_type,
        profession: form.profession.trim(),
        organization: form.organization.trim(),
        nrc_id: form.nrc_id.trim(),
        email_verified: Boolean(form.email_verified),
      };
      if (form.password) payload.password = form.password;

      const url = isEditing
        ? `${API_BASE}/admin/users/${encodeURIComponent(user.id)}`
        : `${API_BASE}/admin/users`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || `Failed to ${isEditing ? 'update' : 'create'} user (${res.status})`);
      }

      onSaved?.(json.data);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not save user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={title}
      subtitle={isEditing ? 'Update user account details' : 'Create a new user account'}
      size="lg"
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-60"
          >
            {saving ? <Spinner size={14} /> : null}
            {saving ? 'Saving…' : (isEditing ? 'Save changes' : 'Create user')}
          </button>
        </>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Full name"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            error={fieldErrors.name}
            placeholder="Jane Doe"
          />
          <FormField
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
            error={fieldErrors.email}
            placeholder="jane@example.com"
          />
          <FormField
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="0977000000"
          />
          <FormField
            label="WhatsApp"
            name="whatsapp"
            value={form.whatsapp}
            onChange={handleChange}
            placeholder="+260977000000"
          />
          <FormField
            label="Role"
            name="role"
            type="select"
            value={form.role}
            onChange={handleChange}
            options={ROLE_OPTIONS}
          />
          <FormField
            label="User type"
            name="user_type"
            type="select"
            value={form.user_type}
            onChange={handleChange}
            options={USER_TYPE_OPTIONS}
          />
          <FormField
            label="Profession"
            name="profession"
            value={form.profession}
            onChange={handleChange}
            placeholder="Software engineer"
          />
          <FormField
            label="Organization"
            name="organization"
            value={form.organization}
            onChange={handleChange}
            placeholder="Acme Inc."
          />
          <FormField
            label="NRC ID"
            name="nrc_id"
            value={form.nrc_id}
            onChange={handleChange}
            placeholder="000000/00/0"
          />
          <FormField
            label={isEditing ? 'New password (optional)' : 'Password'}
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required={!isEditing}
            error={fieldErrors.password}
            placeholder={isEditing ? 'Leave blank to keep current' : 'At least 6 characters'}
            helpText={isEditing ? 'Only fill this in to reset the password.' : ''}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer pt-2 border-t border-navy-100">
          <input
            type="checkbox"
            name="email_verified"
            checked={form.email_verified}
            onChange={handleChange}
            className="rounded border-navy-300"
          />
          Mark email as verified
        </label>
      </form>
    </Modal>
  );
}
