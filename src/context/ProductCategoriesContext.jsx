/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getApiBase } from '../utils/apiBase';
import { getAdminAuthHeaders } from '../utils/authHeaders';

const ProductCategoriesContext = createContext(null);
const API_BASE = getApiBase();

const FALLBACK_CATEGORIES = [
  { id: 'pc_lab_science', name: 'Laboratory Science', scope: 'book', is_active: true, sort_order: 10 },
  { id: 'pc_apparel', name: 'Apparel', scope: 'merch', is_active: true, sort_order: 10 },
  { id: 'pc_other', name: 'Other', scope: 'both', is_active: true, sort_order: 999 },
];

export function ProductCategoriesProvider({ children }) {
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [loaded, setLoaded] = useState(false);
  const loadingRef = useRef(false);

  const reload = useCallback(async ({ includeInactive = false, scope = '' } = {}) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const params = new URLSearchParams();
      if (includeInactive) params.set('all', '1');
      if (scope) params.set('scope', scope);
      const qs = params.toString();
      const headers = includeInactive ? getAdminAuthHeaders() : undefined;
      const res = await fetch(`${API_BASE}/product-categories${qs ? `?${qs}` : ''}`, {
        cache: 'no-store',
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (Array.isArray(json?.data) && json.data.length > 0) {
        setCategories(json.data);
      }
    } catch {
      // keep fallback / previous catalogue
    } finally {
      loadingRef.current = false;
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active !== false && c.is_active !== 0),
    [categories],
  );

  const categoriesByName = useMemo(() => {
    const map = {};
    for (const cat of categories) map[String(cat.name)] = cat;
    return map;
  }, [categories]);

  const getCategoriesForScope = useCallback((scope = 'merch') => {
    const key = String(scope || 'merch').toLowerCase();
    return activeCategories.filter((cat) => cat.scope === key || cat.scope === 'both');
  }, [activeCategories]);

  const value = useMemo(() => ({
    categories,
    activeCategories,
    categoriesByName,
    loaded,
    reload,
    getCategoriesForScope,
  }), [categories, activeCategories, categoriesByName, loaded, reload, getCategoriesForScope]);

  return (
    <ProductCategoriesContext.Provider value={value}>
      {children}
    </ProductCategoriesContext.Provider>
  );
}

export function useProductCategories() {
  const ctx = useContext(ProductCategoriesContext);
  if (!ctx) {
    return {
      categories: FALLBACK_CATEGORIES,
      activeCategories: FALLBACK_CATEGORIES,
      categoriesByName: FALLBACK_CATEGORIES.reduce((acc, c) => { acc[c.name] = c; return acc; }, {}),
      loaded: true,
      reload: async () => {},
      getCategoriesForScope: (scope = 'merch') => FALLBACK_CATEGORIES.filter(
        (c) => c.scope === scope || c.scope === 'both',
      ),
    };
  }
  return ctx;
}
