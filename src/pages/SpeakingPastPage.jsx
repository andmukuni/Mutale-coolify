import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageHeaderBackdrop from '../components/PageHeaderBackdrop';
import EngagementFilters from '../components/speaking/EngagementFilters';
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
import ListingsLoadError from '../components/speaking/ListingsLoadError';
import PastEngagementList from '../components/speaking/PastEngagementList';
import SpeakingCta from '../components/speaking/SpeakingCta';
import { useSpeakingCopy, useSpeakingListings } from '../components/speaking/useSpeakingListings';

const HEADING = 'speaking-past';
const NO_MATCHES = 'No past engagements match these filters.';

// Announced through the page's status line, which is always present.
function LoadingRows() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="h-16 rounded-2xl border border-navy-100 bg-white animate-pulse motion-reduce:animate-none" />
      ))}
    </div>
  );
}

/**
 * "Where I've Spoken": everything that isn't coming up with a date, on a page
 * of its own so the Speaking page can lead with what's next. Past engagements
 * by year (with filters once there are enough), past cancellations apart from
 * them, and engagements whose dates are still to be announced.
 */
export default function SpeakingPastPage() {
  const { page, text, visibility } = useSpeakingCopy();
  const { result, retry, retryButton } = useSpeakingListings(HEADING);
  const [filters, setFilters] = useState(NO_FILTERS);

  const options = useMemo(() => filterOptions(result.data || {}), [result.data]);
  const ready = result.status === 'ready';
  const showFilters = ready && options.total >= FILTER_THRESHOLD;
  const filtering = showFilters && hasActiveFilters(filters);
  const groups = useMemo(
    () => (filtering ? applyFilters(result.data || {}, filters) : (result.data || {})),
    [filtering, result.data, filters],
  );
  const { tba = [], previous = [], cancelled = [] } = groups;
  const shown = FILTERED_SECTIONS.reduce((sum, key) => sum + (groups[key] || []).length, 0);
  // The filters stay when nothing matches, so the visitor can change them.
  const noMatches = filtering && shown === 0;
  const nothingToShow = ready && options.total === 0 && tba.length === 0;

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-cyan-900 text-white">
        <PageHeaderBackdrop image={page.heroBackgroundImage} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <Link
            to="/speaking"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-cyan-300 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to Speaking
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-cyan-400">{text('previousEyebrow')}</p>
          {/* Focus waits here while the listings reload after "Try again" (it never joins the tab order). */}
          <h1 id={HEADING} tabIndex={-1} className="mt-2 text-3xl sm:text-4xl font-bold leading-tight focus:outline-none">
            {text('previousTitle')}
          </h1>
        </div>
      </section>

      <div className="bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-12">
          <div>
            <p className="sr-only" role="status">
              {result.status === 'loading' ? 'Loading speaking engagements…' : ''}
            </p>
            {result.status === 'loading' && <LoadingRows />}
            {result.status === 'error' && <ListingsLoadError onRetry={retry} buttonRef={retryButton} />}
            {showFilters && (
              <div className="mb-6">
                <EngagementFilters options={options} filters={filters} onChange={setFilters} shown={shown} />
              </div>
            )}
            {previous.length > 0 && <PastEngagementList engagements={previous} headingLevel="h2" />}
            {noMatches && (
              <p className="rounded-2xl border border-dashed border-navy-200 bg-white px-6 py-8 text-center text-navy-600">{NO_MATCHES}</p>
            )}
            {nothingToShow && (
              <p className="rounded-2xl border border-dashed border-navy-200 bg-white px-6 py-10 text-center text-navy-600">
                There are no past engagements to show yet.
              </p>
            )}
          </div>

          {/* Past cancellations are kept apart, so they never read as engagements that took place. */}
          {ready && cancelled.length > 0 && (
            <section aria-labelledby="speaking-cancelled">
              <h2 id="speaking-cancelled" className="mb-4 text-lg font-semibold text-navy-900">{text('cancelledTitle')}</h2>
              <PastEngagementList engagements={cancelled} headingLevel="h3" />
            </section>
          )}

          {/* Still to come, but with no date to show, so rows rather than cards. The filters don't apply. */}
          {ready && tba.length > 0 && (
            <section aria-labelledby="speaking-tba">
              <h2 id="speaking-tba" className="mb-4 text-lg font-semibold text-navy-900">{text('tbaTitle')}</h2>
              <EngagementRowList
                engagements={tba}
                rowProps={(engagement) => ({ badges: listingBadges(engagement), showDate: false, headingLevel: 'h3' })}
              />
            </section>
          )}
        </div>
      </div>

      {visibility['speaking.cta'] !== false && <SpeakingCta page={page} text={text} />}
    </div>
  );
}
