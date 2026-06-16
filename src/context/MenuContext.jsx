import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { buildFlatMenuLinks, buildMenuTree } from '../../shared/menuItems.js';
import { navLinks as defaultNavLinks } from '../config/siteHeader.js';
import { fetchMenuItems } from '../utils/menuItemsApi';

const MenuContext = createContext(null);

const defaultFooterLinks = [
  { to: '/about', label: 'About' },
  { to: '/experience', label: 'Experience' },
  { to: '/events', label: 'Events' },
  { to: '/blog', label: 'Blog' },
  { to: '/publications', label: 'Publications' },
  { to: '/contact', label: 'Contact' },
];

export function MenuProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMenuItems()
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => {
    const mainNavLinks = items.length > 0
      ? buildMenuTree(items, { location: 'main' })
      : defaultNavLinks;
    const footerLinks = items.length > 0
      ? buildFlatMenuLinks(items, { location: 'footer' })
      : defaultFooterLinks;

    return {
      loaded,
      items,
      mainNavLinks,
      footerLinks,
    };
  }, [items, loaded]);

  return (
    <MenuContext.Provider value={value}>
      {children}
    </MenuContext.Provider>
  );
}

export function useSiteMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    return {
      loaded: true,
      items: [],
      mainNavLinks: defaultNavLinks,
      footerLinks: defaultFooterLinks,
    };
  }
  return ctx;
}
