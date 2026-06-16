import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { isEventPubliclyVisible } from '../utils/eventServices';
import EventForumPanel from '../components/EventForumPanel';

export default function EventForumPage() {
  const { slug } = useParams();
  const { events, isDataLoaded } = useData();
  const event = events.find((e) => e.slug === slug);

  if (!isDataLoaded) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-navy-100 border-t-navy-900 animate-spin" />
      </div>
    );
  }

  if (!event || !isEventPubliclyVisible(event)) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-navy-500">
        <AlertCircle size={40} className="text-navy-300" />
        <h2 className="text-xl font-semibold text-navy-700">Event not found</h2>
        <Link to="/events" className="text-cyan-600 hover:underline text-sm">← Back to Events</Link>
      </div>
    );
  }

  if (!event.forum_enabled) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-navy-500 px-4">
        <AlertCircle size={40} className="text-navy-300" />
        <h2 className="text-xl font-semibold text-navy-700">Forum not available</h2>
        <p className="text-sm text-navy-500 text-center max-w-md">
          The forum has not been enabled for this event.
        </p>
        <Link to={`/events/${slug}`} className="text-cyan-600 hover:underline text-sm">← Back to event</Link>
      </div>
    );
  }

  return (
    <div className="bg-navy-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Link
          to={`/events/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-cyan-600 transition-colors mb-6"
        >
          <ArrowLeft size={15} />
          Back to {event.title}
        </Link>

        <EventForumPanel
          event={event}
          loginPath={`/account/login`}
        />
      </div>
    </div>
  );
}
