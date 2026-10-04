import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Card, FormField, LoadingButton, StatusBadge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import CampaignEmailEditor from '../../components/admin/campaigns/CampaignEmailEditor.jsx';
import { defaultSegment } from '../../../shared/emailCampaign.js';
import {
  cancelCampaign,
  duplicateCampaign,
  fetchCampaign,
  fetchCampaignProviderStatus,
  fetchCampaignReport,
  fetchCampaignTemplates,
  pauseCampaign,
  previewCampaignAudience,
  resumeCampaign,
  saveCampaignRevision,
  sendCampaign,
  sendCampaignTest,
  updateCampaign,
} from '../../utils/emailCampaignsApi';

const STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'audience', label: 'Audience' },
  { id: 'design', label: 'Design' },
  { id: 'review', label: 'Review / Test' },
  { id: 'send', label: 'Send / Schedule' },
  { id: 'report', label: 'Report' },
];

export default function CampaignWizardPage() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canSend = hasPermission('campaigns.send');
  const [step, setStep] = useState('details');
  const [campaign, setCampaign] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [provider, setProvider] = useState(null);
  const [audience, setAudience] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [form, setForm] = useState({
    name: '',
    purpose: 'event_service',
    subject: '',
    preheader: '',
    scheduled_at: '',
    segment: defaultSegment(),
    design: { version: 1, blocks: [] },
  });

  const load = async () => {
    const [item, tpls, status] = await Promise.all([
      fetchCampaign(id),
      fetchCampaignTemplates(),
      fetchCampaignProviderStatus().catch(() => ({ data: null })),
    ]);
    setCampaign(item.data);
    setTemplates(tpls.data || []);
    setProvider(status.data || null);
    setForm({
      name: item.data.name,
      purpose: item.data.purpose,
      subject: item.data.subject,
      preheader: item.data.preheader,
      scheduled_at: item.data.scheduled_at ? String(item.data.scheduled_at).slice(0, 16) : '',
      segment: item.data.segment || defaultSegment(),
      design: item.data.revision?.design || { version: 1, blocks: [] },
    });
  };

  useEffect(() => {
    void load().catch((error) => toast.error(error.message));
  }, [id]);

  const locked = useMemo(() => !['draft', 'scheduled', 'paused'].includes(campaign?.state || 'draft'), [campaign]);

  const saveDetails = async () => {
    setBusy(true);
    try {
      const saved = await updateCampaign(id, {
        name: form.name,
        purpose: form.purpose,
        subject: form.subject,
        preheader: form.preheader,
        segment: form.segment,
        scheduled_at: form.scheduled_at || null,
        design: form.design,
      });
      setCampaign(saved.data);
      toast.success('Campaign saved.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveDesign = async () => {
    setBusy(true);
    try {
      const saved = await saveCampaignRevision(id, {
        design: form.design,
        subject: form.subject,
        preheader: form.preheader,
      });
      setCampaign(saved.data);
      toast.success('Design saved.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const loadAudience = async () => {
    setBusy(true);
    try {
      const result = await previewCampaignAudience(id, { segment: form.segment, event_id: campaign?.event_id });
      setAudience(result.data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const loadReport = async () => {
    const result = await fetchCampaignReport(id);
    setReport(result.data);
  };

  if (!campaign) return <p className="text-sm text-navy-500">Loading campaign…</p>;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        subtitle={`${campaign.purpose} · ${campaign.from_email}`}
        breadcrumbs={[
          { label: 'Campaigns', to: '/admin/campaigns' },
          { label: campaign.name },
        ]}
        actions={<StatusBadge status={campaign.state} />}
      />

      {provider && !provider.live && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {provider.notice}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setStep(item.id);
              if (item.id === 'report') void loadReport();
            }}
            className={`px-3 py-1.5 rounded-full text-sm ${step === item.id ? 'bg-cyan-600 text-white' : 'bg-navy-50 text-navy-600'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {step === 'details' && (
        <Card>
          <div className="grid gap-3 max-w-xl">
            <FormField label="Name">
              <input className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.name} disabled={locked} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </FormField>
            <FormField label="Purpose">
              <select className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.purpose} disabled={locked} onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}>
                <option value="event_service">Event service</option>
                <option value="promotional">Promotional (needs marketing consent)</option>
              </select>
            </FormField>
            <FormField label="Subject">
              <input className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.subject} disabled={locked} onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))} />
            </FormField>
            <FormField label="Preheader">
              <input className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.preheader} disabled={locked} onChange={(e) => setForm((prev) => ({ ...prev, preheader: e.target.value }))} />
            </FormField>
            <LoadingButton loading={busy} onClick={saveDetails} disabled={locked} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium">Save details</LoadingButton>
          </div>
        </Card>
      )}

      {step === 'audience' && (
        <Card>
          <p className="text-sm text-navy-500 mb-4">Filters use real registration fields only. Country and tags are not available.</p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-3xl mb-4">
            <FormField label="Status">
              <input className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={(form.segment.filters.status || []).join(',')} onChange={(e) => setForm((prev) => ({ ...prev, segment: { ...prev.segment, mode: 'filter', filters: { ...prev.segment.filters, status: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) } } }))} />
            </FormField>
            <FormField label="Payment status">
              <input className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={(form.segment.filters.payment_status || []).join(',')} onChange={(e) => setForm((prev) => ({ ...prev, segment: { ...prev.segment, mode: 'filter', filters: { ...prev.segment.filters, payment_status: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) } } }))} />
            </FormField>
            <FormField label="Attended">
              <select className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.segment.filters.attended || 'any'} onChange={(e) => setForm((prev) => ({ ...prev, segment: { ...prev.segment, filters: { ...prev.segment.filters, attended: e.target.value } } }))}>
                <option value="any">Any</option>
                <option value="yes">Attended</option>
                <option value="no">Not attended</option>
              </select>
            </FormField>
            <FormField label="Include cancelled">
              <input type="checkbox" checked={Boolean(form.segment.filters.include_cancelled)} onChange={(e) => setForm((prev) => ({ ...prev, segment: { ...prev.segment, filters: { ...prev.segment.filters, include_cancelled: e.target.checked } } }))} />
            </FormField>
          </div>
          <div className="flex gap-2 mb-4">
            <LoadingButton loading={busy} onClick={loadAudience} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium">Preview audience</LoadingButton>
            <LoadingButton loading={busy} onClick={saveDetails} disabled={locked} className="border border-navy-200 px-4 py-2 rounded-xl text-sm">Save segment</LoadingButton>
          </div>
          {audience && (
            <div className="text-sm text-navy-700 space-y-2">
              <p><strong>{audience.included_count}</strong> included · {audience.excluded_count} excluded. {audience.notice}</p>
              <ul className="text-xs text-navy-500 max-h-40 overflow-auto">
                {(audience.excluded || []).slice(0, 20).map((row) => (
                  <li key={`${row.registration_id}-${row.reason}`}>{row.email || 'no email'} — {row.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {step === 'design' && (
        <Card>
          <div className="mb-4 flex flex-wrap gap-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                disabled={locked}
                onClick={() => setForm((prev) => ({
                  ...prev,
                  subject: tpl.subject || prev.subject,
                  preheader: tpl.preheader || prev.preheader,
                  design: tpl.design,
                }))}
                className="text-xs px-3 py-1.5 rounded-lg border border-navy-200 hover:bg-navy-50"
              >
                Use {tpl.name}
              </button>
            ))}
          </div>
          <CampaignEmailEditor
            design={form.design}
            subject={form.subject}
            preheader={form.preheader}
            readOnly={locked}
            onChange={(design) => setForm((prev) => ({ ...prev, design }))}
          />
          <div className="mt-4">
            <LoadingButton loading={busy} onClick={saveDesign} disabled={locked} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium">Save design</LoadingButton>
          </div>
        </Card>
      )}

      {step === 'review' && (
        <Card>
          <p className="text-sm text-navy-600 mb-3">Send a test to yourself before a live audience send.</p>
          <div className="flex flex-wrap gap-2">
            <input className="rounded-xl border border-navy-200 px-3 py-2 text-sm min-w-[240px]" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
            <LoadingButton loading={busy} onClick={async () => {
              setBusy(true);
              try {
                await sendCampaignTest(id, testEmail);
                toast.success('Test queued.');
              } catch (error) {
                toast.error(error.message);
              } finally {
                setBusy(false);
              }
            }} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium">Send test</LoadingButton>
          </div>
        </Card>
      )}

      {step === 'send' && (
        <Card>
          <FormField label="Schedule (optional, local datetime)">
            <input type="datetime-local" className="rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.scheduled_at} onChange={(e) => setForm((prev) => ({ ...prev, scheduled_at: e.target.value }))} />
          </FormField>
          <div className="flex flex-wrap gap-2 mt-4">
            <LoadingButton
              loading={busy}
              disabled={!canSend}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium"
              onClick={async () => {
                setBusy(true);
                try {
                  const saved = await sendCampaign(id, { confirmed: true, scheduled_at: form.scheduled_at || null });
                  setCampaign(saved.data);
                  toast.success(form.scheduled_at ? 'Campaign scheduled.' : 'Campaign sending.');
                } catch (error) {
                  toast.error(error.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm send
            </LoadingButton>
            {campaign.state === 'sending' && <LoadingButton className="border border-navy-200 px-4 py-2 rounded-xl text-sm" onClick={() => pauseCampaign(id).then((res) => setCampaign(res.data))}>Pause</LoadingButton>}
            {campaign.state === 'paused' && <LoadingButton className="border border-navy-200 px-4 py-2 rounded-xl text-sm" onClick={() => resumeCampaign(id).then((res) => setCampaign(res.data))}>Resume</LoadingButton>}
            {['draft', 'scheduled', 'sending', 'paused'].includes(campaign.state) && (
              <LoadingButton className="border border-navy-200 px-4 py-2 rounded-xl text-sm" onClick={() => cancelCampaign(id).then((res) => setCampaign(res.data))}>Cancel</LoadingButton>
            )}
            <LoadingButton className="border border-navy-200 px-4 py-2 rounded-xl text-sm" onClick={() => duplicateCampaign(id).then((res) => navigate(`/admin/campaigns/${res.data.id}`))}>Duplicate</LoadingButton>
          </div>
          {!canSend && <p className="text-xs text-navy-400 mt-3">You can edit this campaign but you need campaigns.send to dispatch it.</p>}
        </Card>
      )}

      {step === 'report' && (
        <Card>
          {report ? (
            <div className="space-y-3 text-sm">
              <p>Included {report.totals.included} · delivered {report.totals.delivered} · bounced {report.totals.bounced}</p>
              <p className="text-xs text-navy-400">Opens ({report.totals.opened}) and clicks ({report.totals.clicked}) are estimates.</p>
              <ul className="text-xs max-h-80 overflow-auto divide-y divide-navy-100">
                {(report.recipients || []).slice(0, 100).map((row) => (
                  <li key={row.id} className="py-2 flex justify-between gap-3">
                    <span>{row.email_normalized}</span>
                    <span>{row.included ? row.outcome : row.exclude_reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-navy-500">Open this step to load the report.</p>
          )}
        </Card>
      )}

      {campaign.activity?.length > 0 && (
        <p className="text-xs text-navy-400 mt-4">
          Latest: {campaign.activity[0].action} · <Link className="text-cyan-700" to={`/admin/events/${campaign.event_id}#campaigns`}>Back to event</Link>
        </p>
      )}
    </div>
  );
}
