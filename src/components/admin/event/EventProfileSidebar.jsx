import EventPublicQrCard from '../EventPublicQrCard';

export default function EventProfileSidebar({ event }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-[7.5rem] lg:self-start">
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
