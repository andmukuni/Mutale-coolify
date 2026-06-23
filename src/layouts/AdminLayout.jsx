import { useEffect, useState, Suspense } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  PlusCircle,
  FileEdit,
  FilePlus2,
  FileText,
  Users,
  Settings,
  Menu,
  X,
  ChevronDown,
  Receipt,
  ReceiptText,
  FileUser,
  ArrowDownUp,
  Landmark,
  MessageSquare,
  PanelsTopLeft,
  Layers,
  BookOpen,
  ShoppingCart,
  Truck,
  Video,
  Percent,
  Tags,
  Award,
  Shield,
  Handshake,
  Navigation,
} from 'lucide-react';
import SiteLogo from '../components/SiteLogo';
import ThemeToggle from '../components/ThemeToggle';
import AdminUserMenu from '../components/admin/AdminUserMenu';
import { useAuth } from '../context/AuthContext';
import { NAV_PERMISSION_MAP } from '../../shared/rbacPermissions.js';
import { getApiBase } from '../utils/apiBase';

const CONTENT_NAVIGATION = [
  { key: 'dashboard', name: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
  {
    key: 'events-group',
    name: 'Events',
    icon: CalendarDays,
    children: [
      { key: 'all-events', name: 'All Events', to: '/admin/events', icon: CalendarDays },
      { key: 'create-event', name: 'Create Event', to: '/admin/events/new', icon: PlusCircle, end: true },
      { key: 'certificates', name: 'Certificates', to: '/admin/certificates', icon: Award },
    ],
  },
  { key: 'coupons', name: 'Coupon Management', to: '/admin/coupons', icon: Percent },
  { key: 'attendance', name: 'Subscribers / Attendance', to: '/admin/events', icon: Users },
  {
    key: 'blog-group',
    name: 'Blog',
    icon: FileEdit,
    children: [
      { key: 'all-blog', name: 'All Blog Posts', to: '/admin/blog', icon: FileEdit },
      { key: 'create-blog', name: 'Create Blog Post', to: '/admin/blog/new', icon: FilePlus2, end: true },
    ],
  },
  {
    key: 'publications-group',
    name: 'Publications',
    icon: FileText,
    children: [
      { key: 'all-publications', name: 'All Publications', to: '/admin/publications', icon: FileText },
      { key: 'create-publication', name: 'Create Publication', to: '/admin/publications/new', icon: FilePlus2, end: true },
    ],
  },
  {
    key: 'books-group',
    name: 'Shop',
    icon: BookOpen,
    children: [
      { key: 'all-books', name: 'All Products', to: '/admin/books', icon: BookOpen },
      { key: 'create-book', name: 'Add Product', to: '/admin/books/new', icon: PlusCircle, end: true },
      { key: 'book-orders', name: 'Orders', to: '/admin/books/orders', icon: ShoppingCart },
      { key: 'product-types', name: 'Product Types', to: '/admin/shop/product-types', icon: Tags },
      { key: 'shipping-settings', name: 'Shipping', to: '/admin/shipping', icon: Truck },
    ],
  },
];

const SYSTEM_NAVIGATION = [
  { key: 'website-pages', name: 'Website Pages', to: '/admin/website-pages', icon: PanelsTopLeft },
  { key: 'sections', name: 'Sections', to: '/admin/sections', icon: Layers },
  { key: 'partner-logos', name: 'Partner Logos', to: '/admin/partner-logos', icon: Handshake },
  { key: 'menu', name: 'Menu Management', to: '/admin/menu', icon: Navigation },
  { key: 'users', name: 'Users Table', to: '/admin/users', icon: Users },
  { key: 'messages', name: 'Messages', to: '/admin/messages', icon: MessageSquare },
  { key: 'ledger', name: 'Transaction Ledger', to: '/admin/finance/ledger', icon: ReceiptText },
  { key: 'receipts', name: 'Receipts', to: '/admin/receipts', icon: Receipt },
  { key: 'cv', name: 'CVs', to: '/admin/cv', icon: FileUser },
  { key: 'payments-history', name: 'Payments History', to: '/admin/finance/payments-history', icon: ReceiptText },
  { key: 'collections', name: 'Collections', to: '/admin/finance/collections', icon: ArrowDownUp },
  { key: 'settlement-accounts', name: 'Settlement Accounts', to: '/admin/finance/settlement-accounts', icon: Landmark },
  { key: 'payouts', name: 'Payouts', to: '/admin/finance/payouts', icon: Landmark },
  { key: 'access-control', name: 'Access control', to: '/admin/access-control', icon: Shield },
];

function navItemAllowed(navKey, hasPermission) {
  if (!navKey) return true;
  const perm = NAV_PERMISSION_MAP[navKey];
  if (!perm) return true;
  return hasPermission(perm);
}

function filterContentNav(items, hasPermission) {
  return items
    .map((item) => {
      if (item.children) {
        const children = item.children.filter((c) => navItemAllowed(c.key, hasPermission));
        if (children.length === 0) return null;
        return { ...item, children };
      }
      return navItemAllowed(item.key, hasPermission) ? item : null;
    })
    .filter(Boolean);
}

function AdminOutletLoader() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-100 border-t-cyan-600" />
        <p className="text-sm text-navy-500">Loading page…</p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const [eventsOpen, setEventsOpen] = useState(true);
  const [blogOpen, setBlogOpen] = useState(true);
  const [publicationsOpen, setPublicationsOpen] = useState(true);
  const [booksOpen, setBooksOpen] = useState(true);

  const [videoStatus, setVideoStatus] = useState(null);

  const contentNavigation = filterContentNav(CONTENT_NAVIGATION, hasPermission);
  const systemNavigation = SYSTEM_NAVIGATION.filter((item) => navItemAllowed(item.key, hasPermission));
  const canManageSettings = navItemAllowed('settings', hasPermission);

  useEffect(() => {
    let cancelled = false;
    const API_BASE = getApiBase();
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/settings/video/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setVideoStatus(data);
      } catch {
        if (!cancelled) {
          setVideoStatus({
            defaultProvider: 'zoom',
            providers: {
              zoom: { configured: false },
              daily: { configured: false },
            },
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  const activeVideoProvider = videoStatus?.defaultProvider === 'daily' ? 'daily' : 'zoom';
  const activeProviderStatus = videoStatus?.providers?.[activeVideoProvider] || {};
  const videoConfigured = Boolean(activeProviderStatus?.configured);

  const isContentItemActive = (item, defaultIsActive) => {
    const { pathname } = location;

    if (item.key === 'attendance') {
      return pathname.includes('/attendees');
    }

    if (item.key === 'all-events') {
      return pathname.startsWith('/admin/events')
        && !pathname.includes('/attendees')
        && pathname !== '/admin/events/new';
    }

    if (item.key === 'coupons') {
      return pathname.startsWith('/admin/coupons');
    }

    if (item.key === 'all-blog') {
      return pathname.startsWith('/admin/blog')
        && pathname !== '/admin/blog/new';
    }

    if (item.key === 'all-publications') {
      return pathname.startsWith('/admin/publications')
        && pathname !== '/admin/publications/new';
    }

    if (item.key === 'all-books') {
      return pathname.startsWith('/admin/books')
        && pathname !== '/admin/books/new'
        && pathname !== '/admin/books/orders'
        && !pathname.startsWith('/admin/books/product-types');
    }

    if (item.key === 'product-types') {
      return pathname.startsWith('/admin/shop/product-types')
        || pathname.startsWith('/admin/books/product-types');
    }

    return defaultIsActive;
  };

  const isEventsGroupActive = () => {
    const { pathname } = location;
    return pathname.startsWith('/admin/events') || pathname.startsWith('/admin/coupons');
  };

  const isBlogGroupActive = () => {
    const { pathname } = location;
    return pathname.startsWith('/admin/blog');
  };

  const isPublicationsGroupActive = () => {
    const { pathname } = location;
    return pathname.startsWith('/admin/publications');
  };

  const isBooksGroupActive = () => {
    const { pathname } = location;
    return pathname.startsWith('/admin/books')
      || pathname.startsWith('/admin/shipping')
      || pathname.startsWith('/admin/shop');
  };

  useEffect(() => {
    if (!sidebarOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-navy-50">
      {/* ─── Sidebar ─── */}
      <aside
        className={`theme-fixed fixed inset-y-0 left-0 z-50 w-72 bg-navy-950 flex flex-col transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-6 h-16 border-b border-navy-800">
          <Link to="/admin" className="flex items-center gap-2.5 min-w-0">
            <SiteLogo variant="white" className="h-8 w-auto shrink-0" />
            <div className="min-w-0">
              <span className="text-white font-semibold text-sm block leading-tight">
                Admin Portal
              </span>
              <span className="text-navy-400 text-[10px] block leading-tight">
                Portfolio Manager
              </span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-navy-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 text-[10px] font-semibold text-navy-500 uppercase tracking-wider mb-2">
            Content
          </p>
          {contentNavigation.map((item) => {
            if (item.key === 'events-group') {
              const groupActive = isEventsGroupActive();
              return (
                <div key={item.key} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setEventsOpen((prev) => !prev)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      groupActive
                        ? 'bg-cyan-600/10 text-cyan-400'
                        : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={18} />
                    <span className="flex-1 text-left">{item.name}</span>
                    <ChevronDown size={16} className={`transition-transform ${eventsOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {eventsOpen && (
                    <div className="ml-4 pl-3 border-l border-navy-800 space-y-1">
                      {item.children.map((subItem) => (
                        <NavLink
                          key={subItem.key}
                          to={subItem.to}
                          end={subItem.end}
                          onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => {
                            const active = isContentItemActive(subItem, isActive);
                            return `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              active
                                ? 'bg-cyan-600/10 text-cyan-400'
                                : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                            }`;
                          }}
                        >
                          <subItem.icon size={16} />
                          {subItem.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (item.key === 'blog-group') {
              const groupActive = isBlogGroupActive();
              return (
                <div key={item.key} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setBlogOpen((prev) => !prev)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      groupActive
                        ? 'bg-cyan-600/10 text-cyan-400'
                        : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={18} />
                    <span className="flex-1 text-left">{item.name}</span>
                    <ChevronDown size={16} className={`transition-transform ${blogOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {blogOpen && (
                    <div className="ml-4 pl-3 border-l border-navy-800 space-y-1">
                      {item.children.map((subItem) => (
                        <NavLink
                          key={subItem.key}
                          to={subItem.to}
                          end={subItem.end}
                          onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => {
                            const active = isContentItemActive(subItem, isActive);
                            return `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              active
                                ? 'bg-cyan-600/10 text-cyan-400'
                                : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                            }`;
                          }}
                        >
                          <subItem.icon size={16} />
                          {subItem.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (item.key === 'publications-group') {
              const groupActive = isPublicationsGroupActive();
              return (
                <div key={item.key} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setPublicationsOpen((prev) => !prev)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      groupActive
                        ? 'bg-cyan-600/10 text-cyan-400'
                        : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={18} />
                    <span className="flex-1 text-left">{item.name}</span>
                    <ChevronDown size={16} className={`transition-transform ${publicationsOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {publicationsOpen && (
                    <div className="ml-4 pl-3 border-l border-navy-800 space-y-1">
                      {item.children.map((subItem) => (
                        <NavLink
                          key={subItem.key}
                          to={subItem.to}
                          end={subItem.end}
                          onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => {
                            const active = isContentItemActive(subItem, isActive);
                            return `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              active
                                ? 'bg-cyan-600/10 text-cyan-400'
                                : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                            }`;
                          }}
                        >
                          <subItem.icon size={16} />
                          {subItem.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (item.key === 'books-group') {
              const groupActive = isBooksGroupActive();
              return (
                <div key={item.key} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setBooksOpen((prev) => !prev)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      groupActive
                        ? 'bg-cyan-600/10 text-cyan-400'
                        : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={18} />
                    <span className="flex-1 text-left">{item.name}</span>
                    <ChevronDown size={16} className={`transition-transform ${booksOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {booksOpen && (
                    <div className="ml-4 pl-3 border-l border-navy-800 space-y-1">
                      {item.children.map((subItem) => (
                        <NavLink
                          key={subItem.key}
                          to={subItem.to}
                          end={subItem.end}
                          onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => {
                            const active = isContentItemActive(subItem, isActive);
                            return `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              active
                                ? 'bg-cyan-600/10 text-cyan-400'
                                : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                            }`;
                          }}
                        >
                          <subItem.icon size={16} />
                          {subItem.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.name}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => {
                  const active = isContentItemActive(item, isActive);
                  return `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-cyan-600/10 text-cyan-400'
                      : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                  }`;
                }}
              >
                <item.icon size={18} />
                {item.name}
              </NavLink>
            );
          })}

          <div className="pt-4 mt-4 border-t border-navy-800">
            <p className="px-3 text-[10px] font-semibold text-navy-500 uppercase tracking-wider mb-2">
              System
            </p>
            {systemNavigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-cyan-600/10 text-cyan-400'
                      : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                  }`
                }
              >
                <item.icon size={18} />
                {item.name}
              </NavLink>
            ))}
          </div>

          {/* ── Zoom Integration Status ── */}
          <div className="pt-4 mt-4 border-t border-navy-800">
            <p className="px-3 text-[10px] font-semibold text-navy-500 uppercase tracking-wider mb-2">
              Integrations
            </p>
            <NavLink
              to="/admin/settings?tab=video"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-600/10 text-cyan-400'
                    : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <Video size={18} />
              <span className="flex-1">Video</span>
              {videoStatus && (
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      videoConfigured
                        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                        : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]'
                    }`}
                  />
                  <span className={`text-[10px] font-medium ${videoConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {activeVideoProvider === 'daily' ? 'Daily' : 'Zoom'}
                  </span>
                </span>
              )}
            </NavLink>

            {videoStatus && activeVideoProvider === 'zoom' && activeProviderStatus.oauth && (
              <div className="mx-3 mt-1.5 p-2.5 rounded-lg bg-navy-900/60 space-y-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`h-1.5 w-1.5 rounded-full ${activeProviderStatus.oauth ? 'bg-emerald-400' : 'bg-navy-600'}`} />
                  <span className={activeProviderStatus.oauth ? 'text-emerald-400/90' : 'text-navy-500'}>OAuth</span>
                  <span className={`h-1.5 w-1.5 rounded-full ml-auto ${activeProviderStatus.hostEmail ? 'bg-emerald-400' : 'bg-navy-600'}`} />
                  <span className={activeProviderStatus.hostEmail ? 'text-emerald-400/90' : 'text-navy-500'}>Host</span>
                </div>
              </div>
            )}
            {videoStatus && activeVideoProvider === 'daily' && (
              <div className="mx-3 mt-1.5 p-2.5 rounded-lg bg-navy-900/60 text-[11px] text-navy-400">
                Default: Daily.co · {videoConfigured ? 'ready' : 'needs setup'}
              </div>
            )}
          </div>
        </nav>

        {canManageSettings && (
          <div className="shrink-0 border-t border-navy-800 p-4">
            <NavLink
              to="/admin/settings"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-600/10 text-cyan-400'
                    : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <Settings size={18} />
              System Settings
            </NavLink>
          </div>
        )}
      </aside>

      {/* ─── Mobile overlay ─── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Topbar ─── */}
      <header className="fixed top-0 right-0 left-0 md:left-72 z-30 h-16 bg-white border-b border-navy-100 flex items-center justify-between px-4 sm:px-6">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden p-2 rounded-lg text-navy-500 hover:bg-navy-100 hover:text-navy-700 transition-colors"
        >
          <Menu size={20} />
        </button>

        <div className="hidden md:block">
          <p className="text-sm text-navy-400">
            Welcome back,{' '}
            <span className="font-medium text-navy-700">{user?.name?.split(' ')[0] || 'Admin'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          <ThemeToggle variant="admin" />
          {videoStatus && (
            <Link
              to="/admin/settings?tab=video"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                videoConfigured
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
              }`}
              title={videoConfigured
                ? `${activeVideoProvider === 'daily' ? 'Daily.co' : 'Zoom'} is configured`
                : 'Video provider needs setup'}
            >
              <Video size={14} />
              <span className={`h-2 w-2 rounded-full ${
                videoConfigured
                  ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]'
                  : 'bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]'
              }`} />
              <span className="hidden sm:inline">
                {videoConfigured
                  ? (activeVideoProvider === 'daily' ? 'Daily Connected' : 'Zoom Connected')
                  : 'Video Setup'}
              </span>
            </Link>
          )}
          <AdminUserMenu />
          <Link to="/admin" className="md:hidden shrink-0" aria-label="Admin home">
            <SiteLogo variant="primary" className="h-8 w-auto" />
          </Link>
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main className="md:ml-72 mt-16 min-h-[calc(100vh-4rem)] overflow-x-clip">
        <div className="p-4 sm:p-6 lg:px-8">
          <Suspense fallback={<AdminOutletLoader />}>
            <Outlet key={location.pathname} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
