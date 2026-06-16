import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, MapPin, Users, Tag, ArrowLeft,
  CheckCircle, AlertCircle, Globe, Ticket, User, Video, Mic, Handshake, MessageSquare
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUserAuth } from '../context/UserAuthContext';
import { useBooking } from '../context/BookingContext';
import { useCurrency } from '../context/CurrencyContext';
import {
  checkEventAvailability,
  getEventDisplayStatus,
  isEventPubliclyVisible,
} from '../utils/eventServices';
import { formatDate, formatTime } from '../utils/helpers';
import { resolveUserBearerToken } from '../utils/authHeaders';
import BookingModal from '../components/BookingModal';
import EventMerchStrip from '../components/EventMerchStrip';
import EventForumPanel from '../components/EventForumPanel';
import StatusBadge from '../components/ui/StatusBadge';

export default function EventDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { events, isDataLoaded } = useData();
  const { currentUser, isUserAuthenticated } = useUserAuth();
  const { getEventRegistrationCount, isUserRegistered, registrations } = useBooking();
  const {
    formatEventPrice,
  } = useCurrency();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSession, setBookingSession] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const event = events.find(e => e.slug === slug);

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
        <Link to="/events" className="text-cyan-600 hover:underline text-sm">
          ← Back to Events
        </Link>
      </div>
    );
  }

  const regCount = getEventRegistrationCount(event.id);
  const spotsLeft = event.capacity ? Math.max(0, event.capacity - regCount) : null;
  const displayStatus = getEventDisplayStatus(event);
  const listingAvailability = checkEventAvailability(event, registrations, currentUser?.id, 'subscription', {
    skipDuplicateCheck: true,
  });
  const canRegisterMore = spotsLeft === null || spotsLeft > 0;
  const userAlreadyRegistered = isUserRegistered(currentUser?.id, event.id, 'subscription');

  const inferredMode =
    event.event_mode
    || (String(event.location || '').toLowerCase().includes('virtual') ? 'virtual' : 'in_person');

  const startAt = getEventStartDateTime(event);
  const countdown = getCountdown(startAt, now);
  const isMeetingAccessDay = isOnEventDay(now, event);

  const featuredSpeakersList = parseFeaturedSpeakers(event.featured_speakers).filter(
    (s) => speakerHasAnyDetail(s),
  );

  const handleBookClick = () => {
    if (!isUserAuthenticated || !resolveUserBearerToken()) {
      navigate('/account/login', { state: { from: { pathname: `/events/${slug}` } } });
      return;
    }
    setBookingSession((prev) => prev + 1);
    setBookingOpen(true);
  };

  return (
    <div className="bg-navy-50 min-h-screen">
      {/* Hero banner */}
      <section className="relative overflow-hidden bg-navy-950">
        {event.cover_image && (
          <img
            src={event.cover_image}
            alt={event.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/80 to-navy-900/60" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_45%)]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-14 sm:pt-14 sm:pb-20">
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-sm text-navy-300 hover:text-cyan-300 transition-colors mb-6"
          >
            <ArrowLeft size={15} />
            Back to Events
          </Link>

          <div className="flex flex-wrap gap-2 mb-4">
            <StatusBadge status={displayStatus} size="md" />
            {event.category && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-cyan-500/15 text-cyan-300 px-2.5 py-1 rounded-full border border-cyan-500/20">
                <Tag size={11} />
                {event.category}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/20 capitalize">
              <Video size={11} />
              {inferredMode === 'in_person' ? 'In person' : inferredMode}
            </span>
            <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${event.is_free ? 'bg-green-500/15 text-green-300 border-green-500/20' : 'bg-amber-500/15 text-amber-300 border-amber-500/20'}`}>
              {formatEventPrice(event)}
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-4 max-w-4xl leading-tight">
            {event.title}
          </h1>
          <p className="text-navy-200 text-base sm:text-lg max-w-3xl leading-relaxed mb-8">
            {event.short_description || event.description}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl">
            <HeroMetric label="Date" value={formatDate(event.start_date || event.date)} icon={Calendar} />
            <HeroMetric label="Time" value={event.start_time ? formatTime(event.start_time) : 'TBA'} icon={Clock} />
            <HeroMetric label="Location" value={event.location || 'TBA'} icon={MapPin} />
            <HeroMetric
              label="Spots"
              value={event.capacity ? `${Math.max(0, spotsLeft || 0)} left` : 'Unlimited'}
              icon={Users}
            />
          </div>
        </div>
      </section>

      {/* Main content */}
  <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 pb-28 sm:pb-14">
        <div className="grid lg:grid-cols-3 gap-8 lg:gap-10 items-start">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-navy-100 p-6 sm:p-8 shadow-sm">
              <h2 className="text-xl font-bold text-navy-900 mb-4">About this event</h2>
              <div className="prose prose-sm max-w-none text-navy-600 leading-relaxed space-y-3">
                {(event.description || '').split('\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>

            {event.organizer_name && (
              <div className="bg-white rounded-2xl border border-navy-100 p-6 sm:p-8 shadow-sm">
                <h2 className="text-xl font-bold text-navy-900 mb-4">Organizer</h2>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center shrink-0">
                    <User size={18} className="text-cyan-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-navy-900">{event.organizer_name}</p>
                    {event.organizer_email && (
                      <a
                        href={`mailto:${event.organizer_email}`}
                        className="text-sm text-cyan-600 hover:underline"
                      >
                        {event.organizer_email}
                      </a>
                    )}
                    {event.organizer_phone && (
                      <p className="text-sm text-navy-500 mt-0.5">{event.organizer_phone}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Featured Speakers */}
            {featuredSpeakersList.length > 0 && (
              <div className="bg-white rounded-2xl border border-navy-100 p-6 sm:p-8 shadow-sm">
                <h2 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <Mic size={20} className="text-cyan-600" /> Featured Speakers
                </h2>
                <div className="space-y-4">
                  {featuredSpeakersList.map((speaker, idx) => {
                    const displayName = speakerDisplayName(speaker);
                    const organisation = speakerOrganisation(speaker);
                    const roleTitle = speakerTitle(speaker);
                    const bio = speakerBio(speaker);

                    return (
                      <div
                        key={idx}
                        className="flex gap-4 rounded-xl border border-navy-100 bg-navy-50/50 p-4 sm:p-5"
                      >
                        {speaker.photo ? (
                          <img
                            src={speaker.photo}
                            alt={displayName || 'Speaker'}
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm"
                          />
                        ) : (
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm">
                            <User size={22} className="text-indigo-600" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-2">
                          <h3 className="text-base font-bold text-navy-900 leading-snug">
                            {displayName || 'Speaker'}
                          </h3>

                          <dl className="space-y-1.5 text-sm">
                            {organisation ? (
                              <div className="flex flex-col sm:flex-row sm:gap-2 sm:items-baseline">
                                <dt className="text-navy-400 text-xs font-semibold uppercase tracking-wide shrink-0">
                                  Organisation
                                </dt>
                                <dd className="text-navy-800 font-medium">{organisation}</dd>
                              </div>
                            ) : null}
                            {roleTitle ? (
                              <div className="flex flex-col sm:flex-row sm:gap-2 sm:items-baseline">
                                <dt className="text-navy-400 text-xs font-semibold uppercase tracking-wide shrink-0">
                                  Role
                                </dt>
                                <dd className="text-cyan-700 font-semibold">{roleTitle}</dd>
                              </div>
                            ) : null}
                          </dl>

                          {bio ? (
                            <div className="pt-2 border-t border-navy-100/90">
                              <p className="text-xs font-semibold text-navy-400 uppercase tracking-wide mb-1">
                                About
                              </p>
                              <p className="text-sm text-navy-600 leading-relaxed whitespace-pre-line">
                                {bio}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Event Partners */}
            {Array.isArray(event.partners) && event.partners.length > 0 && (
              <div className="bg-white rounded-2xl border border-navy-100 p-6 sm:p-8 shadow-sm">
                <h2 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <Handshake size={20} className="text-cyan-600" /> Event Partners
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {event.partners.map((partner, idx) => (
                    <a
                      key={idx}
                      href={partner.website || '#'}
                      target={partner.website ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-navy-100 hover:border-cyan-200 hover:bg-cyan-50/50 transition-colors text-center"
                    >
                      {partner.logo ? (
                        <img src={partner.logo} alt={partner.name} className="h-10 max-w-[120px] object-contain" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-navy-100 flex items-center justify-center">
                          <Handshake size={18} className="text-navy-400" />
                        </div>
                      )}
                      <span className="text-sm font-medium text-navy-700">{partner.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — sticky action card */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-navy-100 shadow-sm p-6 lg:sticky lg:top-24">
              <h3 className="font-bold text-navy-900 mb-4">Event Details</h3>

              <div className="mb-5 p-4 rounded-xl border border-cyan-200 bg-cyan-50/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 mb-2">
                  Starts in
                </p>
                {countdown ? (
                  <div className="grid grid-cols-4 gap-2">
                    <TimeChip label="Days" value={countdown.days} />
                    <TimeChip label="Hours" value={countdown.hours} />
                    <TimeChip label="Mins" value={countdown.minutes} />
                    <TimeChip label="Secs" value={countdown.seconds} />
                  </div>
                ) : displayStatus === 'ongoing' ? (
                  <p className="text-sm font-semibold text-green-700">Live now</p>
                ) : (
                  <p className="text-sm text-navy-600">Event already started</p>
                )}
              </div>

              <div className="space-y-3 mb-6">
                <DetailRow icon={Clock} label="Countdown">
                  {countdown ? (
                    <span className="font-semibold text-cyan-700 tabular-nums">
                      {countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s
                    </span>
                  ) : displayStatus === 'ongoing' ? (
                    <span className="font-semibold text-green-700">Live now</span>
                  ) : (
                    <span className="text-navy-500">Event already started</span>
                  )}
                </DetailRow>

                {inferredMode !== 'in_person' && (
                  <DetailRow icon={Video} label="Meeting access">
                    {isMeetingAccessDay ? (
                      <div className="space-y-1.5">
                        {userAlreadyRegistered ? (
                          <Link
                            to={`/events/${slug}/join`}
                            className="inline-flex items-center gap-1.5 text-cyan-700 hover:text-cyan-600 hover:underline font-medium"
                          >
                            Join online meeting
                          </Link>
                        ) : (
                          <span className="text-navy-500 text-sm">Register first to unlock secure join access.</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-navy-500">
                        Meeting link is available on the event day ({formatDate(event.start_date || event.date)}).
                      </span>
                    )}
                  </DetailRow>
                )}

                {event.capacity && (
                  <DetailRow icon={Users} label="Capacity">
                    <div className="space-y-0.5">
                      {spotsLeft === 0 ? (
                        <p className="text-red-600 font-medium">Fully booked</p>
                      ) : (
                        <p className="text-emerald-700 font-medium">
                          {spotsLeft !== null ? `${spotsLeft} spots left` : 'Open'}
                        </p>
                      )}
                      <p className="text-navy-500 text-sm">
                        Registered: <span className="font-semibold text-navy-700">{regCount}</span>
                        <span className="text-navy-400"> / {event.capacity}</span>
                      </p>
                    </div>
                  </DetailRow>
                )}

                {event.registration_deadline && (
                  <DetailRow icon={Globe} label="Deadline">
                    {formatDate(event.registration_deadline)}
                  </DetailRow>
                )}
              </div>

              {isUserAuthenticated && userAlreadyRegistered && (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                    <CheckCircle size={16} className="shrink-0" />
                    You&rsquo;re already registered for this event.
                  </div>
                  {event.forum_enabled && (
                    <Link
                      to={`/events/${slug}/forum`}
                      className="w-full inline-flex items-center justify-center gap-2 bg-white border border-cyan-200 hover:bg-cyan-50 text-cyan-800 font-medium py-3 rounded-xl transition-colors"
                    >
                      <MessageSquare size={15} />
                      Open Event Forum
                    </Link>
                  )}
                  {inferredMode !== 'in_person' && (
                    <Link
                      to={`/events/${slug}/join`}
                      className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition-colors"
                    >
                      <Video size={15} />
                      Join Meeting
                    </Link>
                  )}
                </div>
              )}

              {!listingAvailability.canBook && !userAlreadyRegistered && (
                <div className="flex items-start gap-2 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 mb-4">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  {listingAvailability.reason}
                </div>
              )}

              {listingAvailability.canBook && canRegisterMore && !userAlreadyRegistered && (
                <div className="space-y-2 hidden sm:block">
                  <button
                    onClick={handleBookClick}
                    className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-3 rounded-xl transition-colors"
                  >
                    <Ticket size={15} />
                    Register Now
                  </button>
                </div>
              )}

              {!isUserAuthenticated && (
                <p className="text-xs text-navy-400 mt-3 text-center">
                  <Link to="/account/login" state={{ from: { pathname: `/events/${slug}` } }} className="text-cyan-600 hover:underline">
                    Sign in
                  </Link>{' '}
                  or{' '}
                  <Link to="/account/register" state={{ from: { pathname: `/events/${slug}` } }} className="text-cyan-600 hover:underline">
                    create an account
                  </Link>{' '}
                  to register.
                </p>
              )}

              <Link
                to="/account/my-events"
                className="block text-center text-xs text-navy-400 hover:text-cyan-600 transition-colors mt-4"
              >
                View My Events →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Event merchandise (products linked to this event) */}
      <EventMerchStrip eventId={event.id} eventTitle={event.title} />

      {event.forum_enabled && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <EventForumPanel
            event={event}
            compact
            loginPath={`/account/login`}
          />
        </section>
      )}

      {listingAvailability.canBook && canRegisterMore && !userAlreadyRegistered && (
        <div className="sm:hidden fixed bottom-3 left-3 right-3 z-20 bg-white/95 backdrop-blur rounded-2xl border border-navy-100 p-3 shadow-lg">
          <button
            onClick={handleBookClick}
            className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-3 rounded-xl transition-colors"
          >
            <Ticket size={15} />
            Register Now
          </button>
        </div>
      )}

      {/* Booking modal */}
      <BookingModal
        key={`${event.id}-${bookingSession}`}
        event={event}
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
      />
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm px-3.5 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-cyan-200 mb-1">
        <Icon size={13} className="text-cyan-300" />
        {label}
      </div>
      <p className="text-sm font-semibold text-white line-clamp-2">{value}</p>
    </div>
  );
}

// ─── Small helper sub-component ─────────────────────────────────────────────
function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 p-1.5 rounded-lg bg-navy-50 text-navy-400 shrink-0">
        <Icon size={14} />
      </div>
      <div className="text-sm">
        <span className="text-navy-400 text-xs block">{label}</span>
        <div className="text-navy-700 leading-snug mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function getEventStartDateTime(event) {
  const datePart = event?.start_date || event?.date;
  if (!datePart) return null;

  const timePart = event?.start_time || event?.time || '00:00';
  const normalizedTime = timePart.length === 5 ? `${timePart}:00` : timePart;
  const dt = new Date(`${datePart}T${normalizedTime}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getCountdown(startAt, now) {
  if (!startAt) return null;
  const diff = startAt.getTime() - now.getTime();
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds };
}

function isOnEventDay(now, event) {
  const start = new Date(event?.start_date || event?.date);
  const end = new Date(event?.end_date || event?.start_date || event?.date);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end;
}

function TimeChip({ label, value }) {
  return (
    <div className="rounded-lg bg-white border border-cyan-100 px-2 py-2 text-center">
      <div className="text-base font-bold text-cyan-800 tabular-nums">{String(value).padStart(2, '0')}</div>
      <div className="text-[10px] uppercase tracking-wide text-cyan-600">{label}</div>
    </div>
  );
}

/** Some API paths return JSON as a string; speakers may use alternate keys. */
function parseFeaturedSpeakers(raw) {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function speakerOrganisation(speaker) {
  if (!speaker || typeof speaker !== 'object') return '';
  const v =
    speaker.organisation
    ?? speaker.organization
    ?? speaker.company
    ?? speaker.institution
    ?? speaker.affiliation
    ?? '';
  return String(v || '').trim();
}

function speakerTitle(speaker) {
  if (!speaker || typeof speaker !== 'object') return '';
  const v = speaker.title ?? speaker.role ?? speaker.position ?? '';
  return String(v || '').trim();
}

function speakerDisplayName(speaker) {
  if (!speaker || typeof speaker !== 'object') return '';
  return String(speaker.name ?? speaker.full_name ?? '').trim();
}

function speakerBio(speaker) {
  if (!speaker || typeof speaker !== 'object') return '';
  return String(speaker.bio ?? speaker.description ?? '').trim();
}

function speakerHasAnyDetail(speaker) {
  if (!speaker || typeof speaker !== 'object') return false;
  return Boolean(
    speaker.photo
    || speakerDisplayName(speaker)
    || speakerOrganisation(speaker)
    || speakerTitle(speaker)
    || speakerBio(speaker),
  );
}
