import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag, ShoppingCart, Check, ArrowRight, Sparkles,
} from 'lucide-react';
import { Modal } from './ui';
import { getApiBase } from '../utils/apiBase';
import { useBookStore } from '../context/BookStoreContext';
import { useCurrency } from '../context/CurrencyContext';
import { useProductTypes } from '../context/ProductTypesContext';
import { getProductTypeIcon } from '../utils/productTypeIcons';

const API_BASE = getApiBase();

/**
 * Post-payment upsell modal.
 * Renders only when the event has at least one published, linked product.
 *
 * Props:
 *  - isOpen, onClose
 *  - eventId, eventTitle
 *  - autoLoad (default true) — fetch products from /api/events/:id/products on mount
 *  - products (optional) — prefetched product array; when supplied with autoLoad=false,
 *    no network request is made.
 */
export default function EventMerchUpsellModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  autoLoad = true,
  products: prefetched = null,
}) {
  const [products, setProducts] = useState(Array.isArray(prefetched) ? prefetched : []);
  const [loaded, setLoaded] = useState(Array.isArray(prefetched));
  const [addedKeys, setAddedKeys] = useState({});
  const { addToCart, cartItemCount } = useBookStore();
  const { formatEventPrice } = useCurrency();
  const { productTypesByValue } = useProductTypes();

  // Sync prefetched products when prop changes
  useEffect(() => {
    if (Array.isArray(prefetched)) {
      setProducts(prefetched);
      setLoaded(true);
    }
  }, [prefetched]);

  useEffect(() => {
    if (!isOpen || !eventId || !autoLoad) return undefined;
    let cancelled = false;
    setLoaded(false);
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
  }, [isOpen, eventId, autoLoad]);

  const visibleProducts = useMemo(
    () => products.filter(p => p.is_published !== 0 && p.is_published !== false),
    [products],
  );

  if (!isOpen) return null;
  // Suppress modal entirely when there's nothing to upsell — caller can rely
  // on this fast-path render to avoid showing the success screen twice.
  if (loaded && visibleProducts.length === 0) return null;

  const handleAddDefault = (product) => {
    // If variants are required, send the user to product page to pick one.
    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    if (hasVariants) return;
    addToCart(product, 1, null);
    setAddedKeys(prev => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedKeys(prev => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    }, 1500);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Take a piece of the event home"
      subtitle={eventTitle ? `Limited-edition merch for ${eventTitle}.` : 'Limited-edition merch — only for attendees.'}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-100 transition-colors"
          >
            Maybe later
          </button>
          <Link
            to="/books/cart"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white inline-flex items-center gap-2 transition-colors"
          >
            <ShoppingCart size={14} />
            View cart{cartItemCount ? ` (${cartItemCount})` : ''}
          </Link>
        </>
      )}
    >
      {/* Header strip */}
      <div className="flex items-center gap-3 mb-5 rounded-2xl bg-gradient-to-r from-cyan-50 via-purple-50/50 to-amber-50 border border-cyan-100 px-4 py-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white text-cyan-700 shadow-sm">
          <Sparkles size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy-900">You&rsquo;re in — congrats!</p>
          <p className="text-xs text-navy-600">
            Want a T-shirt, mug, or keepsake from {eventTitle ? `“${eventTitle}”` : 'this event'}? Add it to your order now.
          </p>
        </div>
        <ShoppingBag size={20} className="text-cyan-700 hidden sm:block" />
      </div>

      {/* Product grid */}
      {!loaded ? (
        <div className="py-10 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-cyan-200 border-t-cyan-600 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
          {visibleProducts.map(p => {
            const typeMeta = productTypesByValue?.[p.product_type || 'book'];
            const TypeIcon = getProductTypeIcon(typeMeta?.icon);
            const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
            const added = addedKeys[p.id];
            return (
              <div
                key={p.id}
                className="flex gap-3 p-3 rounded-2xl border border-navy-100 hover:border-cyan-200 transition-colors bg-white"
              >
                <Link to={`/books/${p.slug}`} onClick={onClose} className="shrink-0">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-navy-50 flex items-center justify-center">
                    {p.cover_image ? (
                      <img src={p.cover_image} alt={p.title} className="w-full h-full object-cover" />
                    ) : (
                      <TypeIcon size={28} className="text-navy-300" />
                    )}
                  </div>
                </Link>

                <div className="flex-1 min-w-0 flex flex-col">
                  <Link to={`/books/${p.slug}`} onClick={onClose} className="text-sm font-semibold text-navy-900 line-clamp-2 hover:text-cyan-700">
                    {p.title}
                  </Link>
                  {p.tagline && (
                    <p className="text-[11px] text-cyan-600 line-clamp-1 mt-0.5">{p.tagline}</p>
                  )}
                  <p className="text-sm font-bold text-navy-900 mt-1">
                    {formatEventPrice({ price: p.price, currency: p.currency || 'ZMW' })}
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    {hasVariants ? (
                      <Link
                        to={`/books/${p.slug}`}
                        onClick={onClose}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 hover:text-cyan-800"
                      >
                        Choose options
                        <ArrowRight size={12} />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddDefault(p)}
                        disabled={added}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          added
                            ? 'bg-green-600 text-white'
                            : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                        }`}
                      >
                        {added ? <Check size={12} /> : <ShoppingCart size={12} />}
                        {added ? 'Added' : 'Add to cart'}
                      </button>
                    )}
                    <Link
                      to={`/books/${p.slug}`}
                      onClick={onClose}
                      className="text-[11px] font-medium text-navy-500 hover:text-cyan-700"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
