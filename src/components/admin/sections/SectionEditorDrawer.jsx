import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ImageOff, Upload } from 'lucide-react';
import { Modal, FormField, LoadingButton } from '../../ui';
import { useData } from '../../../context/DataContext';
import { useToast } from '../../../context/ToastContext';
import { resolveMediaUrl } from '../../../utils/mediaUrl';
import { uploadSiteImageFile } from '../../../utils/siteImagesApi';
import {
  getByPath,
  setByPath,
  getSectionVisibility,
  setSectionVisibility,
} from '../../../config/sectionRegistry';

function valueToFormString(value, type) {
  if (type === 'lines') {
    return Array.isArray(value) ? value.join('\n') : String(value || '');
  }
  return value == null ? '' : String(value);
}

function formStringToValue(raw, type) {
  if (type === 'lines') {
    return String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return raw;
}

function ImageField({ field, value, onChange, disabled }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadSiteImageFile(file);
      onChange(url);
      toast.success('Image uploaded.');
    } catch (err) {
      toast.error(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const previewSrc = value ? resolveMediaUrl(value) : (field.fallbackPreview || '');
  const isCustom = Boolean(value);

  return (
    <div>
      <span className="block text-sm font-medium text-navy-700 mb-1.5">{field.label}</span>
      <div className="flex flex-wrap items-center gap-4">
        {previewSrc ? (
          <div className="relative">
            <img
              src={previewSrc}
              alt=""
              className="h-20 w-32 object-cover rounded-lg border border-navy-100 bg-navy-50"
            />
            <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${isCustom ? 'bg-cyan-600 text-white' : 'bg-navy-900/70 text-white'}`}>
              {isCustom ? 'Custom' : 'Current default'}
            </span>
          </div>
        ) : (
          <div className="h-20 w-32 rounded-lg border border-dashed border-navy-200 flex flex-col items-center justify-center gap-1 text-xs text-navy-400">
            <ImageOff size={18} />
            None
          </div>
        )}
        <div className="space-y-2">
          <label className={`inline-flex items-center gap-2 text-sm font-medium ${uploading || disabled ? 'text-navy-300 cursor-not-allowed' : 'text-cyan-700 hover:text-cyan-600 cursor-pointer'}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={uploading || disabled}
              onChange={(e) => void handleUpload(e)}
            />
            <Upload size={15} />
            {uploading ? 'Uploading…' : 'Upload image'}
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled}
              className="block text-xs text-red-600 hover:text-red-700"
            >
              Remove (use default)
            </button>
          )}
        </div>
      </div>
      {field.helpText && <p className="mt-1.5 text-xs text-navy-400">{field.helpText}</p>}
    </div>
  );
}

export default function SectionEditorDrawer({ section, isOpen, onClose }) {
  const { profile, updateProfile } = useData();
  const toast = useToast();
  const [form, setForm] = useState({});
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  const fields = useMemo(() => section?.fields || [], [section]);

  useEffect(() => {
    if (!section) return;
    const next = {};
    for (const field of fields) {
      next[field.key] = valueToFormString(getByPath(profile, field.path), field.type);
    }
    setForm(next);
    setVisible(getSectionVisibility(profile, section));
  }, [section, fields, profile, isOpen]);

  if (!section) return null;

  const setFieldValue = (field, raw) => {
    setForm((prev) => ({ ...prev, [field.key]: raw }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Deep clone serializable profile, then apply edits by dot-path.
      let draft = JSON.parse(JSON.stringify(profile || {}));
      const touchedRoots = new Set();

      for (const field of fields) {
        const value = formStringToValue(form[field.key], field.type);
        draft = setByPath(draft, field.path, value);
        touchedRoots.add(String(field.path).split('.')[0]);
      }

      if (section.toggleable) {
        draft = {
          ...draft,
          websitePages: setSectionVisibility(draft.websitePages, section, visible),
        };
        touchedRoots.add('websitePages');
      }

      const payload = {};
      for (const rootKey of touchedRoots) {
        payload[rootKey] = draft[rootKey];
      }

      await updateProfile(payload);
      toast.success('Section saved.');
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Failed to save section.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      title={`${section.page} · ${section.name}`}
      subtitle={section.type === 'dynamic'
        ? 'Edit headings here. Manage list items in the linked admin.'
        : 'Edit this section’s text and images.'}
      size="xl"
      footer={(
        <>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-800"
          >
            Cancel
          </button>
          <LoadingButton
            type="button"
            loading={saving}
            loadingLabel="Saving…"
            onClick={() => void handleSave()}
            className="px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl"
          >
            Save changes
          </LoadingButton>
        </>
      )}
    >
      <div className="space-y-5">
        {section.manageLink && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-navy-100 bg-navy-50 px-4 py-3">
            <p className="text-sm text-navy-600">
              {section.type === 'dynamic'
                ? 'This section displays items managed elsewhere.'
                : 'Some content for this section is managed elsewhere.'}
            </p>
            <Link
              to={section.manageLink.to}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-600"
            >
              {section.manageLink.label}
              <ExternalLink size={14} />
            </Link>
          </div>
        )}

        {section.toggleable && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-navy-100 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-navy-800">Show on website</span>
              <span className="block text-xs text-navy-400">Turn off to hide this section from visitors.</span>
            </span>
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              className="h-5 w-5 accent-cyan-600"
            />
          </label>
        )}

        {fields.length === 0 ? (
          <p className="text-sm text-navy-500">
            This section has no editable text fields. Use the link above to manage its content.
          </p>
        ) : (
          fields.map((field) => (
            field.type === 'image' ? (
              <ImageField
                key={field.key}
                field={field}
                value={form[field.key] || ''}
                onChange={(url) => setFieldValue(field, url)}
                disabled={saving}
              />
            ) : (
              <FormField
                key={field.key}
                name={field.key}
                label={field.label}
                value={form[field.key] ?? ''}
                onChange={(e) => setFieldValue(field, e.target.value)}
                textarea={field.type === 'textarea' || field.type === 'lines'}
                rows={field.type === 'lines' ? 5 : 4}
                type={field.type === 'link' ? 'text' : 'text'}
                placeholder={field.placeholder || ''}
                helpText={field.helpText || ''}
                disabled={saving}
              />
            )
          ))
        )}
      </div>
    </Modal>
  );
}
