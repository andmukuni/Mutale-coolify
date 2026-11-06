import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Globe, MapPin, Mic } from 'lucide-react';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementDateLeaf,
  formatEngagementDateRange,
  formatEngagementLocation,
  formatRoles,
  optionLabel,
} from '../../../shared/speakingEngagements.js';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { fetchPublicSpeakingEngagements } from '../../utils/speakingApi';
import EngagementBadge from './EngagementBadge';
import { EngagementDateBadge, EngagementPlaceholder } from './EngagementVisuals';
import { listingBadges } from './engagementBadges';
import { engagementPath } from './engagementLinks';
import { countdownLabel, pickNextEngagement } from './nextEngagement';

const PRIMARY_BUTTON = 'group inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition duration-300 ease-out hover:bg-cyan-800 hover:shadow-xl motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900';
const GHOST_BUTTON = 'group inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition duration-300 ease-out hover:border-white/45 hover:bg-white/20 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900';
const ARROW_NUDGE = 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:translate-x-1';

function Fact({ icon: Icon, children, strong = false }) {
  return (
    <li className="flex items-start gap-2">
      <Icon size={18} className="mt-0.5 shrink-0 text-cyan-300" aria-hidden="true" />
      <span className={strong ? 'font-semibold text-white' : ''}>{children}</span>
    </li>
  );
}

/**
 * Homepage feature for the single next speaking engagement: a banner with the
 * event's title, when and where, Mutale's role and session, its photo with the
 * date floating over it, and the ways on to its page and to the rest of what's
 * coming up. Renders nothing until there is a confirmed engagement to show.
 */
export default function NextSpeakingEngagement({ eyebrow, title, linkLabel }) {
  const [state, setState] = useState({ engagement: null, more: 0 });
  const [failedImage, setFailedImage] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchPublicSpeakingEngagements()
      .then((data) => {
        if (cancelled) return;
        const engagement = pickNextEngagement(data);
        // The others listed on the Speaking page, which the second button opens.
        const others = (data?.upcoming || []).length - (engagement ? 1 : 0);
        setState({ engagement, more: Math.max(0, others) });
      })
      // The homepage reads fine without it.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const { engagement, more } = state;
  if (!engagement) return null;

  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type);
  const badges = listingBadges(engagement);
  const leaf = formatEngagementDateLeaf(engagement);
  const dateText = formatEngagementDateRange(engagement);
  // City and country here; the venue is on the engagement's page.
  const place = formatEngagementLocation({ ...engagement, venue: null });
  const roles = formatRoles(engagement.roles);
  const countdown = countdownLabel(engagement);
  const image = engagement.image_url ? resolveMediaUrl(engagement.image_url) : '';
  const showImage = Boolean(image) && failedImage !== image;

  return (
    <section
      aria-labelledby="home-next-speaking"
      className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-cyan-900 text-white"
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-cyan-300/5" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid gap-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:gap-16 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <div className="min-w-0 wrap-anywhere">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3.5 py-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cyan-300 motion-safe:animate-pulse" />
              {/* The section's name; the event's title below is the headline. */}
              <h2 id="home-next-speaking" className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
                {title}
              </h2>
            </div>
            {countdown && (
              <span className="rounded-full bg-[#E76869]/90 px-3 py-1 text-xs font-bold text-navy-950">{countdown}</span>
            )}
          </div>

          {(eyebrow || eventType || badges.length > 0) && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {(eventType || eyebrow) && (
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">{eventType || eyebrow}</p>
              )}
              {badges.map((badge) => <EngagementBadge key={badge.label} tone={badge.tone}>{badge.label}</EngagementBadge>)}
            </div>
          )}
          <h3 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">{engagement.event_title}</h3>

          {(dateText || place || roles) && (
            <ul className="mt-6 flex flex-col gap-2.5 text-base text-navy-100 sm:flex-row sm:flex-wrap sm:gap-x-7">
              {dateText && <Fact icon={CalendarDays} strong>{dateText}</Fact>}
              {place && <Fact icon={engagement.attendance_format === 'online' ? Globe : MapPin}>{place}</Fact>}
              {roles && <Fact icon={Mic}>{roles}</Fact>}
            </ul>
          )}

          {engagement.session_title && (
            <div className="mt-7 max-w-2xl border-l-2 border-cyan-400/60 pl-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Mutale’s session</p>
              <p className="mt-1 text-lg sm:text-xl font-medium leading-snug text-white">{engagement.session_title}</p>
            </div>
          )}

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to={engagementPath(engagement)}
              // The page can show the engagement straight away while it fetches the latest.
              state={{ engagement }}
              className={PRIMARY_BUTTON}
              aria-label={`View details: ${engagement.event_title}`}
            >
              View details
              <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
            </Link>
            <Link to="/speaking" className={GHOST_BUTTON}>
              {linkLabel}
              {/* The space keeps the name from running together: "View more upcoming engagements 4 more". */}
              {more > 0 && (
                <>
                  {' '}
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">{more} more</span>
                </>
              )}
              <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
            </Link>
          </div>
        </div>

        {/* The photo, with the date floating over it; without one, wide screens show the event-type panel. */}
        <div className={`relative ${showImage ? '' : 'hidden lg:block'}`}>
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15 lg:aspect-[4/3]">
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
          {leaf && <EngagementDateBadge leaf={leaf} className="absolute -bottom-5 left-5" />}
        </div>
      </div>
    </section>
  );
}
