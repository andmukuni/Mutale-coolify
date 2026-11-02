import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, ImageOff, Upload } from 'lucide-react';
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

// Upload controls: the file input stays focusable (sr-only), and the label shows its focus ring.
const UPLOAD_LABEL = 'relative inline-flex items-center gap-2 rounded-lg text-sm font-medium focus-within:ring-2 focus-within:ring-cyan-700 focus-within:ring-offset-2 dark:focus-within:ring-cyan-300 dark:focus-within:ring-offset-navy-900';
const UPLOAD_LABEL_ENABLED = 'cursor-pointer text-cyan-800 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200';
const UPLOAD_LABEL_DISABLED = 'cursor-not-allowed text-navy-300';
const REMOVE_BUTTON = 'block text-xs text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200';

function ImageField({ field, value, onChange, disabled, onUploadingChange }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const url = await uploadSiteImageFile(file);
      onChange(url);
      toast.success('Image uploaded.');
    } catch (err) {
      toast.error(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
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
            <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${isCustom ? 'bg-cyan-700 text-white' : 'bg-navy-900/70 text-white'}`}>
              {isCustom ? 'Custom' : 'Current default'}
            </span>
          </div>
        ) : (
          <div className="h-20 w-32 rounded-lg border border-dashed border-navy-200 flex flex-col items-center justify-center gap-1 text-xs text-navy-600">
            <ImageOff size={18} />
            None
          </div>
        )}
        <div className="space-y-2">
          <label className={`${UPLOAD_LABEL} ${uploading || disabled ? UPLOAD_LABEL_DISABLED : UPLOAD_LABEL_ENABLED}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              aria-label={`Upload image: ${field.label}`}
              disabled={uploading || disabled}
              onChange={(e) => void handleUpload(e)}
            />
            <Upload size={15} aria-hidden="true" />
            {uploading ? 'Uploading…' : 'Upload image'}
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled}
              className={REMOVE_BUTTON}
            >
              Remove (use default)
            </button>
          )}
        </div>
      </div>
      {field.helpText && <p className="mt-1.5 text-xs text-navy-600">{field.helpText}</p>}
    </div>
  );
}

function FileField({ field, value, onChange, disabled, onUploadingChange }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    onUploadingChange?.(true);
    try {
      onChange(await field.upload(file));
      toast.success('File uploaded. Save the section to publish it.');
    } catch (err) {
      toast.error(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  const fileName = value ? decodeURIComponent(String(value).split('/').pop() || '') : '';

  return (
    <div>
      <span className="block text-sm font-medium text-navy-700 mb-1.5">{field.label}</span>
      <div className="flex flex-wrap items-center gap-4">
        {value ? (
          <a
            href={resolveMediaUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-xs items-center gap-2 rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-sm text-navy-700 hover:border-cyan-600"
          >
            <FileText size={16} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{fileName}</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-navy-200 px-3 py-2 text-xs text-navy-600">
            <FileText size={16} aria-hidden="true" />
            No file
          </span>
        )}
        <div className="space-y-2">
          <label className={`${UPLOAD_LABEL} ${uploading || disabled ? UPLOAD_LABEL_DISABLED : UPLOAD_LABEL_ENABLED}`}>
            <input
              type="file"
              accept={field.accept}
              className="sr-only"
              aria-label={`${value ? 'Replace file' : 'Upload file'}: ${field.label}`}
              disabled={uploading || disabled}
              onChange={(e) => void handleUpload(e)}
            />
            <Upload size={15} aria-hidden="true" />
            {uploading ? 'Uploading…' : value ? 'Replace file' : 'Upload file'}
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled}
              aria-label={`Remove ${field.label}`}
              className={REMOVE_BUTTON}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {field.helpText && <p className="mt-1.5 text-xs text-navy-600">{field.helpText}</p>}
    </div>
  );
}

export default function SectionEditorDrawer({ section, isOpen, onClose }) {
  const { profile, updateProfile } = useData();
  const toast = useToast();
  const [form, setForm] = useState({});
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  // Field keys with an upload in flight; saving waits until they finish.
  const [uploadingKeys, setUploadingKeys] = useState(() => new Set());
  const uploading = uploadingKeys.size > 0;

  const fields = useMemo(() => section?.fields || [], [section]);

  // The profile refreshes in the background (window focus, polling). Read it through a
  // ref so only opening the drawer or switching section fills the form; a refresh must
  // not wipe unsaved edits or an uploaded-but-unsaved file.
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!section || !isOpen) return;
    const current = profileRef.current;
    const next = {};
    for (const field of fields) {
      next[field.key] = valueToFormString(getByPath(current, field.path), field.type);
    }
    setForm(next);
    setVisible(getSectionVisibility(current, section));
  }, [section, fields, isOpen]);

  if (!section) return null;

  const setFieldValue = (field, raw) => {
    setForm((prev) => ({ ...prev, [field.key]: raw }));
  };

  const setFieldUploading = (field, flag) => setUploadingKeys((prev) => {
    const next = new Set(prev);
    if (flag) next.add(field.key);
    else next.delete(field.key);
    return next;
  });

  const handleSave = async () => {
    if (uploading) return;
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
          {uploading && (
            <p className="mr-auto text-xs text-navy-600" role="status">Wait for the upload to finish before saving.</p>
          )}
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
            disabled={uploading}
            onClick={() => void handleSave()}
            className="px-4 py-2 text-sm font-medium bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl"
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
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-cyan-800 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
            >
              {section.manageLink.label}
              <ExternalLink size={14} aria-hidden="true" />
            </Link>
          </div>
        )}

        {section.toggleable && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-navy-100 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-navy-800">Show on website</span>
              <span className="block text-xs text-navy-600">Turn off to hide this section from visitors.</span>
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
                onUploadingChange={(flag) => setFieldUploading(field, flag)}
                disabled={saving}
              />
            ) : field.type === 'file' ? (
              <FileField
                key={field.key}
                field={field}
                value={form[field.key] || ''}
                onChange={(url) => setFieldValue(field, url)}
                onUploadingChange={(flag) => setFieldUploading(field, flag)}
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
