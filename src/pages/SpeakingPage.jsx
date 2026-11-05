import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, Download, RefreshCw } from 'lucide-react';
import defaultPortrait from '../assets/mutale-navy-suit-and-tie.png';
import PageHeaderBackdrop from '../components/PageHeaderBackdrop';
import EngagementFilters from '../components/speaking/EngagementFilters';
import EngagementCarousel from '../components/speaking/EngagementCarousel';
import { EngagementRowList } from '../components/speaking/EngagementRow';
import { listingBadges } from '../components/speaking/engagementBadges';
import {
  FILTER_THRESHOLD,
  FILTERED_SECTIONS,
  NO_FILTERS,
  applyFilters,
  filterOptions,
  hasActiveFilters,
} from '../components/speaking/engagementFilterRules';
import PastEngagementList from '../components/speaking/PastEngagementList';
import { parseSpeakingFormats } from '../components/speaking/speakingFormats';
import { useData } from '../context/DataContext';
import { defaultWebsitePages, normalizeSectionVisibility } from '../data/websitePages';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { fetchPublicSpeakingEngagements } from '../utils/speakingApi';
import { trackSpeaking } from '../utils/speakingMetrics';

// The enquiry form has its own page; links to where it used to be on this one are sent there.
const INVITE_PATH = '/speaking/invite';
const OLD_INVITE_ANCHOR = '#invite';
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

// Shaped like the carousel: one card on phones, two from 640 px.
// Announced through the section's status line, which is always present.
function LoadingCards() {
  return (
    <div className="flex gap-4 overflow-hidden sm:gap-5" aria-hidden="true">
      {[0, 1].map((key) => (
        <div
          key={key}
          className={`h-80 w-full shrink-0 rounded-2xl border border-navy-100 bg-white animate-pulse motion-reduce:animate-none sm:w-[calc((100%-1.25rem)/2)] ${key ? 'hidden sm:block' : ''}`}
        />
      ))}
    </div>
  );
}

const NO_MATCHES = 'No past engagements match these filters.';

export default function SpeakingPage() {
  const { hash } = useLocation();
  if (hash === OLD_INVITE_ANCHOR) return <Navigate to={INVITE_PATH} replace />;
  return <SpeakingListings />;
}

function SpeakingListings() {
  const { profile } = useData();
  const defaults = defaultWebsitePages.speaking;
  const page = { ...defaults, ...(profile?.websitePages?.speaking || {}) };
  const text = (key) => String(page[key] || '').trim() || defaults[key];
  const visibility = normalizeSectionVisibility(profile?.websitePages?.sectionVisibility || {});

  const [result, setResult] = useState({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState(NO_FILTERS);

  useEffect(() => {
    let cancelled = false;
    fetchPublicSpeakingEngagements()
      .then((data) => { if (!cancelled) setResult({ status: 'ready', data }); })
      .catch(() => { if (!cancelled) setResult({ status: 'error', data: null }); });
    return () => { cancelled = true; };
  }, [attempt]);

  // "Try again" disappears while the listings reload, so focus waits on the
  // section heading, and returns to the button if the load fails again.
  const retrying = useRef(false);
  const retryButton = useRef(null);
  const retry = () => {
    retrying.current = true;
    document.getElementById(UPCOMING_HEADING)?.focus();
    setResult({ status: 'loading', data: null });
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    if (result.status === 'loading' || !retrying.current) return;
    retrying.current = false;
    if (result.status === 'error') retryButton.current?.focus();
  }, [result.status]);

  // The download button and quote appear only once provided; the portrait
  // falls back to the approved photo used on the homepage.
  const profileFile = String(page.speakerProfileFile || '').trim();
  const uploadedPortrait = String(page.heroPortraitImage || '').trim();
  const portrait = uploadedPortrait ? resolveMediaUrl(uploadedPortrait) : defaultPortrait;
  const portraitAlt = String(page.heroPortraitAlt || '').trim() || defaults.heroPortraitAlt;
  const quote = String(page.heroQuote || '').trim();
  const formats = parseSpeakingFormats(page.formats);
  const showFormats = visibility['speaking.formats'] !== false && formats.length > 0;
  const showCta = visibility['speaking.cta'] !== false;

  const options = useMemo(() => filterOptions(result.data || {}), [result.data]);
  const showFilters = result.status === 'ready' && options.total >= FILTER_THRESHOLD;
  const filtering = showFilters && hasActiveFilters(filters);
  const groups = useMemo(
    () => (filtering ? applyFilters(result.data || {}, filters) : (result.data || {})),
    [filtering, result.data, filters],
  );
  const { upcoming = [], tba = [], previous = [], cancelled = [] } = groups;
  const shown = FILTERED_SECTIONS.reduce((sum, key) => sum + (groups[key] || []).length, 0);
  const nothingAhead = upcoming.length === 0 && tba.length === 0;

  // The filters sit in the first past section. That section stays while it has
  // anything to filter, so a filter that matches nothing can't take the filters
  // away with it.
  const hasPrevious = (result.data?.previous || []).length > 0;
  const hasCancelled = (result.data?.cancelled || []).length > 0;
  const noMatches = filtering && shown === 0;
  const filterBar = showFilters && (
    <div className="mb-6">
      <EngagementFilters options={options} filters={filters} onChange={setFilters} shown={shown} />
    </div>
  );
  const noMatchesNote = noMatches && (
    <p className="rounded-2xl border border-dashed border-navy-200 bg-white px-6 py-8 text-center text-navy-600">{NO_MATCHES}</p>
  );

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-12">
          <section aria-labelledby={UPCOMING_HEADING}>
            <SectionHeading id={UPCOMING_HEADING} eyebrow={text('upcomingEyebrow')} title={text('upcomingTitle')} focusable />
            <p className="sr-only" role="status">
              {result.status === 'loading' ? 'Loading speaking engagements…' : ''}
            </p>
            {result.status === 'loading' && <LoadingCards />}
            {result.status === 'error' && (
              <div className="rounded-2xl border border-navy-100 bg-white p-6 text-center" role="alert">
                <p className="text-navy-700">Speaking engagements couldn’t be loaded right now.</p>
                <button
                  ref={retryButton}
                  type="button"
                  onClick={retry}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Try again
                </button>
              </div>
            )}
            {result.status === 'ready' && (
              <>
                {upcoming.length > 0 && <EngagementCarousel engagements={upcoming} />}
                {nothingAhead && (
                  <p className="rounded-2xl border border-dashed border-navy-200 bg-white px-6 py-10 text-center text-navy-600">
                    {text('emptyMessage')}
                  </p>
                )}
                {/* With no date to show, these are rows rather than cards. */}
                {tba.length > 0 && (
                  <div className={upcoming.length > 0 ? 'mt-10' : ''}>
                    <h3 className="mb-4 text-lg font-semibold text-navy-900">{text('tbaTitle')}</h3>
                    <EngagementRowList
                      engagements={tba}
                      rowProps={(engagement) => ({ badges: listingBadges(engagement), showDate: false })}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          {result.status === 'ready' && hasPrevious && (
            <section aria-labelledby="speaking-previous">
              <SectionHeading id="speaking-previous" eyebrow={text('previousEyebrow')} title={text('previousTitle')} />
              {filterBar}
              {previous.length > 0 && <PastEngagementList engagements={previous} />}
              {noMatchesNote}
            </section>
          )}

          {/* Past cancellations are kept apart, so they never read as engagements that took place. */}
          {result.status === 'ready' && hasCancelled && (cancelled.length > 0 || !hasPrevious) && (
            <section aria-labelledby="speaking-cancelled">
              <h2 id="speaking-cancelled" className="mb-4 text-lg font-semibold text-navy-900">{text('cancelledTitle')}</h2>
              {!hasPrevious && filterBar}
              {cancelled.length > 0 && <PastEngagementList engagements={cancelled} />}
              {!hasPrevious && noMatchesNote}
            </section>
          )}
        </div>
      </div>

      {showCta && (
        <section className="relative overflow-hidden bg-navy-950 text-white" aria-labelledby="speaking-cta">
          <PageHeaderBackdrop image={page.ctaBackgroundImage} />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">{text('ctaEyebrow')}</p>
              <h2 id="speaking-cta" className="mt-2 text-2xl sm:text-3xl font-bold">{text('ctaTitle')}</h2>
              <p className="mt-3 leading-relaxed text-navy-200">{text('ctaText')}</p>
            </div>
            <Link
              to={INVITE_PATH}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-coral px-6 py-3 text-sm font-semibold text-navy-950 transition-colors hover:bg-[#f08a83] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 md:self-center"
            >
              {text('ctaButtonLabel')}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
