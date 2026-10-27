import { Link } from 'react-router-dom';
import { LEGAL } from '../config/legal';

/** Shared layout for the Terms and Cookie Policy: dark header, contents list, numbered sections. */
export default function LegalDocument({ eyebrow = 'Legal', title, summary, sections, intro, related }) {
  return (
    <div>
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-14 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">
            {eyebrow}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">{title}</h1>
          {summary && <p className="text-base sm:text-lg text-navy-300 leading-relaxed max-w-3xl">{summary}</p>}
          <p className="mt-4 text-sm text-navy-400">Last updated {LEGAL.lastUpdated}</p>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="On this page" className="mb-10 lg:mb-0">
            <div className="lg:sticky lg:top-24 rounded-2xl border border-navy-100 bg-navy-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-500 mb-3">On this page</p>
              <ol className="space-y-1.5 text-sm">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="flex gap-2 text-navy-600 hover:text-cyan-700">
                      <span className="tabular-nums text-navy-400">{index + 1}.</span>
                      <span>{section.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
              {related && (
                <p className="mt-4 pt-4 border-t border-navy-100 text-xs text-navy-500">
                  See also{' '}
                  <Link to={related.to} className="font-medium text-cyan-700 hover:text-cyan-600">
                    {related.label}
                  </Link>
                </p>
              )}
            </div>
          </nav>

          <article className="legal-doc min-w-0 max-w-3xl text-navy-600 leading-7 space-y-10">
            {intro && <div className="space-y-4">{intro}</div>}
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-24 space-y-4">
                <h2 className="text-xl font-semibold text-navy-900">
                  <span className="text-navy-400 mr-2 tabular-nums">{index + 1}.</span>
                  {section.title}
                </h2>
                {section.content}
              </section>
            ))}
          </article>
        </div>
      </section>
    </div>
  );
}

/** Bulleted list styled for legal text. */
export function LegalList({ items }) {
  return (
    <ul className="list-disc pl-6 space-y-2 marker:text-cyan-600">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
