/** Default site navigation items (seeded into menu_items). */
export const DEFAULT_MENU_ITEMS = [
  { id: 'mi_main_home', location: 'main', label: 'Home', url: '/', parent_id: null, sort_order: 10, badge: false },
  { id: 'mi_main_about', location: 'main', label: 'About', url: '/about', parent_id: null, sort_order: 20, badge: false },
  { id: 'mi_main_experience', location: 'main', label: 'Experience', url: '/experience', parent_id: null, sort_order: 30, badge: false },
  { id: 'mi_main_events', location: 'main', label: 'Events', url: '/events', parent_id: null, sort_order: 40, badge: false },
  { id: 'mi_main_events_upcoming', location: 'main', label: 'Upcoming Events', url: '/events?view=upcoming', parent_id: 'mi_main_events', sort_order: 10, badge: false },
  { id: 'mi_main_events_past', location: 'main', label: 'Past Events', url: '/events?view=past', parent_id: 'mi_main_events', sort_order: 20, badge: false },
  { id: 'mi_main_shop', location: 'main', label: 'Shop', url: '/books', parent_id: null, sort_order: 50, badge: true },
  { id: 'mi_main_blog', location: 'main', label: 'Blog', url: '/blog', parent_id: null, sort_order: 60, badge: false },
  { id: 'mi_main_publications', location: 'main', label: 'Publications', url: '/publications', parent_id: null, sort_order: 70, badge: false },
  { id: 'mi_main_contact', location: 'main', label: 'Contact', url: '/contact', parent_id: null, sort_order: 80, badge: false },

  { id: 'mi_footer_about', location: 'footer', label: 'About', url: '/about', parent_id: null, sort_order: 10, badge: false },
  { id: 'mi_footer_experience', location: 'footer', label: 'Experience', url: '/experience', parent_id: null, sort_order: 20, badge: false },
  { id: 'mi_footer_events', location: 'footer', label: 'Events', url: '/events', parent_id: null, sort_order: 30, badge: false },
  { id: 'mi_footer_blog', location: 'footer', label: 'Blog', url: '/blog', parent_id: null, sort_order: 40, badge: false },
  { id: 'mi_footer_publications', location: 'footer', label: 'Publications', url: '/publications', parent_id: null, sort_order: 50, badge: false },
  { id: 'mi_footer_contact', location: 'footer', label: 'Contact', url: '/contact', parent_id: null, sort_order: 60, badge: false },
];

export const MENU_LOCATIONS = ['main', 'footer'];

/**
 * Build nested nav links from flat menu rows (main menu only uses nesting).
 * @param {Array} items
 * @param {{ includeHidden?: boolean, location?: string }} options
 */
export function buildMenuTree(items, { includeHidden = false, location = 'main' } = {}) {
  const list = (Array.isArray(items) ? items : [])
    .filter((item) => item.location === location)
    .filter((item) => includeHidden || item.is_visible !== false)
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.label).localeCompare(String(b.label)));

  const roots = list.filter((item) => !item.parent_id);

  return roots.map((root) => {
    const link = {
      id: root.id,
      to: root.url,
      label: root.label,
    };
    if (root.badge) link.badge = true;
    if (root.open_in_new_tab) link.openInNewTab = true;

    const children = list.filter((child) => child.parent_id === root.id);
    if (children.length > 0) {
      link.children = children.map((child) => ({
        id: child.id,
        to: child.url,
        label: child.label,
        ...(child.open_in_new_tab ? { openInNewTab: true } : {}),
      }));
    }
    return link;
  });
}

/** Flat footer / quick-link rows → { to, label }[] */
export function buildFlatMenuLinks(items, { includeHidden = false, location = 'footer' } = {}) {
  return buildMenuTree(items, { includeHidden, location }).map(({ to, label, openInNewTab }) => ({
    to,
    label,
    ...(openInNewTab ? { openInNewTab: true } : {}),
  }));
}
