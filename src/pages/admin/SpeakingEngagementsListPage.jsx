import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Eye, EyeOff, Globe, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog, DataTable, PageHeader, StatusBadge } from '../../components/ui';
import {
  HideNotice,
  PublicationBadge,
  SpeakingPreviewModal,
} from '../../components/admin/speaking/SpeakingAdminShared';
import {
  deleteSpeakingEngagement,
  duplicateSpeakingEngagement,
  fetchSpeakingEngagements,
  fetchSpeakingMetrics,
  hideSpeakingEngagement,
  publishSpeakingEngagement,
} from '../../utils/speakingAdminApi';
import {
  formatEngagementDateRange,
  formatRoles,
} from '../../../shared/speakingEngagements.js';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'hidden', label: 'Hidden' },
];

// navy-600 as a literal colour: the app-wide dark remap of text-navy-600 would override the hover colours.
const iconButton = 'p-1.5 rounded-lg text-[#486581] dark:text-navy-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const neutralHover = 'hover:bg-navy-100 hover:text-navy-700';

const yearOf = (record) => String(record.start_date || '').slice(0, 4);

/** Title, organiser, session, place and topics, compared without case. */
function matchesSearch(record, query) {
  if (!query) return true;
  const haystack = [
    record.event_title, record.organiser, record.session_title, record.venue, record.city, record.country,
    ...(record.topics || []),
  ].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

function ActivityStat({ label, count, days }) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-navy-600">{label}</p>
      <p className="mt-1 text-xl font-semibold text-navy-900">{count?.recent ?? 0}</p>
      <p className="text-xs text-navy-600">last {days} days · {count?.total ?? 0} in total</p>
    </div>
  );
}

export default function SpeakingEngagementsListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('speaking.manage');

  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  // Rows with an action in flight; several can be pending at once.
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [previewRecord, setPreviewRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [metrics, setMetrics] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      setEngagements(await fetchSpeakingEngagements());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Activity totals are a bonus; the list works without them.
  useEffect(() => {
    fetchSpeakingMetrics().then(setMetrics).catch(() => setMetrics(null));
  }, []);

  const years = useMemo(() => {
    const set = new Set(engagements.map(yearOf).filter(Boolean));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [engagements]);

  // Search and year narrow every tab; the tab counts follow them.
  const matching = useMemo(() => engagements.filter((e) => matchesSearch(e, query.trim())
    && (!year || (year === 'undated' ? !yearOf(e) : yearOf(e) === year))), [engagements, query, year]);

  const counts = useMemo(() => {
    const result = { all: matching.length, published: 0, draft: 0, hidden: 0 };
    for (const e of matching) result[e.publication_state] = (result[e.publication_state] || 0) + 1;
    return result;
  }, [matching]);

  const visible = tab === 'all' ? matching : matching.filter((e) => e.publication_state === tab);
  const narrowed = Boolean(query.trim() || year);

  const replaceRecord = (record) => setEngagements((list) => list.map((e) => (e.id === record.id ? record : e)));

  const setRowBusy = (rowId, busy) => setBusyIds((prev) => {
    const next = new Set(prev);
    if (busy) next.add(rowId);
    else next.delete(rowId);
    return next;
  });

  const runAction = async (record, action) => {
    setRowBusy(record.id, true);
    try {
      if (action === 'publish') {
        replaceRecord(await publishSpeakingEngagement(record.id));
        toast.success(record.publication_state === 'hidden' ? 'Engagement republished.' : 'Engagement published.');
      } else if (action === 'hide') {
        replaceRecord(await hideSpeakingEngagement(record.id));
        toast.success('Engagement hidden from the website.');
      } else if (action === 'duplicate') {
        const copy = await duplicateSpeakingEngagement(record.id);
        toast.success('Copy created as a draft.');
        navigate(`/admin/speaking/${copy.id}/edit`);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRowBusy(record.id, false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setRowBusy(deleteTarget.id, true);
    try {
      await deleteSpeakingEngagement(deleteTarget.id);
      setEngagements((list) => list.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('Engagement deleted.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRowBusy(deleteTarget.id, false);
    }
  };

  const columns = [
    {
      key: 'start_date',
      label: 'Dates',
      render: (_val, row) => (
        <span className="text-navy-600 block max-w-[8rem]">{formatEngagementDateRange(row)}</span>
      ),
    },
    {
      key: 'event_title',
      label: 'Engagement',
      render: (val, row) => (
        <div className="max-w-[18rem]">
          <span className="font-medium text-navy-800 block line-clamp-2">{val}</span>
          {(row.organiser || row.roles?.length > 0) && (
            <span className="text-xs text-navy-600 block truncate">
              {[row.organiser, formatRoles(row.roles)].filter(Boolean).join(' — ')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'participation_status',
      label: 'Status',
      render: (val, row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={val} />
          {row.event_status && row.event_status !== 'scheduled' && <StatusBadge status={row.event_status} />}
        </div>
      ),
    },
    {
      key: 'publication_state',
      label: 'Website',
      render: (val, row) => (
        <div className="flex flex-col items-start gap-1">
          <PublicationBadge state={val} />
          {val === 'published' && row.participation_status === 'declined' && (
            <span className="text-[11px] text-amber-800 dark:text-amber-200">Not shown — declined</span>
          )}
          {metrics?.engagements?.[row.id]?.event_website_click?.total > 0 && (
            <span className="text-[11px] text-navy-600">
              {metrics.engagements[row.id].event_website_click.total} website clicks
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_val, row) => {
        const busy = busyIds.has(row.id);
        const stop = (fn) => (event) => { event.stopPropagation(); fn(); };
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={stop(() => setPreviewRecord(row))}
              className={`${iconButton} ${neutralHover}`}
              aria-label={`Preview ${row.event_title}`}
              title="Preview"
            >
              <Eye size={15} />
            </button>
            {canManage && (
              <>
                {row.publication_state === 'published' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={stop(() => runAction(row, 'hide'))}
                    className={`${iconButton} hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-500/15 dark:hover:text-amber-200`}
                    aria-label={`Hide ${row.event_title} from the website`}
                    title="Hide from website"
                  >
                    <EyeOff size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || row.participation_status === 'declined'}
                    onClick={stop(() => runAction(row, 'publish'))}
                    className={`${iconButton} hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-500/15 dark:hover:text-green-300`}
                    aria-label={`${row.publication_state === 'hidden' ? 'Republish' : 'Publish'} ${row.event_title}`}
                    title={row.participation_status === 'declined'
                      ? 'Declined engagements stay private'
                      : row.publication_state === 'hidden' ? 'Republish' : 'Publish'}
                  >
                    <Globe size={15} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={stop(() => navigate(`/admin/speaking/${row.id}/edit`))}
                  className={`${iconButton} ${neutralHover}`}
                  aria-label={`Edit ${row.event_title}`}
                  title="Edit"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={stop(() => runAction(row, 'duplicate'))}
                  className={`${iconButton} ${neutralHover}`}
                  aria-label={`Duplicate ${row.event_title}`}
                  title="Duplicate as draft"
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={stop(() => setDeleteTarget(row))}
                  className={`${iconButton} hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-300`}
                  aria-label={`Delete ${row.event_title}`}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  const newButton = canManage && (
    <Link
      to="/admin/speaking/new"
      className="inline-flex items-center gap-2 bg-cyan-700 hover:bg-cyan-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
    >
      <Plus size={16} />
      New Engagement
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Speaking Engagements"
        subtitle="Events where you speak, facilitate, or train. Separate from the events you organise and sell."
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Speaking Engagements' },
        ]}
        actions={newButton}
      />

      {error && (
        <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {metrics && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <ActivityStat label="Enquiries" count={metrics.page.enquiries} days={metrics.days} />
          <ActivityStat label="Speaker profile downloads" count={metrics.page.profile_download} days={metrics.days} />
          <ActivityStat
            label="Event website clicks"
            days={metrics.days}
            count={Object.values(metrics.engagements).reduce((sum, e) => ({
              total: sum.total + (e.event_website_click?.total || 0),
              recent: sum.recent + (e.event_website_click?.recent || 0),
            }), { total: 0, recent: 0 })}
          />
          <p className="text-xs text-navy-600 sm:col-span-3">
            Downloads and clicks are counted only for visitors who accept analytics cookies, so the real numbers are higher.
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search engagements</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, organiser, place or topic"
            className="w-full rounded-xl border border-navy-200 bg-white py-2 pl-9 pr-3 text-sm text-navy-800 focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-700/30"
          />
        </label>
        <label className="block w-full sm:w-44">
          <span className="sr-only">Year</span>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800 focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-700/30"
          >
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
            <option value="undated">No date</option>
          </select>
        </label>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-navy-50 p-1" role="tablist" aria-label="Filter by website status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-navy-500 bg-white text-navy-900 shadow-sm'
                  : 'border-transparent text-navy-600 hover:text-navy-900'
              }`}
            >
              {t.label} <span className="text-navy-600">{counts[t.key] || 0}</span>
            </button>
          ))}
        </div>
        <HideNotice className="sm:max-w-md" />
      </div>

      <DataTable
        columns={columns}
        data={visible}
        loading={loading}
        onRowClick={canManage ? (row) => navigate(`/admin/speaking/${row.id}/edit`) : undefined}
        emptyTitle={narrowed ? 'No matches' : tab === 'all' ? 'No speaking engagements yet' : 'Nothing here'}
        emptyDescription={narrowed
          ? 'No engagements match this search or year.'
          : tab === 'all'
            ? 'Add an engagement. It starts as a draft and appears on the website only when you publish it.'
            : 'No engagements have this website status.'}
        emptyAction={tab === 'all' && !narrowed ? newButton : null}
      />

      <SpeakingPreviewModal
        record={previewRecord}
        isOpen={Boolean(previewRecord)}
        onClose={() => setPreviewRecord(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => { if (!busyIds.has(deleteTarget?.id)) setDeleteTarget(null); }}
        onConfirm={handleDelete}
        title="Delete engagement"
        message={`Delete “${deleteTarget?.event_title || ''}” permanently? To take it off the website but keep it, hide it instead. This cannot be undone.`}
        confirmLabel="Delete engagement"
        variant="danger"
        loading={busyIds.has(deleteTarget?.id)}
      />
    </div>
  );
}
