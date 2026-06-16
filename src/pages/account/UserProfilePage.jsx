import { useCallback, useEffect, useRef, useState } from 'react';
import {
  User,
  Mail,
  Phone,
  Calendar,
  Ticket,
  CheckCircle,
  AlertCircle,
  LogOut,
  Briefcase,
  Building2,
  Link as LinkIcon,
  ExternalLink,
  Activity,
  MapPin,
  CreditCard,
  Heart,
  Gift,
  Download,
  FileText,
  TrendingUp,
  Receipt,
  Award,
  Share2,
  Eye,
  Pencil,
  ArrowRight,
  CalendarX,
  Clock,
  Camera,
  Loader2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import RegistrationRow from './RegistrationRow';
import EmptyState from '../../components/EmptyState';
import { useUserAuth } from '../../context/UserAuthContext';
import { useBooking } from '../../context/BookingContext';
import { useData } from '../../context/DataContext';
import { isEventPast } from '../../utils/eventServices';
import { formatDate } from '../../utils/helpers';
import KycBanner from '../../components/KycBanner';
import ReceiptPreviewModal from '../../components/admin/ReceiptPreviewModal';
import { useToast } from '../../context/ToastContext';
import {
  fetchMyCertificates,
  getCertificateVerifyUrl,
  openCertificatePdf,
  saveCertificatePdf,
  downloadCertificateBlob,
} from '../../utils/certificateApi';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { safeExternalUrl } from '../../../shared/safeUrl.js';
import { validateProfilePhotoFile } from '../../utils/uploadProfilePhoto';
import CvGeneratorPanel from '../../components/account/CvGeneratorPanel';
import ProfileCvSectionsEditor from '../../components/account/ProfileCvSectionsEditor';
import {
  ProfileExperienceCard,
  ProfileEducationCard,
  ProfileReferencesCard,
} from '../../components/account/ProfileCvSectionsView';
import { normalizeCvSections } from '../../../shared/cvProfileSections.js';
import { getApiBase } from '../../utils/apiBase.js';
import { getUserAuthHeaders } from '../../utils/authHeaders.js';
import {
  isReceiptEligible,
  getReceiptSubjectTitle,
  resolveReceiptType,
} from '../../utils/receiptGenerator.js';

const API_BASE = getApiBase();

const PAID_STATUSES = ['paid', 'not_required', 'waived'];

const PROFILE_TABS = [
  { id: 'profile', label: 'Edit profile', icon: Pencil },
  { id: 'cv', label: 'CV generator', icon: FileText },
  { id: 'events', label: 'My events', icon: Calendar },
  { id: 'certificates', label: 'Certificates', icon: Award },
  { id: 'payments', label: 'Payments', icon: Receipt },
];

export default function UserProfilePage() {
  const {
    currentUser,
    updateUserProfile,
    uploadProfilePhoto,
    removeProfilePhoto,
    userLogout,
    authError,
    clearAuthError,
  } = useUserAuth();
  const { getUserRegistrations, cancelRegistration } = useBooking();
  const { events } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const [certificates, setCertificates] = useState([]);
  const [certsLoading, setCertsLoading] = useState(true);
  const [certsError, setCertsError] = useState('');
  const [certActionId, setCertActionId] = useState('');

  const myRegistrations = getUserRegistrations(currentUser?.id || '');
  const activeRegs = myRegistrations.filter(r => r.status !== 'cancelled');
  const cancelledRegs = myRegistrations.filter(r => r.status === 'cancelled');
  const attendedRegs = myRegistrations.filter(r => r.status === 'attended');
  const upcoming = activeRegs.filter(r => {
    const ev = events.find(e => e.id === r.event_id);
    return ev && !isEventPast(ev);
  });
  const past = activeRegs.filter(r => {
    const ev = events.find(e => e.id === r.event_id);
    return ev && isEventPast(ev);
  });
  const engagementRate = activeRegs.length > 0 ? Math.round((attendedRegs.length / activeRegs.length) * 100) : 0;

  // Payment history
  const paidRegs = myRegistrations.filter(r => PAID_STATUSES.includes(r.payment_status));
  const totalPaid = paidRegs.reduce((sum, r) => sum + Number(r.amount_zmw ?? r.amount ?? 0), 0);

  const recentEngagement = myRegistrations
    .slice()
    .sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime())
    .slice(0, 6)
    .map((reg) => ({
      ...reg,
      event: events.find((e) => e.id === reg.event_id),
    }));

  const [activeTab, setActiveTab] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    profession: currentUser?.profession || '',
    organization: currentUser?.organization || '',
    about: currentUser?.about || '',
    specialties: Array.isArray(currentUser?.specialties) ? currentUser.specialties.join(', ') : '',
    portfolio_url: currentUser?.portfolio_url || '',
    linkedin_url: currentUser?.linkedin_url || '',
    linkedin_handle: currentUser?.linkedin_handle || '',
    occupation: currentUser?.occupation || '',
    nrc_id: currentUser?.nrc_id || '',
    address: currentUser?.address || '',
    interests: Array.isArray(currentUser?.interests) ? currentUser.interests.join(', ') : '',
  });
  const [saved, setSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoRemoving, setPhotoRemoving] = useState(false);
  const photoInputRef = useRef(null);
  const [cvSections, setCvSections] = useState(() => normalizeCvSections(currentUser?.cv_sections));

  useEffect(() => {
    setCvSections(normalizeCvSections(currentUser?.cv_sections));
  }, [currentUser?.id, currentUser?.cv_sections]);

  const loadCertificates = useCallback(async () => {
    if (!currentUser?.id) {
      setCertificates([]);
      setCertsError('');
      setCertsLoading(false);
      return;
    }
    setCertsLoading(true);
    setCertsError('');
    try {
      const rows = await fetchMyCertificates();
      setCertificates(rows);
    } catch (err) {
      setCertificates([]);
      const message = err?.message || 'Could not load certificates.';
      setCertsError(message);
      if (/sign in|authentication|session|expired|unauthorized/i.test(message)) {
        toast.error('Please sign in again to view your certificates.');
      }
    } finally {
      setCertsLoading(false);
    }
  }, [currentUser?.id, toast]);

  useEffect(() => {
    void loadCertificates();
  }, [loadCertificates]);

  const handleCertificateView = async (cert) => {
    setCertActionId(cert.id);
    try {
      await openCertificatePdf(
        cert,
        undefined,
        `Certificate-${cert.certificate_code}.pdf`,
      );
    } catch (err) {
      toast.error(err?.message || 'Could not open certificate.');
    } finally {
      setCertActionId('');
    }
  };

  const handleCertificateDownload = async (cert) => {
    setCertActionId(cert.id);
    try {
      await saveCertificatePdf(
        cert,
        undefined,
        `Certificate-${cert.certificate_code}.pdf`,
      );
    } catch (err) {
      toast.error(err?.message || 'Download failed.');
    } finally {
      setCertActionId('');
    }
  };

  const handleCertificateShare = async (cert) => {
    const verifyUrl = getCertificateVerifyUrl(cert.certificate_code);
    setCertActionId(cert.id);
    try {
      if (navigator.share) {
        try {
          const blob = await downloadCertificateBlob(cert);
          const file = new File(
            [blob],
            `Certificate-${cert.certificate_code}.pdf`,
            { type: 'application/pdf' },
          );
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              title: `Certificate — ${cert.event_title}`,
              text: `Certificate of attendance for ${cert.event_title}`,
              files: [file],
            });
            return;
          }
        } catch {
          // fall through to URL share
        }
        await navigator.share({
          title: `Certificate — ${cert.event_title}`,
          url: verifyUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(verifyUrl);
      toast.success('Verification link copied to clipboard.');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        toast.error(err?.message || 'Could not share certificate.');
      }
    } finally {
      setCertActionId('');
    }
  };

  const handleChange = (e) => {
    setFormError('');
    const { name, value } = e.target;
    if (name === 'linkedin_url') {
      const match = value.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
      const handle = match ? match[1].replace(/\/$/, '') : '';
      setForm(p => ({ ...p, linkedin_url: value, linkedin_handle: handle || p.linkedin_handle }));
    } else {
      setForm(p => ({ ...p, [name]: value }));
    }
  };

  const handleSave = async () => {
    if (profileSaving) return;
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.email.trim()) { setFormError('Email is required.'); return; }
    if (!form.phone.trim()) { setFormError('Phone number is required.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) { setFormError('Please enter a valid email address.'); return; }

    const specialties = form.specialties.split(',').map((s) => s.trim()).filter(Boolean);
    clearAuthError();
    setProfileSaving(true);
    try {
      const ok = await updateUserProfile({
        name: form.name,
        email: form.email,
        phone: form.phone,
        profession: form.profession,
        organization: form.organization,
        about: form.about,
        specialties,
        portfolio_url: form.portfolio_url,
        linkedin_url: form.linkedin_url,
        linkedin_handle: form.linkedin_handle,
        occupation: form.occupation,
        nrc_id: form.nrc_id,
        address: form.address,
        interests: form.interests.split(',').map(s => s.trim()).filter(Boolean),
        cv_sections: normalizeCvSections(cvSections),
      });
      if (ok === false) return;
      setSaved(true);
      setEditing(false);
      setActiveTab('profile');
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLogout = () => {
    userLogout();
    navigate('/');
  };

  const handleTabChange = (tabId) => {
    if (tabId !== 'profile') setEditing(false);
    setActiveTab(tabId);
  };

  const enrichedRegistrations = myRegistrations.map((reg) => ({
    ...reg,
    event: events.find((e) => e.id === reg.event_id) || null,
  }));
  const upcomingEvents = enrichedRegistrations.filter(
    (r) => r.status !== 'cancelled' && r.event && !isEventPast(r.event),
  );
  const pastEvents = enrichedRegistrations.filter(
    (r) => r.status !== 'cancelled' && r.event && isEventPast(r.event),
  );
  const cancelledEvents = enrichedRegistrations.filter((r) => r.status === 'cancelled');

  const handleCancelRegistration = async (regId) => {
    if (!window.confirm('Cancel this registration?')) return;
    try {
      await cancelRegistration(regId, currentUser?.id);
      toast.success('Registration cancelled.');
    } catch (error) {
      toast.error(error?.message || 'Failed to cancel registration.');
    }
  };

  const initials = getInitials(currentUser?.name);
  const profilePhotoUrl = resolveMediaUrl(currentUser?.profile_photo);
  const headline = currentUser?.profession || 'Add a headline in your profile';

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validationError = validateProfilePhotoFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setPhotoUploading(true);
    clearAuthError();
    const result = await uploadProfilePhoto(file);
    if (result.ok) {
      toast.success('Profile photo updated.');
    } else {
      toast.error(result.message || 'Could not upload profile photo.');
    }
    setPhotoUploading(false);
  };

  const handleRemoveProfilePhoto = async () => {
    if (!profilePhotoUrl) return;
    setPhotoRemoving(true);
    clearAuthError();
    const result = await removeProfilePhoto();
    if (result.ok) {
      toast.success('Profile photo removed.');
    } else {
      toast.error(result.message || 'Could not remove profile photo.');
    }
    setPhotoRemoving(false);
  };
  const locationLine = [currentUser?.organization, currentUser?.address].filter(Boolean).join(' · ');

  const participationStats = [
    { label: 'Event registrations', value: activeRegs.length },
    { label: 'Upcoming events', value: upcoming.length },
    { label: 'Past events', value: past.length },
    { label: 'Events attended', value: attendedRegs.length },
    { label: 'Engagement rate', value: `${engagementRate}%` },
    { label: 'Certificates', value: certsLoading ? '…' : certificates.length },
    { label: 'Payments on file', value: paidRegs.length },
  ];

  return (
    <div className="min-h-screen bg-[#f3f2ef]">
      {/* Cover photo — LinkedIn-style banner */}
      <div
        className="h-[120px] sm:h-[152px] md:h-[200px] bg-gradient-to-r from-navy-800 via-navy-700 to-cyan-900"
        aria-hidden="true"
      />

      <div className="max-w-[1128px] mx-auto px-4 sm:px-6 pb-10">
        {/* Profile intro card */}
        <header className="relative bg-white rounded-lg border border-navy-200/70 shadow-sm -mt-12 sm:-mt-16 md:-mt-20 mb-4">
          {/* Square avatar — overlaps cover + card edge */}
          <div className="absolute left-4 sm:left-6 top-0 z-10 -translate-y-1/2 size-24 sm:size-32 md:size-[140px] rounded-lg border-4 border-white bg-gradient-to-br from-cyan-100 to-navy-100 shadow-lg overflow-hidden group">
            {profilePhotoUrl ? (
              <img
                src={profilePhotoUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
                <span className="text-2xl sm:text-3xl md:text-4xl font-bold text-navy-800 tracking-tight">{initials}</span>
              </div>
            )}
            <label
              className={`absolute inset-0 flex flex-col items-center justify-center gap-1 bg-navy-900/55 text-white text-xs font-medium transition-opacity cursor-pointer ${
                photoUploading || photoRemoving ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
            >
              {photoUploading || photoRemoving ? (
                <Loader2 size={28} className="animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Camera size={22} aria-hidden="true" />
                  <span>{profilePhotoUrl ? 'Change' : 'Upload'}</span>
                </>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={photoUploading || photoRemoving}
                onChange={handleProfilePhotoChange}
              />
            </label>
          </div>

          <div className="px-4 sm:px-6 pb-5 pt-3">
            {/* Offset text so it sits beside the square avatar */}
            <div className="min-h-[3.25rem] sm:min-h-[4.25rem] md:min-h-[4.75rem] pl-[calc(6rem+0.75rem)] sm:pl-[calc(8rem+1.25rem)] md:pl-[calc(8.75rem+1.5rem)]">
              <div className="min-w-0 text-left">
                <h1 className="text-xl sm:text-2xl md:text-[1.75rem] font-semibold text-navy-900 leading-tight truncate">
                  {currentUser?.name || 'Your name'}
                </h1>
                <p className="text-sm sm:text-base text-navy-700 mt-1 line-clamp-2">{headline}</p>
                {locationLine && (
                  <p className="text-sm text-navy-500 mt-1 flex items-center justify-start gap-1">
                    <MapPin size={14} className="shrink-0" />
                    <span className="truncate">{locationLine}</span>
                  </p>
                )}
                <p className="text-xs text-cyan-700 font-medium mt-2">
                  {activeRegs.length} event{activeRegs.length !== 1 ? 's' : ''} ·{' '}
                  {attendedRegs.length} attended ·{' '}
                  {certsLoading ? '…' : certificates.length} certificate{certificates.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-navy-400 mt-1">
                  Member since{' '}
                  {currentUser?.created_at ? formatDate(currentUser.created_at.split('T')[0]) : '—'}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photoUploading || photoRemoving}
                    className="text-xs font-semibold text-cyan-700 hover:text-cyan-800 disabled:opacity-50"
                  >
                    {photoUploading ? 'Uploading…' : profilePhotoUrl ? 'Change photo' : 'Upload photo'}
                  </button>
                  {profilePhotoUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveProfilePhoto}
                      disabled={photoUploading || photoRemoving}
                      className="text-xs font-medium text-navy-500 hover:text-red-600 disabled:opacity-50"
                    >
                      {photoRemoving ? 'Removing…' : 'Remove photo'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Profile sections"
              className="flex flex-wrap items-center justify-start gap-2 mt-5 pt-4 border-t border-navy-100"
            >
              {PROFILE_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`profile-tabpanel-${tab.id}`}
                    id={`profile-tab-${tab.id}`}
                    onClick={() => handleTabChange(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-2 border-cyan-600 text-cyan-700 bg-cyan-50'
                        : 'border border-navy-400 text-navy-700 hover:bg-navy-50 hover:border-navy-500'
                    }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold text-navy-600 hover:bg-red-50 hover:text-red-600 transition-colors ml-auto sm:ml-0"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        </header>

        <div className="mb-4">
          <KycBanner
            onCompleteClick={() => {
              handleTabChange('profile');
              setEditing(true);
            }}
          />
        </div>

        {saved && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-center gap-2 p-3.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700"
          >
            <CheckCircle size={15} className="shrink-0" />
            Profile updated successfully.
          </div>
        )}

        {(authError || formError) && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 flex items-center gap-2 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
          >
            <AlertCircle size={15} className="shrink-0" />
            {authError || formError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 lg:gap-6">
          {/* Main column — LinkedIn feed-style sections */}
          <main className="space-y-4 min-w-0">
            <div
              role="tabpanel"
              id={`profile-tabpanel-${activeTab}`}
              aria-labelledby={`profile-tab-${activeTab}`}
              className="flex flex-col gap-4"
            >
            {activeTab === 'profile' && editing ? (
              <LiCard>
                <LiSectionHeader title="Edit profile" />
                <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormInput icon={User} label="Full name" name="name" value={form.name} onChange={handleChange} />
                  <FormInput icon={Mail} label="Email address" name="email" type="email" value={form.email} onChange={handleChange} />
                  <FormInput icon={Phone} label="Phone number" name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="e.g. 09777" />
                  <FormInput icon={Briefcase} label="What you do (profession)" name="profession" value={form.profession} onChange={handleChange} placeholder="e.g. Quality Assurance Specialist" />
                  <FormInput icon={Building2} label="Organization" name="organization" value={form.organization} onChange={handleChange} placeholder="e.g. Ministry of Health" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Professional profile summary</label>
                  <textarea
                    name="about"
                    value={form.about}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Tell people what you do and your focus areas..."
                    className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormInput icon={Activity} label="Specialties (comma separated)" name="specialties" value={form.specialties} onChange={handleChange} placeholder="QA, Audits, Diagnostics" />
                  <FormInput icon={LinkIcon} label="Portfolio URL" name="portfolio_url" type="url" value={form.portfolio_url} onChange={handleChange} placeholder="https://..." />
                  <FormInput icon={ExternalLink} label="LinkedIn URL" name="linkedin_url" type="url" value={form.linkedin_url} onChange={handleChange} placeholder="https://linkedin.com/in/..." />
                </div>

                <div className="pt-4 border-t border-navy-100">
                  <div className="flex items-center gap-2 mb-4 p-3 bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-200 rounded-xl">
                    <Gift size={16} className="text-cyan-600 shrink-0" />
                    <p className="text-sm text-cyan-800">
                      <span className="font-semibold">Complete your KYC</span> — Fill in all highlighted fields below to unlock a free event session!
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormInput icon={Briefcase} label="Occupation" name="occupation" value={form.occupation} onChange={handleChange} placeholder="e.g. Software Engineer" highlight={!form.occupation} />
                    <FormInput icon={CreditCard} label="NRC ID No" name="nrc_id" value={form.nrc_id} onChange={handleChange} placeholder="e.g. 123456/78/1" highlight={!form.nrc_id} />
                    <FormInput icon={MapPin} label="Address" name="address" value={form.address} onChange={handleChange} placeholder="e.g. Plot 123, Cairo Road, Lusaka" highlight={!form.address} />
                    <FormInput icon={Heart} label="Interested in (comma separated)" name="interests" value={form.interests} onChange={handleChange} placeholder="e.g. Healthcare, Technology, Finance" highlight={!form.interests} />
                    <FormInput icon={ExternalLink} label="LinkedIn Profile" name="linkedin_handle" value={form.linkedin_handle} onChange={handleChange} placeholder="e.g. john-doe-123" highlight={!form.linkedin_handle} />
                  </div>
                </div>

                <ProfileCvSectionsEditor
                  sections={cvSections}
                  onChange={setCvSections}
                />

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={profileSaving}
                    aria-busy={profileSaving}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2 rounded-full text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors w-full sm:w-auto disabled:opacity-60 disabled:pointer-events-none min-w-[7.5rem]"
                  >
                    {profileSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />
                        Saving…
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={profileSaving}
                    onClick={() => {
                      setEditing(false);
                      setFormError('');
                      setForm({
                        name: currentUser?.name || '',
                        email: currentUser?.email || '',
                        phone: currentUser?.phone || '',
                        profession: currentUser?.profession || '',
                        organization: currentUser?.organization || '',
                        about: currentUser?.about || '',
                        specialties: Array.isArray(currentUser?.specialties) ? currentUser.specialties.join(', ') : '',
                        portfolio_url: currentUser?.portfolio_url || '',
                        linkedin_url: currentUser?.linkedin_url || '',
                        linkedin_handle: currentUser?.linkedin_handle || '',
                        occupation: currentUser?.occupation || '',
                        nrc_id: currentUser?.nrc_id || '',
                        address: currentUser?.address || '',
                        interests: Array.isArray(currentUser?.interests) ? currentUser.interests.join(', ') : '',
                      });
                      setCvSections(normalizeCvSections(currentUser?.cv_sections));
                    }}
                    className="px-5 py-2 rounded-full text-sm font-semibold border border-navy-300 text-navy-700 hover:bg-navy-50 transition-colors w-full sm:w-auto disabled:opacity-60 disabled:pointer-events-none"
                  >
                    Cancel
                  </button>
                </div>
                </div>
              </LiCard>
            ) : activeTab === 'profile' ? (
              <>
                <LiCard>
                  <LiSectionHeader
                    title="Professional profile"
                    onEdit={() => setEditing(true)}
                    showEdit
                  />
                  <p className="text-sm text-navy-800 leading-relaxed whitespace-pre-wrap">
                    {currentUser?.about || (
                      <span className="text-navy-500">
                        Tell your network what you do — add a short summary about your work and focus areas.
                      </span>
                    )}
                  </p>
                  {(currentUser?.profession || currentUser?.organization) && (
                    <p className="text-sm text-navy-600 mt-3 pt-3 border-t border-navy-100">
                      {currentUser.profession}
                      {currentUser.profession && currentUser.organization ? ' · ' : ''}
                      {currentUser.organization}
                    </p>
                  )}
                </LiCard>

                <LiCard>
                  <ProfileExperienceCard
                    sections={currentUser?.cv_sections}
                    onEdit={() => setEditing(true)}
                  />
                </LiCard>

                <LiCard>
                  <ProfileEducationCard
                    sections={currentUser?.cv_sections}
                    onEdit={() => setEditing(true)}
                  />
                </LiCard>

                <LiCard>
                  <ProfileReferencesCard
                    sections={currentUser?.cv_sections}
                    onEdit={() => setEditing(true)}
                  />
                </LiCard>

                <LiCard>
                  <LiSectionHeader title="Activity" />
                  {recentEngagement.length === 0 ? (
                    <p className="text-sm text-navy-500">
                      No activity yet. Register for events to show up here.
                    </p>
                  ) : (
                    <ul className="divide-y divide-navy-100">
                      {recentEngagement.map((reg) => (
                        <li key={reg.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="w-10 h-10 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                            <Ticket size={16} className="text-navy-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-navy-800">
                              <span className="font-semibold text-navy-900">You</span>
                              {' registered for '}
                              <span className="font-semibold">{reg.event_title}</span>
                            </p>
                            <p className="text-xs text-navy-500 mt-0.5 capitalize">
                              {reg.status} · {formatDate((reg.registered_at || '').split('T')[0])}
                            </p>
                            {reg.event?.slug && (
                              <Link
                                to={`/events/${reg.event.slug}`}
                                className="text-xs font-semibold text-cyan-700 hover:underline mt-1 inline-block"
                              >
                                View event
                              </Link>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => handleTabChange('events')}
                    className="mt-3 inline-block text-sm font-semibold text-cyan-700 hover:underline"
                  >
                    Show all events →
                  </button>
                </LiCard>

                <LiCard>
                  <LiSectionHeader
                    title="Skills"
                    onEdit={() => setEditing(true)}
                    showEdit
                  />
                  <div className="flex flex-wrap gap-2">
                    {(currentUser?.specialties || []).length > 0 ? (
                      currentUser.specialties.map((item) => (
                        <span
                          key={item}
                          className="inline-flex px-3 py-1.5 rounded-full text-sm font-medium bg-navy-100 text-navy-800"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-navy-500">Add specialties to highlight your expertise.</p>
                    )}
                  </div>
                  {(currentUser?.interests?.length > 0) && (
                    <div className="mt-4 pt-4 border-t border-navy-100">
                      <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Interests</p>
                      <div className="flex flex-wrap gap-2">
                        {currentUser.interests.map((item) => (
                          <span
                            key={item}
                            className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-pink-50 text-pink-800"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </LiCard>

                <LiCard>
                  <LiSectionHeader
                    title="Verification details"
                    onEdit={() => setEditing(true)}
                    showEdit
                    action={
                      (!currentUser?.occupation || !currentUser?.nrc_id || !currentUser?.address || !currentUser?.linkedin_handle || !(currentUser?.interests?.length > 0)) ? (
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="text-xs font-semibold text-cyan-700 hover:underline flex items-center gap-1"
                        >
                          <Gift size={12} />
                          Complete KYC
                        </button>
                      ) : null
                    }
                  />
                  <ul className="space-y-3 text-sm">
                    <LiDetailRow label="Occupation" value={currentUser?.occupation} />
                    <LiDetailRow label="NRC ID" value={currentUser?.nrc_id} />
                    <LiDetailRow label="Address" value={currentUser?.address} />
                    <li className="flex gap-3">
                      <span className="text-navy-500 w-24 shrink-0">LinkedIn</span>
                      <span className="text-navy-900 font-medium min-w-0">
                        {currentUser?.linkedin_handle ? (
                          <a
                            href={`https://linkedin.com/in/${currentUser.linkedin_handle}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-700 hover:underline inline-flex items-center gap-1"
                          >
                            {currentUser.linkedin_handle}
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-navy-400 font-normal">Not added</span>
                        )}
                      </span>
                    </li>
                  </ul>
                </LiCard>

                <LiCard>
                  <LiSectionHeader title="Contact & links" onEdit={() => setEditing(true)} showEdit />
                  <ul className="space-y-2.5 text-sm">
                    <li className="flex gap-2 items-center text-navy-800">
                      <Mail size={15} className="text-navy-400 shrink-0" />
                      {currentUser?.email || '—'}
                    </li>
                    <li className="flex gap-2 items-center text-navy-800">
                      <Phone size={15} className="text-navy-400 shrink-0" />
                      {currentUser?.phone || 'Not set'}
                    </li>
                    {safeExternalUrl(currentUser?.portfolio_url) && (
                      <li>
                        <a
                          href={safeExternalUrl(currentUser.portfolio_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-cyan-700 font-semibold hover:underline"
                        >
                          <LinkIcon size={15} />
                          Portfolio website
                        </a>
                      </li>
                    )}
                    {safeExternalUrl(currentUser?.linkedin_url) && (
                      <li>
                        <a
                          href={safeExternalUrl(currentUser.linkedin_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-cyan-700 font-semibold hover:underline"
                        >
                          <ExternalLink size={15} />
                          LinkedIn profile
                        </a>
                      </li>
                    )}
                  </ul>
                </LiCard>

              </>
            ) : activeTab === 'cv' ? (
              <CvGeneratorPanel
                certificates={certificates}
                registrations={enrichedRegistrations}
              />
            ) : activeTab === 'events' ? (
              <ProfileEventsTab
                upcoming={upcomingEvents}
                past={pastEvents}
                cancelled={cancelledEvents}
                onCancel={handleCancelRegistration}
              />
            ) : activeTab === 'certificates' ? (
              <ProfileCertificatesTab
                certificates={certificates}
                loading={certsLoading}
                error={certsError}
                onRetry={loadCertificates}
                certActionId={certActionId}
                onView={handleCertificateView}
                onDownload={handleCertificateDownload}
                onShare={handleCertificateShare}
              />
            ) : activeTab === 'payments' ? (
              <LiCard>
                <PaymentHistoryContent />
              </LiCard>
            ) : null}
            </div>
          </main>

          {/* Right rail — LinkedIn sidebar widgets */}
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <LiCard>
              <h2 className="text-base font-semibold text-navy-900 mb-3">Event participation</h2>
              <ul className="space-y-2.5">
                {participationStats.map((row) => (
                  <li key={row.label} className="flex items-center justify-between text-sm gap-2">
                    <span className="text-navy-600">{row.label}</span>
                    <span className="font-semibold text-navy-900 tabular-nums">{row.value}</span>
                  </li>
                ))}
              </ul>
              {cancelledRegs.length > 0 && (
                <p className="text-xs text-red-600 mt-3 pt-3 border-t border-navy-100">
                  {cancelledRegs.length} cancelled registration{cancelledRegs.length !== 1 ? 's' : ''}
                </p>
              )}
            </LiCard>

            <LiCard>
              <h2 className="text-base font-semibold text-navy-900 mb-3">Manage account</h2>
              <nav className="flex flex-col gap-1" aria-label="Quick navigation">
                {PROFILE_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabChange(tab.id)}
                      className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm font-medium text-left w-full transition-colors ${
                        activeTab === tab.id
                          ? 'bg-cyan-50 text-cyan-800'
                          : 'text-navy-700 hover:bg-navy-50'
                      }`}
                    >
                      <Icon size={16} className={activeTab === tab.id ? 'text-cyan-600' : 'text-navy-400'} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </LiCard>

            <LiCard>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-semibold text-navy-900">Credentials</h2>
                {!certsLoading && (
                  <span className="text-xs font-semibold text-navy-500 bg-navy-100 px-2 py-0.5 rounded-full">
                    {certificates.length}
                  </span>
                )}
              </div>
              {certsLoading ? (
                <p className="text-sm text-navy-500">Loading…</p>
              ) : certificates.length === 0 ? (
                <p className="text-sm text-navy-500 leading-relaxed">
                  Earn certificates by attending events after they end.
                </p>
              ) : (
                <ul className="space-y-3">
                  {certificates.slice(0, 3).map((cert) => (
                    <li key={cert.id} className="border-b border-navy-100 last:border-0 pb-3 last:pb-0">
                      <p className="text-sm font-semibold text-navy-900 line-clamp-2">{cert.event_title}</p>
                      <p className="text-xs text-navy-500 mt-0.5 font-mono truncate">{cert.certificate_code}</p>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => handleTabChange('certificates')}
                className="mt-3 text-sm font-semibold text-cyan-700 hover:underline"
              >
                {certificates.length > 0 ? 'View all certificates →' : 'Go to certificates →'}
              </button>
            </LiCard>
          </aside>
        </div>
      </div>

    </div>
  );
}

// ─── Certificates tab ─────────────────────────────────────────────────────────

function ProfileCertificatesTab({
  certificates,
  loading,
  error,
  onRetry,
  certActionId,
  onView,
  onDownload,
  onShare,
}) {
  return (
    <div className="space-y-4">
      <LiCard>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-navy-900 flex items-center gap-2">
              <Award size={18} className="text-amber-600" />
              My certificates
            </h2>
            <p className="text-sm text-navy-500 mt-1">
              Issued automatically after you attend an event that has ended.
            </p>
          </div>
          {!loading && (
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full shrink-0">
              {certificates.length} total
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-navy-400 text-center py-10">Loading certificates…</p>
        ) : error ? (
          <div className="text-center py-10 px-4 rounded-lg bg-red-50/80 border border-red-100">
            <AlertCircle size={32} className="text-red-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-navy-800">Could not load certificates</p>
            <p className="text-sm text-navy-500 mt-1 max-w-sm mx-auto">{error}</p>
            <button
              type="button"
              onClick={() => { void onRetry?.(); }}
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-cyan-700 hover:underline"
            >
              Try again
            </button>
            <p className="text-xs text-navy-400 mt-3">
              If this keeps happening, sign out and sign back in at{' '}
              <Link to="/account/login" className="text-cyan-700 hover:underline">Account login</Link>.
            </p>
          </div>
        ) : certificates.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-lg bg-navy-50/80">
            <Award size={32} className="text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-navy-800">No certificates yet</p>
            <p className="text-sm text-navy-500 mt-1 max-w-sm mx-auto">
              Attend an event, then check back after it ends. Your certificate will appear here and be emailed to you.
            </p>
            <Link
              to="/events"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-cyan-700 hover:underline"
            >
              Browse events
              <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {certificates.map((cert) => (
              <li
                key={cert.id}
                className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 rounded-lg border border-navy-100 hover:border-amber-200/80 transition-colors"
              >
                <div className="w-14 h-14 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                  <Award size={24} className="text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-900 leading-snug">{cert.event_title}</p>
                  <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-navy-500">
                    <div className="flex justify-between sm:block gap-2">
                      <dt className="text-navy-400">Event ended</dt>
                      <dd className="text-navy-700 font-medium">
                        {cert.event_end_date
                          ? formatDate(String(cert.event_end_date).split('T')[0])
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between sm:block gap-2">
                      <dt className="text-navy-400">Issued</dt>
                      <dd className="text-navy-700 font-medium">
                        {cert.issued_at
                          ? formatDate(String(cert.issued_at).split('T')[0])
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  <p
                    className="text-xs font-mono text-cyan-700 mt-2 truncate"
                    title={cert.certificate_code}
                  >
                    {cert.certificate_code}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-col sm:shrink-0">
                  <button
                    type="button"
                    onClick={() => { void onView(cert); }}
                    disabled={certActionId === cert.id}
                    className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1 min-w-[5rem] px-3 py-2 rounded-lg text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 disabled:opacity-50"
                  >
                    <Eye size={13} />
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => { void onDownload(cert); }}
                    disabled={certActionId === cert.id}
                    className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1 min-w-[5rem] px-3 py-2 rounded-lg text-xs font-semibold text-navy-700 bg-navy-50 hover:bg-navy-100 disabled:opacity-50"
                  >
                    <Download size={13} />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => { void onShare(cert); }}
                    disabled={certActionId === cert.id}
                    className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1 min-w-[5rem] px-3 py-2 rounded-lg text-xs font-semibold text-navy-600 bg-navy-50 hover:bg-navy-100 disabled:opacity-50"
                  >
                    <Share2 size={13} />
                    Share
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LiCard>
    </div>
  );
}

// ─── Events tab (inline) ──────────────────────────────────────────────────────

function ProfileEventsTab({ upcoming, past, cancelled, onCancel }) {
  return (
    <div className="space-y-4">
      <LiCard>
        <h2 className="text-base font-semibold text-navy-900 mb-4 flex items-center gap-2">
          <Clock size={18} className="text-cyan-600" />
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title="No upcoming events"
            description="Browse and register for upcoming events."
            action={(
              <Link
                to="/events"
                className="inline-flex items-center gap-2 mt-2 text-sm font-medium bg-cyan-600 text-white px-5 py-2.5 rounded-xl hover:bg-cyan-500 transition-colors"
              >
                Browse Events
                <ArrowRight size={14} />
              </Link>
            )}
          />
        ) : (
          <div className="space-y-3">
            {upcoming.map((reg) => (
              <RegistrationRow key={reg.id} reg={reg} onCancel={() => onCancel(reg.id)} />
            ))}
          </div>
        )}
      </LiCard>

      {past.length > 0 && (
        <LiCard>
          <h2 className="text-base font-semibold text-navy-900 mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-navy-400" />
            Past events ({past.length})
          </h2>
          <div className="space-y-3 opacity-90">
            {past.map((reg) => (
              <RegistrationRow key={reg.id} reg={reg} isPast />
            ))}
          </div>
        </LiCard>
      )}

      {cancelled.length > 0 && (
        <LiCard>
          <h2 className="text-base font-semibold text-navy-900 mb-4 flex items-center gap-2">
            <CalendarX size={18} className="text-red-400" />
            Cancelled ({cancelled.length})
          </h2>
          <div className="space-y-3 opacity-80">
            {cancelled.map((reg) => (
              <RegistrationRow key={reg.id} reg={reg} isPast />
            ))}
          </div>
        </LiCard>
      )}
    </div>
  );
}

// ─── Payment history (inline tab) ───────────────────────────────────────────

function PaymentHistoryContent() {
  const [previewReg, setPreviewReg] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await fetch(`${API_BASE}/account/receipts`, {
          headers: getUserAuthHeaders(),
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || 'Failed to load payment history.');
        }
        if (!cancelled) setReceipts(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || 'Unable to load payment history.');
          setReceipts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const paidReceipts = receipts.filter((r) => isReceiptEligible(r.payment_status));
  const totalPaid = paidReceipts.reduce((sum, r) => sum + Number(r.amount_zmw ?? r.amount ?? 0), 0);

  return (
    <div>
      <h2 className="text-base font-semibold text-navy-900 mb-1">Payment history</h2>
      <p className="text-sm text-navy-500 mb-4">Events, shop orders, CV purchases, and receipts</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg bg-navy-50 px-4 py-3 text-center">
          <SummaryTile icon={FileText} label="Total receipts" value={receipts.length} color="text-navy-700" />
        </div>
        <div className="rounded-lg bg-navy-50 px-4 py-3 text-center">
          <SummaryTile icon={CheckCircle} label="Paid / complimentary" value={paidReceipts.length} color="text-green-600" />
        </div>
        <div className="rounded-lg bg-navy-50 px-4 py-3 text-center">
          <SummaryTile icon={TrendingUp} label="Total paid (ZMW)" value={`K ${totalPaid.toFixed(2)}`} color="text-cyan-700" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-navy-500 py-8 text-center">Loading payment history…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-8 text-center">{loadError}</p>
      ) : receipts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-navy-50 flex items-center justify-center mb-4">
            <Receipt size={24} className="text-navy-300" />
          </div>
          <p className="text-navy-700 font-medium">No payments yet</p>
          <p className="text-sm text-navy-400 mt-1">Your paid events, shop orders, and CV purchases will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-navy-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-navy-500 uppercase tracking-wide">Item</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-navy-500 uppercase tracking-wide hidden sm:table-cell">Date</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-navy-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-navy-500 uppercase tracking-wide hidden md:table-cell">Method</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-navy-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-navy-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {receipts.map((reg) => {
                const isPaid = PAID_STATUSES.includes(reg.payment_status);
                const amount = Number(reg.amount_zmw ?? reg.amount ?? 0);
                const title = getReceiptSubjectTitle(reg);
                const rowKey = `${reg.receipt_source || 'row'}-${reg.receipt_source_id || reg.id || reg.reference_code}`;
                return (
                  <tr key={rowKey} className="hover:bg-navy-50/40 transition-colors">
                    <td className="px-4 py-3.5 max-w-[180px]">
                      <p className="font-medium text-navy-800 line-clamp-2 leading-snug">{title}</p>
                      <p className="text-[11px] text-navy-400 mt-0.5 capitalize">{resolveReceiptType(reg)}</p>
                      <p className="text-[11px] text-navy-400 font-mono">{reg.reference_code || reg.payment_reference || '—'}</p>
                    </td>
                    <td className="px-3 py-3.5 text-navy-500 whitespace-nowrap hidden sm:table-cell">
                      {formatDate((reg.registered_at || reg.created_at || '').split('T')[0])}
                    </td>
                    <td className="px-3 py-3.5 font-semibold text-navy-800 whitespace-nowrap">
                      {amount > 0 ? `K ${amount.toFixed(2)}` : <span className="text-green-600 font-medium">Free</span>}
                    </td>
                    <td className="px-3 py-3.5 text-navy-500 capitalize hidden md:table-cell">
                      {reg.payment_method ? String(reg.payment_method).replace(/_/g, ' ') : '—'}
                    </td>
                    <td className="px-3 py-3.5">
                      <PaymentStatusBadge status={reg.payment_status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {isPaid ? (
                        <button
                          type="button"
                          onClick={() => setPreviewReg(reg)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100"
                          aria-label={`View receipt for ${title}`}
                        >
                          <Eye size={12} />
                          View
                        </button>
                      ) : (
                        <span className="text-xs text-navy-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {previewReg && (
        <ReceiptPreviewModal
          registration={previewReg}
          onClose={() => setPreviewReg(null)}
        />
      )}

      <p className="text-xs text-navy-400 mt-4 pt-4 border-t border-navy-100">
        Open a receipt to preview and download the PDF.
      </p>
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function getInitials(name) {
  return (name || 'U')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function LiCard({ children, className = '' }) {
  return (
    <section className={`bg-white rounded-lg border border-navy-200/70 shadow-sm overflow-hidden ${className}`}>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </section>
  );
}

function LiSectionHeader({ title, onEdit, showEdit = false, action = null }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="text-base font-semibold text-navy-900">{title}</h2>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        {showEdit && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="p-2 rounded-full text-navy-500 hover:bg-navy-100 hover:text-navy-800 transition-colors"
            aria-label={`Edit ${title}`}
          >
            <Pencil size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function LiDetailRow({ label, value }) {
  return (
    <li className="flex gap-3">
      <span className="text-navy-500 w-24 shrink-0">{label}</span>
      <span className={`min-w-0 ${value ? 'text-navy-900 font-medium' : 'text-navy-400 font-normal'}`}>
        {value || 'Not added'}
      </span>
    </li>
  );
}

function SummaryTile({ icon: Icon, label, value, color }) {
  return (
    <div className="flex flex-col items-center justify-center py-4 px-3 text-center gap-1">
      <Icon size={15} className={`${color} mb-0.5`} />
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-[11px] text-navy-400">{label}</span>
    </div>
  );
}

function PaymentStatusBadge({ status = '' }) {
  const s = status.toLowerCase();
  const map = {
    paid:         { label: 'Paid',          cls: 'bg-green-50 text-green-700 border-green-200' },
    not_required: { label: 'Complimentary', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    waived:       { label: 'Waived',        cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    unpaid:       { label: 'Unpaid',        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    pending:      { label: 'Pending',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    failed:       { label: 'Failed',        cls: 'bg-red-50 text-red-700 border-red-200' },
  };
  const { label, cls } = map[s] || { label: status || '—', cls: 'bg-navy-50 text-navy-600 border-navy-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function FormInput({ icon: Icon, label, name, value, onChange, type = 'text', placeholder = '', highlight = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy-700 mb-1.5 flex items-center gap-1.5">
        {label}
        {highlight && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 animate-pulse">
            Required
          </span>
        )}
      </label>
      <div className="relative">
        <Icon size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${highlight ? 'text-cyan-500' : 'text-navy-400'}`} />
        <input
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all ${
            highlight
              ? 'border-cyan-400 bg-cyan-50/50 ring-1 ring-cyan-200 shadow-[0_0_0_3px_rgba(6,182,212,0.1)]'
              : 'border-navy-200 bg-navy-50'
          }`}
        />
      </div>
    </div>
  );
}

