import { useState } from 'react';
import { Search } from 'lucide-react';
import SectionHeader from '../components/SectionHeader';
import BlogCard from '../components/BlogCard';
import EmptyState from '../components/EmptyState';
import { useData } from '../context/DataContext';
import { filterBySearch, filterByCategory, getUniqueCategories } from '../utils/helpers';

export default function BlogPage() {
  const { blogPosts } = useData();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const categories = getUniqueCategories(blogPosts);
  let filtered = filterBySearch(blogPosts, search, ['title', 'excerpt', 'category']);
  filtered = filterByCategory(filtered, category);

  return (
    <div>
      {/* Header */}
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">Blog</span>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">Insights & Articles</h1>
            <p className="text-lg text-navy-300 leading-relaxed">
              Perspectives on quality systems, laboratory management, diagnostics, and public health from over 15 years in the field.
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
                placeholder="Search articles..."
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

      {/* Blog Grid */}
      <section className="py-12 sm:py-16 bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {filtered.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(post => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No articles found"
              description="Try adjusting your search or filter criteria."
            />
          )}
        </div>
      </section>
    </div>
  );
}
