import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PageHeaderBackdrop from '../PageHeaderBackdrop';

/** The closing invitation at the foot of the Speaking pages. */
export default function SpeakingCta({ page, text }) {
  return (
    <section className="relative overflow-hidden bg-navy-950 text-white" aria-labelledby="speaking-cta">
      <PageHeaderBackdrop image={page.ctaBackgroundImage} />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">{text('ctaEyebrow')}</p>
          <h2 id="speaking-cta" className="mt-2 text-2xl sm:text-3xl font-bold">{text('ctaTitle')}</h2>
          <p className="mt-3 leading-relaxed text-navy-200">{text('ctaText')}</p>
        </div>
        <Link
          to="/speaking/invite"
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-coral px-6 py-3 text-sm font-semibold text-navy-950 transition-colors hover:bg-[#f08a83] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 md:self-center"
        >
          {text('ctaButtonLabel')}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
