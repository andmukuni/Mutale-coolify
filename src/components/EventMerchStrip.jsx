import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Sparkles, ArrowRight } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import { useCurrency } from '../context/CurrencyContext';
import { useProductTypes } from '../context/ProductTypesContext';
import { getProductTypeIcon } from '../utils/productTypeIcons';

const API_BASE = getApiBase();

/**
 * Horizontal strip of event-attached merch shown on EventDetailPage.
 * Quietly renders nothing when there are no published products linked to the event.
 */
export default function EventMerchStrip({ eventId, eventTitle }) {
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const { formatEventPrice } = useCurrency();
  const { productTypesByValue } = useProductTypes();

  useEffect(() => {
    if (!eventId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}/products`, {
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setProducts(Array.isArray(json?.data) ? json.data : []);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  if (!loaded || products.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-10">
      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-navy-100">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-50 text-cyan-700">
              <ShoppingBag size={18} />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-navy-900 flex items-center gap-2">
                <Sparkles size={14} className="text-cyan-500" />
                Event Merchandise
              </h2>
              <p className="text-xs text-navy-500">
                Take a piece of {eventTitle || 'this event'} home — limited-edition merch.
              </p>
            </div>
          </div>
          <Link
            to="/books"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 hover:text-cyan-800"
          >
            Browse all
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <div className="flex gap-4 p-5 min-w-min snap-x snap-mandatory">
            {products.map(p => {
              const typeMeta = productTypesByValue?.[p.product_type || 'book'];
              const TypeIcon = getProductTypeIcon(typeMeta?.icon);
              return (
                <Link
                  key={p.id}
                  to={`/books/${p.slug}`}
                  className="snap-start shrink-0 w-44 sm:w-52 rounded-2xl border border-navy-100 hover:border-cyan-200 hover:shadow-md transition-all bg-white flex flex-col overflow-hidden"
                >
                  <div className="aspect-square bg-navy-50 flex items-center justify-center overflow-hidden">
                    {p.cover_image ? (
                      <img src={p.cover_image} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <TypeIcon size={32} className="text-navy-300" />
                    )}
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="text-sm font-semibold text-navy-900 line-clamp-2 mb-1">{p.title}</h3>
                    {p.tagline && (
                      <p className="text-[11px] text-cyan-600 line-clamp-1 mb-2">{p.tagline}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-1">
                      <span className="text-sm font-bold text-navy-900">
                        {formatEventPrice({ price: p.price, currency: p.currency || 'ZMW' })}
                      </span>
                      <span className="text-[11px] font-medium text-cyan-700 inline-flex items-center gap-0.5">
                        Shop
                        <ArrowRight size={11} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
