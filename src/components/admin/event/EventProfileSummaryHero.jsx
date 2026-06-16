import { Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  ExternalLink,
  ChevronLeft,
  Ticket,
  Globe,
} from 'lucide-react';
import { StatusBadge } from '../../ui';
import { formatDate } from '../../../utils/helpers';
import { buildPublicEventPageUrl } from '../../../../shared/receiptQr.js';
import { getAppOrigin } from '../../../utils/apiBase.js';

export default function EventProfileSummaryHero({
  event,
  displayStatus,
  activeCount,
  attendedCount,
  capacity,
  occupancy,
}) {
  const publicUrl = buildPublicEventPageUrl(
    { id: event.id, slug: event.slug },
    getAppOrigin(),
  );

  const dateLabel = `${formatDate(event.start_date || event.date)}${
    event.end_date && event.end_date !== (event.start_date || event.date)
      ? ` – ${formatDate(event.end_date)}`
      : ''
  }`;

  const priceLabel = event.is_free || Number(event.price || 0) <= 0
    ? 'Free event'
    : `ZMW ${Number(event.price).toFixed(2)}`;

  const initials = String(event.title || 'E')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const statLine = [
    `${activeCount} registered`,
    `${attendedCount} attended`,
    capacity != null ? `${occupancy}% capacity` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="bg-white border-b border-navy-100 overflow-visible">
      {/* Cover — fixed height, image fills frame */}
      <div className="relative w-full h-48 sm:h-60 md:h-72 lg:h-80 bg-navy-800 isolate">
        {event.cover_image ? (
          <img
            src={event.cover_image}
            alt=""
            className="block w-full h-full object-cover object-center"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-700 to-cyan-800" />
        )}
        <div
          className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/55 via-black/15 to-transparent"
          aria-hidden
        />

        <Link
          to="/admin/events"
          className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/45 hover:bg-black/60 backdrop-blur-sm text-white text-sm font-medium transition-colors"
        >
          <ChevronLeft size={16} />
          Events
        </Link>
      </div>

      {/* Profile block — sits below cover; only avatar overlaps upward */}
      <div className="relative z-10 bg-white">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-navy-100">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-5 min-w-0 flex-1">
              {/* Avatar — sole element pulled into cover zone */}
              <div className="relative shrink-0 -mt-12 sm:-mt-16 md:-mt-[4.5rem] self-start">
                <div
                  className="w-[88px] h-[88px] sm:w-[112px] sm:h-[112px] md:w-[128px] md:h-[128px] rounded-2xl border-4 border-white bg-gradient-to-br from-cyan-600 to-navy-800 shadow-[0_4px_20px_rgba(15,23,42,0.25)] flex items-center justify-center"
                  aria-hidden
                >
                  <span className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                    {initials}
                  </span>
                </div>
              </div>

              {/* Title + stats — always on white, never under cover */}
              <div className="min-w-0 flex-1 sm:pb-1.5 pt-1 sm:pt-0">
                <h1 className="text-xl sm:text-2xl md:text-[1.75rem] font-bold text-navy-900 leading-snug line-clamp-3">
                  {event.title}
                </h1>
                <p className="text-sm text-navy-500 mt-1.5">{statLine}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <StatusBadge status={displayStatus} />
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-navy-100 text-navy-700">
                    {event.category || 'Event'}
                  </span>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-navy-100 text-navy-700">
                    {priceLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pb-1.5">
              {publicUrl && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-800 text-sm font-semibold transition-colors"
                >
                  <Globe size={16} />
                  View page
                </a>
              )}
              <Link
                to={`/events/${event.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-800 text-sm font-semibold transition-colors"
              >
                <ExternalLink size={16} />
                Public link
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 py-3 text-sm text-navy-600">
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={15} className="text-navy-400 shrink-0" />
              {dateLabel}
            </span>
            {(event.location || event.venue) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} className="text-navy-400 shrink-0" />
                {event.location || event.venue}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Ticket size={15} className="text-navy-400 shrink-0" />
              {event.visibility === 'private' ? 'Private' : 'Public'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
