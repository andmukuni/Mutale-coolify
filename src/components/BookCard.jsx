import { Link } from 'react-router-dom';
import { ShoppingCart, Sparkles } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { useBookStore } from '../context/BookStoreContext';
import { useProductTypes } from '../context/ProductTypesContext';
import { getProductTypeIcon } from '../utils/productTypeIcons';

export default function BookCard({ book }) {
  const { formatEventPrice } = useCurrency();
  const { addToCart } = useBookStore();
  const { productTypesByValue } = useProductTypes();
  const isFree = !book.price || book.price === 0;
  const hasDiscount = book.compare_at_price && book.compare_at_price > book.price;
  const productType = book.product_type || 'book';
  const typeMeta = productTypesByValue?.[productType];
  const TypeIcon = getProductTypeIcon(typeMeta?.icon);
  const typeLabel = typeMeta?.label || 'Product';
  const hasVariants = Array.isArray(book.variants) && book.variants.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden hover:shadow-xl hover:border-cyan-200 transition-all duration-300 group flex flex-col">
      {/* Cover image */}
      <Link to={`/books/${book.slug}`} className="block overflow-hidden bg-navy-50">
        {book.cover_image ? (
          <img
            src={book.cover_image}
            alt={book.title}
            className="w-full h-56 object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-56 flex items-center justify-center bg-gradient-to-br from-navy-100 to-cyan-50">
            <TypeIcon size={48} className="text-navy-300" />
          </div>
        )}
      </Link>

      <div className="p-5 flex flex-col flex-1">
        {/* Type + tagline badges */}
        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full">
            <TypeIcon size={11} />
            {typeLabel}
          </span>
          {book.tagline && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full max-w-[160px] truncate">
              <Sparkles size={11} />
              <span className="truncate">{book.tagline}</span>
            </span>
          )}
        </div>

        {/* Title */}
        <Link to={`/books/${book.slug}`}>
          <h3 className="text-sm font-bold text-navy-900 mb-1 group-hover:text-cyan-700 transition-colors line-clamp-2 break-words">
            {book.title}
          </h3>
        </Link>

        {/* Author (books only) or category fallback */}
        {productType === 'book' && book.author ? (
          <p className="text-xs text-navy-500 mb-3">{book.author}</p>
        ) : book.category ? (
          <p className="text-xs text-navy-500 mb-3">{book.category}</p>
        ) : null}

        {/* Short description */}
        {book.short_description && (
          <p className="text-xs text-navy-400 mb-4 line-clamp-2 flex-1">
            {book.short_description}
          </p>
        )}

        {/* Price + action */}
        <div className="mt-auto pt-3 border-t border-navy-100 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            {isFree ? (
              <span className="text-sm font-bold text-green-600">Free</span>
            ) : (
              <>
                <span className="text-sm font-bold text-navy-900">
                  {formatEventPrice(book)}
                </span>
                {hasDiscount && (
                  <span className="text-xs text-navy-400 line-through">
                    {formatEventPrice({ ...book, price: book.compare_at_price })}
                  </span>
                )}
              </>
            )}
          </div>

          {hasVariants ? (
            <Link
              to={`/books/${book.slug}`}
              className="inline-flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
            >
              <ShoppingCart size={13} />
              Choose options
            </Link>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                addToCart(book, 1);
              }}
              disabled={!book.is_published || (book.stock != null && book.stock <= 0 && !book.is_digital)}
              className="inline-flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <ShoppingCart size={13} />
              {book.is_digital ? 'Get' : 'Add to Cart'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
