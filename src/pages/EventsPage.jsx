import { useState } from 'react';
import { Search } from 'lucide-react';
import SectionHeader from '../components/SectionHeader';
import EventCard from '../components/EventCard';
import EmptyState from '../components/EmptyState';
import PageHeaderBackdrop from '../components/PageHeaderBackdrop';
import { useData } from '../context/DataContext';
import { filterBySearch, filterByCategory, getUniqueCategories } from '../utils/helpers';
import { getEventDisplayStatus, isEventPubliclyVisible } from '../utils/eventServices';
import { formatDate } from '../utils/helpers';
import { Link, useSearchParams } from 'react-router-dom';
import { defaultWebsitePages } from '../data/websitePages';

export default function EventsPage() {
  const { events, profile } = useData();
  const page = profile.websitePages?.events || defaultWebsitePages.events;
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const view = searchParams.get('view');

  // Only show published, public events to visitors
  const publicEvents = events.filter(isEventPubliclyVisible);

  const categories = getUniqueCategories(publicEvents);
  let filtered = filterBySearch(publicEvents, search, ['title', 'short_description', 'description', 'venue', 'location']);
  filtered = filterByCategory(filtered, category);

  const activeEvents = filtered.filter((event) => {
    const status = getEventDisplayStatus(event);
    return status !== 'past' && status !== 'closed' && status !== 'cancelled';
  });

  const pastEvents = filtered
    .filter((event) => getEventDisplayStatus(event) === 'past')
    .sort((a, b) => {
      const aTime = new Date(a.start_date || a.date || 0).getTime();
      const bTime = new Date(b.start_date || b.date || 0).getTime();
      return bTime - aTime;
    });

  const selectedView = view === 'past' || view === 'upcoming' ? view : 'all';
  const mainEvents = selectedView === 'past' ? pastEvents : activeEvents;
  const emptyTitle = selectedView === 'past' ? 'No past events found' : 'No active events found';
  const emptyDescription = selectedView === 'past'
    ? 'Try adjusting your search or filter criteria.'
    : 'Try adjusting your search or filter criteria.';

  return (
    <div>
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <PageHeaderBackdrop image={page.headerBackgroundImage} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">{page.headerEyebrow || defaultWebsitePages.events.headerEyebrow}</span>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">{page.headerTitle || defaultWebsitePages.events.headerTitle}</h1>
            <p className="text-lg text-navy-300 leading-relaxed">
              {page.headerIntro || defaultWebsitePages.events.headerIntro}
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
                placeholder="Search events..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-navy-50"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`text-sm px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${
                    category === cat
                      ? 'bg-cyan-600 text-white'
                      : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Events Grid */}
      <section className="py-12 sm:py-16 bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div className="lg:col-span-9 xl:col-span-9">
              {mainEvents.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {mainEvents.map(event => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                />
              )}
            </div>

            <aside className="lg:col-span-3 xl:col-span-3">
              <div className="bg-white rounded-2xl border border-navy-100 shadow-sm p-5 lg:sticky lg:top-24">
                <h3 className="text-base font-bold text-navy-900 mb-1">Past events</h3>
                <p className="text-xs text-navy-500 mb-4">Quick access to previously held sessions.</p>

                {pastEvents.length > 0 ? (
                  <ul className="space-y-3">
                    {pastEvents.slice(0, 8).map((event) => (
                      <li key={event.id} className="border border-navy-100 rounded-xl p-3 hover:border-cyan-200 transition-colors">
                        <Link to={`/events/${event.slug}`} className="block">
                          <p className="text-sm font-semibold text-navy-800 line-clamp-2 hover:text-cyan-700 transition-colors">
                            {event.title}
                          </p>
                          <p className="text-xs text-navy-500 mt-1">{formatDate(event.start_date || event.date)}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-navy-500">No past events match this filter yet.</p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
