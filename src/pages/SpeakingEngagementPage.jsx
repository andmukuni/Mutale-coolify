import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Globe, MapPin, Mic, RefreshCw } from 'lucide-react';
import EngagementBadge from '../components/speaking/EngagementBadge';
import { EngagementDateBadge, EngagementPlaceholder } from '../components/speaking/EngagementVisuals';
import SpeakingCta from '../components/speaking/SpeakingCta';
import SpeakingEngagementDetails from '../components/speaking/SpeakingEngagementDetails';
import { engagementBadges } from '../components/speaking/engagementBadges';
import { useSpeakingCopy } from '../components/speaking/useSpeakingListings';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementDateLeaf,
  formatEngagementDateRange,
  formatEngagementLocation,
  formatRoles,
  optionLabel,
} from '../../shared/speakingEngagements.js';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { fetchPublicSpeakingEngagement } from '../utils/speakingApi';

const BACK_LINK = 'inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-cyan-300 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900';

/** Back to the page that lists the engagement: the Speaking page for upcoming ones, the past page for the rest. */
function backLink(engagement) {
  if (engagement?.section === 'previous' || engagement?.section === 'cancelled') {
    return { to: '/speaking/past', label: 'All past engagements' };
  }
  if (engagement?.section === 'tba') return { to: '/speaking/past', label: 'More speaking engagements' };
  return { to: '/speaking', label: 'All speaking engagements' };
}

function Fact({ icon: Icon, children, strong = false }) {
  return (
    <li className="flex items-start gap-2">
      <Icon size={17} className="mt-0.5 shrink-0 text-cyan-300" aria-hidden="true" />
      <span className={strong ? 'font-semibold text-white' : ''}>{children}</span>
    </li>
  );
}

/**
 * The banner: the way back, the type and labels, the title and the key facts
 * (dates, place, Mutale's role), beside the photo with the date floating over
 * it, as on the cards. Without a photo, wide screens show the same branded
 * panel as the cards; phones skip it, as the facts already give the date.
 */
function Header({ engagement }) {
  const back = backLink(engagement);
  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement?.event_type);
  const badges = engagement ? engagementBadges(engagement) : [];
  const roles = formatRoles(engagement?.roles);
  const leaf = engagement ? formatEngagementDateLeaf(engagement) : null;
  const cancelledUndated = engagement && !leaf && engagement.event_status === 'cancelled';
  const dateText = engagement && !cancelledUndated ? formatEngagementDateRange(engagement) : '';
  // City and country here; the venue is in the details below.
  const place = engagement ? formatEngagementLocation({ ...engagement, venue: null }) : '';
  const image = engagement?.image_url ? resolveMediaUrl(engagement.image_url) : '';
  const [failedImage, setFailedImage] = useState('');
  const showImage = Boolean(image) && failedImage !== image;

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-cyan-900 text-white">
      <span className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10" aria-hidden="true" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center lg:gap-12">
        <div className="min-w-0 wrap-anywhere">
          <Link to={back.to} className={BACK_LINK}>
            <ArrowLeft size={16} aria-hidden="true" />
            {back.label}
          </Link>
          {engagement ? (
            <>
              {(eventType || badges.length > 0) && (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {eventType && <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">{eventType}</p>}
                  {badges.map((badge) => <EngagementBadge key={badge.label} tone={badge.tone}>{badge.label}</EngagementBadge>)}
                </div>
              )}
              <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">{engagement.event_title}</h1>
              {(dateText || place || roles) && (
                <ul className="mt-6 flex flex-col gap-2.5 text-base text-navy-100 sm:flex-row sm:flex-wrap sm:gap-x-7">
                  {dateText && <Fact icon={CalendarDays} strong>{dateText}</Fact>}
                  {place && <Fact icon={engagement.attendance_format === 'online' ? Globe : MapPin}>{place}</Fact>}
                  {roles && <Fact icon={Mic}>{roles}</Fact>}
                </ul>
              )}
            </>
          ) : (
            <h1 className="mt-6 text-3xl sm:text-4xl font-bold leading-tight">Speaking engagement</h1>
          )}
        </div>

        {engagement && (
          <div className={`relative ${showImage ? '' : 'hidden lg:block'}`}>
            <div className="relative aspect-[16/9] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15 lg:aspect-[4/3]">
              {showImage ? (
                <img
                  src={image}
                  alt={engagement.image_alt || ''}
                  onError={() => setFailedImage(image)}
                  className="absolute inset-0 h-full w-full object-cover object-[50%_25%]"
                />
              ) : (
                <EngagementPlaceholder eventType={engagement.event_type} large />
              )}
            </div>
            {!cancelledUndated && <EngagementDateBadge leaf={leaf} className="absolute -bottom-5 left-5" />}
          </div>
        )}
      </div>
    </section>
  );
}

function Message({ children, action }) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-6 text-center sm:p-8" role="alert">
      <p className="text-navy-700">{children}</p>
      {action}
    </div>
  );
}

/** One published speaking engagement: /speaking/:id. */
export default function SpeakingEngagementPage() {
  const { id } = useParams();
  const { state } = useLocation();
  // Opened from a card, the engagement shows at once; the latest copy replaces it when it arrives.
  const passed = state?.engagement?.id === id ? state.engagement : null;
  const [result, setResult] = useState({ id, status: passed ? 'ready' : 'loading', engagement: passed });
  const [attempt, setAttempt] = useState(0);

  // A different engagement (or a retry) starts over, keeping only what the card passed for it.
  if (result.id !== id) setResult({ id, status: passed ? 'ready' : 'loading', engagement: passed });

  useEffect(() => {
    let cancelled = false;
    fetchPublicSpeakingEngagement(id)
      .then((engagement) => {
        if (cancelled) return;
        setResult({ id, status: engagement ? 'ready' : 'missing', engagement });
      })
      .catch(() => {
        if (cancelled) return;
        // Keep showing what the card passed rather than replacing it with an error.
        setResult((prev) => (prev.engagement ? prev : { id, status: 'error', engagement: null }));
      });
    return () => { cancelled = true; };
  }, [id, attempt]);

  const retry = () => {
    setResult({ id, status: 'loading', engagement: null });
    setAttempt((n) => n + 1);
  };

  const { status, engagement } = result;
  const { page, text, visibility } = useSpeakingCopy();

  return (
    <div className="bg-navy-50 min-h-[60vh]">
      <Header engagement={status === 'ready' ? engagement : null} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <p className="sr-only" role="status">{status === 'loading' ? 'Loading the speaking engagement…' : ''}</p>
        {status === 'loading' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden="true">
            <div className="space-y-6">
              <div className="h-32 rounded-2xl border border-navy-100 bg-white animate-pulse motion-reduce:animate-none" />
              <div className="h-48 rounded-2xl border border-navy-100 bg-white animate-pulse motion-reduce:animate-none" />
            </div>
            <div className="h-72 rounded-2xl border border-navy-100 bg-white animate-pulse motion-reduce:animate-none" />
          </div>
        )}
        {status === 'ready' && <SpeakingEngagementDetails engagement={engagement} />}
        {status === 'missing' && (
          <Message
            action={(
              <Link to="/speaking" className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10">
                See all speaking engagements
              </Link>
            )}
          >
            This speaking engagement isn’t available. It may have been moved or taken down.
          </Message>
        )}
        {status === 'error' && (
          <Message
            action={(
              <button
                type="button"
                onClick={retry}
                className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
              >
                <RefreshCw size={15} aria-hidden="true" />
                Try again
              </button>
            )}
          >
            This speaking engagement couldn’t be loaded right now.
          </Message>
        )}
      </div>
      {visibility['speaking.cta'] !== false && <SpeakingCta page={page} text={text} />}
    </div>
  );
}
