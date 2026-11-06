import { Link } from 'react-router-dom';
import { ArrowRight, Award, BadgeCheck, CheckCircle2 } from 'lucide-react';
import TwoToneTitle from './TwoToneTitle';
import { defaultWebsitePages } from '../data/websitePages';
import { resolveMediaUrl } from '../utils/mediaUrl';

const ABOUT_IMG_FALLBACK = 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=800&q=80';
const HEADING = 'home-about';

/**
 * The homepage's introduction to Mutale: the photo in a teal frame with the
 * floating credential card, then the eyebrow and title, the first line of the
 * summary as a lead, the next two as highlights, the standards as tags, and
 * the way to the full profile. Copy comes from Sections (Home → About preview)
 * and the profile summary.
 */
export default function HomeAboutPreview({ page, summary = [] }) {
  const defaults = defaultWebsitePages.home;
  const text = (key) => String(page?.[key] ?? '').trim() || defaults[key];
  const image = resolveMediaUrl(page?.aboutImage) || ABOUT_IMG_FALLBACK;
  const [lead, ...points] = (Array.isArray(summary) ? summary : []).filter(Boolean).slice(0, 3);
  const tags = (Array.isArray(page?.aboutTags) ? page.aboutTags : defaults.aboutTags).filter(Boolean);
  const floatingTitle = text('aboutFloatingTitle');
  const floatingSubtitle = text('aboutFloatingSubtitle');

  return (
    <section aria-labelledby={HEADING} className="relative overflow-hidden bg-white py-20 sm:py-24">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-16 h-80 w-80 rounded-full bg-cyan-100/60 blur-3xl dark:bg-cyan-500/10"
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid items-center gap-16 lg:grid-cols-12 lg:gap-14 xl:gap-20">
        {/* Photo side: a teal frame set off behind it, and a dot pattern at the corner. */}
        <div className="relative mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none">
          <span
            aria-hidden="true"
            // A smaller offset on phones, where it would otherwise meet the screen's edge.
            className="absolute -left-2.5 -top-2.5 h-full w-full rounded-3xl border-2 border-[#00A79D]/35 sm:-left-5 sm:-top-5"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-6 -right-6 h-32 w-32 rounded-3xl opacity-50 [background-image:radial-gradient(#00A79D_1.5px,transparent_1.5px)] [background-size:14px_14px]"
          />
          <div className="relative overflow-hidden rounded-3xl shadow-2xl shadow-navy-900/15">
            <img
              src={image}
              alt="Laboratory quality assurance work"
              className="aspect-[4/3] w-full object-cover sm:aspect-[5/4] lg:aspect-[4/5]"
            />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-navy-950/30 to-transparent" />
          </div>
          <div className="absolute -bottom-7 left-4 flex items-center gap-3 rounded-2xl border border-navy-100 bg-white p-3.5 pr-5 shadow-xl sm:-left-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#00A79D] to-cyan-800 text-white shadow-md">
              <Award size={20} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold text-navy-900">{floatingTitle}</span>
              <span className="block text-xs font-medium text-navy-500">{floatingSubtitle}</span>
            </span>
          </div>
        </div>

        {/* Text side. */}
        <div className="lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">{text('aboutEyebrow')}</p>
          <TwoToneTitle
            id={HEADING}
            text={text('aboutTitle')}
            className="mt-3 text-3xl sm:text-4xl lg:text-[2.6rem] font-bold leading-tight"
          />
          <span aria-hidden="true" className="mt-5 block h-1 w-12 rounded-full bg-[#E76869]" />

          {lead && <p className="mt-6 text-lg leading-relaxed text-navy-700">{lead}</p>}
          {points.length > 0 && (
            <ul className="mt-6 space-y-4">
              {points.map((point) => (
                <li key={point} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
                    <CheckCircle2 size={16} aria-hidden="true" />
                  </span>
                  <span className="leading-relaxed text-navy-600">{point}</span>
                </li>
              ))}
            </ul>
          )}

          {tags.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Standards and frameworks">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cyan-100 bg-cyan-50/70 px-3 py-1.5 text-xs font-semibold text-cyan-800 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
                >
                  <BadgeCheck size={14} aria-hidden="true" />
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              to="/about"
              className="group inline-flex items-center gap-2 rounded-xl bg-navy-900 px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-cyan-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 dark:bg-cyan-700 dark:hover:bg-cyan-600"
            >
              Read Full Profile
              <ArrowRight size={16} aria-hidden="true" className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/experience"
              className="group inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-cyan-800 hover:text-cyan-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 dark:text-cyan-300 dark:hover:text-cyan-200"
            >
              View Experience
              <ArrowRight size={14} aria-hidden="true" className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
