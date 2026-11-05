import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Globe, MapPin, Mic } from 'lucide-react';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementDateLeaf,
  formatEngagementDateRange,
  formatEngagementLocation,
  formatRoles,
  optionLabel,
} from '../../../shared/speakingEngagements.js';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import EngagementBadge from './EngagementBadge';
import { EngagementDateBadge, EngagementPlaceholder } from './EngagementVisuals';
import { listingBadges } from './engagementBadges';
import { engagementPath } from './engagementLinks';

function Detail({ icon: Icon, children, strong = false }) {
  return (
    <p className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
      <span className={strong ? 'font-semibold text-navy-800' : ''}>{children}</span>
    </p>
  );
}

/**
 * An upcoming engagement as a card: the photo (or a branded panel, when there
 * is no photo or it fails to load) with the date floating over its edge, then
 * the type, any label that sets it apart, the title, role and place. Everything
 * else is on the engagement's own page. The title is the one link, stretched
 * over the card. Pass linked={false} where there is no page to open, such as
 * the admin preview of a draft.
 */
export default function EngagementGridCard({ engagement, headingLevel = 'h3', linked = true }) {
  const Heading = headingLevel;
  const to = linked ? engagementPath(engagement) : '';
  const leaf = formatEngagementDateLeaf(engagement);
  // An undated cancellation will never get a date, so it never promises one.
  const cancelledUndated = !leaf && engagement.event_status === 'cancelled';
  const dateText = cancelledUndated ? '' : formatEngagementDateRange(engagement);
  // City and country only; the venue is on the engagement's page.
  const place = formatEngagementLocation({ ...engagement, venue: null });
  const roles = formatRoles(engagement.roles);
  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type);
  const badges = listingBadges(engagement);
  const image = engagement.image_url ? resolveMediaUrl(engagement.image_url) : '';
  // A photo that fails to load (moved, deleted, offline) gives way to the branded panel.
  const [failedImage, setFailedImage] = useState('');
  const showImage = Boolean(image) && failedImage !== image;

  // Forced-colours mode drops rings, so the link also keeps a transparent
  // outline (outline-hidden) that the system then draws in its focus colour.
  const linkedClasses = to
    ? 'group hover:border-cyan-300 hover:shadow-lg motion-safe:hover:-translate-y-1 has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-cyan-700 has-[a.card-link:focus-visible]:ring-offset-2'
    : '';

  return (
    <article
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-sm motion-safe:transition ${linkedClasses}`}
      data-linked={to ? 'true' : 'false'}
    >
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-navy-900">
        {showImage ? (
          <>
            <img
              src={image}
              alt={engagement.image_alt || ''}
              onError={() => setFailedImage(image)}
              // Portraits: keep faces in view rather than centring on the middle.
              className="absolute inset-0 h-full w-full object-cover object-[50%_25%] motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.04]"
            />
            {/* A soft shade along the bottom, where the date sits. */}
            <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-navy-950/40 to-transparent" aria-hidden="true" />
          </>
        ) : (
          <EngagementPlaceholder eventType={engagement.event_type} />
        )}
        {engagement.in_progress && (
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-700 via-cyan-500 to-cyan-300" aria-hidden="true" />
        )}
      </div>

      {/* Long unbroken text (pasted links, email addresses) wraps instead of widening the card. */}
      <div className={`flex flex-1 flex-col px-5 pb-5 wrap-anywhere ${cancelledUndated ? 'pt-4' : ''}`}>
        {!cancelledUndated && <EngagementDateBadge leaf={leaf} className="relative -mt-10 mb-3 self-start" />}

        {(eventType || badges.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {eventType && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">{eventType}</p>
            )}
            {badges.map((badge) => <EngagementBadge key={badge.label} tone={badge.tone}>{badge.label}</EngagementBadge>)}
          </div>
        )}

        <Heading className="mt-1.5 text-[17px] font-bold leading-snug text-navy-900">
          {to ? (
            <Link
              to={to}
              // The page can show the engagement straight away while it fetches the latest.
              state={{ engagement }}
              className="card-link rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus:outline-hidden group-hover:text-cyan-800 dark:group-hover:text-cyan-300"
            >
              {engagement.event_title}
            </Link>
          ) : (
            engagement.event_title
          )}
        </Heading>

        {/* The date on the badge is only for sighted visitors. */}
        {dateText && <p className="sr-only">{dateText}</p>}

        {(roles || place) && (
          <div className="mt-3 space-y-1.5 text-sm leading-snug text-navy-700">
            {roles && <Detail icon={Mic} strong>{roles}</Detail>}
            {place && <Detail icon={engagement.attendance_format === 'online' ? Globe : MapPin}>{place}</Detail>}
          </div>
        )}

        {to && (
          // The link's name is the title; this only says where it leads. It
          // sits at the bottom, so it lines up across a row of cards.
          <div className="mt-auto pt-4" aria-hidden="true">
            <div className="flex items-center justify-between border-t border-navy-100 pt-4 text-sm font-semibold text-cyan-800 dark:text-cyan-300">
              View details
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-cyan-800 transition-colors group-hover:bg-cyan-700 group-hover:text-white dark:bg-cyan-500/10 dark:text-cyan-300">
                <ArrowRight size={15} className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
