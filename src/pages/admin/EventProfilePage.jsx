import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  Edit3,
  ExternalLink,
  PlayCircle,
  Percent,
  Trash2,
  Award,
  LayoutGrid,
  Activity,
  MessageSquare,
  Upload,
  PowerOff,
  FileDown,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useBooking } from '../../context/BookingContext';
import { StatusBadge, LoadingButton, Spinner } from '../../components/ui';
import { formatDate, formatTime } from '../../utils/helpers';
import { getEventDisplayStatus, isEventPast } from '../../utils/eventServices';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { useToast } from '../../context/ToastContext';
import EventProfileSummaryHero from '../../components/admin/event/EventProfileSummaryHero';
import EventProfileQuickActions from '../../components/admin/event/EventProfileQuickActions';
import EventProfileSidebar from '../../components/admin/event/EventProfileSidebar';
import EventForumPanel from '../../components/EventForumPanel';
import CertificatePreviewModal from '../../components/admin/certificate/CertificatePreviewModal';
import CertificateTemplateThumbnail from '../../components/admin/certificate/CertificateTemplateThumbnail';
import { buildSamplePreviewData } from '../../../shared/certificateDesign.js';
import {
  fetchEventCertificateTemplate,
  activateEventCertificateTemplate,
  deactivateEventCertificateTemplate,
  previewEventCertificateTemplate,
  publishEventCertificateTemplate,
  generateEventCertificates,
} from '../../utils/certificateApi';

const API_BASE = getApiBase();

const PROFILE_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'certificates', label: 'Certificates', icon: Award },
  { id: 'attendees', label: 'Attendees', icon: Users },
  { id: 'forum', label: 'Forum', icon: MessageSquare },
  { id: 'marketing', label: 'Marketing', icon: Percent },
  { id: 'activity', label: 'Activity', icon: Activity },
];

export default function EventProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { events, refreshData } = useData();
  const { getEventRegistrations } = useBooking();
  const toast = useToast();
  const [zoomLoading, setZoomLoading] = useState(false);
  const [zoomMessage, setZoomMessage] = useState('');
  const [zoomError, setZoomError] = useState('');
  const [zoomLogs, setZoomLogs] = useState([]);
  const [zoomLogsLoading, setZoomLogsLoading] = useState(false);
  const [coupons, setCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponBusyId, setCouponBusyId] = useState(null);
  const [couponForm, setCouponForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: '',
    max_redemptions: '',
    max_per_user: '1',
    valid_from: '',
    valid_until: '',
    label: '',
  });
  const [certTemplate, setCertTemplate] = useState(null);
  const [certConfigured, setCertConfigured] = useState(false);
  const [certLoading, setCertLoading] = useState(true);
  const [certBusy, setCertBusy] = useState(false);
  const [certPreviewUrl, setCertPreviewUrl] = useState('');
  const [certPreviewBlob, setCertPreviewBlob] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const event = events.find((e) => e.id === id);
  const registrations = getEventRegistrations(id || '');
  const certSampleData = useMemo(
    () => buildSamplePreviewData(event || {}),
    [event],
  );
  const certBadgeStatus = !certConfigured
    ? 'draft'
    : certTemplate?.is_active
      ? 'published'
      : 'draft';
  const certStatusMessage = !certConfigured
    ? 'No certificate template configured yet.'
    : certTemplate?.is_active
      ? 'Eligible attendees can receive certificates after the event ends.'
      : 'Publish the design to enable certificate issuance.';

  const videoProvider = (() => {
    const platform = String(event?.meeting_platform || event?.provider || '').toLowerCase();
    if (platform === 'daily' || platform === 'zoom') return platform;
    return 'zoom';
  })();

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async () => {
      setZoomLogsLoading(true);
      try {
        const response = await fetch(
          `${API_BASE}/admin/integrations/logs?provider=${encodeURIComponent(videoProvider)}&related_type=event&related_id=${encodeURIComponent(id || '')}&limit=8`,
          { headers: getAdminAuthHeaders() },
        );
        const json = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok || !json?.ok || !Array.isArray(json?.data)) {
          setZoomLogs([]);
          return;
        }

        setZoomLogs(json.data);
      } catch {
        if (!cancelled) setZoomLogs([]);
      } finally {
        if (!cancelled) setZoomLogsLoading(false);
      }
    };

    void loadLogs();
    return () => {
      cancelled = true;
    };
  }, [id, zoomMessage, videoProvider]);

  useEffect(() => {
    let cancelled = false;
    const loadCoupons = async () => {
      setCouponsLoading(true);
      try {
        const response = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(id || '')}/coupons`, {
          headers: getAdminAuthHeaders(),
        });
        const json = await response.json().catch(() => ({}));
        if (cancelled) return;
        setCoupons(response.ok && json?.ok && Array.isArray(json?.data) ? json.data : []);
      } catch {
        if (!cancelled) setCoupons([]);
      } finally {
        if (!cancelled) setCouponsLoading(false);
      }
    };
    void loadCoupons();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const loadCertTemplate = async () => {
      setCertLoading(true);
      try {
        const data = await fetchEventCertificateTemplate(id || '');
        if (cancelled) return;
        setCertConfigured(Boolean(data?.configured));
        setCertTemplate(data?.template || null);
      } catch {
        if (!cancelled) {
          setCertConfigured(false);
          setCertTemplate(null);
        }
      } finally {
        if (!cancelled) setCertLoading(false);
      }
    };
    void loadCertTemplate();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (PROFILE_TABS.some((tab) => tab.id === hash)) {
      setActiveTab(hash);
      return;
    }
    if (String(id || '').includes('certificate')) {
      setActiveTab('certificates');
    }
  }, [id]);

  const setProfileTab = (tabId) => {
    setActiveTab(tabId);
    window.history.replaceState(null, '', `#${tabId}`);
  };

  const showMarketingTab = event ? !event.is_free && Number(event.price || 0) > 0 : false;
  const showForumTab = Boolean(event?.forum_enabled);
  const visibleTabs = useMemo(
    () => PROFILE_TABS.filter((tab) => {
      if (tab.id === 'marketing') return showMarketingTab;
      if (tab.id === 'forum') return showForumTab;
      return true;
    }),
    [showForumTab, showMarketingTab],
  );

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, visibleTabs]);

  if (!event) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>Event not found.</p>
        <Link to="/admin/events" className="text-cyan-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Events
        </Link>
      </div>
    );
  }

  const displayStatus = getEventDisplayStatus(event);
  const isPastLocked = isEventPast(event);
  const confirmed = registrations.filter(r => r.status === 'confirmed').length;
  const attended = registrations.filter(r => r.status === 'attended').length;
  const cancelled = registrations.filter(r => r.status === 'cancelled').length;
  const active = registrations.filter(r => r.status !== 'cancelled').length;
  const capacity = Number(event.capacity) || null;
  const occupancy = capacity ? Math.min(100, Math.round((active / capacity) * 100)) : null;
  const attendanceRate = active > 0 ? Math.round((attended / active) * 100) : 0;

  const handleCreateVideoMeeting = async () => {
    setZoomError('');
    setZoomMessage('');
    setZoomLoading(true);
    const isDaily = videoProvider === 'daily';
    const createPath = isDaily
      ? `${API_BASE}/admin/events/${event.id}/daily/create`
      : `${API_BASE}/admin/events/${event.id}/zoom/create`;
    try {
      const response = await fetch(createPath, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || `Unable to create ${isDaily ? 'Daily room' : 'Zoom meeting'}.`);
      }

      setZoomMessage(isDaily
        ? 'Daily room created and linked to this event.'
        : 'Zoom meeting created and linked to this event.');
      await refreshData();
    } catch (error) {
      setZoomError(error?.message || `Unable to create ${isDaily ? 'Daily room' : 'Zoom meeting'}.`);
    } finally {
      setZoomLoading(false);
    }
  };

  const hasVideoMeeting = videoProvider === 'daily'
    ? Boolean(event?.daily_room_url || event?.daily_room_name)
    : Boolean(event?.zoom_meeting_id || event?.zoom_join_url);

  const refreshCoupons = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(event.id)}/coupons`, {
        headers: getAdminAuthHeaders(),
      });
      const json = await response.json().catch(() => ({}));
      setCoupons(response.ok && json?.ok && Array.isArray(json?.data) ? json.data : []);
    } catch {
      setCoupons([]);
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    setCouponSaving(true);
    try {
      const payload = {
        code: couponForm.code.trim(),
        discount_type: couponForm.discount_type,
        discount_value: Number(couponForm.discount_value),
        max_per_user: Number(couponForm.max_per_user || 1),
        label: couponForm.label.trim() || undefined,
      };
      if (couponForm.max_redemptions.trim()) payload.max_redemptions = Number(couponForm.max_redemptions);
      if (couponForm.valid_from.trim()) payload.valid_from = couponForm.valid_from.trim();
      if (couponForm.valid_until.trim()) payload.valid_until = couponForm.valid_until.trim();

      const response = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(event.id)}/coupons`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Could not create coupon.');
      }
      setCouponForm({
        code: '',
        discount_type: 'percent',
        discount_value: '',
        max_redemptions: '',
        max_per_user: '1',
        valid_from: '',
        valid_until: '',
        label: '',
      });
      await refreshCoupons();
      toast.success('Coupon created.');
    } catch (error) {
      toast.error(error.message || 'Failed to create coupon');
    } finally {
      setCouponSaving(false);
    }
  };

  const handleToggleCoupon = async (couponId, nextActive) => {
    setCouponBusyId(couponId);
    try {
      const response = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(event.id)}/coupons/${encodeURIComponent(couponId)}`, {
        method: 'PATCH',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ active: nextActive }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Update failed.');
      }
      await refreshCoupons();
      toast.success(nextActive ? 'Coupon enabled.' : 'Coupon disabled.');
    } catch (error) {
      toast.error(error.message || 'Failed to update coupon');
    } finally {
      setCouponBusyId(null);
    }
  };

  const handleDeleteCoupon = async (couponId) => {
    if (!window.confirm('Delete this coupon? Existing registrations linked to this code are unchanged; new redemptions stop.')) return;
    setCouponBusyId(couponId);
    try {
      const response = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(event.id)}/coupons/${encodeURIComponent(couponId)}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Delete failed.');
      }
      await refreshCoupons();
      toast.success('Coupon deleted.');
    } catch (error) {
      toast.error(error.message || 'Failed to delete coupon');
    } finally {
      setCouponBusyId(null);
    }
  };

  const handleActivateCertificate = async () => {
    setCertBusy(true);
    try {
      await activateEventCertificateTemplate(event.id);
      navigate(`/admin/events/${event.id}/certificate-designer`);
    } catch (error) {
      toast.error(error.message || 'Failed to activate certificate.');
    } finally {
      setCertBusy(false);
    }
  };

  const handlePreviewCertificate = async () => {
    setCertBusy(true);
    try {
      const blob = await previewEventCertificateTemplate(event.id, {});
      const url = URL.createObjectURL(blob);
      setCertPreviewBlob(blob);
      setCertPreviewUrl(url);
    } catch (error) {
      toast.error(error.message || 'Preview failed.');
    } finally {
      setCertBusy(false);
    }
  };

  const closeCertPreview = () => {
    if (certPreviewUrl) URL.revokeObjectURL(certPreviewUrl);
    setCertPreviewUrl('');
    setCertPreviewBlob(null);
  };

  const handleDeactivateCertificate = async () => {
    if (!window.confirm('Deactivate certificate template? New certificates will not be issued until published again.')) return;
    setCertBusy(true);
    try {
      const updated = await deactivateEventCertificateTemplate(event.id);
      setCertTemplate(updated);
      toast.success('Certificate template deactivated.');
    } catch (error) {
      toast.error(error.message || 'Failed to deactivate.');
    } finally {
      setCertBusy(false);
    }
  };

  const handlePublishCertificate = async () => {
    setCertBusy(true);
    try {
      const updated = await publishEventCertificateTemplate(event.id, {});
      setCertTemplate(updated);
      setCertConfigured(true);
      toast.success('Certificate template published.');
    } catch (error) {
      toast.error(error.message || 'Publish failed.');
    } finally {
      setCertBusy(false);
    }
  };

  const handleGenerateCertificates = async () => {
    setCertBusy(true);
    try {
      const result = await generateEventCertificates(event.id);
      toast.success(`Generated ${result.issued || 0} certificate(s). ${result.skipped ? `${result.skipped} skipped.` : ''}`);
    } catch (error) {
      toast.error(error.message || 'Generation failed.');
    } finally {
      setCertBusy(false);
    }
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 min-h-full bg-navy-50">
      <EventProfileSummaryHero
        event={event}
        displayStatus={displayStatus}
        activeCount={active}
        attendedCount={attended}
        capacity={capacity}
        occupancy={occupancy}
      />

      <EventProfileQuickActions
        eventId={event.id}
        isPastLocked={isPastLocked}
        certConfigured={certConfigured}
        certBusy={certBusy || certLoading}
        hasVideoMeeting={hasVideoMeeting}
        videoProvider={videoProvider}
        zoomStartUrl={videoProvider === 'zoom' ? event.zoom_start_url : ''}
        meetingLink={event.meeting_link || event.zoom_join_url || event.daily_room_url || ''}
        onActivateCertificate={handleActivateCertificate}
        onPreviewCertificate={handlePreviewCertificate}
        onCreateVideoMeeting={handleCreateVideoMeeting}
        onNavigateDesigner={() => navigate(`/admin/events/${event.id}/certificate-designer`)}
        videoLoading={zoomLoading}
      />

      {(zoomMessage || zoomError) && (
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-3 space-y-2">
          {zoomMessage && (
            <div className="p-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm">
              {zoomMessage}
            </div>
          )}
          {zoomError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
              {zoomError}
            </div>
          )}
        </div>
      )}

      {/* Sticky tabs — Facebook-style */}
      <nav
        className="sticky top-16 z-20 bg-white border-b border-navy-200 shadow-sm"
        aria-label="Event profile sections"
      >
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {visibleTabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setProfileTab(tab.id)}
                className={`relative inline-flex items-center gap-2 px-4 py-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-cyan-700'
                    : 'text-navy-500 hover:bg-navy-50 hover:text-navy-800'
                }`}
              >
                <TabIcon size={16} />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-cyan-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-4">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
          <div className="min-w-0 space-y-4">
          {activeTab === 'overview' && (
            <>
              {(event.short_description || event.description) && (
                <FeedCard title="About" subtitle="Event description">
                  {event.short_description && (
                    <p className="text-sm font-medium text-navy-800 mb-3">{event.short_description}</p>
                  )}
                  {event.description && (
                    <p className="text-sm text-navy-600 whitespace-pre-wrap leading-relaxed">{event.description}</p>
                  )}
                </FeedCard>
              )}

              <FeedCard title="Event details" subtitle="Schedule, location, and operational status">
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <OverviewRow icon={Calendar} label="Date" value={`${formatDate(event.start_date || event.date)}${event.end_date && event.end_date !== (event.start_date || event.date) ? ` – ${formatDate(event.end_date)}` : ''}`} />
                  <OverviewRow icon={Clock} label="Time" value={`${event.start_time ? formatTime(event.start_time) : '—'}${event.end_time ? ` – ${formatTime(event.end_time)}` : ''}`} />
                  <OverviewRow icon={MapPin} label="Location" value={event.location || event.venue || '—'} />
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-navy-50 text-navy-500">
                      <CheckCircle2 size={14} />
                    </div>
                    <div>
                      <p className="text-xs text-navy-400">Status</p>
                      <div className="mt-1"><StatusBadge status={displayStatus} /></div>
                    </div>
                  </div>
                </div>

                {event.meeting_link && (
                  <div className="mt-5 pt-4 border-t border-navy-100">
                    <a
                      href={event.meeting_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-cyan-700 hover:text-cyan-600 font-medium"
                    >
                      <ExternalLink size={14} />
                      Open meeting link
                    </a>
                  </div>
                )}
              </FeedCard>

              <FeedCard title="Video meeting" subtitle={`Linked ${videoProvider === 'daily' ? 'Daily.co' : 'Zoom'} details`}>
                {!hasVideoMeeting ? (
                  <p className="text-sm text-navy-500">
                    No {videoProvider === 'daily' ? 'Daily room' : 'Zoom meeting'} linked yet. Use the quick action above to provision one.
                  </p>
                ) : videoProvider === 'daily' ? (
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-navy-400">Provider</p>
                      <p className="font-medium text-navy-800">Daily.co</p>
                    </div>
                    <div>
                      <p className="text-xs text-navy-400">Room name</p>
                      <p className="font-mono text-navy-800">{event.daily_room_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-navy-400">Status</p>
                      <p className="font-medium text-navy-800 capitalize">{event.daily_status || 'scheduled'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-navy-400 mb-1">Room URL</p>
                      {event.daily_room_url || event.meeting_link ? (
                        <a
                          href={event.daily_room_url || event.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-700 hover:text-cyan-600 hover:underline break-all"
                        >
                          {event.daily_room_url || event.meeting_link}
                        </a>
                      ) : (
                        <p className="text-navy-500">—</p>
                      )}
                    </div>
                    <p className="sm:col-span-2 text-xs text-navy-500">
                      Attendees join via the secure event page with a token — not this URL alone.
                    </p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-navy-400">Provider</p>
                      <p className="font-medium text-navy-800">{event.provider || 'zoom'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-navy-400">Meeting ID</p>
                      <p className="font-mono text-navy-800">{event.zoom_meeting_id || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-navy-400">Host Email</p>
                      <p className="font-medium text-navy-800">{event.zoom_host_email || event.organizer_email || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-navy-400">Zoom Status</p>
                      <p className="font-medium text-navy-800 capitalize">{event.zoom_status || 'scheduled'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-navy-400 mb-1">Join URL</p>
                      {event.zoom_join_url || event.meeting_link ? (
                        <a
                          href={event.zoom_join_url || event.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-700 hover:text-cyan-600 hover:underline break-all"
                        >
                          {event.zoom_join_url || event.meeting_link}
                        </a>
                      ) : (
                        <p className="text-navy-500">—</p>
                      )}
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-2 pt-2 border-t border-navy-100 mt-2">
                      <p className="text-xs text-navy-400">Host start</p>
                      {event.zoom_start_url ? (
                        <a
                          href={event.zoom_start_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 w-fit text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl transition-colors"
                        >
                          <PlayCircle size={16} />
                          Open Zoom as host
                        </a>
                      ) : (
                        <p className="text-sm text-navy-500">
                          No host URL on file. Recreate the Zoom meeting to refresh the host start link.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </FeedCard>
            </>
          )}

          {activeTab === 'marketing' && showMarketingTab && (
            <FeedCard
              title="Discount codes"
              subtitle="Percentage or fixed ZMW reductions for checkout (validated server-side)."
              actions={(
                <span className="inline-flex items-center gap-1.5 text-xs text-navy-500">
                  <Percent size={13} aria-hidden />
                  Coupons
                </span>
              )}
            >
          {couponsLoading ? (
            <p className="text-sm text-navy-500">Loading coupons…</p>
          ) : (
            <div className="space-y-5">
              {coupons.length === 0 ? (
                <p className="text-sm text-navy-500">No coupons yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-navy-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-navy-50 text-left border-b border-navy-100">
                        <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Code</th>
                        <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Type</th>
                        <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Uses</th>
                        <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase">Status</th>
                        <th className="py-2.5 px-3 font-semibold text-navy-500 text-xs uppercase w-[120px]" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-50">
                      {coupons.map((c) => (
                        <tr key={c.id} className="bg-white hover:bg-navy-50/50">
                          <td className="py-2.5 px-3 font-mono font-semibold text-navy-900">{c.code}</td>
                          <td className="py-2.5 px-3 text-navy-600">
                            {c.discount_type === 'fixed' ? `ZMW ${Number(c.discount_value).toFixed(2)}` : `${Number(c.discount_value)}%`}
                          </td>
                          <td className="py-2.5 px-3 text-navy-600 text-xs">
                            {c.redemptions_count}{c.max_redemptions != null ? ` / ${c.max_redemptions}` : ''}
                            {' · '}max {c.max_per_user}/user
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => handleToggleCoupon(c.id, !c.active)}
                              disabled={couponBusyId === c.id}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg capitalize disabled:opacity-60 ${c.active ? 'bg-amber-100 text-amber-800' : 'bg-navy-100 text-navy-600'}`}
                            >
                              {couponBusyId === c.id ? <Spinner size={12} /> : null}
                              {c.active ? 'active' : 'disabled'}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteCoupon(c.id)}
                              disabled={couponBusyId === c.id}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                            >
                              {couponBusyId === c.id ? <Spinner size={12} /> : <Trash2 size={13} aria-hidden />}
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <form onSubmit={handleCreateCoupon} className="rounded-xl border border-navy-100 bg-navy-50/60 p-4 space-y-3">
                <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Create coupon</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block text-xs text-navy-600">
                    Code
                    <input
                      required
                      value={couponForm.code}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, code: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm font-mono uppercase"
                      placeholder="EARLY2026"
                      maxLength={64}
                    />
                  </label>
                  <label className="block text-xs text-navy-600">
                    Label (optional)
                    <input
                      value={couponForm.label}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, label: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                      placeholder="Early bird"
                    />
                  </label>
                  <label className="block text-xs text-navy-600">
                    Type
                    <select
                      value={couponForm.discount_type}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, discount_type: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                    >
                      <option value="percent">Percent (%)</option>
                      <option value="fixed">Fixed amount (ZMW)</option>
                    </select>
                  </label>
                  <label className="block text-xs text-navy-600">
                    {couponForm.discount_type === 'percent' ? 'Percent off (1–100)' : 'Amount off (ZMW)'}
                    <input
                      required
                      type="number"
                      min={couponForm.discount_type === 'percent' ? '1' : '0'}
                      step="0.01"
                      value={couponForm.discount_value}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, discount_value: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                    />
                  </label>
                  <label className="block text-xs text-navy-600">
                    Total redemptions cap (optional)
                    <input
                      type="number"
                      min="1"
                      value={couponForm.max_redemptions}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, max_redemptions: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                      placeholder="Unlimited"
                    />
                  </label>
                  <label className="block text-xs text-navy-600">
                    Max uses per subscriber
                    <input
                      type="number"
                      min="1"
                      value={couponForm.max_per_user}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, max_per_user: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                    />
                  </label>
                  <label className="block text-xs text-navy-600">
                    Valid from (optional)
                    <input
                      type="date"
                      value={couponForm.valid_from}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, valid_from: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                    />
                  </label>
                  <label className="block text-xs text-navy-600">
                    Valid until (optional)
                    <input
                      type="date"
                      value={couponForm.valid_until}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, valid_until: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm"
                    />
                  </label>
                </div>
                <LoadingButton
                  type="submit"
                  loading={couponSaving}
                  loadingLabel="Saving…"
                  className="text-sm font-medium px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  Add coupon
                </LoadingButton>
              </form>
            </div>
          )}
        </FeedCard>
          )}

          {activeTab === 'certificates' && (
      <FeedCard
        title="Certificates"
        subtitle="Design and issue attendance certificates for this event"
        actions={!certLoading ? <StatusBadge status={certBadgeStatus} size="md" /> : null}
      >
        {certLoading ? (
          <div className="py-6 flex justify-center"><Spinner /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                {!certConfigured ? (
                  <CertIconButton
                    icon={Award}
                    label="Activate certificate"
                    onClick={handleActivateCertificate}
                    loading={certBusy}
                    variant="primary"
                  />
                ) : (
                  <>
                    <CertIconButton
                      icon={Edit3}
                      label="Edit certificate design"
                      onClick={() => navigate(`/admin/events/${event.id}/certificate-designer`)}
                      variant="primary"
                    />
                    {certTemplate?.is_active ? (
                      <CertIconButton
                        icon={PowerOff}
                        label="Deactivate certificate"
                        onClick={handleDeactivateCertificate}
                        loading={certBusy}
                        variant="danger"
                      />
                    ) : (
                      <CertIconButton
                        icon={Upload}
                        label="Publish certificate"
                        onClick={handlePublishCertificate}
                        loading={certBusy}
                        variant="success"
                      />
                    )}
                    {isPastLocked && certTemplate?.is_active && attended > 0 && (
                      <CertIconButton
                        icon={FileDown}
                        label={`Generate certificates (${attended} attended)`}
                        onClick={handleGenerateCertificates}
                        loading={certBusy}
                        variant="indigo"
                      />
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-navy-500 text-right leading-relaxed max-w-sm hidden sm:block">
                {certStatusMessage}
              </p>
            </div>

            <p className="text-xs text-navy-500 sm:hidden">{certStatusMessage}</p>

            {certConfigured && certTemplate?.design_json && (
              <CertificateTemplateThumbnail
                design={certTemplate.design_json}
                orientation={certTemplate.orientation || 'landscape'}
                sampleData={certSampleData}
                onClick={handlePreviewCertificate}
                loading={certBusy}
              />
            )}

            {certConfigured && (
              <p className="text-xs text-navy-500">
                Attended registrations: {attended}. Certificates require an active template and a completed event.
              </p>
            )}
          </div>
        )}
      </FeedCard>
          )}

          {activeTab === 'forum' && showForumTab && (
            <EventForumPanel event={event} adminMode />
          )}

          {activeTab === 'attendees' && (
      <FeedCard
        title="Subscribers"
        subtitle={`${registrations.length} total records`}
        actions={
          <Link
            to={`/admin/events/${event.id}/attendees`}
            className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
          >
            Open full attendees list →
          </Link>
        }
      >
        {registrations.length === 0 ? (
          <p className="text-sm text-navy-400 text-center py-4">No subscribers yet.</p>
        ) : (
          <ul className="divide-y divide-navy-100">
            {registrations.slice(0, 12).map((reg) => (
              <li key={reg.id} className="flex items-center gap-3 py-3 first:pt-0">
                <div className="w-10 h-10 rounded-full bg-cyan-100 text-cyan-800 flex items-center justify-center text-sm font-bold shrink-0">
                  {String(reg.user_name || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy-900 truncate">{reg.user_name}</p>
                  <p className="text-xs text-navy-500 truncate">{reg.user_email}</p>
                </div>
                <div className="text-right shrink-0">
                  <StatusBadge status={reg.status} />
                  <p className="text-[11px] text-navy-400 mt-1 font-mono">{reg.reference_code}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </FeedCard>
          )}

          {activeTab === 'activity' && (
      <FeedCard title="Video activity log" subtitle="Recent meeting, join-auth, and webhook updates">
        {zoomLogsLoading ? (
          <p className="text-sm text-navy-500">Loading activity…</p>
        ) : zoomLogs.length === 0 ? (
          <p className="text-sm text-navy-500">No Zoom activity logs yet for this event.</p>
        ) : (
          <div className="space-y-2.5">
            {zoomLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-navy-900">{String(log.action || '').replace(/_/g, ' ')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${log.status === 'success' ? 'bg-green-100 text-green-700' : log.status === 'failed' ? 'bg-red-100 text-red-700' : log.status === 'denied' ? 'bg-amber-100 text-amber-700' : 'bg-navy-100 text-navy-600'}`}>
                    {log.status}
                  </span>
                </div>
                <p className="text-xs text-navy-500 mt-1">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : 'Unknown time'}
                </p>
                {log.error_message && (
                  <p className="text-xs text-red-600 mt-1">{log.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </FeedCard>
          )}
        </div>

        <EventProfileSidebar
          event={event}
          registrationsCount={registrations.length}
          confirmed={confirmed}
          activeCount={active}
          attendedCount={attended}
          cancelled={cancelled}
          attendanceRate={attendanceRate}
          capacity={capacity}
          occupancy={occupancy}
        />
      </div>
      </div>

      {certPreviewUrl && (
        <CertificatePreviewModal
          pdfUrl={certPreviewUrl}
          onClose={closeCertPreview}
          onDownload={() => {
            if (!certPreviewBlob) return;
            const url = URL.createObjectURL(certPreviewBlob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `Certificate-Preview-${event.id}.pdf`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        />
      )}
    </div>
  );
}

function CertIconButton({
  icon: Icon,
  label,
  onClick,
  loading = false,
  variant = 'default',
  disabled = false,
}) {
  const variants = {
    default: 'bg-white border border-navy-200 text-navy-700 hover:bg-navy-50',
    primary: 'bg-cyan-600 hover:bg-cyan-500 text-white border border-transparent shadow-sm',
    success: 'bg-emerald-600 hover:bg-emerald-500 text-white border border-transparent shadow-sm',
    danger: 'bg-white border border-red-200 text-red-600 hover:bg-red-50',
    indigo: 'bg-indigo-600 hover:bg-indigo-500 text-white border border-transparent shadow-sm',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {loading ? <Spinner size={16} /> : <Icon size={18} strokeWidth={2} />}
    </button>
  );
}

function FeedCard({ title, subtitle, actions, children }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-navy-100 overflow-hidden">
      {(title || subtitle || actions) && (
        <div className="px-4 py-3 border-b border-navy-100 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-lg font-bold text-navy-900">{title}</h3>}
            {subtitle && <p className="text-xs text-navy-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function OverviewRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-navy-50 text-navy-500">
        <Icon size={14} />
      </div>
      <div>
        <p className="text-xs text-navy-400">{label}</p>
        <p className="text-sm font-medium text-navy-800 mt-0.5">{value || '—'}</p>
      </div>
    </div>
  );
}
