/* eslint-disable react-refresh/only-export-components */
/**
 * ProductTypesContext — caches the dynamic product-type catalogue.
 *
 * One network fetch on mount, in-memory cache, and a `reload()` helper for
 * admin pages to refresh after CRUD operations.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getApiBase } from '../utils/apiBase';
import { getAdminAuthHeaders } from '../utils/authHeaders';

const ProductTypesContext = createContext(null);
const API_BASE = getApiBase();

/**
 * Sensible fallback in case the API is unavailable on first paint — keeps the
 * shop functional with the same defaults that the server seeds.
 */
const FALLBACK_TYPES = [
  { id: 'pt_book',       value: 'book',       label: 'Book',         icon: 'book',         default_category: 'Laboratory Science', is_active: true, sort_order: 10 },
  { id: 'pt_tshirt',     value: 'tshirt',     label: 'T-Shirt',      icon: 'shirt',        default_category: 'Apparel',            is_active: true, sort_order: 20 },
  { id: 'pt_sweatshirt', value: 'sweatshirt', label: 'Sweatshirt',   icon: 'shirt',        default_category: 'Apparel',            is_active: true, sort_order: 30 },
  { id: 'pt_cap',        value: 'cap',        label: 'Cap / Hat',    icon: 'shirt',        default_category: 'Apparel',            is_active: true, sort_order: 40 },
  { id: 'pt_mug',        value: 'mug',        label: 'Mug',          icon: 'coffee',       default_category: 'Drinkware',          is_active: true, sort_order: 50 },
  { id: 'pt_keyholder',  value: 'keyholder',  label: 'Key Holder',   icon: 'tag',          default_category: 'Accessories',        is_active: true, sort_order: 60 },
  { id: 'pt_wristwatch', value: 'wristwatch', label: 'Wrist Watch',  icon: 'watch',        default_category: 'Accessories',        is_active: true, sort_order: 70 },
  { id: 'pt_bag',        value: 'bag',        label: 'Bag / Tote',   icon: 'shopping-bag', default_category: 'Accessories',        is_active: true, sort_order: 80 },
  { id: 'pt_sticker',    value: 'sticker',    label: 'Sticker',      icon: 'sticker',      default_category: 'Stickers',           is_active: true, sort_order: 90 },
  { id: 'pt_other',      value: 'other',      label: 'Other',        icon: 'box',          default_category: 'Other',              is_active: true, sort_order: 999 },
];

export function ProductTypesProvider({ children }) {
  const [productTypes, setProductTypes] = useState(FALLBACK_TYPES);
  const [loaded, setLoaded] = useState(false);
  const loadingRef = useRef(false);

  const reload = useCallback(async ({ includeInactive = false } = {}) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const url = includeInactive
        ? `${API_BASE}/product-types?all=1`
        : `${API_BASE}/product-types`;
      const headers = includeInactive ? getAdminAuthHeaders() : undefined;
      const res = await fetch(url, { cache: 'no-store', headers });
      const json = await res.json().catch(() => ({}));
      if (Array.isArray(json?.data) && json.data.length > 0) {
        setProductTypes(json.data);
      }
    } catch {
      // keep current (fallback or previously-loaded) catalogue
    } finally {
      loadingRef.current = false;
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const productTypesByValue = useMemo(() => {
    const map = {};
    for (const t of productTypes) map[String(t.value)] = t;
    return map;
  }, [productTypes]);

  const activeProductTypes = useMemo(
    () => productTypes.filter(t => t.is_active !== false && t.is_active !== 0),
    [productTypes],
  );

  const value = useMemo(() => ({
    productTypes,
    activeProductTypes,
    productTypesByValue,
    loaded,
    reload,
  }), [productTypes, activeProductTypes, productTypesByValue, loaded, reload]);

  return (
    <ProductTypesContext.Provider value={value}>
      {children}
    </ProductTypesContext.Provider>
  );
}

export function useProductTypes() {
  const ctx = useContext(ProductTypesContext);
  if (!ctx) {
    // Surface a sensible fallback when used outside the provider (e.g. isolated tests)
    return {
      productTypes: FALLBACK_TYPES,
      activeProductTypes: FALLBACK_TYPES,
      productTypesByValue: FALLBACK_TYPES.reduce((acc, t) => { acc[t.value] = t; return acc; }, {}),
      loaded: true,
      reload: async () => {},
    };
  }
  return ctx;
}
