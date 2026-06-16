/**
 * Admin RBAC permission catalog — shared by API and admin UI.
 */

export const RBAC_SUPER_ADMIN_SLUG = 'super_admin';

export const ADMIN_PERMISSIONS = [
  { key: 'dashboard.view', name: 'View dashboard', group: 'General' },
  { key: 'events.view', name: 'View events', group: 'Events' },
  { key: 'events.manage', name: 'Manage events', group: 'Events' },
  { key: 'certificates.manage', name: 'Manage certificates', group: 'Events' },
  { key: 'coupons.manage', name: 'Manage coupons', group: 'Events' },
  { key: 'blog.view', name: 'View blog', group: 'Content' },
  { key: 'blog.manage', name: 'Manage blog', group: 'Content' },
  { key: 'publications.view', name: 'View publications', group: 'Content' },
  { key: 'publications.manage', name: 'Manage publications', group: 'Content' },
  { key: 'shop.view', name: 'View shop products', group: 'Shop' },
  { key: 'shop.manage', name: 'Manage shop products', group: 'Shop' },
  { key: 'shop.orders', name: 'Manage orders', group: 'Shop' },
  { key: 'users.view', name: 'View users', group: 'Users' },
  { key: 'users.manage', name: 'Manage users', group: 'Users' },
  { key: 'messages.view', name: 'View contact messages', group: 'Users' },
  { key: 'finance.view', name: 'View finance & ledger', group: 'Finance' },
  { key: 'finance.payouts', name: 'Manage payouts & settlements', group: 'Finance' },
  { key: 'receipts.view', name: 'View receipts', group: 'Finance' },
  { key: 'cv.view', name: 'View CV purchases', group: 'Finance' },
  { key: 'website.manage', name: 'Manage website pages', group: 'System' },
  { key: 'settings.manage', name: 'Manage system settings', group: 'System' },
  { key: 'rbac.manage', name: 'Manage roles & permissions', group: 'System' },
];

export const ALL_PERMISSION_KEYS = ADMIN_PERMISSIONS.map((p) => p.key);

/** Default roles seeded on first run */
export const DEFAULT_ADMIN_ROLES = [
  {
    slug: RBAC_SUPER_ADMIN_SLUG,
    name: 'Super Admin',
    description: 'Full access to all admin features.',
    is_system: true,
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    slug: 'content_manager',
    name: 'Content Manager',
    description: 'Events, blog, publications, and shop catalog.',
    is_system: true,
    permissions: [
      'dashboard.view',
      'events.view', 'events.manage', 'certificates.manage', 'coupons.manage',
      'blog.view', 'blog.manage',
      'publications.view', 'publications.manage',
      'shop.view', 'shop.manage', 'shop.orders',
      'receipts.view',
    ],
  },
  {
    slug: 'finance_manager',
    name: 'Finance Manager',
    description: 'Ledger, collections, payouts, receipts, and CV sales.',
    is_system: true,
    permissions: [
      'dashboard.view',
      'finance.view', 'finance.payouts',
      'receipts.view', 'cv.view',
      'shop.orders',
      'users.view',
    ],
  },
  {
    slug: 'support_agent',
    name: 'Support Agent',
    description: 'View users, messages, and registrations.',
    is_system: true,
    permissions: [
      'dashboard.view',
      'users.view', 'messages.view',
      'events.view', 'receipts.view',
    ],
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read-only access across admin modules.',
    is_system: true,
    permissions: ALL_PERMISSION_KEYS.filter((k) => k.endsWith('.view') || k === 'dashboard.view'),
  },
];

/** Sidebar / route hints for the admin UI */
export const NAV_PERMISSION_MAP = {
  dashboard: 'dashboard.view',
  events: 'events.view',
  'events-create': 'events.manage',
  certificates: 'certificates.manage',
  coupons: 'coupons.manage',
  blog: 'blog.view',
  'blog-create': 'blog.manage',
  publications: 'publications.view',
  'publications-create': 'publications.manage',
  shop: 'shop.view',
  'shop-create': 'shop.manage',
  'book-orders': 'shop.orders',
  'product-types': 'shop.manage',
  shipping: 'shop.manage',
  users: 'users.view',
  messages: 'messages.view',
  ledger: 'finance.view',
  receipts: 'receipts.view',
  cv: 'cv.view',
  'payments-history': 'finance.view',
  collections: 'finance.view',
  'settlement-accounts': 'finance.payouts',
  payouts: 'finance.payouts',
  'website-pages': 'website.manage',
  'partner-logos': 'website.manage',
  menu: 'website.manage',
  settings: 'settings.manage',
  'access-control': 'rbac.manage',
};

export function permissionMatches(have = [], need = '') {
  const required = String(need || '').trim();
  if (!required) return true;
  const set = new Set((have || []).map((p) => String(p).trim()));
  if (set.has(RBAC_SUPER_ADMIN_SLUG)) return true;
  if (set.has('*')) return true;
  return set.has(required);
}

export function hasAnyPermission(have = [], needs = []) {
  const list = Array.isArray(needs) ? needs : [needs];
  return list.some((n) => permissionMatches(have, n));
}
