import { ArrowLeft, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';

function buildReferenceLinks(publication) {
  const doiRaw = String(publication?.doi || '').trim();
  if (!doiRaw) return [];

  const chunks = doiRaw
    .split(/[\n,]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const seen = new Set();
  const links = [];

  chunks.forEach((chunk) => {
    let href = '';
    let label = chunk;

    if (/^https?:\/\//i.test(chunk)) {
      href = chunk;
    } else if (/doi\.org\//i.test(chunk)) {
      href = `https://${chunk.replace(/^https?:\/\//i, '')}`;
      label = chunk.replace(/^https?:\/\//i, '');
    } else {
      href = `https://doi.org/${chunk}`;
      label = `DOI: ${chunk}`;
    }

    if (!seen.has(href)) {
      seen.add(href);
      links.push({ href, label });
    }
  });

  return links;
}

export default function PublicationDetailPage() {
  const { id } = useParams();
  const { publications, isDataLoaded } = useData();

  const publication = publications.find((item) => String(item.id) === String(id));

  if (!isDataLoaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-navy-50">
        <div className="w-8 h-8 rounded-full border-4 border-navy-100 border-t-navy-900 animate-spin" />
      </div>
    );
  }

  if (!publication) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-navy-50">
        <div className="text-center px-4">
          <h1 className="text-2xl font-bold text-navy-900 mb-2">Publication Not Found</h1>
          <p className="text-navy-500 mb-6">The publication you are looking for does not exist.</p>
          <Link
            to="/publications"
            className="inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700 font-medium"
          >
            <ArrowLeft size={16} /> Back to Publications
          </Link>
        </div>
      </div>
    );
  }

  const referenceLinks = buildReferenceLinks(publication);

  return (
    <div>
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/publications"
            className="inline-flex items-center gap-1 text-sm text-navy-400 hover:text-cyan-400 transition-colors mb-6"
          >
            <ArrowLeft size={14} /> Back to Publications
          </Link>

          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-cyan-600/20 text-cyan-300 px-2.5 py-1 rounded-full mb-4">
            Research Publication
          </span>

          <h1 className="text-2xl sm:text-4xl font-bold leading-tight mb-4 break-words">{publication.title}</h1>
          <p className="text-base sm:text-lg text-navy-300 break-words">{publication.authors}</p>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-8">
          <article className="lg:col-span-2 bg-white rounded-2xl border border-navy-100 p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-navy-900 mb-4">Abstract</h2>
            {publication.abstract ? (
              <p className="text-navy-600 leading-relaxed whitespace-pre-line">{publication.abstract}</p>
            ) : (
              <p className="text-navy-500">No abstract was provided for this publication.</p>
            )}
          </article>

          <aside className="space-y-4">
            <div className="bg-navy-50 rounded-2xl border border-navy-100 p-5">
              <h3 className="text-sm font-semibold text-navy-900 mb-3 uppercase tracking-wide">Publication Info</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-navy-500">Journal</dt>
                  <dd className="text-navy-800 font-medium break-words">{publication.journal || '-'}</dd>
                </div>
                <div>
                  <dt className="text-navy-500">Volume / Issue</dt>
                  <dd className="text-navy-800 font-medium break-words">{publication.volume || '-'}</dd>
                </div>
                <div>
                  <dt className="text-navy-500">Year</dt>
                  <dd className="text-navy-800 font-medium">{publication.year || '-'}</dd>
                </div>
              </dl>
            </div>

            {referenceLinks.length > 0 && (
              <div className="bg-cyan-50 rounded-2xl border border-cyan-100 p-5">
                <h3 className="text-sm font-semibold text-navy-900 mb-3 uppercase tracking-wide inline-flex items-center gap-2">
                  <LinkIcon size={14} /> Reference Links
                </h3>
                <div className="space-y-2">
                  {referenceLinks.map((ref) => (
                    <a
                      key={ref.href}
                      href={ref.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-start gap-2 text-sm text-cyan-700 hover:text-cyan-800 break-all"
                    >
                      <ExternalLink size={14} className="mt-0.5 shrink-0" />
                      <span>{ref.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
