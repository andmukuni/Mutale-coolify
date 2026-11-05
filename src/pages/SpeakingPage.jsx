import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, Download } from 'lucide-react';
import defaultPortrait from '../assets/mutale-navy-suit-and-tie.png';
import PageHeaderBackdrop from '../components/PageHeaderBackdrop';
import { SLIDE_WIDTH } from '../components/speaking/carouselLayout';
import EngagementCarousel from '../components/speaking/EngagementCarousel';
import ListingsLoadError from '../components/speaking/ListingsLoadError';
import SpeakingCta from '../components/speaking/SpeakingCta';
import { parseSpeakingFormats } from '../components/speaking/speakingFormats';
import { useSpeakingCopy, useSpeakingListings } from '../components/speaking/useSpeakingListings';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { trackSpeaking } from '../utils/speakingMetrics';

// The enquiry form has its own page; links to where it used to be on this one are sent there.
const INVITE_PATH = '/speaking/invite';
const OLD_INVITE_ANCHOR = '#invite';
const PAST_PATH = '/speaking/past';
const UPCOMING_HEADING = 'speaking-upcoming';

/** `focusable` lets the page move focus to the heading (it never joins the tab order). */
function SectionHeading({ eyebrow, title, id, focusable = false }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">{eyebrow}</p>}
      <h2
        id={id}
        tabIndex={focusable ? -1 : undefined}
        className={`mt-1 text-2xl sm:text-3xl font-bold text-navy-900 ${focusable ? 'focus:outline-none' : ''}`}
      >
        {title}
      </h2>
    </div>
  );
}

// Shaped like the carousel: as many cards as it shows at each width.
// Announced through the section's status line, which is always present.
const SKELETON_SHOWN = ['', 'hidden sm:block', 'hidden lg:block', 'hidden xl:block'];
function LoadingCards() {
  return (
    <div className="flex gap-4 overflow-hidden sm:gap-5" aria-hidden="true">
      {SKELETON_SHOWN.map((shown, key) => (
        <div
          key={key}
          className={`h-96 w-full shrink-0 rounded-2xl border border-navy-100 bg-white animate-pulse motion-reduce:animate-none ${SLIDE_WIDTH} ${shown}`}
        />
      ))}
    </div>
  );
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** What the "Where I've Spoken" page holds, e.g. "10 past engagements · 2 with dates to be announced". */
function pastSummary({ previous = [], tba = [], cancelled = [] }) {
  return [
    previous.length > 0 && plural(previous.length, 'past engagement', 'past engagements'),
    tba.length > 0 && `${tba.length} with dates to be announced`,
    cancelled.length > 0 && `${cancelled.length} cancelled`,
  ].filter(Boolean).join(' · ');
}

/** The way to everything that isn't coming up with a date, shown only when there is something there. */
function PastEngagementsLink({ data, text }) {
  const summary = pastSummary(data);
  if (!summary) return null;
  return (
    <Link
      to={PAST_PATH}
      className="group flex items-center justify-between gap-4 rounded-2xl border border-navy-100 bg-white px-5 py-4 transition-colors hover:border-cyan-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 sm:px-6 sm:py-5"
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">{text('previousEyebrow')}</span>
        <span className="mt-1 block text-lg sm:text-xl font-bold text-navy-900 group-hover:text-cyan-800 dark:group-hover:text-cyan-300">{text('previousTitle')}</span>
        <span className="mt-0.5 block text-sm text-navy-600">{summary}</span>
      </span>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-navy-200 text-navy-900 transition-colors group-hover:border-cyan-300 group-hover:text-cyan-800 dark:group-hover:text-cyan-300"
        aria-hidden="true"
      >
        <ArrowRight size={18} className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export default function SpeakingPage() {
  const { hash } = useLocation();
  if (hash === OLD_INVITE_ANCHOR) return <Navigate to={INVITE_PATH} replace />;
  return <SpeakingListings />;
}

function SpeakingListings() {
  const { page, text, visibility } = useSpeakingCopy();
  const { result, retry, retryButton } = useSpeakingListings(UPCOMING_HEADING);

  // The download button and quote appear only once provided; the portrait
  // falls back to the approved photo used on the homepage.
  const profileFile = String(page.speakerProfileFile || '').trim();
  const uploadedPortrait = String(page.heroPortraitImage || '').trim();
  const portrait = uploadedPortrait ? resolveMediaUrl(uploadedPortrait) : defaultPortrait;
  const portraitAlt = text('heroPortraitAlt');
  const quote = String(page.heroQuote || '').trim();
  const formats = parseSpeakingFormats(page.formats);
  const showFormats = visibility['speaking.formats'] !== false && formats.length > 0;
  const showCta = visibility['speaking.cta'] !== false;

  // Past, undated and cancelled engagements are on their own page, linked from here.
  const upcoming = result.data?.upcoming || [];

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-cyan-900 text-white">
        <PageHeaderBackdrop image={page.heroBackgroundImage} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 grid gap-10 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">{text('heroEyebrow')}</p>
            <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">{text('heroTitle')}</h1>
            <p className="mt-4 max-w-2xl text-base sm:text-lg leading-relaxed text-navy-200">{text('heroText')}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to={INVITE_PATH}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
              >
                {text('primaryButtonLabel')}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              {profileFile && (
                <a
                  href={resolveMediaUrl(profileFile)}
                  download
                  onClick={() => trackSpeaking('profile_download')}
                  aria-label={`${text('profileButtonLabel')} (PDF)`}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/50 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
                >
                  <Download size={16} aria-hidden="true" />
                  {text('profileButtonLabel')}
                </a>
              )}
            </div>
          </div>

          {/* Only on wide screens, where the heading still fits on one line beside it; smaller screens reach the listings sooner. */}
          <figure className="hidden xl:flex items-end gap-6 justify-self-end">
            <img
              src={portrait}
              alt={portraitAlt}
              className="h-60 w-auto max-w-[16rem] rounded-2xl object-cover"
            />
            {quote && (
              <figcaption className="max-w-[12rem] text-lg italic leading-snug text-cyan-100">“{quote}”</figcaption>
            )}
          </figure>
        </div>
      </section>

      {showFormats && (
        <section aria-label="Speaking formats" className="bg-white border-b border-navy-100">
          {/* Compact on phones (titles only) so the listings stay near the top. */}
          <ul className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-5 lg:grid-cols-4">
            {formats.map(({ title, description, Icon }) => (
              <li key={title} className="flex items-center gap-2 sm:items-start sm:gap-3">
                <span className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-300">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm sm:text-base font-semibold text-navy-900">{title}</span>
                  {description && <span className="hidden sm:block text-sm text-navy-600">{description}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
          <section aria-labelledby={UPCOMING_HEADING}>
            <SectionHeading id={UPCOMING_HEADING} eyebrow={text('upcomingEyebrow')} title={text('upcomingTitle')} focusable />
            <p className="sr-only" role="status">
              {result.status === 'loading' ? 'Loading speaking engagements…' : ''}
            </p>
            {result.status === 'loading' && <LoadingCards />}
            {result.status === 'error' && <ListingsLoadError onRetry={retry} buttonRef={retryButton} />}
            {result.status === 'ready' && (
              upcoming.length > 0 ? (
                <EngagementCarousel engagements={upcoming} />
              ) : (
                <p className="rounded-2xl border border-dashed border-navy-200 bg-white px-6 py-10 text-center text-navy-600">
                  {text('emptyMessage')}
                </p>
              )
            )}
          </section>

          {result.status === 'ready' && <PastEngagementsLink data={result.data || {}} text={text} />}
        </div>
      </div>

      {showCta && <SpeakingCta page={page} text={text} />}
    </div>
  );
}
