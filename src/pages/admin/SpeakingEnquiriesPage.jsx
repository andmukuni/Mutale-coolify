import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, Mail, Pencil, Send, Trash2, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog, DataTable, FormField, LoadingButton, Modal, PageHeader } from '../../components/ui';
import {
  announceEnquiriesChanged,
  createDraftFromSpeakingEnquiry,
  deleteSpeakingEnquiry,
  fetchSpeakingEnquiries,
  replyToSpeakingEnquiry,
  updateSpeakingEnquiry,
} from '../../utils/speakingAdminApi';
import {
  ENQUIRY_FORMAT_OPTIONS,
  ENQUIRY_LIMITS,
  ENQUIRY_ROLE_OPTIONS,
  ENQUIRY_STATUSES,
  formatEnquiryDates,
  normalizeEnquiryReply,
} from '../../../shared/speakingEnquiries.js';
import { optionLabel } from '../../../shared/speakingEngagements.js';

const STATUS_STYLES = {
  new: 'bg-cyan-50 text-cyan-800 ring-cyan-600/20 dark:bg-cyan-500/10 dark:text-cyan-300',
  reviewing: 'bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200',
  accepted: 'bg-green-50 text-green-800 ring-green-600/20 dark:bg-green-500/10 dark:text-green-200',
  declined: 'bg-slate-100 text-slate-700 ring-slate-400/30 dark:text-slate-200',
  archived: 'bg-navy-50 text-navy-600 ring-navy-500/20',
};

function EnquiryStatus({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] || STATUS_STYLES.new}`}>
      {optionLabel(ENQUIRY_STATUSES, status) || 'New'}
    </span>
  );
}

const receivedAt = (value) => String(value || '').slice(0, 16).replace('T', ' ');

function Detail({ label, children, className = '' }) {
  if (children == null || children === '') return null;
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-navy-600">{label}</dt>
      <dd className="mt-0.5 text-sm text-navy-800 whitespace-pre-line break-words">{children}</dd>
    </div>
  );
}

function ReplyComposer({ enquiry, onSent, onCancel }) {
  const toast = useToast();
  const [subject, setSubject] = useState(`Re: ${enquiry.event_title}`);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const sectionRef = useRef(null);

  // Start the reply where the admin will type, rather than leaving focus on the page.
  useEffect(() => {
    sectionRef.current?.querySelector('input')?.focus();
  }, []);

  const send = async () => {
    const { errors: found } = normalizeEnquiryReply({ subject, message });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    try {
      onSent(await replyToSpeakingEnquiry(enquiry.id, { subject, message }));
      toast.success(`Reply sent to ${enquiry.email}.`);
    } catch (err) {
      if (err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Reply to the organiser"
      className="space-y-3 rounded-xl border border-navy-100 bg-navy-50/40 p-4 dark:bg-navy-950/40"
    >
      <p className="text-sm text-navy-600">
        To {enquiry.organiser_name} &lt;{enquiry.email}&gt;. Sent from the website’s email address; their answer goes to the
        Reply-To address in Settings → Email.
      </p>
      <FormField
        label="Subject"
        name="reply_subject"
        value={subject}
        onChange={(e) => { setSubject(e.target.value); setErrors((prev) => ({ ...prev, subject: '' })); }}
        maxLength={ENQUIRY_LIMITS.reply_subject}
        error={errors.subject}
      />
      <FormField
        label="Message"
        name="reply_message"
        textarea
        rows={6}
        value={message}
        onChange={(e) => { setMessage(e.target.value); setErrors((prev) => ({ ...prev, message: '' })); }}
        maxLength={ENQUIRY_LIMITS.reply_message}
        error={errors.message}
      />
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm font-medium text-navy-600 hover:text-navy-800">
          Cancel
        </button>
        <LoadingButton
          type="button"
          loading={sending}
          loadingLabel="Sending…"
          onClick={() => void send()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800"
        >
          <Send size={15} aria-hidden="true" />
          Send reply
        </LoadingButton>
      </div>
    </section>
  );
}

function EnquiryModal({ enquiry, onClose, onSaved, onDelete, canManage }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState(enquiry.status);
  const [notes, setNotes] = useState(enquiry.admin_notes || '');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [replying, setReplying] = useState(false);
  const replyButtonRef = useRef(null);
  const dirty = status !== enquiry.status || notes !== (enquiry.admin_notes || '');
  const hasDraftAction = Boolean(enquiry.engagement_id) || canManage;
  const emailProblem = [
    enquiry.admin_email_status && enquiry.admin_email_status !== 'sent' ? 'the admin notification' : '',
    enquiry.ack_email_status && enquiry.ack_email_status !== 'sent' ? 'the acknowledgement to the organiser' : '',
  ].filter(Boolean);

  // The server's copy (e.g. notes without trailing spaces) becomes the new baseline.
  const persist = async () => {
    const updated = await updateSpeakingEnquiry(enquiry.id, { status, admin_notes: notes });
    setStatus(updated.status);
    setNotes(updated.admin_notes || '');
    onSaved(updated);
  };

  const save = async () => {
    setSaving(true);
    try {
      await persist();
      toast.success('Enquiry updated.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Leaving for the draft engagement saves the status and notes first, so they aren't lost.
  const createDraft = async () => {
    setCreating(true);
    try {
      if (dirty) await persist();
      const { engagement, enquiry: updated } = await createDraftFromSpeakingEnquiry(enquiry.id);
      onSaved(updated);
      toast.success(dirty
        ? 'Enquiry saved, and a draft engagement created. It is not published.'
        : 'Draft engagement created. It is not published.');
      navigate(`/admin/speaking/${engagement.id}/edit`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const openDraft = async () => {
    setSaving(true);
    try {
      await persist();
      toast.success('Enquiry updated.');
      navigate(`/admin/speaking/${enquiry.engagement_id}/edit`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Sending a reply can move the status to "In review"; follow it unless the admin already picked another.
  const handleReplied = (updated) => {
    if (status === enquiry.status) setStatus(updated.status);
    onSaved(updated);
    replyButtonRef.current?.focus();
    setReplying(false);
  };

  const cancelReply = () => {
    replyButtonRef.current?.focus();
    setReplying(false);
  };

  const mailto = `mailto:${enquiry.email}`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={enquiry.event_title}
      size="lg"
      footer={(
        <>
          <button
            type="button"
            onClick={() => onDelete(enquiry)}
            className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            <Trash2 size={15} aria-hidden="true" />
            Delete
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-800">
            Close
          </button>
          <LoadingButton
            type="button"
            loading={saving}
            loadingLabel="Saving…"
            disabled={!dirty || creating}
            onClick={() => void save()}
            className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:opacity-60"
          >
            Save
          </LoadingButton>
        </>
      )}
    >
      <div className="space-y-5">
        {/* Kept in the body rather than the dialog subtitle, whose shared style is too faint. */}
        <p className="text-sm text-navy-600">
          From {enquiry.organiser_name}, {enquiry.organisation} · received {receivedAt(enquiry.created_at)}
        </p>

        {emailProblem.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Email could not be sent for {emailProblem.join(' and ')}. Check Settings → Email, then reply to the organiser.
          </p>
        )}

        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Organiser">{enquiry.organiser_name}</Detail>
          <Detail label="Organisation">{enquiry.organisation}</Detail>
          <Detail label="Email"><a href={mailto} className="text-cyan-800 hover:underline dark:text-cyan-300">{enquiry.email}</a></Detail>
          <Detail label="Phone">{enquiry.phone}</Detail>
          <Detail label="Proposed date">{`${formatEnquiryDates(enquiry)} (${enquiry.timezone})`}</Detail>
          <Detail label="Format">
            {[optionLabel(ENQUIRY_FORMAT_OPTIONS, enquiry.attendance_format), enquiry.location].filter(Boolean).join(' — ')}
          </Detail>
          <Detail label="Intended audience">
            {enquiry.audience}{enquiry.audience_size ? ` (about ${enquiry.audience_size})` : ''}
          </Detail>
          <Detail label="Requested role">{optionLabel(ENQUIRY_ROLE_OPTIONS, enquiry.requested_role)}</Detail>
          <Detail label="Proposed topic" className="sm:col-span-2">{enquiry.topic}</Detail>
          <Detail label="Budget or honorarium">{enquiry.budget}</Detail>
          <Detail label="Message" className="sm:col-span-2">{enquiry.message}</Detail>
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-navy-100 pt-4">
          <button
            ref={replyButtonRef}
            type="button"
            onClick={() => setReplying(true)}
            aria-expanded={replying}
            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
          >
            <Mail size={15} aria-hidden="true" />
            Reply
          </button>
          {enquiry.engagement_id ? (
            <Link
              to={`/admin/speaking/${enquiry.engagement_id}/edit`}
              onClick={(event) => {
                if (!dirty) return;
                event.preventDefault();
                if (!saving) void openDraft();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
            >
              <Pencil size={15} aria-hidden="true" />
              Open draft engagement
            </Link>
          ) : canManage && (
            <LoadingButton
              type="button"
              loading={creating}
              loadingLabel="Creating…"
              disabled={saving}
              onClick={() => void createDraft()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
            >
              <FilePlus2 size={15} aria-hidden="true" />
              Create draft engagement
            </LoadingButton>
          )}
        </div>
        {(enquiry.replied_at || (!enquiry.engagement_id && canManage) || (dirty && hasDraftAction)) && (
          <div className="-mt-2 space-y-1 text-xs text-navy-600">
            {enquiry.replied_at && <p>Last reply sent {receivedAt(enquiry.replied_at)}.</p>}
            {!enquiry.engagement_id && canManage && (
              <p>A draft is marked “Invited” and stays off the website until you publish it. Creating one does not confirm anything.</p>
            )}
            {dirty && hasDraftAction && (
              <p>Your status and notes are saved before the draft engagement opens.</p>
            )}
          </div>
        )}

        {replying && <ReplyComposer enquiry={enquiry} onSent={handleReplied} onCancel={cancelReply} />}

        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <FormField
            label="Status"
            name="status"
            type="select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={ENQUIRY_STATUSES}
          />
          <FormField
            label="Private notes"
            name="admin_notes"
            textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={ENQUIRY_LIMITS.admin_notes}
            helpText="Only visible to admins."
          />
        </div>
      </div>
    </Modal>
  );
}

export default function SpeakingEnquiriesPage() {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('speaking.manage');
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [openId, setOpenId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setEnquiries(await fetchSpeakingEnquiries());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const result = { all: enquiries.length };
    for (const e of enquiries) result[e.status] = (result[e.status] || 0) + 1;
    return result;
  }, [enquiries]);

  const tabs = [{ value: 'all', label: 'All' }, ...ENQUIRY_STATUSES];
  const visible = tab === 'all' ? enquiries : enquiries.filter((e) => e.status === tab);
  const open = enquiries.find((e) => e.id === openId) || null;
  const replace = (updated) => {
    setEnquiries((list) => list.map((e) => (e.id === updated.id ? updated : e)));
    announceEnquiriesChanged();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSpeakingEnquiry(deleteTarget.id);
      setEnquiries((list) => list.filter((e) => e.id !== deleteTarget.id));
      announceEnquiriesChanged();
      setOpenId('');
      setDeleteTarget(null);
      toast.success('Enquiry deleted.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'created_at',
      label: 'Received',
      render: (val) => <span className="text-navy-600 block max-w-[7rem]">{receivedAt(val)}</span>,
    },
    {
      key: 'organiser_name',
      label: 'From',
      render: (val, row) => (
        <div className="max-w-[14rem]">
          <span className="font-medium text-navy-800 block truncate">{val}</span>
          <span className="text-xs text-navy-600 block truncate">{row.organisation}</span>
        </div>
      ),
    },
    {
      key: 'event_title',
      label: 'Event',
      render: (val, row) => (
        <div className="max-w-[16rem]">
          <span className="text-navy-800 block line-clamp-2">{val}</span>
          <span className="text-xs text-navy-600 block">{formatEnquiryDates(row)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (val, row) => (
        <div className="flex flex-col items-start gap-1">
          <EnquiryStatus status={val} />
          {row.replied_at && <span className="text-[11px] text-navy-600">Replied</span>}
          {row.engagement_id && <span className="text-[11px] text-navy-600">Draft created</span>}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_val, row) => (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); setOpenId(row.id); }}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-cyan-800 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
          aria-label={`View enquiry from ${row.organiser_name}`}
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Speaking Enquiries"
        subtitle="Invitations sent from the Speaking page. An enquiry never becomes a public engagement on its own."
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Speaking Engagements', to: '/admin/speaking' },
          { label: 'Enquiries' },
        ]}
      />

      {error && (
        <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">{error}</div>
      )}

      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-navy-50 p-1" role="tablist" aria-label="Filter by status">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'border-navy-500 bg-white text-navy-900 shadow-sm'
                : 'border-transparent text-navy-600 hover:text-navy-900'
            }`}
          >
            {t.label} <span className="text-navy-600">{counts[t.value] || 0}</span>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={visible}
        loading={loading}
        onRowClick={(row) => setOpenId(row.id)}
        emptyTitle={tab === 'all' ? 'No enquiries yet' : 'Nothing here'}
        emptyDescription={tab === 'all'
          ? 'Enquiries sent from the “Invite Me to Speak” form on the Speaking page appear here.'
          : 'No enquiries have this status.'}
      />

      {/* While the delete confirmation is open, Escape belongs to it alone. */}
      {open && (
        <EnquiryModal
          key={open.id}
          enquiry={open}
          canManage={canManage}
          onClose={() => { if (!deleteTarget) setOpenId(''); }}
          onSaved={replace}
          onDelete={setDeleteTarget}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={handleDelete}
        title="Delete enquiry"
        message={`Delete the enquiry from ${deleteTarget?.organiser_name || ''} permanently? This cannot be undone.`}
        confirmLabel="Delete enquiry"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
