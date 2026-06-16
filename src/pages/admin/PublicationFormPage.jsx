import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, FormField, Spinner } from '../../components/ui';

const emptyPublication = {
  title: '',
  authors: '',
  journal: '',
  year: new Date().getFullYear(),
  volume: '',
  doi: '',
  abstract: '',
};

export default function PublicationFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { publications, isDataLoaded, addPublication, updatePublication } = useData();
  const toast = useToast();
  const isEditing = Boolean(id);

  const initialPublication = useMemo(() => {
    if (!id) return emptyPublication;
    const found = publications.find((p) => p.id === id);
    return found ? { ...found } : null;
  }, [id, publications]);

  const [form, setForm] = useState(initialPublication || emptyPublication);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const initializedIdRef = useRef(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    const formKey = id || '__new__';

    if (initializedIdRef.current !== formKey) {
      initializedIdRef.current = formKey;
      dirtyRef.current = false;
      setForm(initialPublication || emptyPublication);
      return;
    }

    if (initialPublication && !dirtyRef.current) {
      setForm(initialPublication);
      return;
    }

    if (isEditing && isDataLoaded && !initialPublication) {
      navigate('/admin/publications');
    }
  }, [id, initialPublication, isEditing, isDataLoaded, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    dirtyRef.current = true;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'year' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      year: form.year === '' ? null : Number(form.year),
    };

    try {
      if (!payload.title?.trim() || !payload.authors?.trim()) {
        throw new Error('Title and authors are required.');
      }

      if (isEditing) {
        await updatePublication(id, payload);
      } else {
        await addPublication(payload);
      }

      dirtyRef.current = false;
      setSaved(true);
      toast.success(isEditing ? 'Publication updated.' : 'Publication added.');
      setTimeout(() => navigate('/admin/publications'), 1000);
    } catch (err) {
      const msg = err?.message || 'Failed to save publication.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Edit Publication' : 'Create Publication'}
        subtitle={isEditing ? `Editing: ${form.title || 'Publication'}` : 'Add a research publication to your profile'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Publications', to: '/admin/publications' },
          { label: isEditing ? 'Edit' : 'New' },
        ]}
      />

      {saved && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Publication {isEditing ? 'updated' : 'created'} successfully! Redirecting...
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormField
            label="Title"
            name="title"
            value={form.title}
            onChange={handleChange}
            required
            placeholder="Publication title"
          />

          <FormField
            label="Authors"
            name="authors"
            value={form.authors}
            onChange={handleChange}
            required
            placeholder="e.g., Mubanga M., et al."
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField
              label="Journal"
              name="journal"
              value={form.journal}
              onChange={handleChange}
              placeholder="Journal name"
            />
            <FormField
              label="Year"
              name="year"
              type="number"
              value={form.year ?? ''}
              onChange={handleChange}
              placeholder="e.g., 2024"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField
              label="Volume / Issue"
              name="volume"
              value={form.volume}
              onChange={handleChange}
              placeholder="e.g., 9(1)"
            />
            <FormField
              label="DOI"
              name="doi"
              value={form.doi}
              onChange={handleChange}
              placeholder="e.g., 10.1000/xyz123"
            />
          </div>

          <FormField
            label="Abstract"
            name="abstract"
            value={form.abstract}
            onChange={handleChange}
            textarea
            rows={6}
            placeholder="Optional abstract summary"
          />

          <div className="flex items-center gap-3 pt-4 border-t border-navy-100">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-70 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? <Spinner size={16} /> : <Save size={16} />}
              {saving ? 'Saving...' : isEditing ? 'Update Publication' : 'Save Publication'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/publications')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-navy-500 hover:bg-navy-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
