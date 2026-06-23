import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save, RotateCcw, ExternalLink, Info } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, FormField, ConfirmDialog, LoadingButton } from '../../components/ui';
import ThemeToggle from '../../components/ThemeToggle';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { formatNrcNumber } from '../../utils/helpers';

const tabs = [
  { key: 'profile', label: 'Profile' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'email', label: 'Email Configuration' },
  { key: 'payment', label: 'Payment Gateway' },
  { key: 'cv', label: 'CV Generator' },
  { key: 'sms', label: 'SMS Configuration' },
  { key: 'whatsapp', label: 'WhatsApp Configuration' },
  { key: 'nrc', label: 'NRC Verification' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security', label: 'Security' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'video', label: 'Video Meetings' },
];

const API_BASE = getApiBase();

const defaultSystemConfig = {
  email: {
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: '',
    fromName: 'Mutale Admin',
    fromEmail: '',
    replyTo: '',
  },
  payment: {
    provider: 'lenco',
    publicKey: '',
    secretKey: '',
    webhookSecret: '',
    accountId: '',
    currency: 'ZMW',
    sandboxMode: true,
  },
  sms: {
    provider: 'twilio',
    senderId: '',
    apiKey: '',
    apiSecret: '',
    defaultCountryCode: '+260',
    webhookUrl: '',
  },
  whatsapp: {
    provider: 'green_api',
    accessToken: '',
    phoneNumberId: '',
    greenApiUrl: 'https://api.green-api.com',
    greenApiInstanceId: '',
    greenApiToken: '',
    senderNumber: '0973790404',
    webhookUrl: '',
  },
  notifications: {
    emailOnNewRegistration: true,
    emailOnEventReminder: true,
    smsOnNewRegistration: false,
    whatsappOnNewRegistration: false,
    whatsappClientOnRegistration: false,
    weeklySummary: true,
    adminAlertEmail: '',
    adminAlertPhone: '',
    adminAlertWhatsApp: '',
    digestDay: 'monday',
  },
  security: {
    sessionTimeoutMinutes: '120',
    require2faAdmin: false,
    loginAlertEmails: true,
    passwordRotationDays: '90',
    allowedIps: '',
  },
  integrations: {
    googleAnalyticsId: '',
    metaPixelId: '',
    slackWebhook: '',
    zapierWebhook: '',
    nrcVerificationEnabled: true,
    smartdataApiKey: '',
    smartdataBaseUrl: 'https://mysmartdata.tech/api/v1',
  },
  video: {
    defaultProvider: 'zoom',
    enabledProviders: ['zoom', 'daily'],
    joinMode: 'embed',
  },
  zoom: {
    accountId: '',
    clientId: '',
    clientSecret: '',
    sdkKey: '',
    sdkSecret: '',
    defaultHostEmail: '',
    webhookSecretToken: '',
  },
  daily: {
    apiKey: '',
    domain: '',
    webhookSecret: '',
    defaultRoomPrivacy: 'private',
    maxParticipantsDefault: 200,
  },
  cvGenerator: {
    enabled: true,
    priceZmw: 75,
  },
};

function normalizeSystemConfigSource(source) {
  if (!source) return {};
  if (typeof source === 'string') {
    try {
      return JSON.parse(source);
    } catch {
      return {};
    }
  }
  return source;
}



function mergeSystemConfig(source = {}) {
  const normalized = normalizeSystemConfigSource(source);
  return {
    ...defaultSystemConfig,
    ...normalized,
    email: { ...defaultSystemConfig.email, ...(normalized.email || {}) },
    payment: { ...defaultSystemConfig.payment, ...(normalized.payment || {}) },
    sms: { ...defaultSystemConfig.sms, ...(normalized.sms || {}) },
    whatsapp: { ...defaultSystemConfig.whatsapp, ...(normalized.whatsapp || {}) },
    notifications: { ...defaultSystemConfig.notifications, ...(normalized.notifications || {}) },
    security: { ...defaultSystemConfig.security, ...(normalized.security || {}) },
    integrations: { ...defaultSystemConfig.integrations, ...(normalized.integrations || {}) },
    video: { ...defaultSystemConfig.video, ...(normalized.video || {}) },
    zoom: { ...defaultSystemConfig.zoom, ...(normalized.zoom || {}) },
    daily: { ...defaultSystemConfig.daily, ...(normalized.daily || {}) },
    cvGenerator: {
      enabled: normalized.cvGenerator?.enabled !== false,
      priceZmw: Math.max(0, Number(normalized.cvGenerator?.priceZmw ?? defaultSystemConfig.cvGenerator.priceZmw) || 0),
    },
  };
}

export default function SettingsPage() {
  const { profile, updateProfile, resetToDefaults } = useData();
  const toast = useToast();
  const savedTimerRef = useRef(null);

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tab = String(searchParams.get('tab') || '').trim();
    return tabs.some((t) => t.key === tab) ? tab : 'profile';
  });
  const [form, setForm] = useState({
    name: profile.name,
    tagline: profile.tagline,
    heroIntro: profile.heroIntro,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    availableFor: profile.availableFor,
  });
  const [systemForm, setSystemForm] = useState(defaultSystemConfig);
  const [saved, setSaved] = useState('');
  const [systemLoading, setSystemLoading] = useState(true);
  const [systemSaving, setSystemSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [testingNotificationChannel, setTestingNotificationChannel] = useState('');
  const [notificationStatus, setNotificationStatus] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [testingZoom, setTestingZoom] = useState(false);
  const [zoomTestStatus, setZoomTestStatus] = useState(null);
  const [testingZoomSdk, setTestingZoomSdk] = useState(false);
  const [zoomSdkTestStatus, setZoomSdkTestStatus] = useState(null);
  const [sdkTestMeetingNumber, setSdkTestMeetingNumber] = useState('');
  const [videoSubTab, setVideoSubTab] = useState('provider');
  const [zoomSubTab, setZoomSubTab] = useState('getting-started');
  const [dailyTestStatus, setDailyTestStatus] = useState(null);
  const [testingDaily, setTestingDaily] = useState(false);
  const [testingSmartData, setTestingSmartData] = useState(false);
  const [smartDataTestStatus, setSmartDataTestStatus] = useState(null);
  const [testNrcNumber, setTestNrcNumber] = useState('');
  const [videoStatus, setVideoStatus] = useState(null);

  useEffect(() => {
    const tab = String(searchParams.get('tab') || '').trim();
    if (tab && tabs.some((t) => t.key === tab)) {
      setActiveTab(tab);
      if (tab === 'video') setVideoSubTab('provider');
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadSystemSettings = async () => {
      try {
        const response = await fetch(`${API_BASE}/settings/system`, {
          headers: getAdminAuthHeaders(),
        });
        if (!response.ok) throw new Error(`Failed to load settings (${response.status})`);
        const json = await response.json();
        if (cancelled) return;
        setSystemForm(mergeSystemConfig(json?.data || {}));
      } catch {
        if (cancelled) return;
        setSystemForm(defaultSystemConfig);
      } finally {
        if (!cancelled) setSystemLoading(false);
      }
    };

    loadSystemSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'video') return undefined;
    let cancelled = false;

    const loadVideoStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/settings/video/status`, {
          headers: getAdminAuthHeaders(),
        });
        const json = await response.json().catch(() => ({}));
        if (!cancelled) setVideoStatus(json);
      } catch {
        if (!cancelled) setVideoStatus(null);
      }
    };

    loadVideoStatus();
    return () => {
      cancelled = true;
    };
  }, [activeTab, systemSaving]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleVideoProviderEnabled = (provider) => {
    setSystemForm((prev) => {
      const current = Array.isArray(prev.video?.enabledProviders)
        ? [...prev.video.enabledProviders]
        : ['zoom', 'daily'];
      const next = current.includes(provider)
        ? current.filter((p) => p !== provider)
        : [...current, provider];
      if (!next.length) return prev;
      const defaultProvider = next.includes(prev.video?.defaultProvider)
        ? prev.video.defaultProvider
        : next[0];
      return {
        ...prev,
        video: {
          ...prev.video,
          enabledProviders: next,
          defaultProvider,
        },
      };
    });
  };

  const handleTestDailyConnection = async () => {
    setDailyTestStatus(null);
    setTestingDaily(true);
    try {
      await fetch(`${API_BASE}/settings/system`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(systemForm),
      });
      const response = await fetch(`${API_BASE}/settings/daily/test`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'Daily test failed.');
      }
      setDailyTestStatus({ type: 'success', message: json.message || 'Daily credentials are valid.' });
    } catch (error) {
      setDailyTestStatus({ type: 'error', message: error.message || 'Daily test failed.' });
    } finally {
      setTestingDaily(false);
    }
  };

  const handleSystemChange = (section, e) => {
    const { name, value, type, checked } = e.target;
    setSystemForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [name]: type === 'checkbox' ? checked : value,
      },
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await updateProfile(form);
      setSaved('Profile settings saved successfully!');
      toast.success('Profile saved.');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(''), 3000);
    } catch {
      const msg = 'Failed to save profile settings.';
      setSaved(msg);
      toast.error(msg);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(''), 3500);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveSystem = async (e) => {
    e.preventDefault();
    setSystemSaving(true);
    try {
      const response = await fetch(`${API_BASE}/settings/system`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(systemForm),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.message || json?.error || `Failed to save settings (${response.status})`);
      }

      const json = await response.json();
      setSystemForm(mergeSystemConfig(json?.data || systemForm));
      setSaved('System configuration saved successfully!');
      toast.success('System configuration saved.');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(''), 3000);
    } catch (error) {
      const msg = error?.message || 'Failed to save settings. Please verify the backend is running.';
      setSaved(msg);
      toast.error(msg);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(''), 3500);
    } finally {
      setSystemSaving(false);
    }
  };

  const handleTestPaymentConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      const persistResponse = await fetch(`${API_BASE}/settings/system`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(systemForm),
      });

      if (!persistResponse.ok) {
        throw new Error(`Failed to persist settings before test (${persistResponse.status})`);
      }

      const response = await fetch(`${API_BASE}/settings/payment/lenco/test`, {
        method: 'POST',
        headers: getAdminAuthHeaders(),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || json?.message || `Connection test failed (${response.status})`);
      }

      setConnectionStatus({
        type: 'success',
        message: json?.message || 'Connection successful. Lenco credentials are valid.',
      });
    } catch (error) {
      setConnectionStatus({
        type: 'error',
        message: error?.message || 'Unable to validate Lenco connection right now.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTestSmartDataConnection = async () => {
    setTestingSmartData(true);
    setSmartDataTestStatus(null);

    try {
      const persistResponse = await fetch(`${API_BASE}/settings/system`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(systemForm),
      });

      if (!persistResponse.ok) {
        const json = await persistResponse.json().catch(() => ({}));
        throw new Error(json?.message || `Failed to save settings before test (${persistResponse.status})`);
      }

      const response = await fetch(`${API_BASE}/settings/smartdata/test`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ nrc_number: testNrcNumber.trim() }),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || `SmartData test failed (${response.status})`);
      }

      setSmartDataTestStatus({
        type: 'success',
        message: json?.message || 'SmartData connection successful.',
      });
    } catch (error) {
      setSmartDataTestStatus({
        type: 'error',
        message: error?.message || 'Unable to validate SmartData connection right now.',
      });
    } finally {
      setTestingSmartData(false);
    }
  };

  const handleTestZoomConnection = async () => {
    setTestingZoom(true);
    setZoomTestStatus(null);

    try {
      // Save settings first
      await fetch(`${API_BASE}/settings/system`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(systemForm),
      });

      const response = await fetch(`${API_BASE}/settings/zoom/test`, {
        method: 'POST',
        headers: getAdminAuthHeaders(),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || json?.message || `Connection test failed (${response.status})`);
      }

      setZoomTestStatus({
        type: 'success',
        message: json?.message || 'Zoom credentials are valid.',
      });
    } catch (error) {
      setZoomTestStatus({
        type: 'error',
        message: error?.message || 'Unable to validate Zoom connection right now.',
      });
    } finally {
      setTestingZoom(false);
    }
  };

  const handleTestZoomSdk = async () => {
    setTestingZoomSdk(true);
    setZoomSdkTestStatus(null);

    try {
      await fetch(`${API_BASE}/settings/system`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(systemForm),
      });

      const response = await fetch(`${API_BASE}/settings/zoom/sdk-test`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ meetingNumber: sdkTestMeetingNumber }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || json?.message || `SDK test failed (${response.status})`);
      }

      const diagnostics = json?.diagnostics || {};
      const warnings = Array.isArray(diagnostics?.warnings) ? diagnostics.warnings.filter(Boolean) : [];
      const meetingLookup = diagnostics?.meetingLookup || {};
      const meetingMessage = meetingLookup?.attempted
        ? (meetingLookup?.exists
          ? ` Meeting lookup: ${meetingLookup?.message || 'found.'}`
          : ` Meeting lookup warning: ${meetingLookup?.message || 'not found.'}`)
        : '';
      const warningMessage = warnings.length ? ` Warnings: ${warnings.join(' ')}` : '';

      setZoomSdkTestStatus({
        type: 'success',
        message: `${json?.message || 'SDK signature preflight passed.'}${meetingMessage}${warningMessage}`,
      });
    } catch (error) {
      setZoomSdkTestStatus({
        type: 'error',
        message: error?.message || 'Unable to validate Zoom SDK signature right now.',
      });
    } finally {
      setTestingZoomSdk(false);
    }
  };

  const handleReset = () => {
    resetToDefaults();
    setConfirmReset(false);
    window.location.reload();
  };

  const handleTestNotification = async (channel) => {
    setTestingNotificationChannel(channel);
    setNotificationStatus(null);

    try {
      const persistResponse = await fetch(`${API_BASE}/settings/system`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(systemForm),
      });

      if (!persistResponse.ok) {
        throw new Error(`Failed to persist settings before test (${persistResponse.status})`);
      }

      const response = await fetch(`${API_BASE}/notifications/test`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          channel,
          recipient: channel === 'whatsapp'
            ? (systemForm.whatsapp.senderNumber || systemForm.notifications.adminAlertWhatsApp || '0973790404')
            : undefined,
        }),
      });

      const json = await response.json().catch(() => ({}));
      const result = json?.data || {};

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || json?.message || `Test failed (${response.status})`);
      }

      setNotificationStatus({
        type: result.status === 'sent' ? 'success' : result.status === 'failed' ? 'error' : 'info',
        message: result.status === 'sent'
          ? `${channelLabel(channel)} test sent successfully to ${result.recipient || 'configured recipient'}${result.data?.idMessage ? ` (message ID: ${result.data.idMessage})` : ''}.`
          : result.status === 'skipped'
            ? `${channelLabel(channel)} test skipped: ${result.reason || 'No recipient configured. Fill in the alert recipient field above and save first.'}`
            : result.reason || `${channelLabel(channel)} test completed with status: ${result.status || 'unknown'}.`,
      });
      setTimeout(() => setNotificationStatus(null), 8000);
    } catch (error) {
      setNotificationStatus({
        type: 'error',
        message: error?.message || `Unable to send ${channelLabel(channel)} test notification right now.`,
      });
      setTimeout(() => setNotificationStatus(null), 8000);
    } finally {
      setTestingNotificationChannel('');
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your portfolio profile information"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Settings' },
        ]}
      />

      {saved && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
          <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          {saved}
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        <Card title="Configuration Center" subtitle="Manage site-wide and integration settings">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-cyan-600 text-white'
                    : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </Card>

        {activeTab === 'profile' && (
          <Card
            title="Profile Information"
            subtitle="Update your personal and professional details"
          >
            <form onSubmit={handleSave} className="space-y-5">
              <FormField label="Full Name" name="name" value={form.name} onChange={handleChange} required />
              <FormField label="Professional Tagline" name="tagline" value={form.tagline} onChange={handleChange} required helpText="Appears below your name on the homepage" />
              <FormField label="Hero Introduction" name="heroIntro" value={form.heroIntro} onChange={handleChange} textarea rows={4} required helpText="The main introduction text on your homepage" />
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
                <FormField label="Phone" name="phone" value={form.phone} onChange={handleChange} required />
              </div>
              <FormField label="Location" name="location" value={form.location} onChange={handleChange} required />
              <FormField label="Available For" name="availableFor" value={form.availableFor} onChange={handleChange} textarea rows={3} helpText="What types of engagements or opportunities you're open to" />

              <div className="pt-4 border-t border-navy-100">
                <LoadingButton
                  type="submit"
                  loading={profileSaving}
                  loadingLabel="Saving…"
                  icon={Save}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Save Profile Settings
                </LoadingButton>
              </div>
            </form>
          </Card>
        )}

        {activeTab === 'appearance' && (
          <Card
            title="Appearance"
            subtitle="Choose light mode, dark mode, or match your system preference"
          >
            <div className="space-y-4">
              <p className="text-sm text-navy-600">
                This preference applies to the public website and admin portal. Your choice is saved in this browser.
              </p>
              <ThemeToggle variant="segmented" />
            </div>
          </Card>
        )}

        {activeTab === 'email' && (
          <Card title="Email Configuration" subtitle="SMTP and sender details">
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="SMTP Host" name="smtpHost" value={systemForm.email.smtpHost} onChange={(e) => handleSystemChange('email', e)} />
                <FormField label="SMTP Port" name="smtpPort" value={systemForm.email.smtpPort} onChange={(e) => handleSystemChange('email', e)} />
                <FormField label="SMTP Username" name="smtpUser" value={systemForm.email.smtpUser} onChange={(e) => handleSystemChange('email', e)} />
                <FormField label="SMTP Password" name="smtpPassword" type="password" value={systemForm.email.smtpPassword} onChange={(e) => handleSystemChange('email', e)} />
                <FormField label="From Name" name="fromName" value={systemForm.email.fromName} onChange={(e) => handleSystemChange('email', e)} />
                <FormField label="From Email" name="fromEmail" type="email" value={systemForm.email.fromEmail} onChange={(e) => handleSystemChange('email', e)} />
              </div>
              <FormField label="Reply-To Address" name="replyTo" type="email" value={systemForm.email.replyTo} onChange={(e) => handleSystemChange('email', e)} />
              <SaveButton loading={systemSaving} disabled={systemLoading} />
            </form>
          </Card>
        )}

        {activeTab === 'payment' && (
          <Card title="Payment Gateway" subtitle="Configure payment processing provider">
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Provider" name="provider" type="select" value={systemForm.payment.provider} onChange={(e) => handleSystemChange('payment', e)} options={[{ value: 'lenco', label: 'Lenco' }, { value: 'stripe', label: 'Stripe' }, { value: 'paypal', label: 'PayPal' }, { value: 'flutterwave', label: 'Flutterwave' }, { value: 'paystack', label: 'Paystack' }, { value: 'manual', label: 'Manual / Offline' }]} />
                <FormField label="Default Currency" name="currency" value={systemForm.payment.currency} onChange={(e) => handleSystemChange('payment', e)} />
                <FormField label="Lenco Public Key" name="publicKey" value={systemForm.payment.publicKey} onChange={(e) => handleSystemChange('payment', e)} />
                <FormField label="Lenco Secret Key" name="secretKey" type="password" value={systemForm.payment.secretKey} onChange={(e) => handleSystemChange('payment', e)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Lenco Account ID" name="accountId" value={systemForm.payment.accountId} onChange={(e) => handleSystemChange('payment', e)} helpText="Optional but recommended for transfer/balance operations" />
                <FormField label="Webhook Secret" name="webhookSecret" value={systemForm.payment.webhookSecret} onChange={(e) => handleSystemChange('payment', e)} />
              </div>
              <BooleanField label="Enable Sandbox/Test Mode" name="sandboxMode" checked={systemForm.payment.sandboxMode} onChange={(e) => handleSystemChange('payment', e)} />
              {systemForm.payment.provider === 'lenco' && (
                <>
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 text-sm text-cyan-800">
                    {systemForm.payment.sandboxMode ? 'Sandbox' : 'Production'} mode enabled. Base URL resolves automatically for Lenco.
                  </div>
                  <div className="rounded-xl border border-navy-200 bg-navy-50 p-3 text-sm text-navy-700 space-y-2">
                    <p className="font-medium text-navy-900">Card checkout checklist (production)</p>
                    <ul className="list-disc pl-5 space-y-1 text-navy-600">
                      <li>Turn off Sandbox/Test Mode for live card payments.</li>
                      <li>Use the Lenco <strong>public</strong> key in Public Key (not the secret key).</li>
                      <li>Public and secret keys must both be from the same environment (production pair or sandbox pair).</li>
                      <li>Test Connection only validates API access (mobile money). Card uses the public key and must be enabled on your Lenco account.</li>
                      <li>If card shows &ldquo;not authorized&rdquo;, email <a href="mailto:support@lenco.co" className="text-cyan-700 underline">support@lenco.co</a> with the error reference and your site domain.</li>
                    </ul>
                  </div>
                </>
              )}
              {connectionStatus && (
                <div
                  className={`rounded-xl border p-3 text-sm ${
                    connectionStatus.type === 'success'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {connectionStatus.message}
                </div>
              )}
              <div className="pt-4 border-t border-navy-100 flex flex-wrap items-center gap-3">
                <LoadingButton
                  type="button"
                  onClick={handleTestPaymentConnection}
                  loading={testingConnection}
                  loadingLabel="Testing Connection..."
                  disabled={systemLoading || systemForm.payment.provider !== 'lenco'}
                  className="border border-cyan-200 text-cyan-700 hover:bg-cyan-50 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Test Connection
                </LoadingButton>
                <LoadingButton
                  type="submit"
                  loading={systemSaving}
                  loadingLabel="Saving…"
                  icon={Save}
                  disabled={systemLoading}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Save Payment Configuration
                </LoadingButton>
              </div>
            </form>
          </Card>
        )}

        {activeTab === 'cv' && (
          <Card
            title="CV Generator"
            subtitle="Download bundle price — viewing and generating are always free"
          >
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <BooleanField
                label="Enable CV generator for users"
                name="enabled"
                checked={systemForm.cvGenerator?.enabled !== false}
                onChange={(e) => handleSystemChange('cvGenerator', e)}
              />
              <FormField
                label="Download bundle price (ZMW)"
                name="priceZmw"
                type="number"
                min={0}
                step={0.01}
                value={systemForm.cvGenerator?.priceZmw ?? 75}
                onChange={(e) => handleSystemChange('cvGenerator', e)}
                helpText="Set to 0 for free PDF and Word downloads. Users see this amount on /account/profile → CV generator when they download."
              />
              <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 text-sm text-cyan-900">
                {Number(systemForm.cvGenerator?.priceZmw) > 0 ? (
                  <>
                    Users pay <strong>K {Number(systemForm.cvGenerator?.priceZmw || 0).toFixed(2)}</strong> once via
                    your configured Lenco gateway (mobile money or card) to unlock PDF and Word downloads forever.
                    Viewing and generating the CV on the profile page stay free.
                  </>
                ) : (
                  <>CV downloads are <strong>free</strong> — users can download PDF and Word without payment.</>
                )}
              </div>
              <SaveButton
                label="Save CV Generator Settings"
                loading={systemSaving}
                disabled={systemLoading}
              />
            </form>
          </Card>
        )}

        {activeTab === 'sms' && (
          <Card title="SMS Configuration" subtitle="Configure SMS provider and credentials">
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Provider" name="provider" type="select" value={systemForm.sms.provider} onChange={(e) => handleSystemChange('sms', e)} options={[{ value: 'twilio', label: 'Twilio' }, { value: 'africastalking', label: 'Africa\'s Talking' }, { value: 'aws_sns', label: 'AWS SNS' }, { value: 'webhook', label: 'Custom Webhook' }, { value: 'none', label: 'Disabled' }]} />
                <FormField label="Sender ID" name="senderId" value={systemForm.sms.senderId} onChange={(e) => handleSystemChange('sms', e)} />
                <FormField label="API Key" name="apiKey" value={systemForm.sms.apiKey} onChange={(e) => handleSystemChange('sms', e)} />
                <FormField label="API Secret" name="apiSecret" type="password" value={systemForm.sms.apiSecret} onChange={(e) => handleSystemChange('sms', e)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Default Country Code" name="defaultCountryCode" value={systemForm.sms.defaultCountryCode} onChange={(e) => handleSystemChange('sms', e)} />
                <FormField label="Delivery Webhook URL" name="webhookUrl" value={systemForm.sms.webhookUrl} onChange={(e) => handleSystemChange('sms', e)} placeholder="https://..." />
              </div>
              <p className="text-xs text-navy-500">Webhook mode sends a POST payload to your provider adapter/service.</p>
              <SaveButton loading={systemSaving} disabled={systemLoading} />
            </form>
          </Card>
        )}

        {activeTab === 'whatsapp' && (
          <Card title="WhatsApp Configuration" subtitle="Configure provider and delivery credentials">
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Provider" name="provider" type="select" value={systemForm.whatsapp.provider} onChange={(e) => handleSystemChange('whatsapp', e)} options={[{ value: 'green_api', label: 'Green API' }, { value: 'none', label: 'Disabled' }]} />
                <FormField label="API URL" name="greenApiUrl" value={systemForm.whatsapp.greenApiUrl} onChange={(e) => handleSystemChange('whatsapp', e)} placeholder="https://7107.api.greenapi.com" />
                <FormField label="ID Instance" name="greenApiInstanceId" value={systemForm.whatsapp.greenApiInstanceId} onChange={(e) => handleSystemChange('whatsapp', e)} placeholder="7107615755" />
                <FormField label="API Token Instance" name="greenApiToken" type="password" value={systemForm.whatsapp.greenApiToken} onChange={(e) => handleSystemChange('whatsapp', e)} />
                <FormField label="Phone / Test Recipient" name="senderNumber" value={systemForm.whatsapp.senderNumber} onChange={(e) => handleSystemChange('whatsapp', e)} placeholder="260973790404" />
              </div>
              <p className="text-xs text-navy-500">Use the exact API URL, ID Instance, API Token Instance, and phone shown in Green API. The phone is used for the test message.</p>
              <div className="flex flex-wrap gap-2">
                <SaveButton loading={systemSaving} disabled={systemLoading} />
                <LoadingButton
                  type="button"
                  onClick={() => handleTestNotification('whatsapp')}
                  loading={testingNotificationChannel === 'whatsapp'}
                  loadingLabel="Sending WhatsApp test..."
                  disabled={systemLoading || Boolean(testingNotificationChannel)}
                  className="border border-cyan-200 text-cyan-700 hover:bg-cyan-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Send WhatsApp test
                </LoadingButton>
              </div>
              {notificationStatus && (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    notificationStatus.type === 'success'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : notificationStatus.type === 'info'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {notificationStatus.message}
                </div>
              )}
            </form>
          </Card>
        )}

        {activeTab === 'notifications' && (
          <Card title="Notification Configuration" subtitle="Enable channels and recipients for registration alerts">
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <BooleanField label="Email on new registration" name="emailOnNewRegistration" checked={systemForm.notifications.emailOnNewRegistration} onChange={(e) => handleSystemChange('notifications', e)} />
                <BooleanField label="Email event reminders" name="emailOnEventReminder" checked={systemForm.notifications.emailOnEventReminder} onChange={(e) => handleSystemChange('notifications', e)} />
                <BooleanField label="SMS on new registration" name="smsOnNewRegistration" checked={systemForm.notifications.smsOnNewRegistration} onChange={(e) => handleSystemChange('notifications', e)} />
                <BooleanField label="WhatsApp on new registration" name="whatsappOnNewRegistration" checked={systemForm.notifications.whatsappOnNewRegistration} onChange={(e) => handleSystemChange('notifications', e)} />
                <BooleanField label="WhatsApp client after event registration" name="whatsappClientOnRegistration" checked={systemForm.notifications.whatsappClientOnRegistration} onChange={(e) => handleSystemChange('notifications', e)} />
                <BooleanField label="Weekly summary digest" name="weeklySummary" checked={systemForm.notifications.weeklySummary} onChange={(e) => handleSystemChange('notifications', e)} />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <FormField label="Alert Email" name="adminAlertEmail" type="email" value={systemForm.notifications.adminAlertEmail} onChange={(e) => handleSystemChange('notifications', e)} />
                <FormField label="Alert SMS Phone" name="adminAlertPhone" value={systemForm.notifications.adminAlertPhone} onChange={(e) => handleSystemChange('notifications', e)} placeholder="+260..." />
                <FormField label="Alert WhatsApp" name="adminAlertWhatsApp" value={systemForm.notifications.adminAlertWhatsApp} onChange={(e) => handleSystemChange('notifications', e)} placeholder="+260..." />
                <FormField label="Digest Day" name="digestDay" type="select" value={systemForm.notifications.digestDay} onChange={(e) => handleSystemChange('notifications', e)} options={[{ value: 'monday', label: 'Monday' }, { value: 'tuesday', label: 'Tuesday' }, { value: 'wednesday', label: 'Wednesday' }, { value: 'thursday', label: 'Thursday' }, { value: 'friday', label: 'Friday' }]} />
              </div>

              <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4 space-y-3">
                <p className="text-sm text-cyan-900 font-medium">Send test notifications</p>
                <p className="text-xs text-cyan-800">Each test uses the alert recipient configured above for that channel.</p>
                <div className="flex flex-wrap gap-2">
                  {['email', 'sms', 'whatsapp'].map((channel) => {
                    const channelLoading = testingNotificationChannel === channel;
                    return (
                      <LoadingButton
                        key={channel}
                        type="button"
                        onClick={() => handleTestNotification(channel)}
                        loading={channelLoading}
                        loadingLabel={`Sending ${channelLabel(channel)}...`}
                        disabled={systemLoading || Boolean(testingNotificationChannel)}
                        className="border border-cyan-200 text-cyan-700 hover:bg-cyan-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        {`Send ${channelLabel(channel)} test`}
                      </LoadingButton>
                    );
                  })}
                </div>

                {notificationStatus && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      notificationStatus.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : notificationStatus.type === 'info'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {notificationStatus.message}
                  </div>
                )}
              </div>

              <SaveButton loading={systemSaving} disabled={systemLoading} />
            </form>
          </Card>
        )}

        {activeTab === 'security' && (
          <Card title="Security Settings" subtitle="Session and access controls">
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Session Timeout (minutes)" name="sessionTimeoutMinutes" type="number" value={systemForm.security.sessionTimeoutMinutes} onChange={(e) => handleSystemChange('security', e)} />
                <FormField label="Password Rotation (days)" name="passwordRotationDays" type="number" value={systemForm.security.passwordRotationDays} onChange={(e) => handleSystemChange('security', e)} />
              </div>
              <BooleanField label="Require 2FA for admins" name="require2faAdmin" checked={systemForm.security.require2faAdmin} onChange={(e) => handleSystemChange('security', e)} />
              <BooleanField label="Send login alert emails" name="loginAlertEmails" checked={systemForm.security.loginAlertEmails} onChange={(e) => handleSystemChange('security', e)} />
              <FormField label="Allowed IPs" name="allowedIps" value={systemForm.security.allowedIps} onChange={(e) => handleSystemChange('security', e)} textarea rows={4} helpText="Optional: comma-separated IP addresses or CIDR blocks" />
              <SaveButton loading={systemSaving} disabled={systemLoading} />
            </form>
          </Card>
        )}

        {activeTab === 'nrc' && (
          <Card title="NRC Verification" subtitle="MySmartData API — verify Zambian NRC numbers during local user registration">
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-cyan-900 space-y-2">
                <p className="font-medium">Registration lookup</p>
                <p className="text-cyan-800 text-xs">
                  When enabled, Zambian users can verify their NRC on the registration page and auto-fill their legal name.
                  Get an API key from{' '}
                  <a href="https://mysmartdata.tech" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    mysmartdata.tech
                  </a>.
                </p>
              </div>

              <BooleanField
                label="Enable NRC verification on registration"
                name="nrcVerificationEnabled"
                checked={systemForm.integrations.nrcVerificationEnabled !== false}
                onChange={(e) => handleSystemChange('integrations', e)}
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  label="SmartData API Key"
                  name="smartdataApiKey"
                  value={systemForm.integrations.smartdataApiKey}
                  onChange={(e) => handleSystemChange('integrations', e)}
                  placeholder="sk_..."
                  type="password"
                  helpText="Sent as X-API-Key header to MySmartData"
                />
                <FormField
                  label="SmartData Base URL"
                  name="smartdataBaseUrl"
                  value={systemForm.integrations.smartdataBaseUrl}
                  onChange={(e) => handleSystemChange('integrations', e)}
                  placeholder="https://mysmartdata.tech/api/v1"
                />
              </div>

              <FormField
                label="Test NRC number"
                name="testNrcNumber"
                value={testNrcNumber}
                onChange={(e) => setTestNrcNumber(formatNrcNumber(e.target.value))}
                placeholder="123456/78/1"
                helpText="Used only for Test Connection — not saved"
              />

              {smartDataTestStatus && (
                <div
                  className={`rounded-xl border p-3 text-sm ${
                    smartDataTestStatus.type === 'success'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {smartDataTestStatus.message}
                </div>
              )}

              <div className="pt-4 border-t border-navy-100 flex flex-wrap items-center gap-3">
                <LoadingButton
                  type="button"
                  onClick={handleTestSmartDataConnection}
                  loading={testingSmartData}
                  loadingLabel="Testing SmartData…"
                  disabled={systemLoading}
                  className="border border-cyan-200 text-cyan-700 hover:bg-cyan-50 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Test Connection
                </LoadingButton>
                <LoadingButton
                  type="submit"
                  loading={systemSaving}
                  loadingLabel="Saving…"
                  icon={Save}
                  disabled={systemLoading}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Save NRC Configuration
                </LoadingButton>
              </div>
            </form>
          </Card>
        )}

        {activeTab === 'integrations' && (
          <Card title="Integrations" subtitle="Analytics, tracking, and automation webhooks">
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Google Analytics ID" name="googleAnalyticsId" value={systemForm.integrations.googleAnalyticsId} onChange={(e) => handleSystemChange('integrations', e)} placeholder="G-XXXXXXXXXX" />
                <FormField label="Meta Pixel ID" name="metaPixelId" value={systemForm.integrations.metaPixelId} onChange={(e) => handleSystemChange('integrations', e)} />
                <FormField label="Slack Webhook URL" name="slackWebhook" value={systemForm.integrations.slackWebhook} onChange={(e) => handleSystemChange('integrations', e)} placeholder="https://hooks.slack.com/services/..." />
                <FormField label="Zapier Webhook URL" name="zapierWebhook" value={systemForm.integrations.zapierWebhook} onChange={(e) => handleSystemChange('integrations', e)} placeholder="https://hooks.zapier.com/hooks/catch/..." />
              </div>

              <SaveButton loading={systemSaving} disabled={systemLoading} />
            </form>
          </Card>
        )}

        {activeTab === 'video' && (
          <>
            <Card title="Video Meetings" subtitle="Choose Zoom or Daily.co for virtual events — per-event overrides remain available">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'provider', label: 'Provider' },
                  { key: 'zoom', label: 'Zoom Setup' },
                  { key: 'daily', label: 'Daily.co Setup' },
                ].map((sub) => (
                  <button
                    key={sub.key}
                    type="button"
                    onClick={() => setVideoSubTab(sub.key)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      videoSubTab === sub.key
                        ? 'bg-cyan-600 text-white'
                        : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </Card>

            {videoSubTab === 'provider' && (
              <Card title="Default video provider" subtitle="Used for new virtual events; existing events keep their platform">
                <form onSubmit={handleSaveSystem} className="space-y-5">
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm text-cyan-900 space-y-2">
                    <p className="font-medium">Site-wide default</p>
                    <p className="text-cyan-800 text-xs">
                      Attendees join via the event&apos;s meeting platform. Zoom embeds in Mutale by default when Meeting SDK credentials are configured; otherwise attendees are sent to Zoom in a new tab.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${videoStatus?.sdkReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        Meeting SDK: {videoStatus?.sdkReady ? 'configured' : 'not configured'}
                      </span>
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-navy-100 text-navy-700">
                        Join mode: {systemForm.video.joinMode === 'embed' ? 'embed in Mutale' : 'open Zoom in new tab'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-navy-800">Enabled providers</p>
                    <div className="flex flex-wrap gap-3">
                      <BooleanField
                        label="Enable Zoom"
                        name="enableZoom"
                        checked={systemForm.video.enabledProviders?.includes('zoom')}
                        onChange={() => toggleVideoProviderEnabled('zoom')}
                      />
                      <BooleanField
                        label="Enable Daily.co"
                        name="enableDaily"
                        checked={systemForm.video.enabledProviders?.includes('daily')}
                        onChange={() => toggleVideoProviderEnabled('daily')}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField
                      label="Default provider for new events"
                      name="defaultProvider"
                      type="select"
                      value={systemForm.video.defaultProvider}
                      onChange={(e) => handleSystemChange('video', e)}
                      options={[
                        ...(systemForm.video.enabledProviders?.includes('zoom') ? [{ value: 'zoom', label: 'Zoom' }] : []),
                        ...(systemForm.video.enabledProviders?.includes('daily') ? [{ value: 'daily', label: 'Daily.co (embedded)' }] : []),
                      ]}
                    />
                    <FormField
                      label="Zoom join mode"
                      name="joinMode"
                      type="select"
                      value={systemForm.video.joinMode}
                      onChange={(e) => handleSystemChange('video', e)}
                      options={[
                        { value: 'embed', label: 'Embed in Mutale (recommended)' },
                        { value: 'redirect', label: 'Always open Zoom in new tab' },
                      ]}
                      helpText="Embed requires Meeting SDK credentials and mutalemubanga.org on the Zoom domain allowlist. Daily.co always embeds on the join page."
                    />
                  </div>

                  <p className="text-xs text-navy-500">
                    Webhook URL for Daily: <code className="bg-navy-100 px-1.5 py-0.5 rounded">/api/webhooks/daily</code>
                  </p>

                  <SaveButton label="Save Video Settings" loading={systemSaving} disabled={systemLoading} />
                </form>
              </Card>
            )}

            {videoSubTab === 'daily' && (
              <Card title="Daily.co" subtitle="API credentials for embedded rooms">
                <form onSubmit={handleSaveSystem} className="space-y-4">
                  <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-4 text-sm text-cyan-900">
                    <p className="font-medium">Where to find these values</p>
                    <p className="mt-1 text-cyan-800 text-xs">
                      Each field below has a link to the Daily dashboard or docs. Use the same Daily account for API key, domain, and webhooks.
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField
                      label="API Key"
                      name="apiKey"
                      type="password"
                      value={systemForm.daily.apiKey}
                      onChange={(e) => handleSystemChange('daily', e)}
                      helpText="Developers tab → copy your domain API key (server-side only)."
                      helpLink={{ href: 'https://dashboard.daily.co/developers', label: 'Open Daily Developers → API key' }}
                    />
                    <FormField
                      label="Domain"
                      name="domain"
                      value={systemForm.daily.domain}
                      onChange={(e) => handleSystemChange('daily', e)}
                      placeholder="yoursubdomain.daily.co"
                      helpText="The subdomain only (e.g. mysite from mysite.daily.co), shown in the dashboard header."
                      helpLink={{ href: 'https://dashboard.daily.co/', label: 'Open Daily dashboard (see your domain)' }}
                    />
                    <FormField
                      label="Webhook HMAC secret"
                      name="webhookSecret"
                      type="password"
                      value={systemForm.daily.webhookSecret}
                      onChange={(e) => handleSystemChange('daily', e)}
                      helpText="Create a webhook pointing to your site /api/webhooks/daily; paste the hmac value Daily returns."
                      helpLink={{ href: 'https://docs.daily.co/reference/rest-api/webhooks', label: 'Daily webhook setup guide' }}
                    />
                    <FormField
                      label="Default max participants"
                      name="maxParticipantsDefault"
                      type="number"
                      value={systemForm.daily.maxParticipantsDefault}
                      onChange={(e) => handleSystemChange('daily', e)}
                      helpText="Applied when creating rooms from an event (max 200 on standard plans)."
                      helpLink={{ href: 'https://docs.daily.co/reference/rest-api/rooms/config#max_participants', label: 'Room max_participants docs' }}
                    />
                    <FormField
                      label="Default room privacy"
                      name="defaultRoomPrivacy"
                      type="select"
                      value={systemForm.daily.defaultRoomPrivacy}
                      onChange={(e) => handleSystemChange('daily', e)}
                      options={[{ value: 'private', label: 'Private (token required)' }, { value: 'public', label: 'Public' }]}
                      helpText="Private rooms require a meeting token from join-auth (recommended for paid events)."
                      helpLink={{ href: 'https://docs.daily.co/reference/rest-api/rooms/config#privacy', label: 'Room privacy docs' }}
                    />
                  </div>
                  <p className="text-xs text-navy-500">
                    Production webhook URL for Daily:{' '}
                    <code className="bg-navy-100 px-1.5 py-0.5 rounded">https://yourdomain.com/api/webhooks/daily</code>
                  </p>
                  <div className="pt-4 border-t border-navy-100 flex flex-wrap items-center gap-3">
                    <LoadingButton
                      type="button"
                      onClick={handleTestDailyConnection}
                      loading={testingDaily}
                      loadingLabel="Testing Daily…"
                      disabled={systemLoading || !systemForm.daily.apiKey || !systemForm.daily.domain}
                      className="border border-cyan-200 text-cyan-700 hover:bg-cyan-50 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    >
                      Test Daily connection
                    </LoadingButton>
                    <SaveButton label="Save Daily configuration" loading={systemSaving} disabled={systemLoading} />
                  </div>
                  {dailyTestStatus && (
                    <div className={`rounded-xl px-4 py-3 text-sm font-medium ${dailyTestStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {dailyTestStatus.message}
                    </div>
                  )}
                </form>
              </Card>
            )}

            {videoSubTab === 'zoom' && (
          <>
            <Card title="Zoom credentials" subtitle="Server-to-Server OAuth, Meeting SDK, and webhooks">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'getting-started', label: 'Getting Started' },
                  { key: 'oauth', label: 'Server-to-Server OAuth' },
                  { key: 'sdk', label: 'Meeting SDK' },
                  { key: 'webhook', label: 'Webhooks' },
                ].map((sub) => (
                  <button
                    key={sub.key}
                    type="button"
                    onClick={() => setZoomSubTab(sub.key)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      zoomSubTab === sub.key
                        ? 'bg-cyan-600 text-white'
                        : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </Card>

            {/* ── Getting Started ── */}
            {zoomSubTab === 'getting-started' && (
              <Card title="Getting Started with Zoom" subtitle="Follow these steps to get your Zoom API credentials">
                <div className="space-y-4">
                  <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-4">
                    <div className="flex gap-2 mb-3">
                      <Info size={18} className="text-cyan-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-cyan-800 font-medium">
                        You need a <strong>Server-to-Server OAuth</strong> app from the Zoom Marketplace. This gives your platform permission to create and manage meetings on behalf of a Zoom user.
                      </p>
                    </div>
                    <a
                      href="https://marketplace.zoom.us/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-900 underline underline-offset-2"
                    >
                      Open Zoom App Marketplace <ExternalLink size={14} />
                    </a>
                  </div>

                  <ol className="space-y-3 text-sm text-navy-700 list-none">
                    <li className="flex gap-3">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold shrink-0">1</span>
                      <div>
                        <strong>Create a Server-to-Server OAuth App</strong>
                        <p className="text-navy-500 mt-0.5">
                          Go to{' '}
                          <a href="https://marketplace.zoom.us/develop/create" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline">
                            marketplace.zoom.us/develop/create
                          </a>
                          {' '}→ choose <strong>&quot;Server-to-Server OAuth&quot;</strong> → give it a name (e.g. &quot;Mutale Events&quot;).
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold shrink-0">2</span>
                      <div>
                        <strong>Copy your credentials</strong>
                        <p className="text-navy-500 mt-0.5">
                          On the <em>App Credentials</em> page you&apos;ll find your <strong>Account ID</strong>, <strong>Client ID</strong>, and <strong>Client Secret</strong>. Paste them into the fields below.
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold shrink-0">3</span>
                      <div>
                        <strong>Add required scopes</strong>
                        <p className="text-navy-500 mt-0.5">
                          Under <em>Scopes</em>, add: <code className="bg-navy-100 px-1.5 py-0.5 rounded text-xs">meeting:write:admin</code>{' '}
                          <code className="bg-navy-100 px-1.5 py-0.5 rounded text-xs">meeting:read:admin</code>{' '}
                          <code className="bg-navy-100 px-1.5 py-0.5 rounded text-xs">user:read:admin</code>
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold shrink-0">4</span>
                      <div>
                        <strong>Activate the app</strong>
                        <p className="text-navy-500 mt-0.5">
                          Click <strong>&quot;Activate your app&quot;</strong> on the Activation tab. The app must be active for API calls to work.
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold shrink-0">5</span>
                      <div>
                        <strong>Set the host email</strong>
                        <p className="text-navy-500 mt-0.5">
                          Enter the email of a <strong>Licensed</strong> Zoom user on your account. This user will be the host for all created meetings. Basic (free) users cannot host meetings via API.
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold shrink-0">6</span>
                      <div>
                        <strong>Save &amp; Test</strong>
                        <p className="text-navy-500 mt-0.5">
                          Go to the <button type="button" onClick={() => setZoomSubTab('oauth')} className="text-cyan-600 hover:underline font-medium">Server-to-Server OAuth</button> tab, fill in the fields, hit <strong>Save Configuration</strong>, then click <strong>Test Connection</strong> to verify everything works.
                        </p>
                      </div>
                    </li>
                  </ol>
                </div>
              </Card>
            )}

            {/* ── Server-to-Server OAuth Credentials ── */}
            {zoomSubTab === 'oauth' && (
              <Card title="Server-to-Server OAuth" subtitle="Required credentials from your Zoom Marketplace app">
                <form onSubmit={handleSaveSystem} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField label="Account ID" name="accountId" value={systemForm.zoom.accountId} onChange={(e) => handleSystemChange('zoom', e)} placeholder="e.g. AbC1dEfGhI2jKlMnO" helpText="App Credentials → Account ID" />
                    <FormField label="Client ID" name="clientId" value={systemForm.zoom.clientId} onChange={(e) => handleSystemChange('zoom', e)} placeholder="e.g. xY3zA_BcDeFgHiJkLm" helpText="App Credentials → Client ID" />
                    <FormField label="Client Secret" name="clientSecret" type="password" value={systemForm.zoom.clientSecret} onChange={(e) => handleSystemChange('zoom', e)} placeholder="Your Zoom Client Secret" helpText="App Credentials → Client Secret (keep this private)" />
                    <FormField label="Default Host Email" name="defaultHostEmail" type="email" value={systemForm.zoom.defaultHostEmail} onChange={(e) => handleSystemChange('zoom', e)} placeholder="host@yourorganisation.com" helpText="Must be a Licensed Zoom user on your account" />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <SaveButton loading={systemSaving} disabled={systemLoading} />
                    <LoadingButton
                      type="button"
                      onClick={handleTestZoomConnection}
                      loading={testingZoom}
                      loadingLabel="Testing…"
                      disabled={!systemForm.zoom.accountId || !systemForm.zoom.clientId || !systemForm.zoom.clientSecret}
                      className="border border-cyan-300 text-cyan-700 hover:bg-cyan-50 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    >
                      Test Connection
                    </LoadingButton>
                  </div>

                  {zoomTestStatus && (
                    <div className={`mt-3 rounded-xl px-4 py-3 text-sm font-medium ${zoomTestStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {zoomTestStatus.message}
                    </div>
                  )}
                </form>
              </Card>
            )}

            {/* ── Meeting SDK (Optional) ── */}
            {zoomSubTab === 'sdk' && (
              <Card title="Meeting SDK" subtitle="Required for in-page Zoom join on mutalemubanga.org">
                <form onSubmit={handleSaveSystem} className="space-y-4">
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <div className="flex gap-2">
                      <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium">Embed is the default join mode.</p>
                        <p className="mt-1 text-amber-700">
                          Save Meeting SDK Key and Secret here, add <strong>mutalemubanga.org</strong> to your Zoom app&apos;s domain allowlist, then run Test SDK Signature. Without SDK credentials, attendees fall back to opening Zoom in a new tab.
                        </p>
                      </div>
                    </div>
                  </div>

                  <details className="rounded-xl border border-navy-100 bg-navy-50/50">
                    <summary className="px-4 py-3 text-sm font-medium text-navy-700 cursor-pointer hover:text-cyan-700">
                      How to get Meeting SDK credentials
                    </summary>
                    <div className="px-4 pb-4 text-sm text-navy-600 space-y-2">
                      <p>Use credentials from a <strong>Meeting SDK-capable</strong> app only (<strong>Meeting SDK app</strong>, or a <strong>General App</strong> with Meeting SDK enabled). Do <strong>not</strong> use Server-to-Server OAuth credentials unless they are explicitly from a Meeting SDK-capable app.</p>
                      <ol className="list-decimal list-inside space-y-1 ml-1">
                        <li>Go to <a href="https://marketplace.zoom.us/develop/create" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline">marketplace.zoom.us/develop/create</a></li>
                        <li>Choose <strong>&quot;Meeting SDK&quot;</strong> app type (or enable Meeting SDK in your General App)</li>
                        <li>Add <strong>mutalemubanga.org</strong> (and staging domains) to the SDK <strong>domain allowlist</strong></li>
                        <li>Copy the app&apos;s <strong>SDK Key</strong> / <strong>SDK Secret</strong> (or Client ID / Client Secret for Meeting SDK-capable app)</li>
                        <li>Activate the app, save credentials below, and run <strong>Test SDK Signature</strong></li>
                      </ol>
                    </div>
                  </details>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField label="Meeting SDK Key" name="sdkKey" value={systemForm.zoom.sdkKey} onChange={(e) => handleSystemChange('zoom', e)} placeholder="Your SDK Key (Client ID)" helpText="Same as Client ID, or from a separate Meeting SDK app" />
                    <FormField label="Meeting SDK Secret" name="sdkSecret" type="password" value={systemForm.zoom.sdkSecret} onChange={(e) => handleSystemChange('zoom', e)} placeholder="Your SDK Secret (Client Secret)" />
                  </div>
                  <FormField
                    label="SDK Test Meeting Number (optional)"
                    name="sdkTestMeetingNumber"
                    value={sdkTestMeetingNumber}
                    onChange={(e) => setSdkTestMeetingNumber(e.target.value)}
                    placeholder="e.g. 81450582445"
                    helpText="Used for SDK preflight validation. If empty, the latest Zoom event meeting is used."
                  />

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <LoadingButton
                      type="button"
                      onClick={handleTestZoomSdk}
                      loading={testingZoomSdk}
                      loadingLabel="Testing SDK…"
                      disabled={!systemForm.zoom.sdkKey || !systemForm.zoom.sdkSecret}
                      className="border border-cyan-300 text-cyan-700 hover:bg-cyan-50 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    >
                      Test SDK Signature
                    </LoadingButton>
                  </div>

                  {zoomSdkTestStatus && (
                    <div className={`mt-3 rounded-xl px-4 py-3 text-sm font-medium ${zoomSdkTestStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {zoomSdkTestStatus.message}
                      {zoomSdkTestStatus.type === 'success' && (
                        <p className="mt-2 text-xs font-normal text-emerald-800">
                          Next: register for a Zoom event and open <code className="bg-emerald-100 px-1 rounded">/events/&lt;slug&gt;/join</code> to confirm in-page join works on your domain.
                        </p>
                      )}
                    </div>
                  )}
                  <SaveButton loading={systemSaving} disabled={systemLoading} />
                </form>
              </Card>
            )}

            {/* ── Webhook Verification (Optional) ── */}
            {zoomSubTab === 'webhook' && (
              <Card title="Webhook Verification" subtitle="Receive real-time meeting status updates from Zoom — optional">
                <form onSubmit={handleSaveSystem} className="space-y-4">
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <div className="flex gap-2">
                      <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium">This section is optional.</p>
                        <p className="mt-1 text-amber-700">
                          Webhooks let Zoom push live updates (meeting started, ended, etc.) to your platform so event statuses stay in sync automatically.
                        </p>
                      </div>
                    </div>
                  </div>

                  <details className="rounded-xl border border-navy-100 bg-navy-50/50">
                    <summary className="px-4 py-3 text-sm font-medium text-navy-700 cursor-pointer hover:text-cyan-700">
                      How to set up Zoom webhooks
                    </summary>
                    <div className="px-4 pb-4 text-sm text-navy-600 space-y-2">
                      <ol className="list-decimal list-inside space-y-1.5 ml-1">
                        <li>Open your app on the <a href="https://marketplace.zoom.us/user/build" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline">Zoom Marketplace</a></li>
                        <li>Go to <strong>Feature</strong> → <strong>Event Subscriptions</strong> → click <strong>Add Event Subscription</strong></li>
                        <li>
                          Set the <strong>Event notification endpoint URL</strong> to:<br />
                          <code className="bg-navy-100 px-2 py-1 rounded text-xs mt-1 inline-block">{'https://yourdomain.com/api/webhooks/zoom'}</code>
                        </li>
                        <li>Add these events: <code className="bg-navy-100 px-1.5 py-0.5 rounded text-xs">meeting.started</code> <code className="bg-navy-100 px-1.5 py-0.5 rounded text-xs">meeting.ended</code> <code className="bg-navy-100 px-1.5 py-0.5 rounded text-xs">meeting.deleted</code></li>
                        <li>Click <strong>Save</strong> — Zoom will validate your endpoint automatically</li>
                        <li>Copy the <strong>Secret Token</strong> shown on the Event Subscriptions page and paste it below</li>
                      </ol>
                    </div>
                  </details>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField label="Webhook Secret Token" name="webhookSecretToken" type="password" value={systemForm.zoom.webhookSecretToken} onChange={(e) => handleSystemChange('zoom', e)} placeholder="Your Zoom Webhook Secret Token" helpText="Feature → Event Subscriptions → Secret Token" />
                  </div>
                  <SaveButton loading={systemSaving} disabled={systemLoading} />
                </form>
              </Card>
            )}
          </>
            )}
          </>
        )}

        <Card
          title="Danger Zone"
          subtitle="Irreversible actions"
          className="border-red-200"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-red-800">Reset to Defaults</h4>
              <p className="text-sm text-red-600 mt-1">
                Reset all content (profile, events, blog posts) to the original default data. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0"
            >
              <RotateCcw size={14} />
              Reset All Data
            </button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleReset}
        title="Reset All Data"
        message="This will reset your profile, events, and blog posts to their original default values. All your changes will be permanently lost."
        confirmLabel="Reset Everything"
        variant="danger"
      />
    </div>
  );
}

function SaveButton({ label = 'Save Configuration', disabled = false, loading = false }) {
  return (
    <div className="pt-4 border-t border-navy-100">
      <LoadingButton
        type="submit"
        loading={loading}
        loadingLabel="Saving…"
        icon={Save}
        disabled={disabled}
        className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
      >
        {label}
      </LoadingButton>
    </div>
  );
}

function BooleanField({ label, name, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
      />
      <span className="text-sm text-navy-700 font-medium">{label}</span>
    </label>
  );
}

function channelLabel(channel) {
  if (channel === 'sms') return 'SMS';
  if (channel === 'whatsapp') return 'WhatsApp';
  return 'Email';
}
