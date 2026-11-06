import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import SpeakingEngagementCard from './SpeakingEngagementCard';
import { fetchPublicSpeakingEngagements } from '../../utils/speakingApi';
import { pickNextEngagement } from './nextEngagement';

/** Homepage "Next Speaking Engagement" band; renders nothing until there is one to show. */
export default function NextSpeakingEngagement({ eyebrow, title, linkLabel }) {
  const [engagement, setEngagement] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicSpeakingEngagements()
      .then((data) => { if (!cancelled) setEngagement(pickNextEngagement(data)); })
      // The homepage reads fine without it.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!engagement) return null;

  return (
    <section aria-labelledby="home-next-speaking" className="border-t border-navy-100 bg-white py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">{eyebrow}</p>}
            <h2 id="home-next-speaking" className="mt-1 text-2xl sm:text-3xl font-bold text-navy-900">{title}</h2>
          </div>
          <Link
            to="/speaking"
            className="group inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-cyan-800 hover:text-cyan-900 hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 dark:text-cyan-300"
          >
            {linkLabel}
            <ArrowRight size={16} aria-hidden="true" className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
          </Link>
        </div>
        <SpeakingEngagementCard engagement={engagement} headingLevel="h3" />
      </div>
    </section>
  );
}
