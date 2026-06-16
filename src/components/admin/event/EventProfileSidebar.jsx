import EventPublicQrCard from '../EventPublicQrCard';

function IntroRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm py-1">
      <span className="text-navy-500 shrink-0">{label}</span>
      <span className="font-semibold text-navy-900 text-right tabular-nums">{value}</span>
    </div>
  );
}

export default function EventProfileSidebar({
  event,
  registrationsCount,
  confirmed,
  activeCount,
  attendedCount,
  cancelled,
  attendanceRate,
  capacity,
  occupancy,
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-[7.5rem] lg:self-start">
      <div className="bg-white rounded-lg shadow-sm border border-navy-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-100">
          <h3 className="text-lg font-bold text-navy-900">Intro</h3>
        </div>
        <div className="p-4 space-y-3 text-sm text-navy-700">
          {event.short_description && (
            <p className="leading-relaxed">{event.short_description}</p>
          )}
          <IntroRow label="Category" value={event.category || '—'} />
          <IntroRow label="Mode" value={event.event_mode || 'virtual'} />
          <IntroRow label="Organizer" value={event.organizer_name || '—'} />
          {event.organizer_email && (
            <p className="text-xs text-navy-500 break-all">{event.organizer_email}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-navy-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-100">
          <h3 className="text-lg font-bold text-navy-900">Registration stats</h3>
        </div>
        <div className="p-4 space-y-2">
          <IntroRow label="Total" value={registrationsCount} />
          <IntroRow label="Confirmed" value={confirmed} />
          <IntroRow label="Active" value={activeCount} />
          <IntroRow label="Attended" value={attendedCount} />
          <IntroRow label="Cancelled" value={cancelled} />
          <div className="pt-3 mt-2 border-t border-navy-100">
            <p className="text-xs text-navy-500 mb-0.5">Attendance rate</p>
            <p className="text-2xl font-bold text-navy-900 tabular-nums">{attendanceRate}%</p>
          </div>
          {capacity != null && (
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-navy-500 mb-1.5">
                <span>Capacity</span>
                <span>{activeCount}/{capacity}</span>
              </div>
              <div className="h-2 rounded-full bg-navy-100 overflow-hidden">
                <div
                  className="h-full bg-cyan-600 transition-all rounded-full"
                  style={{ width: `${occupancy || 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-navy-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-100">
          <h3 className="text-lg font-bold text-navy-900">Share</h3>
          <p className="text-xs text-navy-500 mt-0.5">QR code and registration link</p>
        </div>
        <div className="p-4">
          <EventPublicQrCard event={{ id: event.id, slug: event.slug, title: event.title }} />
        </div>
      </div>
    </aside>
  );
}
