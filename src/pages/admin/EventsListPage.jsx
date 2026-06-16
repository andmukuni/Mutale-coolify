import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Users, Globe, Lock, CheckCircle, XCircle, Copy, QrCode } from 'lucide-react';
import EventShareQrModal from '../../components/admin/EventShareQrModal';
import { useData } from '../../context/DataContext';
import { useBooking } from '../../context/BookingContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, DataTable, ConfirmDialog, StatusBadge } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { formatPrice, getEventDisplayStatus, isEventPast, sortEventsByRecentlyCreated } from '../../utils/eventServices';

export default function EventsListPage() {
  const { events, deleteEvent, updateEvent } = useData();
  const { getEventRegistrationCount } = useBooking();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [qrShareEvent, setQrShareEvent] = useState(null);

  const sortedEvents = useMemo(() => sortEventsByRecentlyCreated(events), [events]);

  const PAGE_SIZE = 10;
  const totalItems = sortedEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalItems);
  const paginatedEvents = sortedEvents.slice(startIndex, endIndex);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEvent(deleteTarget);
      toast.success('Event deleted.');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err?.message || 'Failed to delete event.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'row_num',
      label: '#',
      align: 'center',
      render: (_val, row) => {
        const index = paginatedEvents.findIndex((e) => e.id === row.id);
        const num = index >= 0 ? startIndex + index + 1 : '—';
        return (
          <span className="text-sm font-medium text-navy-500 tabular-nums">{num}</span>
        );
      },
    },
    {
      key: 'qr',
      label: 'QR',
      align: 'center',
      render: (_val, row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setQrShareEvent(row);
          }}
          className="inline-flex items-center justify-center p-2 rounded-lg text-cyan-700 hover:bg-cyan-50 border border-transparent hover:border-cyan-200 transition-colors"
          aria-label={`QR code and share for ${row.title || 'event'}`}
          title="QR code & share"
        >
          <QrCode size={16} />
        </button>
      ),
    },
    {
      key: 'title',
      label: 'Title',
      render: (val, row) => (
        <div>
          <span className="font-medium text-navy-800">{val}</span>
          <div className="flex gap-2 mt-0.5">
            <span className="text-xs text-navy-400 capitalize">{row.booking_type || '—'}</span>
            {row.is_free
              ? <span className="text-xs text-green-600">Free</span>
              : <span className="text-xs text-amber-600">{formatPrice(row)}</span>
            }
          </div>
        </div>
      ),
    },
    {
      key: 'start_date',
      label: 'Date',
      render: (val, row) => (
        <span className="text-navy-500">{formatDate(val || row.date)}</span>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (val) => (
        <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-medium">
          {val}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_val, row) => <StatusBadge status={getEventDisplayStatus(row)} />,
    },
    {
      key: 'attendees',
      label: 'Attendees',
      render: (_val, row) => {
        const count = getEventRegistrationCount(row.id);
        return (
          <Link
            to={`/admin/events/${row.id}/attendees`}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:text-cyan-800 transition-colors"
          >
            <Users size={13} />
            {count} / {row.capacity || '∞'}
          </Link>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_val, row) => (
        <div className="flex items-center justify-end gap-1">
          {(() => {
            const isLocked = isEventPast(row);
            if (isLocked) {
              return (
                <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  Past · locked
                </span>
              );
            }

            return (
              <>
          {/* Publish / unpublish */}
          {row.status === 'published' ? (
            <button
              onClick={e => { e.stopPropagation(); updateEvent(row.id, { status: 'draft' }); }}
              className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 transition-colors"
              title="Unpublish"
            >
              <Lock size={14} />
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); updateEvent(row.id, { status: 'published' }); }}
              className="p-1.5 rounded-lg hover:bg-green-50 text-navy-400 hover:text-green-600 transition-colors"
              title="Publish"
            >
              <Globe size={14} />
            </button>
          )}
          {/* Open / close registration */}
          {row.status !== 'closed' ? (
            <button
              onClick={e => { e.stopPropagation(); updateEvent(row.id, { status: 'closed' }); }}
              className="p-1.5 rounded-lg hover:bg-amber-50 text-navy-400 hover:text-amber-600 transition-colors"
              title="Close registration"
            >
              <XCircle size={14} />
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); updateEvent(row.id, { status: 'published' }); }}
              className="p-1.5 rounded-lg hover:bg-green-50 text-navy-400 hover:text-green-600 transition-colors"
              title="Re-open registration"
            >
              <CheckCircle size={14} />
            </button>
          )}
              </>
            );
          })()}
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/admin/events/${row.id}/edit`); }}
            disabled={isEventPast(row)}
            className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-navy-400 transition-colors"
            aria-label="Edit event"
            title={isEventPast(row) ? 'Past events are locked and cannot be edited' : 'Edit event'}
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/admin/events/new?clone=${encodeURIComponent(row.id)}`); }}
            className="p-1.5 rounded-lg hover:bg-cyan-50 text-navy-400 hover:text-cyan-700 transition-colors"
            aria-label="Clone event"
            title="Clone event"
          >
            <Copy size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row.id); }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600 transition-colors"
            aria-label="Delete event"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle={`${events.length} total · newest first`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Events' },
        ]}
        actions={
          <Link
            to="/admin/events/new"
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            New Event
          </Link>
        }
      />

      <DataTable
        columns={columns}
        data={paginatedEvents}
        onRowClick={(row) => navigate(`/admin/events/${row.id}`)}
        emptyTitle="No events yet"
        emptyDescription="Create your first event to get started."
        emptyAction={
          <Link
            to="/admin/events/new"
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Create Event
          </Link>
        }
      />

      {totalItems > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-navy-500">
            Showing <span className="font-medium text-navy-700">{startIndex + 1}</span>
            {' '}-{' '}
            <span className="font-medium text-navy-700">{endIndex}</span>
            {' '}of{' '}
            <span className="font-medium text-navy-700">{totalItems}</span> events
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-navy-200 bg-white text-navy-600 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <span className="text-sm text-navy-600 px-2">
              Page <span className="font-semibold text-navy-800">{safeCurrentPage}</span> of{' '}
              <span className="font-semibold text-navy-800">{totalPages}</span>
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-navy-200 bg-white text-navy-600 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {qrShareEvent && (
        <EventShareQrModal
          event={qrShareEvent}
          onClose={() => setQrShareEvent(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Event"
        message="Are you sure you want to delete this event? This action cannot be undone."
        confirmLabel="Delete Event"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
