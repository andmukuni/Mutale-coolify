import { useState, useMemo } from 'react';
import { ShoppingCart, ShoppingBag, Search, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import BookCard from '../components/BookCard';
import { useBookStore } from '../context/BookStoreContext';
import SectionHeader from '../components/SectionHeader';

// Type filter groups. Each maps to one or more `product_type` values.
const typeFilters = [
  { value: 'all',         label: 'All',         match: () => true },
  { value: 'book',        label: 'Books',       match: (p) => (p.product_type || 'book') === 'book' },
  { value: 'apparel',     label: 'Apparel',     match: (p) => ['tshirt', 'sweatshirt', 'cap'].includes(p.product_type) },
  { value: 'drinkware',   label: 'Drinkware',   match: (p) => p.product_type === 'mug' },
  { value: 'accessories', label: 'Accessories', match: (p) => ['keyholder', 'wristwatch', 'bag'].includes(p.product_type) },
  { value: 'stickers',    label: 'Stickers',    match: (p) => p.product_type === 'sticker' },
];

export default function BookShopPage() {
  const { products, productsLoaded, cartItemCount } = useBookStore();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('featured');

  const publishedProducts = useMemo(
    () => (products || []).filter(p => p.is_published),
    [products],
  );

  const filtered = useMemo(() => {
    const matcher = typeFilters.find(f => f.value === typeFilter)?.match || (() => true);
    let result = publishedProducts.filter(matcher);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.title || '').toLowerCase().includes(q)
        || (p.author || '').toLowerCase().includes(q)
        || (p.category || '').toLowerCase().includes(q)
        || (p.tagline || '').toLowerCase().includes(q),
      );
    }
    if (sort === 'featured')   result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    if (sort === 'price_low')  result.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === 'price_high') result.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sort === 'newest')     result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return result;
  }, [publishedProducts, typeFilter, search, sort]);

  const heroLabel = typeFilters.find(f => f.value === typeFilter)?.label || 'All';

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-cyan-500/10 text-cyan-400 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border border-cyan-500/20">
            <ShoppingBag size={16} />
            Shop
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Books, Apparel & <span className="text-cyan-400">Event Merch</span>
          </h1>
          <p className="text-navy-300 max-w-2xl mx-auto text-base sm:text-lg">
            T-shirts, mugs, keyholders, books, and limited-edition event merchandise from Mutale Mubanga.
          </p>

          {/* Cart floating link */}
          {cartItemCount > 0 && (
            <Link
              to="/books/cart"
              className="mt-6 inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              <ShoppingCart size={16} />
              View Cart ({cartItemCount})
            </Link>
          )}
        </div>
      </section>

      {/* Filters */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          {/* Search */}
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-navy-200 bg-white text-sm text-navy-800 placeholder:text-navy-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-300"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
            <div className="flex items-center gap-1.5 text-xs text-navy-500">
              <Filter size={13} />
              Sort:
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="text-xs rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 w-full sm:w-auto"
            >
              <option value="featured">Featured</option>
              <option value="newest">Newest</option>
              <option value="price_low">Price: Low → High</option>
              <option value="price_high">Price: High → Low</option>
            </select>
          </div>
        </div>

        {/* Type filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible mb-8">
          {typeFilters.map(f => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                typeFilter === f.value
                  ? 'bg-cyan-600 text-white'
                  : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Results */}
        {!productsLoaded ? (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-cyan-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-navy-500 text-sm">Loading shop…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag size={40} className="mx-auto text-navy-300 mb-4" />
            <h3 className="text-lg font-semibold text-navy-700 mb-2">No products found</h3>
            <p className="text-navy-500 text-sm">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <>
            <SectionHeader
              title={typeFilter === 'all' ? 'All Products' : heroLabel}
              subtitle={`${filtered.length} item${filtered.length !== 1 ? 's' : ''} available`}
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
              {filtered.map(product => (
                <BookCard key={product.id} book={product} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
