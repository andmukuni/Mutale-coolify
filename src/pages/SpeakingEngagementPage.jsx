import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import EngagementBadge from '../components/speaking/EngagementBadge';
import SpeakingEngagementDetails from '../components/speaking/SpeakingEngagementDetails';
import { engagementBadges } from '../components/speaking/engagementBadges';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementDateLeaf,
  formatEngagementDateRange,
  formatRoles,
  optionLabel,
} from '../../shared/speakingEngagements.js';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { fetchPublicSpeakingEngagement } from '../utils/speakingApi';

const BACK_LINK = 'inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-cyan-300 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900';

function Header({ engagement }) {
  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement?.event_type);
  const badges = engagement ? engagementBadges(engagement) : [];
  const roles = formatRoles(engagement?.roles);
  const cancelledUndated = engagement && !formatEngagementDateLeaf(engagement) && engagement.event_status === 'cancelled';
  const dateText = engagement && !cancelledUndated ? formatEngagementDateRange(engagement) : '';
  const image = engagement?.image_url ? resolveMediaUrl(engagement.image_url) : '';

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-cyan-900 text-white">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 wrap-anywhere">
          <Link to="/speaking" className={BACK_LINK}>
            <ArrowLeft size={16} aria-hidden="true" />
            All speaking engagements
          </Link>
          {engagement ? (
            <>
              {(eventType || badges.length > 0) && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {eventType && <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">{eventType}</p>}
                  {badges.map((badge) => <EngagementBadge key={badge.label} tone={badge.tone}>{badge.label}</EngagementBadge>)}
                </div>
              )}
              <h1 className="mt-2 text-3xl sm:text-4xl font-bold leading-tight">{engagement.event_title}</h1>
              {roles && <p className="mt-3 text-base sm:text-lg text-navy-200">{roles}</p>}
              {dateText && <p className="mt-1 text-base font-semibold text-cyan-200">{dateText}</p>}
            </>
          ) : (
            <h1 className="mt-5 text-3xl sm:text-4xl font-bold leading-tight">Speaking engagement</h1>
          )}
        </div>
        {image && (
          <img
            src={image}
            alt={engagement.image_alt || ''}
            className="hidden h-56 w-auto max-w-[18rem] rounded-2xl object-cover md:block"
          />
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

  return (
    <div className="bg-navy-50 min-h-[60vh]">
      <Header engagement={status === 'ready' ? engagement : null} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <p className="sr-only" role="status">{status === 'loading' ? 'Loading the speaking engagement…' : ''}</p>
        {status === 'loading' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden="true">
            <div className="h-48 rounded-2xl border border-navy-100 bg-white animate-pulse" />
            <div className="h-64 rounded-2xl border border-navy-100 bg-white animate-pulse" />
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
    </div>
  );
}
