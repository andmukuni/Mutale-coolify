import { useEffect, useRef, useState } from 'react';
import { useData } from '../../context/DataContext';
import { defaultWebsitePages, normalizeSectionVisibility } from '../../data/websitePages';
import { fetchPublicSpeakingEngagements } from '../../utils/speakingApi';

/** The Speaking pages' editable copy, falling back to the defaults for anything left blank. */
export function useSpeakingCopy() {
  const { profile } = useData();
  const defaults = defaultWebsitePages.speaking;
  const page = { ...defaults, ...(profile?.websitePages?.speaking || {}) };
  const text = (key) => String(page[key] || '').trim() || defaults[key];
  const visibility = normalizeSectionVisibility(profile?.websitePages?.sectionVisibility || {});
  return { page, text, visibility };
}

/**
 * The published engagements, grouped by the server, for a page that lists them.
 * "Try again" disappears while the listings reload, so focus waits on the
 * heading named by `headingId`, and returns to the button if loading fails again.
 */
export function useSpeakingListings(headingId) {
  const [result, setResult] = useState({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPublicSpeakingEngagements()
      .then((data) => { if (!cancelled) setResult({ status: 'ready', data }); })
      .catch(() => { if (!cancelled) setResult({ status: 'error', data: null }); });
    return () => { cancelled = true; };
  }, [attempt]);

  const retrying = useRef(false);
  const retryButton = useRef(null);
  const retry = () => {
    retrying.current = true;
    document.getElementById(headingId)?.focus();
    setResult({ status: 'loading', data: null });
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    if (result.status === 'loading' || !retrying.current) return;
    retrying.current = false;
    if (result.status === 'error') retryButton.current?.focus();
  }, [result.status]);

  return { result, retry, retryButton };
}
