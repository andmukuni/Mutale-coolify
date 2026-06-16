import { useState } from 'react';
import { Search } from 'lucide-react';
import PublicationItem from '../components/PublicationItem';
import EmptyState from '../components/EmptyState';
import { useData } from '../context/DataContext';
import { filterBySearch } from '../utils/helpers';

export default function PublicationsPage() {
  const { publications } = useData();
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('All');

  const sourcePublications = Array.isArray(publications) ? publications : [];

  const years = ['All', ...new Set(sourcePublications.map(p => p.year).filter(Boolean))].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    return b - a;
  });

  let filtered = filterBySearch(sourcePublications, search, ['title', 'authors', 'journal']);
  if (yearFilter !== 'All') {
    filtered = filtered.filter(p => p.year === parseInt(yearFilter));
  }

  return (
    <div>
      {/* Header */}
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">Research</span>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">Publications</h1>
            <p className="text-lg text-navy-300 leading-relaxed">
              Peer-reviewed publications contributing to laboratory quality, diagnostics, and public health science.
            </p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="bg-white border-b border-navy-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
              <input
                type="text"
                placeholder="Search publications..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-navy-50"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              {years.map(year => (
                <button
                  key={year}
                  onClick={() => setYearFilter(String(year))}
                  className={`text-sm px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${
                    String(yearFilter) === String(year)
                      ? 'bg-cyan-600 text-white'
                      : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Publications List */}
      <section className="py-12 sm:py-16 bg-navy-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {filtered.length > 0 ? (
            <div className="space-y-4">
              {filtered.map(pub => (
                <PublicationItem key={pub.id} pub={pub} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No publications found"
              description="Try adjusting your search criteria."
            />
          )}
        </div>
      </section>
    </div>
  );
}
