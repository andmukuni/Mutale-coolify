import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, Tag, ArrowRight, Ticket, CheckCircle2 } from 'lucide-react';
import { formatDate, formatTime } from '../utils/helpers';
import { getEventDisplayStatus } from '../utils/eventServices';
import { useCurrency } from '../context/CurrencyContext';
import { useUserAuth } from '../context/UserAuthContext';
import { useBooking } from '../context/BookingContext';

const statusPill = {
  upcoming: 'bg-blue-50 text-blue-700',
  ongoing: 'bg-green-50 text-green-700',
  past: 'bg-navy-100 text-navy-500',
  closed: 'bg-red-50 text-red-600',
  cancelled: 'bg-red-50 text-red-600',
  draft: 'bg-navy-100 text-navy-400',
};

export default function EventCard({ event }) {
  const navigate = useNavigate();
  const { formatEventPrice } = useCurrency();
  const { currentUser, isUserAuthenticated } = useUserAuth();
  const { isUserRegistered } = useBooking();
  const displayStatus = getEventDisplayStatus(event);
  const isPast = displayStatus === 'past' || displayStatus === 'cancelled' || displayStatus === 'closed';
  const isLive = displayStatus === 'ongoing';
  const userAlreadyRegistered = isUserAuthenticated && isUserRegistered(currentUser?.id, event.id, 'subscription');
  const detailPath = `/events/${event.slug}`;

  const isInteractiveTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('a, button, input, select, textarea, [role="button"]'));
  };

  const handleCardClick = (eventObj) => {
    if (isInteractiveTarget(eventObj.target)) return;
    navigate(detailPath);
  };

  const handleCardKeyDown = (eventObj) => {
    if (eventObj.key !== 'Enter' && eventObj.key !== ' ') return;
    if (isInteractiveTarget(eventObj.target)) return;
    eventObj.preventDefault();
    navigate(detailPath);
  };

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all duration-300 group flex flex-col ${
      isLive
        ? 'border-4 border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.2)] hover:shadow-[0_0_0_4px_rgba(16,185,129,0.28)]'
        : 'border-navy-100 hover:shadow-xl hover:border-cyan-200'
    } cursor-pointer focus-within:ring-2 focus-within:ring-cyan-500 focus-within:ring-offset-2`}
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={`View details for ${event.title}`}
    >
      {/* Cover image */}
      {event.cover_image && (
        <Link to={`/events/${event.slug}`} className="block overflow-hidden">
          <img
            src={event.cover_image}
            alt={event.title}
            className="w-full h-44 object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        </Link>
      )}

      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            {event.category && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-cyan-50 text-cyan-700 px-2.5 py-1 rounded-full">
                <Tag size={12} />
                {event.category}
              </span>
            )}
            {userAlreadyRegistered && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100">
                <CheckCircle2 size={12} />
                Registered
              </span>
            )}
          </div>
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live now
            </span>
          ) : (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusPill[displayStatus] || 'bg-navy-50 text-navy-500'}`}>
              {displayStatus}
            </span>
          )}
        </div>

        <Link to={`/events/${event.slug}`}>
          <h3 className="text-base font-bold text-navy-900 mb-3 group-hover:text-cyan-700 transition-colors line-clamp-2 break-words">
            {event.title}
          </h3>
        </Link>

        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-xs text-navy-500">
            <Calendar size={13} className="text-navy-400 shrink-0" />
            {formatDate(event.start_date || event.date)}
          </div>
          {(event.start_time || event.time) && (
            <div className="flex items-center gap-2 text-xs text-navy-500">
              <Clock size={13} className="text-navy-400 shrink-0" />
              {formatTime(event.start_time || event.time)}
              {(event.end_time || event.endTime) && ` – ${formatTime(event.end_time || event.endTime)}`}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-navy-500">
            <MapPin size={13} className="text-navy-400 shrink-0" />
            {event.location}
          </div>
        </div>

        <p className="text-xs text-navy-500 leading-relaxed mb-4 line-clamp-2 flex-1">
          {event.short_description || event.description}
        </p>

        {/* Price badge */}
        <div className="flex items-center justify-between mb-4">
          <span className={`text-xs font-semibold ${event.is_free ? 'text-green-600' : 'text-navy-700'}`}>
            {event.is_free ? '✓ Free' : formatEventPrice(event)}
          </span>
          {event.capacity && (
            <span className="text-xs text-navy-400">
              Capacity: {event.capacity}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/events/${event.slug}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors"
          >
            View Details <ArrowRight size={13} />
          </Link>
          {!isPast && event.status === 'published' && (
            userAlreadyRegistered ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-navy-200 text-navy-500 px-3.5 py-1.5 rounded-lg shrink-0 cursor-not-allowed"
                aria-disabled="true"
                title="You are already registered"
              >
                <CheckCircle2 size={12} />
                Registered
              </span>
            ) : (
              <Link
                to={`/events/${event.slug}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-1.5 rounded-lg transition-colors shrink-0"
              >
                <Ticket size={12} />
                Register
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}
