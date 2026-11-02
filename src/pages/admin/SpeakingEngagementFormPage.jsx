import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Check, Copy, Eye, EyeOff, Globe, ImagePlus, Lock, Plus, Save, Trash2, TriangleAlert, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, ConfirmDialog, FormField, PageHeader, PageLoader, Spinner } from '../../components/ui';
import { useFieldErrors } from '../../hooks/useFieldErrors';
import {
  HideNotice,
  PublicationBadge,
  SpeakingPreviewModal,
} from '../../components/admin/speaking/SpeakingAdminShared';
import { visibilitySummary } from '../../utils/speakingAdminText';
import {
  createSpeakingEngagement,
  deleteSpeakingEngagement,
  duplicateSpeakingEngagement,
  fetchSpeakingEngagement,
  hideSpeakingEngagement,
  publishSpeakingEngagement,
  updateSpeakingEngagement,
  uploadSpeakingImage,
} from '../../utils/speakingAdminApi';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { safeExternalUrl } from '../../../shared/safeUrl.js';
import {
  ATTENDANCE_FORMATS,
  AUDIENCE_ACCESS_OPTIONS,
  DEFAULT_SPEAKING_TIMEZONE,
  ENGAGEMENT_LIMITS,
  MEDIA_TYPES,
  PARTICIPATION_STATUSES,
  SPEAKING_EVENT_STATUSES,
  SPEAKING_EVENT_TYPES,
  SPEAKING_ROLES,
  normalizeEngagementInput,
} from '../../../shared/speakingEngagements.js';

const EMPTY_FORM = {
  event_title: '',
  organiser: '',
  event_type: '',
  roles: [],
  session_title: '',
  description: '',
  start_date: '',
  end_date: '',
  dates_tbc: false,
  session_date: '',
  session_start_time: '',
  session_end_time: '',
  timezone: DEFAULT_SPEAKING_TIMEZONE,
  attendance_format: '',
  venue: '',
  city: '',
  country: '',
  audience_access: 'unspecified',
  event_url: '',
  image_url: '',
  image_alt: '',
  participation_status: 'invited',
  event_status: 'scheduled',
  featured: false,
  topics: '',
  media: [],
  admin_notes: '',
};

const EMPTY_MEDIA = { type: 'recording', url: '', label: '' };

function formFromRecord(record) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const value = record?.[key];
    if (typeof EMPTY_FORM[key] === 'boolean') form[key] = Boolean(value);
    else if (Array.isArray(EMPTY_FORM[key])) form[key] = Array.isArray(value) ? value : [];
    else form[key] = value == null ? EMPTY_FORM[key] : String(value);
  }
  // <input type="time"> expects HH:MM.
  form.session_start_time = form.session_start_time.slice(0, 5);
  form.session_end_time = form.session_end_time.slice(0, 5);
  form.topics = Array.isArray(record?.topics) ? record.topics.join(', ') : '';
  form.media = (Array.isArray(record?.media) ? record.media : [])
    .map((item) => ({ type: item.type || 'recording', url: item.url || '', label: item.label || '' }));
  return form;
}

const TIME_ZONES = (() => {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  const rest = zones.filter((z) => z !== DEFAULT_SPEAKING_TIMEZONE);
  if (!rest.includes('UTC')) rest.push('UTC');
  return [DEFAULT_SPEAKING_TIMEZONE, ...rest];
})();

const withBlank = (options, label) => [{ value: '', label }, ...options];

function Section({ title, description, children }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-navy-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-navy-600">{description}</p>}
      {/* A container, so field rows follow the card's width rather than the window's. */}
      <div className="@container mt-4 space-y-4">{children}</div>
    </Card>
  );
}

function CheckboxField({ name, checked, onChange, label, help }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 rounded border-navy-300 text-cyan-700 focus:ring-cyan-700"
      />
      <span>
        <span className="block text-sm font-medium text-navy-800">{label}</span>
        {help && <span className="block text-xs text-navy-600">{help}</span>}
      </span>
    </label>
  );
}

export default function SpeakingEngagementFormPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('speaking.manage');
  const { fieldErrors, setErrors, clearField, clearAll, rootRef } = useFieldErrors();

  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Field to focus once the next render is on screen, e.g. the alt text after an upload.
  const pendingFocusRef = useRef('');

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    document.getElementById(pendingFocusRef.current)?.focus();
    pendingFocusRef.current = '';
  });

  useEffect(() => {
    let cancelled = false;
    clearAll();
    if (!isEditing) {
      setRecord(null);
      setForm(EMPTY_FORM);
      setSavedForm(EMPTY_FORM);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setLoadError('');
    fetchSpeakingEngagement(id)
      .then((data) => {
        if (cancelled) return;
        const next = formFromRecord(data);
        setRecord(data);
        setForm(next);
        setSavedForm(next);
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, isEditing, clearAll]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);

  const update = (name, value) => {
    clearField(name);
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target;
    update(name, type === 'checkbox' ? checked : value);
  };

  const toggleRole = (role) => {
    clearField('roles');
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter((r) => r !== role) : [...prev.roles, role],
    }));
  };

  const updateMedia = (index, key, value) => {
    clearField('media');
    clearField(`media_${key}_${index}`);
    setForm((prev) => ({
      ...prev,
      media: prev.media.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    }));
  };
  // Focus follows the change: into a new row, or back to "Add link" after a removal.
  const addMedia = () => {
    const index = form.media.length;
    setForm((prev) => ({ ...prev, media: [...prev.media, { ...EMPTY_MEDIA }] }));
    requestAnimationFrame(() => document.getElementsByName(`media_type_${index}`)[0]?.focus());
  };
  const removeMedia = (index) => {
    clearField('media');
    ['type', 'url', 'label'].forEach((key) => clearField(`media_${key}_${index}`));
    setForm((prev) => ({ ...prev, media: prev.media.filter((_, i) => i !== index) }));
    requestAnimationFrame(() => document.getElementById('add-media-link')?.focus());
  };
  const mediaRowError = Object.keys(fieldErrors).some((key) => /^media_(type|url|label)_\d+$/.test(key) && fieldErrors[key]);

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      update('image_url', await uploadSpeakingImage(file));
      pendingFocusRef.current = 'image_alt';
      toast.success('Image uploaded. Add a short description for screen readers.');
    } catch (err) {
      pendingFocusRef.current = 'image_upload';
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const applyRecord = (data) => {
    const next = formFromRecord(data);
    setRecord(data);
    setForm(next);
    setSavedForm(next);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const { errors } = normalizeEngagementInput(form);
    if (Object.keys(errors).length) {
      setErrors(errors);
      toast.error(Object.values(errors)[0]);
      return;
    }
    clearAll();
    setSaving(true);
    try {
      if (isEditing) {
        const sent = form;
        const wasPublished = record?.publication_state === 'published';
        const data = await updateSpeakingEngagement(id, sent);
        const next = formFromRecord(data);
        setRecord(data);
        setSavedForm(next);
        // Anything typed while the save was in flight is kept, and stays unsaved.
        setForm((current) => (current === sent ? next : current));
        toast.success(wasPublished && data.publication_state === 'hidden' && data.participation_status === 'declined'
          ? 'Changes saved. Declined engagements stay private, so it is now hidden from the website.'
          : 'Changes saved.');
      } else {
        const created = await createSpeakingEngagement(form);
        toast.success('Saved as a draft. It is not on the website until you publish it.');
        navigate(`/admin/speaking/${created.id}/edit`, { replace: true });
      }
    } catch (err) {
      if (err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action) => {
    setBusyAction(action);
    try {
      if (action === 'publish') {
        const wasHidden = record.publication_state === 'hidden';
        applyRecord(await publishSpeakingEngagement(id));
        toast.success(wasHidden ? 'Engagement republished.' : 'Engagement published.');
      } else if (action === 'hide') {
        applyRecord(await hideSpeakingEngagement(id));
        toast.success('Engagement hidden from the website. Your details are kept.');
      } else if (action === 'duplicate') {
        const copy = await duplicateSpeakingEngagement(id);
        toast.success('Copy created as a draft.');
        navigate(`/admin/speaking/${copy.id}/edit`);
      } else if (action === 'delete') {
        await deleteSpeakingEngagement(id);
        toast.success('Engagement deleted.');
        navigate('/admin/speaking');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyAction('');
      setConfirmDelete(false);
    }
  };

  if (!canManage) {
    return (
      <div className="max-w-xl">
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900" role="alert">
          You can view speaking engagements but not add or edit them. Ask an administrator for the
          “Manage speaking engagements” permission.
        </div>
        <Link to="/admin/speaking" className="mt-4 inline-block text-sm font-medium text-cyan-800 hover:underline dark:text-cyan-300">
          Back to speaking engagements
        </Link>
      </div>
    );
  }

  if (loading) return <PageLoader />;

  if (loadError) {
    return (
      <div className="max-w-xl">
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">{loadError}</div>
        <Link to="/admin/speaking" className="mt-4 inline-block text-sm font-medium text-cyan-800 hover:underline dark:text-cyan-300">
          Back to speaking engagements
        </Link>
      </div>
    );
  }

  const urlStatus = (() => {
    const raw = form.event_url.trim();
    if (!raw) return { tone: 'muted', text: 'No website: the card will not be clickable.' };
    const safe = safeExternalUrl(raw);
    if (!safe) return { tone: 'error', text: 'Only full http:// or https:// addresses are allowed.' };
    // Same rule as the server, which measures the normalised address.
    if (safe.length > ENGAGEMENT_LIMITS.event_url) return { tone: 'error', text: 'This web address is too long.' };
    return { tone: 'ok', text: `The card will link to ${safe} (opens in a new tab).` };
  })();

  // A zone saved from another browser can be missing from this one's list; keep it selectable.
  const timeZoneOptions = form.timezone && !TIME_ZONES.includes(form.timezone)
    ? [form.timezone, ...TIME_ZONES]
    : TIME_ZONES;

  const publication = record?.publication_state || 'draft';
  const declined = form.participation_status === 'declined';
  const savedDeclined = record?.participation_status === 'declined';
  const actionsDisabled = dirty || Boolean(busyAction) || saving;
  const descriptionLength = form.description.length;

  return (
    <div ref={rootRef}>
      <PageHeader
        title={isEditing ? 'Edit Speaking Engagement' : 'New Speaking Engagement'}
        subtitle={isEditing ? form.event_title || 'Untitled engagement' : 'New engagements are saved as drafts.'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Speaking Engagements', to: '/admin/speaking' },
          { label: isEditing ? 'Edit' : 'New' },
        ]}
      />

      <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* A new engagement reopens in edit mode once saved, so its fields are locked meanwhile. */}
        <fieldset disabled={saving && !isEditing} className="space-y-6 min-w-0">
          <Section title="Event">
            <FormField
              label="Event title"
              name="event_title"
              value={form.event_title}
              onChange={handleChange}
              required
              maxLength={ENGAGEMENT_LIMITS.event_title}
              placeholder="e.g. BMSZ2026 Scientific Conference"
              error={fieldErrors.event_title}
            />
            <div className="grid gap-4 @sm:grid-cols-2">
              <FormField
                label="Organising institution"
                name="organiser"
                value={form.organiser}
                onChange={handleChange}
                maxLength={ENGAGEMENT_LIMITS.organiser}
                error={fieldErrors.organiser}
              />
              <FormField
                label="Event type"
                name="event_type"
                type="select"
                value={form.event_type}
                onChange={handleChange}
                options={withBlank(SPEAKING_EVENT_TYPES, 'Not specified')}
                error={fieldErrors.event_type}
              />
            </div>
            <FormField
              label="Session or presentation title"
              name="session_title"
              value={form.session_title}
              onChange={handleChange}
              maxLength={ENGAGEMENT_LIMITS.session_title}
              error={fieldErrors.session_title}
            />
            <FormField
              label="Short public description"
              name="description"
              textarea
              rows={3}
              value={form.description}
              onChange={handleChange}
              maxLength={ENGAGEMENT_LIMITS.description}
              helpText={`${descriptionLength}/${ENGAGEMENT_LIMITS.description} characters. Shown on the card.`}
              error={fieldErrors.description}
            />
          </Section>

          <Section title="Your role" description="Choose every role you have at this event.">
            <fieldset>
              <legend className="sr-only">Your role or roles</legend>
              <div className="flex flex-wrap gap-2">
                {SPEAKING_ROLES.map((role, index) => {
                  const selected = form.roles.includes(role.value);
                  return (
                    <button
                      key={role.value}
                      type="button"
                      aria-pressed={selected}
                      data-field={index === 0 ? 'roles' : undefined}
                      onClick={() => toggleRole(role.value)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        selected
                          ? 'border-cyan-700 bg-cyan-700 text-white'
                          : 'border-navy-200 bg-white text-navy-700 hover:border-cyan-700'
                      }`}
                    >
                      {selected && <Check size={14} aria-hidden="true" />}
                      {role.label}
                    </button>
                  );
                })}
              </div>
              {fieldErrors.roles && <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{fieldErrors.roles}</p>}
            </fieldset>
          </Section>

          <Section title="Dates" description="Dates are kept exactly as entered, in the event's own time zone.">
            <CheckboxField
              name="dates_tbc"
              checked={form.dates_tbc}
              onChange={handleChange}
              label="Dates to be confirmed"
              help="The card appears under “Dates to be announced” and shows no date. Any dates below are kept for later."
            />
            <div className="grid gap-4 @sm:grid-cols-2">
              <FormField label="Event start date" name="start_date" type="date" value={form.start_date} onChange={handleChange} error={fieldErrors.start_date} />
              <FormField label="Event end date" name="end_date" type="date" value={form.end_date} onChange={handleChange} helpText="Leave empty for a one-day event." error={fieldErrors.end_date} />
            </div>
            <FormField
              label="Event time zone"
              name="timezone"
              type="select"
              value={form.timezone}
              onChange={handleChange}
              options={timeZoneOptions}
              helpText="Decides when the event moves to “Previous Engagements”."
              error={fieldErrors.timezone}
            />
            <div className="@container rounded-xl border border-navy-100 bg-navy-50 p-4">
              <p className="text-sm font-medium text-navy-800">Your speaking session (optional)</p>
              <p className="text-xs text-navy-600">Only if you know when you speak. Leave empty rather than guessing.</p>
              {/* Date and time inputs need about 8rem each before their values clip. */}
              <div className="mt-3 grid gap-4 @lg:grid-cols-3">
                <FormField label="Session date" name="session_date" type="date" value={form.session_date} onChange={handleChange} error={fieldErrors.session_date} />
                <FormField label="Starts" name="session_start_time" type="time" value={form.session_start_time} onChange={handleChange} error={fieldErrors.session_start_time} />
                <FormField label="Ends" name="session_end_time" type="time" value={form.session_end_time} onChange={handleChange} error={fieldErrors.session_end_time} />
              </div>
            </div>
          </Section>

          <Section title="Location">
            <FormField
              label="Attendance format"
              name="attendance_format"
              type="select"
              value={form.attendance_format}
              onChange={handleChange}
              options={withBlank(ATTENDANCE_FORMATS, 'Not specified')}
              error={fieldErrors.attendance_format}
            />
            <div className="grid gap-4 @md:grid-cols-3">
              <FormField label="Venue" name="venue" value={form.venue} onChange={handleChange} maxLength={ENGAGEMENT_LIMITS.venue} error={fieldErrors.venue} />
              <FormField label="City" name="city" value={form.city} onChange={handleChange} maxLength={ENGAGEMENT_LIMITS.city} error={fieldErrors.city} />
              <FormField label="Country" name="country" value={form.country} onChange={handleChange} maxLength={ENGAGEMENT_LIMITS.country} error={fieldErrors.country} />
            </div>
          </Section>

          <Section title="Public details">
            <FormField
              label="Audience access"
              name="audience_access"
              type="select"
              value={form.audience_access}
              onChange={handleChange}
              options={AUDIENCE_ACCESS_OPTIONS}
              error={fieldErrors.audience_access}
            />
            <div>
              <FormField
                label="Event website"
                name="event_url"
                type="url"
                value={form.event_url}
                onChange={handleChange}
                placeholder="https://"
                error={fieldErrors.event_url}
              />
              {!fieldErrors.event_url && (
                <p
                  className={`mt-1 text-xs ${
                    urlStatus.tone === 'error'
                      ? 'text-red-600 dark:text-red-300'
                      : urlStatus.tone === 'ok' ? 'text-green-700 dark:text-green-300' : 'text-navy-600'
                  }`}
                  aria-live="polite"
                >
                  {urlStatus.text}
                </p>
              )}
            </div>

            <div data-field-wrapper="image_url">
              <p className="block text-sm font-medium text-navy-700 mb-1.5">Event image or organiser logo</p>
              <p className="text-xs text-navy-600 mb-2">Use only images you are approved to publish.</p>
              {form.image_url ? (
                <div className="flex items-center gap-4">
                  <img
                    src={resolveMediaUrl(form.image_url)}
                    alt=""
                    className="h-16 w-auto max-w-[10rem] rounded-lg border border-navy-100 bg-white object-contain p-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      update('image_url', '');
                      update('image_alt', '');
                      pendingFocusRef.current = 'image_upload';
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-navy-600 hover:bg-navy-100 hover:text-navy-700"
                  >
                    <X size={14} aria-hidden="true" />
                    Remove image
                  </button>
                </div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-navy-300 px-4 py-2.5 text-sm font-medium text-navy-700 hover:border-cyan-700 focus-within:ring-2 focus-within:ring-cyan-700 dark:focus-within:ring-cyan-300">
                  {uploading ? <Spinner size={16} /> : <ImagePlus size={16} aria-hidden="true" />}
                  {uploading ? 'Uploading…' : 'Upload image'}
                  <input
                    id="image_upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={uploading}
                    onChange={handleImageUpload}
                  />
                </label>
              )}
              {fieldErrors.image_url && <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{fieldErrors.image_url}</p>}
            </div>
            {form.image_url && (
              <FormField
                label="Image description (alt text)"
                name="image_alt"
                value={form.image_alt}
                onChange={handleChange}
                required
                maxLength={ENGAGEMENT_LIMITS.image_alt}
                placeholder="e.g. BMSZ conference logo"
                error={fieldErrors.image_alt}
              />
            )}
            <FormField
              label="Topics"
              name="topics"
              value={form.topics}
              onChange={handleChange}
              placeholder="e.g. Leadership, Laboratory systems"
              helpText="Separate topics with commas. Shown on the card and used by the topic filter on the Speaking page."
              error={fieldErrors.topics}
            />
          </Section>

          <Section
            title="Recordings and resources"
            description="Approved recordings, slides, photos or articles, usually added after the event. Each one shows as its own button on the card and never makes the card itself clickable."
          >
            <div data-field-wrapper="media" className="space-y-3">
              {form.media.length === 0 && <p className="text-sm text-navy-600">No links yet.</p>}
              {form.media.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-xl border border-navy-100 p-3 @xl:grid-cols-[9rem_minmax(0,1fr)_minmax(0,12rem)_auto] @xl:items-end">
                  <FormField
                    label="Type"
                    name={`media_type_${index}`}
                    error={fieldErrors[`media_type_${index}`]}
                    type="select"
                    value={item.type}
                    onChange={(e) => updateMedia(index, 'type', e.target.value)}
                    options={MEDIA_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  />
                  <FormField
                    label="Web address"
                    name={`media_url_${index}`}
                    error={fieldErrors[`media_url_${index}`]}
                    type="url"
                    value={item.url}
                    onChange={(e) => updateMedia(index, 'url', e.target.value)}
                    placeholder="https://"
                  />
                  <FormField
                    label="Button label (optional)"
                    name={`media_label_${index}`}
                    error={fieldErrors[`media_label_${index}`]}
                    value={item.label}
                    onChange={(e) => updateMedia(index, 'label', e.target.value)}
                    maxLength={ENGAGEMENT_LIMITS.media_label}
                    placeholder={MEDIA_TYPES.find((t) => t.value === item.type)?.action}
                  />
                  <button
                    type="button"
                    onClick={() => removeMedia(index)}
                    aria-label={`Remove link ${index + 1}`}
                    className="inline-flex h-10 items-center justify-center rounded-lg px-3 text-navy-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {fieldErrors.media && !mediaRowError && <p className="text-xs text-red-600 dark:text-red-300" role="alert">{fieldErrors.media}</p>}
              <button
                id="add-media-link"
                type="button"
                onClick={addMedia}
                disabled={form.media.length >= ENGAGEMENT_LIMITS.media}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-navy-300 px-3 py-2 text-sm font-medium text-navy-700 hover:border-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={15} aria-hidden="true" />
                Add link
              </button>
            </div>
          </Section>

          <Section title="Status" description="Participation status never publishes or hides the engagement.">
            <div className="grid gap-4 @sm:grid-cols-2">
              <FormField
                label="Your participation"
                name="participation_status"
                type="select"
                value={form.participation_status}
                onChange={handleChange}
                options={PARTICIPATION_STATUSES}
                error={fieldErrors.participation_status}
              />
              <FormField
                label="Event status"
                name="event_status"
                type="select"
                value={form.event_status}
                onChange={handleChange}
                options={SPEAKING_EVENT_STATUSES}
                error={fieldErrors.event_status}
              />
            </div>
            {declined && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {publication === 'published'
                  ? 'Saving as Declined takes this engagement off the website: it becomes Hidden. Changing your participation later does not bring it back; republishing is a separate step.'
                  : 'Declined engagements stay private and can’t be published.'}
              </p>
            )}
            <CheckboxField
              name="featured"
              checked={form.featured}
              onChange={handleChange}
              label="Featured engagement"
              help="Shown in the homepage’s “Next Speaking Engagement” band while it is upcoming, confirmed and scheduled. Without one, the band shows the next confirmed engagement."
            />
          </Section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
            <h2 className="flex items-center gap-2 text-base font-semibold text-amber-950 dark:text-amber-100">
              <Lock size={16} aria-hidden="true" />
              Private notes
            </h2>
            <p className="mt-0.5 text-sm text-amber-900 dark:text-amber-200">Never shown on the website. For contacts, fees, logistics, and reminders.</p>
            <div className="mt-3">
              <FormField
                label="Notes"
                name="admin_notes"
                textarea
                rows={4}
                value={form.admin_notes}
                onChange={handleChange}
                maxLength={ENGAGEMENT_LIMITS.admin_notes}
                error={fieldErrors.admin_notes}
              />
            </div>
          </section>
        </fieldset>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-navy-900">Website</h2>
              <PublicationBadge state={publication} />
            </div>
            <p className="mt-2 text-sm text-navy-600">
              {isEditing ? visibilitySummary(record) : 'This engagement will be saved as a draft.'}
            </p>

            <div className="mt-4 space-y-2">
              <button
                type="submit"
                disabled={saving || (isEditing && !dirty)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Spinner size={16} /> : <Save size={16} aria-hidden="true" />}
                {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save as draft'}
              </button>

              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-navy-200 px-4 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50"
              >
                <Eye size={16} aria-hidden="true" />
                Preview card
              </button>

              {isEditing && (publication === 'published' ? (
                <button
                  type="button"
                  disabled={actionsDisabled}
                  onClick={() => runAction('hide')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                >
                  {busyAction === 'hide' ? <Spinner size={16} /> : <EyeOff size={16} aria-hidden="true" />}
                  Hide from website
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionsDisabled || savedDeclined}
                  onClick={() => runAction('publish')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-navy-600 dark:hover:bg-navy-700"
                >
                  {busyAction === 'publish' ? <Spinner size={16} /> : <Globe size={16} aria-hidden="true" />}
                  {publication === 'hidden' ? 'Republish' : 'Publish'}
                </button>
              ))}

              {isEditing && dirty && (
                <p className="text-xs text-navy-600">Save your changes before publishing, hiding, or duplicating.</p>
              )}
              {isEditing && !dirty && savedDeclined && publication !== 'published' && (
                <p className="text-xs text-navy-600">Declined engagements can’t be published. Change your participation first.</p>
              )}
            </div>

            {isEditing && <HideNotice className="mt-4 border-t border-navy-100 pt-4" />}
          </Card>

          {isEditing && (
            <Card>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={actionsDisabled}
                  onClick={() => runAction('duplicate')}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-navy-700 hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Copy size={15} aria-hidden="true" />
                  Duplicate as draft
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Delete engagement
                </button>
              </div>
            </Card>
          )}
        </aside>
      </form>

      <SpeakingPreviewModal
        record={{ ...form, id: record?.id, publication_state: publication }}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => { if (!busyAction) setConfirmDelete(false); }}
        onConfirm={() => runAction('delete')}
        title="Delete engagement"
        message={`Delete “${record?.event_title || ''}” permanently? To take it off the website but keep it, hide it instead. This cannot be undone.`}
        confirmLabel="Delete engagement"
        variant="danger"
        loading={busyAction === 'delete'}
      />
    </div>
  );
}
