import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Users, Download, CheckCircle2, Video, QrCode, Printer, Columns3, Search } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, Modal, StatusBadge } from '../../components/ui';
import EmptyState from '../../components/EmptyState';
import { resolveEventMode } from '../../utils/eventServices';
import { downloadEventBadgePrintPdf } from '../../utils/badgeApi';
import { downloadBlob, exportEventAttendees, fetchEventAttendees } from '../../utils/attendeesApi';
import {
  filterAttendeeRows,
  formatTableDisplay,
  getFieldValue,
  hasAttended,
  readColumnPrefs,
  resolveAttendeeFields,
  truncateDisplay,
  visibleAttendeeFields,
  writeColumnPrefs,
} from '../../../shared/registrationAttendeeFields.js';

function fieldById(fields, id) {
  return fields.find((field) => field.id === id);
}

export default function EventAttendeesPage() {
  const { id } = useParams();
  const { events } = useData();
  const toast = useToast();
  const event = events.find((item) => item.id === id);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [attendedFilter, setAttendedFilter] = useState('');
  const [hiddenIds, setHiddenIds] = useState(() => readColumnPrefs().hidden);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [badgeExportLoading, setBadgeExportLoading] = useState(false);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const json = await fetchEventAttendees(id);
        if (cancelled) return;
        setRows(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load attendees.');
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [id]);

  const fields = useMemo(() => resolveAttendeeFields(rows), [rows]);
  const visibleFields = useMemo(() => visibleAttendeeFields(fields, hiddenIds), [fields, hiddenIds]);
  const filters = useMemo(() => ({
    q: query,
    status: statusFilter,
    payment_status: paymentFilter,
    attended: attendedFilter,
  }), [query, statusFilter, paymentFilter, attendedFilter]);
  const filtered = useMemo(() => filterAttendeeRows(rows, filters), [rows, filters]);

  const active = rows.filter((row) => row.status !== 'cancelled');
  const attendedRegs = active.filter(hasAttended);
  const totalActive = active.length;
  const totalAttended = attendedRegs.length;
  const attendanceRate = totalActive > 0 ? Math.round((totalAttended / totalActive) * 100) : 0;

  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selectedIds.has(row.id));

  const toggleHidden = (fieldId) => {
    setHiddenIds((prev) => {
      const next = prev.includes(fieldId)
        ? prev.filter((item) => item !== fieldId)
        : [...prev, fieldId];
      writeColumnPrefs(next);
      return next;
    });
  };

  const showAllFields = () => {
    writeColumnPrefs([]);
    setHiddenIds([]);
  };

  const toggleRow = (rowId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleSelectFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((row) => next.delete(row.id));
      } else {
        filtered.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const handlePrintBadges = async () => {
    setBadgeExportLoading(true);
    try {
      const blob = await downloadEventBadgePrintPdf(id);
      downloadBlob(blob, `badges-a4-${event?.slug || event?.id}.pdf`);
      toast.success('Badge print sheet downloaded (2 per A4 page).');
    } catch (err) {
      toast.error(err.message || 'Badge export failed.');
    } finally {
      setBadgeExportLoading(false);
    }
  };

  const runExport = async (scope, format) => {
    const key = `${scope}-${format}`;
    setExporting(key);
    try {
      const payload = {
        scope,
        format,
        ...(scope === 'filtered' ? filters : {}),
        ...(scope === 'selected' ? { ids: [...selectedIds] } : {}),
      };
      const result = await exportEventAttendees(id, payload);
      downloadBlob(result.blob, result.filename);
      toast.success(`Exported ${result.count} attendee${result.count === 1 ? '' : 's'} (${format.toUpperCase()}).`);
    } catch (err) {
      toast.error(err.message || 'Export failed.');
    } finally {
      setExporting('');
    }
  };

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

  return (
    <div>
      <PageHeader
        title={`Attendees — ${event.title}`}
        subtitle={`${totalActive} confirmed / ${rows.length} total registrations`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Events', to: '/admin/events' },
          { label: 'Attendees' },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/admin/events/${id}/check-in`}
              className="inline-flex items-center gap-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl transition-colors"
            >
              <QrCode size={15} />
              Gate check-in
            </Link>
            {resolveEventMode(event) !== 'virtual' && (
              <button
                type="button"
                onClick={() => { void handlePrintBadges(); }}
                disabled={badgeExportLoading}
                className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 hover:text-cyan-700 px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
                title="A4 landscape — 2 badges per sheet"
              >
                <Printer size={15} />
                {badgeExportLoading ? 'Exporting…' : 'Print badges'}
              </button>
            )}
          </div>
        )}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile icon={Users} label="Registered" value={totalActive} tone="navy" />
        <StatTile icon={CheckCircle2} label="Attended" value={totalAttended} tone="emerald" />
        <StatTile icon={Video} label="Attendance" value={`${attendanceRate}%`} tone="cyan" />
        <StatTile icon={Users} label="Cancelled" value={rows.length - totalActive} tone="rose" />
      </div>

      <Card className="mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <label className="flex-1 min-w-0">
              <span className="block text-xs font-medium text-navy-500 mb-1">Search name, email, or phone</span>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search across all attendees"
                  className="w-full rounded-xl border border-navy-200 bg-white pl-9 pr-3 py-2 text-sm text-navy-800"
                />
              </div>
            </label>
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={['confirmed', 'pending', 'cancelled', 'attended']} />
            <FilterSelect label="Payment" value={paymentFilter} onChange={setPaymentFilter} options={['paid', 'unpaid', 'pending', 'not_required', 'waived']} />
            <FilterSelect label="Attendance" value={attendedFilter} onChange={setAttendedFilter} options={[['yes', 'Attended'], ['no', 'Not attended']]} />
            <button
              type="button"
              onClick={() => setColumnsOpen((open) => !open)}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 hover:border-cyan-400 px-4 py-2 rounded-xl"
            >
              <Columns3 size={15} />
              Columns
            </button>
          </div>

          {columnsOpen && (
            <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Table columns</p>
                <button type="button" onClick={showAllFields} className="text-xs font-medium text-cyan-700 hover:underline">
                  Show all fields
                </button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {fields.map((field) => (
                  <label key={field.id} className="flex items-center gap-2 text-sm text-navy-700">
                    <input
                      type="checkbox"
                      checked={!hiddenIds.includes(field.id)}
                      onChange={() => toggleHidden(field.id)}
                    />
                    <span>
                      {field.label}
                      <span className="ml-1 text-[10px] uppercase text-navy-400">{field.group === 'form' ? 'form' : 'admin'}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-navy-400 mt-2">Hidden columns stay in exports. Preferences are saved in this browser only.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons
              label={`Export all (${rows.length})`}
              disabled={!rows.length || Boolean(exporting)}
              busy={exporting}
              scope="all"
              onExport={runExport}
            />
            <ExportButtons
              label={`Export filtered (${filtered.length})`}
              disabled={!filtered.length || Boolean(exporting)}
              busy={exporting}
              scope="filtered"
              onExport={runExport}
            />
            <ExportButtons
              label={`Export selected (${selectedIds.size})`}
              disabled={!selectedIds.size || Boolean(exporting)}
              busy={exporting}
              scope="selected"
              onExport={runExport}
            />
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-navy-400 py-8 text-center">Loading attendees…</p>
        ) : error ? (
          <p className="text-sm text-rose-600 py-8 text-center">{error}</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={rows.length ? 'No matching attendees' : 'No registrations yet'}
            description={rows.length
              ? 'Try clearing search or filters.'
              : 'Attendees will appear here once people register for this event.'}
          />
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {filtered.map((row) => {
                const name = formatTableDisplay(getFieldValue(row, fieldById(fields, 'attendee_name')));
                const email = formatTableDisplay(getFieldValue(row, fieldById(fields, 'attendee_email')));
                const phone = formatTableDisplay(getFieldValue(row, fieldById(fields, 'attendee_phone')));
                return (
                  <div key={row.id} className="rounded-xl border border-navy-100 p-3">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-navy-900">{name}</p>
                        <p className="text-xs text-navy-500 break-all">{email}</p>
                        <p className="text-xs text-navy-500">{phone}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge status={row.status} />
                          <StatusBadge status={row.payment_status} />
                        </div>
                        <div className="mt-3 flex gap-3 text-xs">
                          <Link to={`/admin/events/${id}/attendees/${row.id}`} className="text-cyan-700 font-medium">Open profile</Link>
                          <button type="button" className="text-navy-600" onClick={() => setDetailRow(row)}>All fields</button>
                        </div>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="text-sm border-separate border-spacing-0 min-w-max">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-white border-b border-navy-100 py-3 px-3 text-left">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectFiltered} aria-label="Select filtered attendees" />
                    </th>
                    {visibleFields.map((field, index) => (
                      <th
                        key={field.id}
                        className={`border-b border-navy-100 text-left text-xs font-semibold text-navy-400 uppercase tracking-wider py-3 px-3 bg-white ${
                          field.sticky ? 'sticky left-10 z-20 shadow-[1px_0_0_0_rgba(15,23,42,0.08)]' : ''
                        }`}
                        style={{ minWidth: field.minWidth || 140 }}
                      >
                        <span className="block">{field.label}</span>
                        {index === 0 || field.group === 'form' ? (
                          <span className="block normal-case tracking-normal font-normal text-[10px] text-navy-300">
                            {field.group === 'form' ? 'Registration answer' : 'Administrative'}
                          </span>
                        ) : (
                          <span className="block normal-case tracking-normal font-normal text-[10px] text-navy-300">Administrative</span>
                        )}
                      </th>
                    ))}
                    <th className="border-b border-navy-100 bg-white py-3 px-3 text-xs font-semibold text-navy-400 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="hover:bg-navy-50/40">
                      <td className="sticky left-0 z-10 bg-white border-b border-navy-50 py-2.5 px-3">
                        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} aria-label={`Select ${row.id}`} />
                      </td>
                      {visibleFields.map((field) => {
                        const cell = getFieldValue(row, field);
                        const display = formatTableDisplay(cell);
                        const long = field.type === 'longtext' || (field.truncate && display.length > (field.truncate || 80));
                        const clipped = long ? truncateDisplay(display, field.truncate || 80) : { text: display, truncated: false };
                        const badge = field.id === 'status' || field.id === 'payment_status';
                        return (
                          <td
                            key={field.id}
                            className={`border-b border-navy-50 py-2.5 px-3 text-navy-700 align-top ${
                              field.sticky ? 'sticky left-10 z-10 bg-white font-medium text-navy-900 shadow-[1px_0_0_0_rgba(15,23,42,0.08)]' : ''
                            }`}
                          >
                            {field.sticky ? (
                              <Link to={`/admin/events/${id}/attendees/${row.id}`} className="hover:text-cyan-700">
                                {display}
                              </Link>
                            ) : badge && cell.kind === 'value' ? (
                              <StatusBadge status={cell.raw} />
                            ) : (
                              <span className="whitespace-pre-wrap break-words">
                                {clipped.text}
                                {clipped.truncated && (
                                  <button type="button" className="ml-1 text-xs text-cyan-700" onClick={() => setDetailRow(row)}>
                                    View
                                  </button>
                                )}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-b border-navy-50 py-2.5 px-3">
                        <button type="button" className="text-xs font-medium text-cyan-700" onClick={() => setDetailRow(row)}>
                          View all
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <AttendeeDetailModal
        eventId={id}
        row={detailRow}
        fields={fields}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}

function AttendeeDetailModal({ eventId, row, fields, onClose }) {
  if (!row) return null;
  const formFields = fields.filter((field) => field.group === 'form');
  const adminFields = fields.filter((field) => field.group === 'admin');
  const name = formatTableDisplay(getFieldValue(row, fieldById(fields, 'attendee_name')));
  return (
    <Modal isOpen={Boolean(row)} onClose={onClose} title={name} subtitle="Registration answers and administrative fields" size="xl">
      <FieldSection title="Registration answers" fields={formFields} row={row} />
      <FieldSection title="Administrative information" fields={adminFields} row={row} />
      <div className="mt-4">
        <Link to={`/admin/events/${eventId}/attendees/${row.id}`} className="text-sm font-medium text-cyan-700">
          Open full attendee profile →
        </Link>
      </div>
    </Modal>
  );
}

function FieldSection({ title, fields, row }) {
  return (
    <section className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-navy-400 mb-3">{title}</h3>
      <dl className="grid sm:grid-cols-2 gap-3">
        {fields.map((field) => (
          <div key={field.id} className="rounded-xl border border-navy-100 px-3 py-2">
            <dt className="text-xs text-navy-400">
              {field.label}
              {field.labelUncertain ? ' — label inferred' : ''}
            </dt>
            <dd className="text-sm text-navy-800 mt-1 whitespace-pre-wrap break-words">
              {formatTableDisplay(getFieldValue(row, field))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ExportButtons({ label, disabled, busy, scope, onExport }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-navy-200 overflow-hidden">
      <span className="px-3 py-2 text-xs font-medium text-navy-500 bg-navy-50">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onExport(scope, 'csv')}
        className="inline-flex items-center gap-1 px-3 py-2 text-sm text-navy-700 hover:bg-navy-50 disabled:opacity-50"
      >
        <Download size={14} />
        {busy === `${scope}-csv` ? 'CSV…' : 'CSV'}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onExport(scope, 'xlsx')}
        className="inline-flex items-center gap-1 px-3 py-2 text-sm text-navy-700 hover:bg-navy-50 border-l border-navy-200 disabled:opacity-50"
      >
        {busy === `${scope}-xlsx` ? 'Excel…' : 'Excel'}
      </button>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="sm:w-40">
      <span className="block text-xs font-medium text-navy-500 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm text-navy-800"
      >
        <option value="">All</option>
        {options.map((option) => {
          const [id, text] = Array.isArray(option) ? option : [option, option.replace(/_/g, ' ')];
          return <option key={id} value={id}>{text}</option>;
        })}
      </select>
    </label>
  );
}

function StatTile({ icon: Icon, label, value, tone = 'navy' }) {
  const tones = {
    navy: 'bg-white border-navy-100 text-navy-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
  };
  return (
    <div className={`rounded-xl border ${tones[tone]} p-4`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-80 mb-1.5">
        <Icon size={13} />
        {label}
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
