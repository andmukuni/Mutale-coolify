import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, ChevronLeft, ChevronRight, CheckCircle2, Plus, Trash2, Upload } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, FormField, Spinner } from '../../components/ui';
import { generateSlug, generateId } from '../../utils/helpers';
import EventPublicQrCard from '../../components/admin/EventPublicQrCard';
import { formatPrice, isEventPast } from '../../utils/eventServices';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

const eventCategories = [
  'Workshop', 'Seminar', 'Training', 'Conference',
  'Masterclass', 'Review', 'Webinar', 'Meeting', 'Other',
];

const formSteps = [
  { label: 'Basic Details', hint: 'Title, description, and featured image' },
  { label: 'Schedule & Venue', hint: 'Date, time, location, and mode' },
  { label: 'Registration Setup', hint: 'Pricing, visibility, and organizer' },
  { label: 'Speakers & Partners', hint: 'Featured speakers and event partners' },
  { label: 'Review & Publish', hint: 'Final confirmation before save' },
];

function toLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function ceilToNextHalfHour(date = new Date()) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const addMinutes = minutes === 0 || minutes === 30 ? 30 : (minutes < 30 ? 30 - minutes : 60 - minutes);
  next.setMinutes(minutes + addMinutes);
  return next;
}

function combineLocalDateTime(dateValue, timeValue, fallbackTime = '00:00') {
  const datePart = String(dateValue || '').trim();
  if (!datePart) return null;
  const timePart = String(timeValue || fallbackTime).trim() || fallbackTime;
  const normalizedTime = /^\d{2}:\d{2}:\d{2}$/.test(timePart) ? timePart.slice(0, 5) : timePart;
  const dt = new Date(`${datePart}T${normalizedTime}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function createDefaultEvent() {
  const start = ceilToNextHalfHour(new Date());
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const deadline = new Date(start.getTime() - 60 * 60 * 1000);

  return {
    ...emptyEvent,
    start_date: toLocalDateInputValue(start),
    end_date: toLocalDateInputValue(start),
    start_time: toTimeInputValue(start),
    end_time: toTimeInputValue(end),
    registration_deadline: toLocalDateInputValue(deadline),
    registration_deadline_time: toTimeInputValue(deadline),
  };
}

const emptyEvent = {
  title: '',
  slug: '',
  short_description: '',
  description: '',
  cover_image: '',
  event_mode: 'virtual',
  meeting_platform: 'zoom',
  meeting_link: '',
  venue: '',
  location: '',
  start_date: '',
  end_date: '',
  start_time: '',
  end_time: '',
  timezone: 'Africa/Lusaka',
  capacity: '',
  booking_type: 'subscription',
  price: 0,
  is_free: true,
  status: 'draft',
  registration_deadline: '',
  registration_deadline_time: '',
  visibility: 'public',
  organizer_name: '',
  organizer_email: '',
  organizer_phone: '',
  category: 'Workshop',
  featured: false,
  featured_speakers: [],
  partners: [],
  forum_enabled: false,
};

function buildCloneForm(sourceEvent = {}) {
  const defaults = createDefaultEvent();
  const copyStamp = Date.now().toString().slice(-6);
  const sourceTitle = String(sourceEvent.title || '').trim();
  const clonedTitle = sourceTitle ? `${sourceTitle} (Copy)` : 'Untitled Event (Copy)';

  return {
    ...emptyEvent,
    ...sourceEvent,
    ...defaults,
    id: '',
    title: clonedTitle,
    slug: generateSlug(`${sourceEvent.slug || generateSlug(clonedTitle)}-copy-${copyStamp}`),
    status: 'draft',
    featured: false,
  };
}

function getInitialForm(events, id, cloneId) {
  if (!id) {
    if (cloneId) {
      const source = events.find((e) => e.id === cloneId);
      if (source) return buildCloneForm(source);
    }
    return createDefaultEvent();
  }
  const event = events.find((e) => e.id === id);
  return event ? { ...emptyEvent, ...event } : null;
}

export default function EventFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const cloneId = String(searchParams.get('clone') || '').trim();
  const navigate = useNavigate();
  const { events, addEvent, updateEvent, isDataLoaded } = useData();
  const toast = useToast();
  const isEditing = Boolean(id);
  const isCloning = !isEditing && Boolean(cloneId);

  const initialForm = getInitialForm(events, id, cloneId);
  const [form, setForm] = useState(() => initialForm || emptyEvent);
  const [hasHydratedEditForm, setHasHydratedEditForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [videoSettings, setVideoSettings] = useState({
    defaultProvider: 'zoom',
    enabledProviders: ['zoom', 'daily'],
  });
  const stepRef = useRef(0);           // always mirrors currentStep synchronously
  const isPastLockedEvent = isEditing && Boolean(initialForm) && isEventPast(initialForm);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/settings/system`, { headers: getAdminAuthHeaders() });
        const json = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || !json?.ok) return;
        const video = json.data?.video || {};
        const defaultProvider = video.defaultProvider === 'daily' ? 'daily' : 'zoom';
        const enabledProviders = Array.isArray(video.enabledProviders)
          ? video.enabledProviders.filter((p) => p === 'zoom' || p === 'daily')
          : ['zoom', 'daily'];
        setVideoSettings({ defaultProvider, enabledProviders: enabledProviders.length ? enabledProviders : ['zoom'] });
        if (!isEditing) {
          setForm((prev) => ({
            ...prev,
            meeting_platform: enabledProviders.includes(defaultProvider) ? defaultProvider : (enabledProviders[0] || 'zoom'),
          }));
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => { cancelled = true; };
  }, [isEditing]);

  const normalizeSlug = (value) => String(value || '').trim().toLowerCase();

  const getSubmitErrorMessage = (error) => {
    const raw = String(error?.message || '').trim();
    const msg = raw.toLowerCase();

    if (!raw) return 'Could not save this event right now. Please try again.';
    if (msg.includes('title and slug are required')) return 'Please provide both Title and Slug in Basic Details.';
    if (msg.includes('duplicate entry') && msg.includes('slug')) {
      return 'This slug already exists. Change the title or slug to something unique.';
    }
    if (msg.includes('request entity too large') || msg.includes('payload too large') || msg.includes('(413)')) {
      return 'Image upload is too large for server limits. Use a smaller image or paste an image URL.';
    }
    if (msg.includes('max_allowed_packet')) {
      return 'The selected cover image is too large for database storage. Use a smaller image (or image URL) and try again.';
    }
    if (msg.includes('epipe') || msg.includes('socket hang up') || msg.includes('connection reset')) {
      return 'Temporary server connection issue while saving. Please click Update Event once more.';
    }

    return raw;
  };

  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (!isEditing) return;
    if (initialForm && !hasHydratedEditForm) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({ ...emptyEvent, ...initialForm });
      setHasHydratedEditForm(true);
    }
  }, [isEditing, initialForm, hasHydratedEditForm]);

  useEffect(() => {
    // Only redirect after initial data is loaded and no matching event exists.
    if (isEditing && isDataLoaded && !initialForm && !hasHydratedEditForm) {
      navigate('/admin/events');
    }
  }, [isEditing, isDataLoaded, initialForm, hasHydratedEditForm, navigate]);

  useEffect(() => {
    // Invalid clone source id: return to events list.
    if (!isEditing && cloneId && isDataLoaded && !initialForm) {
      navigate('/admin/events');
    }
  }, [isEditing, cloneId, isDataLoaded, initialForm, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newVal = type === 'checkbox' ? checked : value;
    if (name === 'cover_image' && value.trim()) setPhotoError('');
    if (stepError) setStepError('');
    setForm((prev) => {
      const next = {
        ...prev,
        [name]: newVal,
        ...(name === 'title' && !isEditing ? { slug: generateSlug(value) } : {}),
        ...(name === 'start_date' ? { date: value } : {}),
        ...(name === 'start_time' ? { time: value } : {}),
        ...(name === 'end_time' ? { endTime: value } : {}),
        ...(name === 'event_mode' && value === 'in_person' ? { meeting_platform: '', meeting_link: '' } : {}),
      };

      if (name === 'start_date') {
        if (!next.end_date || next.end_date < value) next.end_date = value;
        if (!next.registration_deadline) next.registration_deadline = value;
      }

      if (name === 'start_time') {
        if (!next.end_time) {
          const startDt = combineLocalDateTime(next.start_date, value);
          if (startDt) {
            startDt.setHours(startDt.getHours() + 1);
            next.end_time = toTimeInputValue(startDt);
          }
        }
        if (!next.registration_deadline_time) next.registration_deadline_time = value;
      }

      return next;
    });
  };

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please upload a valid image file (JPG, PNG, WebP).');
      return;
    }

    const MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB — keeps base64 payload under 2 MB
    if (file.size > MAX_BYTES) {
      setPhotoError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please resize it to under 1.5 MB before uploading, or paste an image URL instead.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, cover_image: String(reader.result || '') }));
      setPhotoError('');
      if (stepError) setStepError('');
    };
    reader.readAsDataURL(file);
  };

  const validateStep = (stepIndex) => {
    if (stepIndex === 0) {
      if (!form.title.trim()) return 'Event title is required.';
      if (!form.slug.trim()) return 'Slug is required.';

      const targetSlug = normalizeSlug(form.slug);
      const hasSlugConflict = events.some((event) => (
        event.id !== id && normalizeSlug(event.slug) === targetSlug
      ));
      if (hasSlugConflict) {
        return 'This slug already exists. Use a different title or edit the slug.';
      }

      if (!form.description.trim()) return 'Full description is required.';
      if (!isEditing && !(form.cover_image || '').trim()) return 'Featured photo is required for new events.';
      return '';
    }

    if (stepIndex === 1) {
      if (!form.location.trim()) return 'Location / City is required.';
      if (!form.start_date) return 'Start date is required.';
      if (!form.end_date) return 'End date is required.';
      if (form.end_date < form.start_date) return 'End date cannot be earlier than start date.';

      if (form.start_time && form.end_time && form.start_date === form.end_date) {
        const startDt = combineLocalDateTime(form.start_date, form.start_time);
        const endDt = combineLocalDateTime(form.end_date, form.end_time);
        if (startDt && endDt && endDt <= startDt) {
          return 'End time must be later than start time when the event starts and ends on the same day.';
        }
      }
      return '';
    }

    if (stepIndex === 2) {
      if (!form.registration_deadline) return 'Registration deadline date is required.';
      if (!form.registration_deadline_time) return 'Registration deadline time is required.';

      const startDt = combineLocalDateTime(form.start_date, form.start_time, '00:00');
      const endDt = combineLocalDateTime(form.end_date, form.end_time, '23:59');
      const deadlineDt = combineLocalDateTime(form.registration_deadline, form.registration_deadline_time, '00:00');
      if (endDt && deadlineDt && deadlineDt > endDt) {
        return 'Registration deadline cannot be after the event ends.';
      }

      if (!form.is_free && (!form.price || Number(form.price) <= 0)) {
        return 'Please set a valid paid price, or mark the event as free.';
      }
      if (form.organizer_email && !/^\S+@\S+\.\S+$/.test(form.organizer_email)) {
        return 'Organizer email format looks invalid.';
      }
      return '';
    }

    return '';
  };

  const handleNextStep = () => {
    const error = validateStep(currentStep);
    if (error) {
      setStepError(error);
      return;
    }
    setStepError('');
    setCurrentStep((prev) => {
      const next = Math.min(prev + 1, formSteps.length - 1);
      stepRef.current = next;
      return next;
    });
  };

  const handlePrevStep = () => {
    setStepError('');
    setCurrentStep((prev) => {
      const next = Math.max(prev - 1, 0);
      stepRef.current = next;
      return next;
    });
  };

  const handleFormKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const tag = String(e.target?.tagName || '').toLowerCase();
    // Let Enter work normally inside textareas (new line).
    if (tag === 'textarea') return;
    // Prevent any default browser action (there's no <form>, but just in case).
    e.preventDefault();
    e.stopPropagation();
    // On the final step, Enter triggers save; otherwise advance to next step.
    if (stepRef.current >= formSteps.length - 1) {
      handleSubmit();
    } else {
      handleNextStep();
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (submitting) return;
    setSaveError('');

    if (isPastLockedEvent) {
      setSaveError('Past events are locked and cannot be edited.');
      return;
    }

    // Use the synchronous ref – React may not have flushed setCurrentStep yet.
    if (stepRef.current < formSteps.length - 1) {
      // Not on final step – just advance.  Do NOT save.
      handleNextStep();
      return;
    }

    const payload = { ...form };
    payload.cover_image = (payload.cover_image || '').trim();

    if (!isEditing && !payload.cover_image) {
      setPhotoError('Featured photo is required when creating an event.');
      setCurrentStep(0);
      return;
    }

    for (let i = 0; i < formSteps.length - 1; i += 1) {
      const error = validateStep(i);
      if (error) {
        setCurrentStep(i);
        setStepError(error);
        return;
      }
    }

    if (!payload.slug) payload.slug = generateSlug(payload.title);
    if (!payload.booking_type) payload.booking_type = 'subscription';
    if (payload.event_mode === 'in_person') {
      payload.meeting_platform = '';
      payload.meeting_link = '';
    }
    if (payload.is_free) payload.price = 0;

    // Avoid re-sending very large unchanged cover images on edit updates.
    // This helps prevent backend/DB packet size errors.
    if (isEditing && initialForm && payload.cover_image === initialForm.cover_image) {
      delete payload.cover_image;
    }

    const changedPayload = isEditing && initialForm
      ? Object.fromEntries(
        Object.entries(payload).filter(([key, value]) => key !== 'id' && value !== initialForm[key]),
      )
      : payload;

    // Wait for the server round-trip to finish before navigating, so the
    // route-change refresh fetches the already-persisted data instead of stale
    // rows that overwrite the optimistic update.
    let profileId = id;
    if (!isEditing && !payload.id) {
      payload.id = generateId('evt');
    }
    if (!isEditing) {
      profileId = payload.id;
    }

    try {
      setSubmitting(true);
      if (isEditing) {
        await updateEvent(id, changedPayload);
      } else {
        await addEvent(payload);
      }
    } catch (error) {
      const msg = getSubmitErrorMessage(error);
      setSaveError(msg);
      toast.error(msg);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setSaved(true);
    toast.success(isEditing ? 'Event updated.' : 'Event created.');
    setTimeout(() => navigate(`/admin/events/${profileId}`), 800);
  };

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Edit Event' : isCloning ? 'Clone Event' : 'Create Event'}
        subtitle={isEditing ? `Editing: ${form.title}` : isCloning ? 'Review the cloned details and publish as a new event' : 'Add a new event'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Events', to: '/admin/events' },
          { label: isEditing ? 'Edit' : isCloning ? 'Clone' : 'New' },
        ]}
      />

      {saved && (
        <div role="status" aria-live="polite" className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Event {isEditing ? 'updated' : 'created'} successfully! Opening event profile with your QR code…
        </div>
      )}

      {saveError && (
        <div role="alert" aria-live="assertive" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {saveError}
        </div>
      )}

      {isPastLockedEvent && (
        <div role="alert" aria-live="polite" className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          This event has already ended and is locked for editing.
        </div>
      )}

  <Card className="max-w-3xl mx-auto">
  <div onKeyDown={handleFormKeyDown} className="space-y-5 pb-24 sm:pb-0">
          {/* Stepper */}
          <div className="flex sm:grid sm:grid-cols-4 gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
            {formSteps.map((step, index) => {
              const isActive = index === currentStep;
              const isDone = index < currentStep;
              return (
                <div
                  key={step.label}
                  className={`rounded-xl border px-3 py-2.5 min-w-[170px] sm:min-w-0 snap-start ${isActive ? 'border-cyan-300 bg-cyan-50' : isDone ? 'border-green-200 bg-green-50' : 'border-navy-100 bg-navy-50'}`}
                >
                  <p className={`text-xs font-semibold ${isActive ? 'text-cyan-700' : isDone ? 'text-green-700' : 'text-navy-500'}`}>
                    Step {index + 1}
                  </p>
                  <p className={`text-sm font-medium ${isActive ? 'text-cyan-900' : 'text-navy-700'}`}>{step.label}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-navy-100 p-4 bg-navy-50/30">
            <p className="text-sm font-semibold text-navy-800">{formSteps[currentStep].label}</p>
            <p className="text-xs text-navy-500 mt-0.5">{formSteps[currentStep].hint}</p>
          </div>

          {stepError && (
            <div role="alert" aria-live="assertive" className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {stepError}
            </div>
          )}

          {currentStep === 0 && (
            <>
              <FormField label="Title" name="title" value={form.title} onChange={handleChange} required placeholder="Event title" />
              <FormField label="Slug" name="slug" value={form.slug} onChange={handleChange} placeholder="auto-generated-from-title" helpText="URL-friendly identifier (auto-filled from title)" />
              <FormField label="Short Description" name="short_description" value={form.short_description} onChange={handleChange} placeholder="One-line summary (shown in cards)" />
              <FormField label="Full Description" name="description" value={form.description} onChange={handleChange} textarea rows={5} required placeholder="Full event description…" />
              <FormField
                label="Featured Photo (Event Cover)"
                name="cover_image"
                value={form.cover_image}
                onChange={handleChange}
                placeholder="https://..."
                required={!isEditing}
                helpText="Paste an image URL or upload an image file below."
              />
              <div>
                <label htmlFor="cover_upload" className="block text-sm font-medium text-navy-700 mb-1.5">
                  Upload Featured Photo
                </label>
                <input
                  id="cover_upload"
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="block w-full text-sm text-navy-600 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-cyan-500"
                />
                <p className="mt-1 text-xs text-navy-400">
                  Recommended: <span className="font-medium">1200 × 630 px</span> (16:9) · JPG or WebP · Max <span className="font-medium">1.5 MB</span>
                </p>
                {photoError && <p className="mt-1 text-xs text-red-500">{photoError}</p>}
              </div>

              {form.cover_image && (
                <div className="rounded-xl border border-navy-100 overflow-hidden">
                  <img
                    src={form.cover_image}
                    alt="Event cover preview"
                    className="w-full h-48 object-cover"
                  />
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Category" name="category" type="select" value={form.category} onChange={handleChange} options={eventCategories} />
                <FormField
                  label="Status"
                  name="status"
                  type="select"
                  value={form.status}
                  onChange={handleChange}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'published', label: 'Published' },
                    { value: 'closed', label: 'Closed' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="featured"
                    checked={form.featured}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-navy-700 group-hover:text-navy-900">Featured event</span>
                    <p className="text-xs text-navy-400">Featured events appear on the homepage</p>
                  </div>
                </label>
              </div>
            </>
          )}

          {currentStep === 1 && (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                <FormField
                  label="Event Mode"
                  name="event_mode"
                  type="select"
                  value={form.event_mode}
                  onChange={handleChange}
                  options={[
                    { value: 'virtual', label: 'Virtual' },
                    { value: 'in_person', label: 'In Person' },
                    { value: 'hybrid', label: 'Hybrid' },
                  ]}
                />
                <FormField
                  label="Meeting Platform"
                  name="meeting_platform"
                  type="select"
                  value={form.meeting_platform}
                  onChange={handleChange}
                  disabled={form.event_mode === 'in_person'}
                  options={[
                    { value: '', label: 'Select platform' },
                    ...(videoSettings.enabledProviders.includes('zoom') ? [{ value: 'zoom', label: 'Zoom' }] : []),
                    ...(videoSettings.enabledProviders.includes('daily') ? [{ value: 'daily', label: 'Daily.co (embedded)' }] : []),
                    { value: 'teams', label: 'Microsoft Teams' },
                    { value: 'google_meet', label: 'Google Meet' },
                    { value: 'webex', label: 'Cisco Webex' },
                    { value: 'other', label: 'Other' },
                  ]}
                  helpText={form.event_mode !== 'in_person'
                    ? `Site default: ${videoSettings.defaultProvider === 'daily' ? 'Daily.co' : 'Zoom'} — change in Settings → Video Meetings`
                    : undefined}
                />
                <FormField
                  label="Meeting Link"
                  name="meeting_link"
                  type="url"
                  value={form.meeting_link}
                  onChange={handleChange}
                  disabled={form.event_mode === 'in_person'}
                  placeholder="https://..."
                  helpText={form.event_mode === 'in_person' ? 'Not needed for in-person events.' : 'Paste Zoom/Teams/Meet link'}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Venue" name="venue" value={form.venue} onChange={handleChange} placeholder="e.g., Conference Centre" />
                <FormField label="Location / City" name="location" value={form.location} onChange={handleChange} required placeholder="e.g., Lusaka, Zambia" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Start Date" name="start_date" type="date" value={form.start_date} onChange={handleChange} required />
                <FormField label="End Date" name="end_date" type="date" value={form.end_date} onChange={handleChange} required min={form.start_date || undefined} />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <FormField label="Start Time" name="start_time" type="time" value={form.start_time} onChange={handleChange} />
                <FormField
                  label="End Time"
                  name="end_time"
                  type="time"
                  value={form.end_time}
                  onChange={handleChange}
                  min={form.start_date && form.end_date && form.start_date === form.end_date ? form.start_time || undefined : undefined}
                />
                <FormField label="Timezone" name="timezone" value={form.timezone} onChange={handleChange} placeholder="Africa/Lusaka" />
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                <FormField
                  label="Registration Deadline"
                  name="registration_deadline"
                  type="date"
                  value={form.registration_deadline}
                  onChange={handleChange}
                  required
                  max={form.end_date || undefined}
                  helpText="Closes early registration before the event. People can still register while the event is live if spots remain."
                />
                <FormField
                  label="Deadline Time"
                  name="registration_deadline_time"
                  type="time"
                  value={form.registration_deadline_time}
                  onChange={handleChange}
                  required
                  max={form.registration_deadline && form.end_date && form.registration_deadline === form.end_date ? form.end_time || undefined : undefined}
                />
                <FormField label="Capacity" name="capacity" type="number" value={form.capacity} onChange={handleChange} placeholder="Leave blank for unlimited" />
                <FormField label="Registration Type" name="booking_type" value="Subscription" disabled helpText="All events are subscription-based (Zoom)." />
              </div>

              <div className="grid sm:grid-cols-2 gap-4 items-end">
                <div className="pt-1">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="is_free"
                      checked={form.is_free}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-sm font-medium text-navy-700">Free event</span>
                  </label>
                </div>
                {!form.is_free && (
                  <FormField label="Price (ZMW - Zambia)" name="price" type="number" value={form.price} onChange={handleChange} placeholder="0" />
                )}
              </div>

              <FormField
                label="Visibility"
                name="visibility"
                type="select"
                value={form.visibility}
                onChange={handleChange}
                options={[
                  { value: 'public', label: 'Public' },
                  { value: 'private', label: 'Private' },
                ]}
              />

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="forum_enabled"
                  checked={Boolean(form.forum_enabled)}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-sm font-medium text-navy-700">
                  Enable event forum
                </span>
              </label>
              <p className="text-xs text-navy-400 -mt-2">
                Registered attendees can discuss this event in a dedicated forum.
              </p>

              <div className="grid sm:grid-cols-3 gap-4">
                <FormField label="Organizer Name" name="organizer_name" value={form.organizer_name} onChange={handleChange} placeholder="Your name" />
                <FormField label="Organizer Email" name="organizer_email" type="email" value={form.organizer_email} onChange={handleChange} placeholder="email@example.com" />
                <FormField label="Organizer Phone" name="organizer_phone" value={form.organizer_phone} onChange={handleChange} placeholder="+260 ..." />
              </div>
            </>
          )}

          {currentStep === 3 && (
            <>
              {/* Featured Speakers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-navy-700">Featured Speakers</label>
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, featured_speakers: [...(prev.featured_speakers || []), { name: '', organisation: '', title: '', bio: '', photo: '' }] }))} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:text-cyan-700">
                    <Plus size={14} /> Add Speaker
                  </button>
                </div>
                {(form.featured_speakers || []).length === 0 && (
                  <p className="text-xs text-navy-400 italic">No speakers added yet.</p>
                )}
                {(form.featured_speakers || []).map((speaker, idx) => (
                  <div key={idx} className="rounded-xl border border-navy-100 bg-navy-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-navy-500">Speaker {idx + 1}</span>
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, featured_speakers: prev.featured_speakers.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <FormField label="Name" value={speaker.name || ''} onChange={(e) => { const arr = [...form.featured_speakers]; arr[idx] = { ...arr[idx], name: e.target.value }; setForm(prev => ({ ...prev, featured_speakers: arr })); }} placeholder="Dr. Jane Doe" />
                      <FormField label="Title / Role" value={speaker.title || ''} onChange={(e) => { const arr = [...form.featured_speakers]; arr[idx] = { ...arr[idx], title: e.target.value }; setForm(prev => ({ ...prev, featured_speakers: arr })); }} placeholder="Keynote Speaker" />
                    </div>
                    <FormField
                      label="Organisation"
                      value={speaker.organisation || speaker.organization || ''}
                      onChange={(e) => { const arr = [...form.featured_speakers]; arr[idx] = { ...arr[idx], organisation: e.target.value }; setForm(prev => ({ ...prev, featured_speakers: arr })); }}
                      placeholder="Company or institution"
                    />
                    <FormField label="Short Bio" value={speaker.bio} onChange={(e) => { const arr = [...form.featured_speakers]; arr[idx] = { ...arr[idx], bio: e.target.value }; setForm(prev => ({ ...prev, featured_speakers: arr })); }} placeholder="Brief description..." type="textarea" />
                    <div>
                      <label className="block text-sm font-medium text-navy-700 mb-1.5">Speaker Photo</label>
                      <div className="flex items-center gap-3">
                        {speaker.photo ? (
                          <img src={speaker.photo} alt="Speaker" className="w-14 h-14 rounded-full object-cover border border-navy-200" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-navy-100 flex items-center justify-center text-navy-400">
                            <Upload size={18} />
                          </div>
                        )}
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 bg-white text-xs font-medium text-navy-600 hover:bg-navy-50 transition-colors">
                          <Upload size={13} />
                          {speaker.photo ? 'Change' : 'Upload'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file || !file.type.startsWith('image/')) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const arr = [...form.featured_speakers];
                              arr[idx] = { ...arr[idx], photo: String(reader.result || '') };
                              setForm(prev => ({ ...prev, featured_speakers: arr }));
                            };
                            reader.readAsDataURL(file);
                          }} />
                        </label>
                        {speaker.photo && (
                          <button type="button" onClick={() => { const arr = [...form.featured_speakers]; arr[idx] = { ...arr[idx], photo: '' }; setForm(prev => ({ ...prev, featured_speakers: arr })); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Partners */}
              <div className="space-y-3 mt-6">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-navy-700">Event Partners</label>
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, partners: [...(prev.partners || []), { name: '', logo: '', website: '' }] }))} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:text-cyan-700">
                    <Plus size={14} /> Add Partner
                  </button>
                </div>
                {(form.partners || []).length === 0 && (
                  <p className="text-xs text-navy-400 italic">No partners added yet.</p>
                )}
                {(form.partners || []).map((partner, idx) => (
                  <div key={idx} className="rounded-xl border border-navy-100 bg-navy-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-navy-500">Partner {idx + 1}</span>
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, partners: prev.partners.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <FormField label="Name" value={partner.name} onChange={(e) => { const arr = [...form.partners]; arr[idx] = { ...arr[idx], name: e.target.value }; setForm(prev => ({ ...prev, partners: arr })); }} placeholder="Partner Org" />
                      <FormField label="Website" value={partner.website} onChange={(e) => { const arr = [...form.partners]; arr[idx] = { ...arr[idx], website: e.target.value }; setForm(prev => ({ ...prev, partners: arr })); }} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-navy-700 mb-1.5">Partner Logo</label>
                      <div className="flex items-center gap-3">
                        {partner.logo ? (
                          <img src={partner.logo} alt="Logo" className="h-10 max-w-[100px] object-contain border border-navy-200 rounded-lg p-1 bg-white" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-navy-100 flex items-center justify-center text-navy-400">
                            <Upload size={16} />
                          </div>
                        )}
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 bg-white text-xs font-medium text-navy-600 hover:bg-navy-50 transition-colors">
                          <Upload size={13} />
                          {partner.logo ? 'Change' : 'Upload'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file || !file.type.startsWith('image/')) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const arr = [...form.partners];
                              arr[idx] = { ...arr[idx], logo: String(reader.result || '') };
                              setForm(prev => ({ ...prev, partners: arr }));
                            };
                            reader.readAsDataURL(file);
                          }} />
                        </label>
                        {partner.logo && (
                          <button type="button" onClick={() => { const arr = [...form.partners]; arr[idx] = { ...arr[idx], logo: '' }; setForm(prev => ({ ...prev, partners: arr })); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex items-start gap-2">
                <CheckCircle2 size={17} className="shrink-0 mt-0.5" />
                Review your event details below, then click {isEditing ? 'Update Event' : 'Create Event'} to finish.
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <SummaryItem label="Title" value={form.title} />
                <SummaryItem label="Category" value={form.category} />
                <SummaryItem label="Status" value={form.status} />
                <SummaryItem label="Visibility" value={form.visibility} />
                <SummaryItem label="Event forum" value={form.forum_enabled ? 'Enabled' : 'Disabled'} />
                <SummaryItem label="Mode" value={form.event_mode} />
                <SummaryItem label="Location" value={form.location} />
                <SummaryItem label="Start Date" value={form.start_date} />
                <SummaryItem label="Start Time" value={form.start_time || '—'} />
                <SummaryItem label="End Date" value={form.end_date || '—'} />
                <SummaryItem label="End Time" value={form.end_time || '—'} />
                <SummaryItem label="Registration Deadline" value={form.registration_deadline || '—'} />
                <SummaryItem label="Deadline Time" value={form.registration_deadline_time || '—'} />
                <SummaryItem label="Price" value={formatPrice(form)} />
                <SummaryItem label="Organizer" value={form.organizer_name || '—'} />
                <SummaryItem label="Speakers" value={`${(form.featured_speakers || []).length} speaker(s)`} />
                <SummaryItem label="Partners" value={`${(form.partners || []).length} partner(s)`} />
              </div>

              {form.short_description && (
                <div className="rounded-xl border border-navy-100 p-4 bg-white">
                  <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-1">Short description</p>
                  <p className="text-sm text-navy-700">{form.short_description}</p>
                </div>
              )}

              {(isEditing || form.slug) && (
                <div>
                  <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">
                    {isEditing ? 'Share this event' : 'Preview share QR (uses slug)'}
                  </p>
                  <EventPublicQrCard
                    compact
                    event={{
                      id: isEditing ? id : undefined,
                      slug: form.slug,
                      title: form.title,
                    }}
                  />
                  {!isEditing && (
                    <p className="text-xs text-navy-500 mt-2">
                      After you create the event, the full QR and link appear on the event profile.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="sticky bottom-3 z-20 bg-white/95 backdrop-blur rounded-2xl border border-navy-100 p-3 flex flex-col gap-3 sm:static sm:bg-transparent sm:backdrop-blur-none sm:border-0 sm:p-0 sm:rounded-none sm:flex-row sm:items-center sm:justify-between sm:pt-4 sm:border-t sm:border-navy-100">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={currentStep === 0}
                className="inline-flex items-center justify-center gap-1 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
                Back
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/events')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-medium text-navy-500 hover:bg-navy-100 transition-colors"
              >
                Cancel
              </button>
              {currentStep === 2 && (
                <p className="hidden sm:block text-xs text-navy-400 ml-2">
                  Tip: Press <span className="font-medium text-navy-500">Enter</span> to continue to Review.
                </p>
              )}
            </div>

            {currentStep < formSteps.length - 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center justify-center gap-1 w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Next
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || isPastLockedEvent}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 disabled:opacity-70 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                {submitting ? <Spinner size={16} /> : <Save size={16} />}
                {submitting ? 'Saving...' : isEditing ? 'Update Event' : 'Create Event'}
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-lg border border-navy-100 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-navy-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-navy-800">{value || '—'}</p>
    </div>
  );
}
