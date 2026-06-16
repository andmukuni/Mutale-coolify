/* eslint-disable react-refresh/only-export-components */
/**
 * BookStoreContext — book catalog, shopping cart, and order management.
 *
 * Cart stored in localStorage under 'mm_book_cart'.
 * Orders stored in localStorage under 'mm_book_orders'.
 */
import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { generateId } from '../utils/helpers';
import { getApiBase } from '../utils/apiBase';
import { getUserAuthHeaders } from '../utils/authHeaders';
import { toast } from './ToastContext';

const BookStoreContext = createContext();
const API_BASE = getApiBase();

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    const msg = parsed?.message || parsed?.error || `Request failed (${response.status})`;
    const error = new Error(msg);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function BookStoreProvider({ children }) {
  const [books, setBooks] = useState([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [cart, setCart] = useLocalStorage('mm_book_cart', []);
  const [orders, setOrders] = useLocalStorage('mm_book_orders', []);
  const [shippingConfig, setShippingConfig] = useState(null);
  const loadingRef = useRef(false);

  // ─── Load books from API ────────────────────────────────────────
  const reloadBooks = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await apiFetch('/books');
      const loaded = Array.isArray(res?.data) ? res.data : [];
      setBooks(loaded);
    } catch {
      // keep current books on error
    } finally {
      loadingRef.current = false;
      setBooksLoaded(true);
    }
  }, []);

  const reloadShippingConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/shipping/config');
      setShippingConfig(res?.data || null);
    } catch {
      // keep null
    }
  }, []);

  useEffect(() => {
    reloadBooks();
    reloadShippingConfig();
  }, [reloadBooks, reloadShippingConfig]);

  // ─── Cart helpers ───────────────────────────────────────────────
  // A cart line is uniquely identified by `${productId}::${variantId || 'default'}`
  // so the same shirt in size M and L become separate lines.
  const cartLineKey = (productId, variantId) => `${productId}::${variantId || 'default'}`;

  const addToCart = useCallback((product, qty = 1, variant = null) => {
    if (!product) return;
    const variantId = variant?.id || null;
    const priceDelta = Number(variant?.price_delta || 0);
    const unitPrice = Number(product.price || 0) + priceDelta;
    const key = cartLineKey(product.id, variantId);
    const variantSuffix = variant?.label ? ` (${variant.label})` : '';
    toast.success(`Added "${product.title}${variantSuffix}" to cart`, { description: `${qty > 1 ? `${qty} × ` : ''}items in your cart` });
    setCart(prev => {
      const existing = prev.find(item => (item.lineKey || cartLineKey(item.bookId || item.productId, item.variantId)) === key);
      if (existing) {
        return prev.map(item =>
          (item.lineKey || cartLineKey(item.bookId || item.productId, item.variantId)) === key
            ? { ...item, quantity: item.quantity + qty }
            : item,
        );
      }
      return [...prev, {
        lineKey: key,
        // Back-compat: keep bookId for any legacy consumer
        bookId: product.id,
        productId: product.id,
        productType: product.product_type || 'book',
        title: product.title,
        price: unitPrice,
        base_price: Number(product.price || 0),
        variantId,
        variantLabel: variant?.label || '',
        variantValue: variant?.value || '',
        variantType: variant?.type || '',
        price_delta: priceDelta,
        cover_image: product.cover_image,
        weight_kg: product.weight_kg || 0,
        is_digital: product.is_digital || false,
        event_id: product.event_id || null,
        quantity: qty,
      }];
    });
  }, [setCart]);

  const updateCartItemQty = useCallback((lineKeyOrBookId, qty) => {
    const matches = (item) => {
      if (item.lineKey === lineKeyOrBookId) return true;
      // Back-compat: callers using bookId only target the default-variant line
      return (
        item.bookId === lineKeyOrBookId
        && (!item.variantId || item.variantId === 'default')
      );
    };
    if (qty <= 0) {
      setCart(prev => prev.filter(item => !matches(item)));
    } else {
      setCart(prev => prev.map(item => matches(item) ? { ...item, quantity: qty } : item));
    }
  }, [setCart]);

  const removeFromCart = useCallback((lineKeyOrBookId) => {
    setCart(prev => prev.filter(item => {
      if (item.lineKey === lineKeyOrBookId) return false;
      if (item.bookId === lineKeyOrBookId && (!item.variantId || item.variantId === 'default')) return false;
      return true;
    }));
  }, [setCart]);

  const clearCart = useCallback(() => {
    setCart([]);
  }, [setCart]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotalWeight = cart.reduce((sum, item) => sum + (item.weight_kg || 0) * item.quantity, 0);
  const hasPhysicalItems = cart.some(item => !item.is_digital);

  // ─── Shipping calculation ───────────────────────────────────────
  const calculateShipping = useCallback(({ zone = 'domestic', totalWeight = 0, subtotal = 0 } = {}) => {
    if (!shippingConfig) return { cost: 0, method: 'standard', label: 'Standard Shipping' };
    if (!hasPhysicalItems) return { cost: 0, method: 'digital', label: 'Digital Delivery (No Shipping)' };

    const cfg = shippingConfig;
    if (cfg.freeShippingEnabled && subtotal >= (cfg.freeShippingThreshold || 0)) {
      return { cost: 0, method: 'free', label: `Free Shipping (orders over ${cfg.currency || 'ZMW'} ${cfg.freeShippingThreshold})` };
    }

    const zones = cfg.zones || {};
    const zoneConfig = zones[zone] || zones.domestic || {};
    const method = zoneConfig.method || cfg.defaultMethod || 'flat';

    if (method === 'weight') {
      const baseRate = Number(zoneConfig.baseRate || cfg.baseRate || 0);
      const perKgRate = Number(zoneConfig.perKgRate || cfg.perKgRate || 0);
      const cost = baseRate + perKgRate * totalWeight;
      return { cost: Math.round(cost * 100) / 100, method: 'weight', label: zoneConfig.label || 'Weight-Based Shipping' };
    }

    // Flat rate
    const cost = Number(zoneConfig.flatRate || cfg.flatRate || 0);
    return { cost, method: 'flat', label: zoneConfig.label || 'Flat Rate Shipping' };
  }, [shippingConfig, hasPhysicalItems]);

  // ─── Orders ─────────────────────────────────────────────────────
  const placeOrder = useCallback(async ({
    user,
    shippingAddress = {},
    shippingZone = 'domestic',
    paymentMethod = '',
    paymentReference = '',
    notes = '',
    clearCartOnSuccess = true,
  }) => {
    if (!user) return { success: false, error: 'You must be logged in to place an order.' };
    if (cart.length === 0) return { success: false, error: 'Your cart is empty.' };

    const shipping = calculateShipping({ zone: shippingZone, totalWeight: cartTotalWeight, subtotal: cartTotal });

    const order = {
      id: generateId('ord'),
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      items: cart.map(item => ({ ...item })),
      subtotal: cartTotal,
      shipping_cost: shipping.cost,
      shipping_method: shipping.method,
      shipping_label: shipping.label,
      total: cartTotal + shipping.cost,
      currency: 'ZMW',
      shipping_address: shippingAddress,
      shipping_zone: shippingZone,
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      payment_status: cartTotal === 0 ? 'not_required' : 'unpaid',
      status: 'pending',
      notes,
      created_at: new Date().toISOString(),
    };

    try {
      const response = await fetch(`${API_BASE}/books/orders`, {
        method: 'POST',
        headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(order),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        return { success: false, error: json?.message || 'Unable to place order.' };
      }

      const savedOrder = json.data ? {
        ...json.data,
        items: typeof json.data.items === 'string' ? JSON.parse(json.data.items) : json.data.items,
        shipping_address: typeof json.data.shipping_address === 'string' ? JSON.parse(json.data.shipping_address) : json.data.shipping_address,
      } : order;
      setOrders(prev => [savedOrder, ...prev]);
      if (clearCartOnSuccess) clearCart();

      return { success: true, order: savedOrder };
    } catch {
      return { success: false, error: 'Unable to connect to the order service.' };
    }
  }, [cart, cartTotal, cartTotalWeight, calculateShipping, clearCart, setOrders]);

  const getUserOrders = useCallback((userId) => {
    return orders.filter(o => o.user_id === userId);
  }, [orders]);

  return (
    <BookStoreContext.Provider value={{
      books,
      // Forward-looking alias — products is the generalised name.
      products: books,
      booksLoaded,
      productsLoaded: booksLoaded,
      reloadBooks,
      reloadProducts: reloadBooks,
      cart,
      addToCart,
      updateCartItemQty,
      removeFromCart,
      clearCart,
      cartTotal,
      cartItemCount,
      cartTotalWeight,
      hasPhysicalItems,
      shippingConfig,
      calculateShipping,
      placeOrder,
      orders,
      getUserOrders,
    }}>
      {children}
    </BookStoreContext.Provider>
  );
}

export function useBookStore() {
  const ctx = useContext(BookStoreContext);
  if (!ctx) throw new Error('useBookStore must be used within a BookStoreProvider');
  return ctx;
}

// Forward-looking alias — prefer useShopStore in new code.
export const useShopStore = useBookStore;
export const ShopStoreProvider = BookStoreProvider;
