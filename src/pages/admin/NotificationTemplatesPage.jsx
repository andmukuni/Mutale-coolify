import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, MessageSquare, Pencil, Plus, RefreshCw, RotateCcw, Send, Trash2 } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  Modal,
  FormField,
  ConfirmDialog,
  LoadingButton,
  Spinner,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  SAMPLE_TEMPLATE_VARS,
  SMS_TEMPLATE_MAX_LENGTH,
  TEMPLATE_PLACEHOLDERS,
  renderTemplate,
} from '../../../shared/notificationTemplates.js';
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  fetchNotificationTemplates,
  resetNotificationTemplate,
  sendNotificationTemplateTest,
  updateNotificationTemplate,
} from '../../utils/notificationTemplatesApi';

const TABS = [
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'email', label: 'Email', icon: Mail },
];

const emptyForm = {
  id: '',
  name: '',
  slug: '',
  channel: 'sms',
  description: '',
  subject: '',
  body: '',
  enabled: true,
  is_system: false,
};

function insertPlaceholder(body, key) {
  const snippet = `{{${key}}}`;
  const el = document.getElementById('template-body');
  if (!el || typeof el.selectionStart !== 'number') {
    return `${body}${body ? ' ' : ''}${snippet}`;
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const next = `${body.slice(0, start)}${snippet}${body.slice(end)}`;
  requestAnimationFrame(() => {
    el.focus();
    const cursor = start + snippet.length;
    el.setSelectionRange(cursor, cursor);
  });
  return next;
}

export default function NotificationTemplatesPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [channel, setChannel] = useState('sms');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState({ open: false, row: null, busy: false });

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchNotificationTemplates({ channel });
      setRows(data);
    } catch (err) {
      setError(err?.message || 'Failed to load templates.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const openCreate = () => {
    setForm({ ...emptyForm, channel });
    setFormError('');
    setTestRecipient(channel === 'email' ? (user?.email || '') : '');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    const nextChannel = row.channel || channel;
    setForm({
      id: row.id,
      name: row.name || '',
      slug: row.slug || '',
      channel: nextChannel,
      description: row.description || '',
      subject: row.subject || '',
      body: row.body || '',
      enabled: row.enabled !== false,
      is_system: Boolean(row.is_system),
    });
    setFormError('');
    setTestRecipient(nextChannel === 'email' ? (user?.email || '') : '');
    setModalOpen(true);
  };

  const preview = useMemo(() => ({
    subject: renderTemplate(form.subject, SAMPLE_TEMPLATE_VARS),
    body: renderTemplate(form.body, SAMPLE_TEMPLATE_VARS),
  }), [form.subject, form.body]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        channel: form.channel,
        description: form.description,
        subject: form.subject,
        body: form.body,
        enabled: form.enabled,
      };
      if (form.id) await updateNotificationTemplate(form.id, payload);
      else await createNotificationTemplate(payload);
      toast.success(form.id ? 'Template saved.' : 'Template created.');
      setModalOpen(false);
      await loadRows();
    } catch (err) {
      setFormError(err?.message || 'Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    setFormError('');
    try {
      await sendNotificationTemplateTest({
        channel: form.channel,
        recipient: testRecipient,
        subject: form.subject,
        body: form.body,
      });
      toast.success(form.channel === 'email'
        ? `Test email sent to ${testRecipient.trim()}.`
        : `Test SMS sent to ${testRecipient.trim()}.`);
    } catch (err) {
      const message = err?.message || 'Could not send test.';
      setFormError(message);
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleReset = async (row) => {
    try {
      await resetNotificationTemplate(row.id);
      toast.success('Template reset to default.');
      await loadRows();
    } catch (err) {
      toast.error(err?.message || 'Could not reset template.');
    }
  };

  const handleDelete = async () => {
    if (!confirm.row) return;
    setConfirm((prev) => ({ ...prev, busy: true }));
    try {
      await deleteNotificationTemplate(confirm.row.id);
      toast.success('Template deleted.');
      setConfirm({ open: false, row: null, busy: false });
      await loadRows();
    } catch (err) {
      toast.error(err?.message || 'Could not delete template.');
      setConfirm((prev) => ({ ...prev, busy: false }));
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Template',
      render: (_v, row) => (
        <div>
          <p className="font-medium text-navy-900">{row.name}</p>
          <p className="text-xs text-navy-500 mt-0.5">{row.description || row.slug}</p>
        </div>
      ),
    },
    {
      key: 'slug',
      label: 'Slug',
      render: (v) => <span className="font-mono text-xs text-navy-600">{v}</span>,
    },
    {
      key: 'is_system',
      label: 'Type',
      render: (v) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
          v ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-cyan-50 text-cyan-700 ring-cyan-600/20'
        }`}
        >
          {v ? 'System' : 'Custom'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (_v, row) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600"
          >
            <Pencil size={14} />
            Edit
          </button>
          {row.is_system ? (
            <button
              type="button"
              onClick={() => void handleReset(row)}
              className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm({ open: true, row, busy: false })}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  const smsLength = form.channel === 'sms' ? form.body.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        subtitle="Create and edit the SMS and email copy Mutale sends to customers."
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Templates' },
        ]}
        actions={(
          <>
            <button
              type="button"
              onClick={() => void loadRows()}
              className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 px-4 py-2 rounded-xl"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl"
            >
              <Plus size={15} />
              New template
            </button>
          </>
        )}
      />

      <div className="flex gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = channel === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setChannel(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${
                active
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white text-navy-700 border-navy-200 hover:bg-navy-50'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <Card
        title={channel === 'sms' ? 'SMS templates' : 'Email templates'}
        subtitle="System templates are used automatically. Use {{placeholders}} for names, event titles, and links."
      >
        {loading ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            emptyTitle="No templates yet"
            emptyDescription="Create an SMS or email template to get started."
          />
        )}
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && !testing && setModalOpen(false)}
        title={form.id ? 'Edit template' : 'New template'}
        subtitle={form.is_system ? 'System template — slug and channel stay fixed.' : 'Use placeholders so each send is personalized.'}
        size="xl"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving || testing}
              className="px-4 py-2 rounded-lg border border-navy-200 text-navy-600 hover:bg-navy-50 text-sm font-medium"
            >
              Cancel
            </button>
            <LoadingButton
              form="template-form"
              type="submit"
              loading={saving}
              loadingLabel="Saving…"
              className="px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg"
            >
              Save template
            </LoadingButton>
          </>
        )}
      >
        <form id="template-form" onSubmit={handleSave} className="space-y-4">
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <FormField
              label="Name"
              name="name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              placeholder="Entry ticket"
            />
            <FormField
              label="Slug"
              name="slug"
              value={form.slug}
              onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
              disabled={form.is_system}
              placeholder="ticket"
              helpText={form.is_system ? 'Reserved for this notification.' : 'Used internally. Leave blank to generate from the name.'}
            />
          </div>
          {!form.is_system && (
            <FormField
              label="Channel"
              name="channel"
              type="select"
              value={form.channel}
              onChange={(e) => {
                const nextChannel = e.target.value;
                setForm((prev) => ({ ...prev, channel: nextChannel }));
                if (nextChannel === 'email' && !testRecipient) {
                  setTestRecipient(user?.email || '');
                }
              }}
              options={[
                { value: 'sms', label: 'SMS' },
                { value: 'email', label: 'Email' },
              ]}
            />
          )}
          <FormField
            label="Description"
            name="description"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="When this message is sent"
          />
          {form.channel === 'email' && (
            <FormField
              label="Subject"
              name="subject"
              value={form.subject}
              onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
              required
              placeholder="Your entry ticket: {{event_title}}"
            />
          )}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="body" className="text-sm font-medium text-navy-700">
                {form.channel === 'sms' ? 'SMS message' : 'Email body'}
              </label>
              {form.channel === 'sms' && (
                <span className={`text-xs ${smsLength > SMS_TEMPLATE_MAX_LENGTH ? 'text-red-600' : 'text-navy-400'}`}>
                  {smsLength}/{SMS_TEMPLATE_MAX_LENGTH}
                </span>
              )}
            </div>
            <textarea
              id="template-body"
              name="body"
              required
              rows={form.channel === 'sms' ? 5 : 8}
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder={form.channel === 'sms' ? '{{thank_you}} {{event_title}}. View your ticket here: {{ticket_url}}' : 'Hi {{first_name}},'}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TEMPLATE_PLACEHOLDERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  title={item.label}
                  onClick={() => setForm((prev) => ({ ...prev, body: insertPlaceholder(prev.body, item.key) }))}
                  className="px-2 py-0.5 rounded-full bg-white border border-navy-200 text-[11px] font-mono text-navy-600 hover:border-cyan-400 hover:text-cyan-700"
                >
                  {`{{${item.key}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500 mb-1">Preview</p>
            {form.channel === 'email' && preview.subject && (
              <p className="text-sm font-medium text-navy-900 mb-1">{preview.subject}</p>
            )}
            <p className="text-sm text-navy-700 whitespace-pre-wrap">{preview.body || 'Add copy to see a sample send.'}</p>
          </div>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Send a test</p>
              <p className="text-xs text-navy-500 mt-0.5">
                {form.channel === 'email'
                  ? 'Sends a branded test email with sample names so you can see how it looks in the inbox.'
                  : 'Sends this SMS to a phone number using the sample preview values.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <FormField
                  label={form.channel === 'email' ? 'Test email' : 'Test phone'}
                  name="testRecipient"
                  type="text"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder={form.channel === 'email' ? 'you@example.com' : '0970000000'}
                />
              </div>
              <div className="sm:pt-7">
                <LoadingButton
                  type="button"
                  icon={Send}
                  loading={testing}
                  loadingLabel="Sending…"
                  disabled={saving || !form.body.trim() || !testRecipient.trim()}
                  onClick={() => void handleSendTest()}
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium bg-navy-900 hover:bg-navy-800 text-white rounded-xl"
                >
                  {form.channel === 'email' ? 'Send test email' : 'Send test SMS'}
                </LoadingButton>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirm.open}
        onClose={() => !confirm.busy && setConfirm({ open: false, row: null, busy: false })}
        onConfirm={() => void handleDelete()}
        title="Delete template"
        message={`Delete “${confirm.row?.name || 'this template'}”? This cannot be undone.`}
        confirmLabel="Delete"
        loading={confirm.busy}
      />
    </div>
  );
}
