import { Link, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';

function paragraphsFromContent(content = '') {
  return String(content || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export default function CustomPage() {
  const { slug } = useParams();
  const { profile, isDataLoaded } = useData();
  const pages = Array.isArray(profile.websitePages?.customPages) ? profile.websitePages.customPages : [];
  const page = pages.find((item) => item.slug === slug && item.published !== false);

  if (!page && !isDataLoaded) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-navy-500">
        Loading page...
      </div>
    );
  }

  if (!page) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-3xl font-bold text-navy-900 mb-3">Page not found</h1>
        <p className="text-navy-500 mb-6">This page is not published or does not exist.</p>
        <Link to="/" className="text-sm font-medium text-cyan-700 hover:text-cyan-600">
          Back to home
        </Link>
      </div>
    );
  }

  const paragraphs = paragraphsFromContent(page.content);

  return (
    <div>
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {page.eyebrow && (
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">
              {page.eyebrow}
            </span>
          )}
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">{page.title}</h1>
          {page.excerpt && <p className="text-lg text-navy-300 leading-relaxed">{page.excerpt}</p>}
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-white">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="text-navy-600 leading-8 whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </article>
      </section>
    </div>
  );
}
