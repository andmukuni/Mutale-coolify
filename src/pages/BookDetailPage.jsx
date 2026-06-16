import { useParams, Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import {
  ShoppingCart, ArrowLeft, Package, Download, Minus, Plus, Check,
  Calendar, Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useBookStore } from '../context/BookStoreContext';
import { useCurrency } from '../context/CurrencyContext';
import { useData } from '../context/DataContext';
import { useProductTypes } from '../context/ProductTypesContext';
import { getProductTypeIcon } from '../utils/productTypeIcons';

export default function BookDetailPage() {
  const { slug } = useParams();
  const { products, productsLoaded, addToCart, cart } = useBookStore();
  const { formatEventPrice } = useCurrency();
  const { events } = useData();
  const { productTypesByValue } = useProductTypes();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [galleryIdx, setGalleryIdx] = useState(0);

  const product = useMemo(() => (products || []).find(p => p.slug === slug), [products, slug]);
  const productType = product?.product_type || 'book';
  const typeMeta = productTypesByValue?.[productType];
  const TypeIcon = getProductTypeIcon(typeMeta?.icon);
  const typeLabel = typeMeta?.label || 'Product';
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const gallery = Array.isArray(product?.gallery) ? product.gallery : [];

  const allImages = useMemo(() => {
    const list = [];
    if (product?.cover_image) list.push(product.cover_image);
    for (const g of gallery) if (g) list.push(g);
    return list;
  }, [product?.cover_image, gallery]);

  const selectedVariant = variants.find(v => v.id === selectedVariantId) || null;
  const requiresVariantPick = variants.length > 0;
  const variantPriceDelta = Number(selectedVariant?.price_delta || 0);
  const effectivePrice = Number(product?.price || 0) + variantPriceDelta;

  const attachedEvent = useMemo(
    () => (product?.event_id ? events.find(e => e.id === product.event_id) : null),
    [events, product?.event_id],
  );

  // Group variants by `type`/`label` to render as separate pickers (e.g. Size + Colour).
  const variantGroups = useMemo(() => {
    const groups = new Map();
    for (const v of variants) {
      const key = `${v.type || 'option'}::${v.label || ''}`;
      if (!groups.has(key)) groups.set(key, { type: v.type, label: v.label, items: [] });
      groups.get(key).items.push(v);
    }
    return Array.from(groups.values());
  }, [variants]);

  const inCart = cart.find(item =>
    (item.productId || item.bookId) === product?.id
    && (item.variantId || null) === (selectedVariantId || null),
  );

  if (!productsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <TypeIcon size={48} className="text-navy-300" />
        <h1 className="text-xl font-bold text-navy-800">Product not found</h1>
        <Link to="/books" className="text-cyan-600 hover:text-cyan-500 text-sm font-medium">
          ← Back to Shop
        </Link>
      </div>
    );
  }

  const isFree = !effectivePrice;
  const hasDiscount = product.compare_at_price && product.compare_at_price > effectivePrice;
  const stockSource = selectedVariant
    ? Number(selectedVariant.stock || 0)
    : Number(product.stock || 0);
  const outOfStock = !product.is_digital && stockSource <= 0;

  const handleAddToCart = () => {
    if (requiresVariantPick && !selectedVariant) return;
    addToCart(product, qty, selectedVariant);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="min-h-screen bg-navy-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-navy-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-xs text-navy-500">
            <Link to="/books" className="hover:text-cyan-600 transition-colors flex items-center gap-1">
              <ArrowLeft size={12} />
              Shop
            </Link>
            <span>/</span>
            <span className="text-navy-700 font-medium truncate">{product.title}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
          {/* Image gallery */}
          <div>
            <div className="rounded-2xl overflow-hidden bg-white border border-navy-100 shadow-sm relative">
              {allImages[galleryIdx] ? (
                <img src={allImages[galleryIdx]} alt={product.title} className="w-full h-auto max-h-[600px] object-cover" />
              ) : (
                <div className="w-full h-96 flex items-center justify-center bg-gradient-to-br from-navy-100 to-cyan-50">
                  <TypeIcon size={80} className="text-navy-300" />
                </div>
              )}
              {allImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setGalleryIdx((galleryIdx - 1 + allImages.length) % allImages.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-navy-700 shadow"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryIdx((galleryIdx + 1) % allImages.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-navy-700 shadow"
                    aria-label="Next image"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
            {allImages.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {allImages.map((src, idx) => (
                  <button
                    key={src + idx}
                    type="button"
                    onClick={() => setGalleryIdx(idx)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                      idx === galleryIdx ? 'border-cyan-500' : 'border-transparent hover:border-navy-200'
                    }`}
                  >
                    <img src={src} alt={`${product.title} ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="text-xs font-semibold bg-cyan-50 text-cyan-700 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                <TypeIcon size={11} />
                {typeLabel}
              </span>
              {product.category && (
                <span className="text-xs font-medium bg-navy-100 text-navy-700 px-2.5 py-1 rounded-full">
                  {product.category}
                </span>
              )}
              {product.is_digital && (
                <span className="text-xs font-medium bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Download size={11} />
                  Digital
                </span>
              )}
              {productType === 'book' && !product.is_digital && (
                <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Package size={11} />
                  {product.format === 'hardcover' ? 'Hardcover' : 'Paperback'}
                </span>
              )}
              {product.tagline && (
                <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Sparkles size={11} />
                  {product.tagline}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-navy-900 mb-2">{product.title}</h1>
            {productType === 'book' && product.author && (
              <p className="text-sm text-navy-500 mb-4">by {product.author}</p>
            )}

            {/* Attached event chip */}
            {attachedEvent && (
              <Link
                to={`/events/${attachedEvent.slug}`}
                className="inline-flex items-center gap-2 self-start mb-4 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <Calendar size={12} />
                Part of {attachedEvent.title}
              </Link>
            )}

            {/* Price */}
            <div className="flex items-baseline gap-3 mb-6">
              {isFree ? (
                <span className="text-2xl font-bold text-green-600">Free</span>
              ) : (
                <>
                  <span className="text-2xl font-bold text-navy-900">
                    {formatEventPrice({ price: effectivePrice, currency: product.currency || 'ZMW' })}
                  </span>
                  {hasDiscount && (
                    <span className="text-base text-navy-400 line-through">
                      {formatEventPrice({ price: product.compare_at_price, currency: product.currency || 'ZMW' })}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Description */}
            <div className="prose prose-sm text-navy-700 mb-6 max-w-none">
              <p>{product.description || product.short_description}</p>
            </div>

            {/* Variants */}
            {variantGroups.length > 0 && (
              <div className="space-y-4 mb-6">
                {variantGroups.map((group, gi) => (
                  <div key={`${group.type}-${gi}`}>
                    <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">
                      {group.label || group.type || 'Option'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map(v => {
                        const active = v.id === selectedVariantId;
                        const stockless = Number(v.stock || 0) <= 0;
                        const swatch = String(group.type || '').toLowerCase() === 'color';
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setSelectedVariantId(v.id)}
                            disabled={stockless}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              active
                                ? 'bg-cyan-600 border-cyan-600 text-white'
                                : 'bg-white border-navy-200 text-navy-700 hover:border-cyan-300'
                            } ${stockless ? 'opacity-50 cursor-not-allowed line-through' : ''}`}
                            title={stockless ? 'Out of stock' : ''}
                          >
                            {swatch && (
                              <span
                                aria-hidden
                                className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle border border-white/50"
                                style={{ background: String(v.value || '').toLowerCase() }}
                              />
                            )}
                            {v.value}
                            {Number(v.price_delta) ? ` (+${Number(v.price_delta).toFixed(2)})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Metadata grid (books only) */}
            {productType === 'book' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {product.isbn && (
                  <div className="bg-navy-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide">ISBN</p>
                    <p className="text-xs text-navy-700 font-medium">{product.isbn}</p>
                  </div>
                )}
                {product.pages > 0 && (
                  <div className="bg-navy-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide">Pages</p>
                    <p className="text-xs text-navy-700 font-medium">{product.pages}</p>
                  </div>
                )}
                {product.publisher && (
                  <div className="bg-navy-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide">Publisher</p>
                    <p className="text-xs text-navy-700 font-medium">{product.publisher}</p>
                  </div>
                )}
                {product.publish_year && (
                  <div className="bg-navy-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide">Year</p>
                    <p className="text-xs text-navy-700 font-medium">{product.publish_year}</p>
                  </div>
                )}
                {product.language && (
                  <div className="bg-navy-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide">Language</p>
                    <p className="text-xs text-navy-700 font-medium">{product.language}</p>
                  </div>
                )}
                {!product.is_digital && product.weight_kg > 0 && (
                  <div className="bg-navy-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide">Weight</p>
                    <p className="text-xs text-navy-700 font-medium">{product.weight_kg} kg</p>
                  </div>
                )}
              </div>
            )}

            {/* Stock */}
            {!product.is_digital && (
              <div className="mb-4">
                {outOfStock ? (
                  <p className="text-sm text-red-600 font-medium">Out of Stock</p>
                ) : (
                  <p className="text-xs text-navy-500">{stockSource} in stock</p>
                )}
              </div>
            )}

            {/* Qty + Add to cart */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mt-auto">
              {!product.is_digital && !outOfStock && (
                <div className="flex items-center border border-navy-200 rounded-xl overflow-hidden w-full sm:w-auto justify-center">
                  <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-2.5 hover:bg-navy-100 transition-colors">
                    <Minus size={14} />
                  </button>
                  <span className="px-4 py-2.5 text-sm font-medium text-navy-800 min-w-[40px] text-center">{qty}</span>
                  <button onClick={() => setQty(qty + 1)} className="px-3 py-2.5 hover:bg-navy-100 transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
              )}

              <button
                onClick={handleAddToCart}
                disabled={outOfStock || added || (requiresVariantPick && !selectedVariant)}
                className={`w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-colors ${
                  added
                    ? 'bg-green-600 text-white'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {added ? (
                  <>
                    <Check size={16} />
                    Added to Cart!
                  </>
                ) : (
                  <>
                    <ShoppingCart size={16} />
                    {requiresVariantPick && !selectedVariant
                      ? 'Choose an option'
                      : outOfStock
                        ? 'Out of Stock'
                        : product.is_digital ? 'Get' : 'Add to Cart'}
                  </>
                )}
              </button>
            </div>

            {/* Already in cart note */}
            {inCart && !added && (
              <p className="text-xs text-cyan-600 mt-2">
                Already in cart ({inCart.quantity}).{' '}
                <Link to="/books/cart" className="underline font-medium">View Cart</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
