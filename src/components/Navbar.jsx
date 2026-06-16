import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  User,
  CalendarCheck,
  LogOut,
  LogIn,
  ChevronDown,
  Star,
  ShoppingCart,
  Home,
  Phone,
  Mail,
  AtSign,
  ExternalLink,
} from 'lucide-react';
import { useUserAuth } from '../context/UserAuthContext';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { useBookStore } from '../context/BookStoreContext';
import { useSiteMenu } from '../context/MenuContext';
import SiteLogo from './SiteLogo';
import ThemeToggle from './ThemeToggle';
import {
  headerQuickLinks,
  headerBrand,
  headerContact,
  headerSocial,
} from '../config/siteHeader.js';

const containerClass = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';

function isExternalUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function MenuLink({ to, children, className, onClick, end = false, ...rest }) {
  if (isExternalUrl(to)) {
    const resolvedClass = typeof className === 'function' ? className({ isActive: false }) : className;
    return (
      <a href={to} className={resolvedClass} onClick={onClick} target="_blank" rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <NavLink to={to} end={end} className={className} onClick={onClick} {...rest}>
      {children}
    </NavLink>
  );
}

/** Coral star above top-left of Shop label */
function ShopNavLabel({ label }) {
  return (
    <span className="relative inline-block">
      <Star
        size={9}
        className="absolute left-0 -top-2.5 fill-coral text-coral pointer-events-none"
        strokeWidth={2}
        aria-hidden
      />
      <span className="relative">{label}</span>
    </span>
  );
}

function HeaderUtilityBar() {
  return (
    <div className="theme-fixed hidden sm:block bg-navy-950 border-b border-navy-900/80">
      <div className={`${containerClass} flex items-center justify-between gap-4 h-9`}>
        <div className="flex items-center gap-0 min-w-0 overflow-x-auto scrollbar-none">
          {headerQuickLinks.map((link, index) => (
            <span key={link.to} className="inline-flex items-center shrink-0">
              {index > 0 && (
                <span className="text-navy-600 px-2 select-none" aria-hidden>|</span>
              )}
              <Link
                to={link.to}
                className="text-xs text-navy-300 hover:text-cyan-400 transition-colors whitespace-nowrap"
              >
                {link.label}
              </Link>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-cyan-400/90">Follow us</span>
          {headerSocial.linkedin && (
            <a
              href={headerSocial.linkedin}
              target="_blank"
              rel="noreferrer"
              className="text-navy-200 hover:text-cyan-400 transition-colors"
              aria-label="LinkedIn"
            >
              <ExternalLink size={15} />
            </a>
          )}
          <a
            href={headerSocial.emailHref}
            className="text-navy-200 hover:text-cyan-400 transition-colors"
            aria-label="Email"
          >
            <Mail size={15} />
          </a>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function HeaderBrandBar({ onMenuToggle, menuOpen, showMobileActions, cartSlot }) {
  return (
    <div className="theme-fixed bg-navy-900">
      <div className={`${containerClass} flex items-center justify-between gap-4 py-3 sm:py-3.5`}>
        <Link to="/" className="group flex items-center gap-3 min-w-0">
          <SiteLogo
            variant="white"
            className="h-11 sm:h-12 md:h-14 w-auto shrink-0 transition-opacity duration-200 group-hover:opacity-90"
            alt={headerBrand.name}
          />
          <div className="hidden lg:block min-w-0">
            <p className="text-sm font-semibold text-white leading-tight truncate">
              {headerBrand.name}
            </p>
            <p className="text-[11px] text-navy-300 truncate max-w-md">
              {headerBrand.tagline}
            </p>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          <Link
            to={headerContact.contactPage}
            className="flex items-center gap-2 text-sm text-white hover:text-cyan-300 transition-colors"
          >
            <Phone size={16} className="text-cyan-400 shrink-0" />
            <span className="font-medium">Contact us</span>
          </Link>
          <a
            href={headerContact.phoneHref}
            className="flex items-center gap-2 text-sm text-navy-100 hover:text-cyan-300 transition-colors"
          >
            <Phone size={16} className="text-cyan-400 shrink-0" />
            <span className="whitespace-nowrap">{headerContact.phone}</span>
          </a>
          <a
            href={headerContact.emailHref}
            className="flex items-center gap-2 text-sm text-navy-100 hover:text-cyan-300 transition-colors min-w-0"
          >
            <AtSign size={16} className="text-cyan-400 shrink-0" />
            <span className="truncate max-w-[200px]">{headerContact.email}</span>
          </a>
        </div>

        <div className="flex md:hidden items-center gap-1 shrink-0">
          <Link
            to={headerContact.contactPage}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 px-2 py-1"
          >
            Contact
          </Link>
          {showMobileActions && cartSlot}
          <button
            type="button"
            onClick={onMenuToggle}
            className="text-navy-200 hover:text-white transition-colors p-2"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function NavLinkItem({
  link,
  eventsMenuOpen,
  setEventsMenuOpen,
  eventsActive,
  variant = 'desktop',
  onNavigate,
}) {
  const isDesktop = variant === 'desktop';

  if (link.children) {
    if (isDesktop) {
      return (
        <div
          className="relative"
          onMouseEnter={() => setEventsMenuOpen(true)}
          onMouseLeave={() => setEventsMenuOpen(false)}
        >
          <NavLink
            to={link.to}
            className={({ isActive }) => `inline-flex items-center gap-1 text-sm font-semibold tracking-wide transition-colors duration-200 ${
              isActive || eventsActive
                ? 'text-cyan-400'
                : 'text-white hover:text-cyan-300'
            }`}
          >
            {link.label}
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${eventsMenuOpen ? 'rotate-180' : ''}`}
            />
          </NavLink>
          {eventsMenuOpen && (
            <div className="absolute left-0 top-full pt-2 w-56 z-30">
              <div className="rounded-xl border border-navy-700 bg-navy-900/95 backdrop-blur-md shadow-2xl p-2">
                {link.children.map((child) => (
                  <MenuLink
                    key={child.to}
                    to={child.to}
                    className="block rounded-lg px-3 py-2.5 text-sm text-navy-100 hover:bg-navy-800 hover:text-cyan-300 transition-colors"
                  >
                    {child.label}
                  </MenuLink>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    const baseClass = ({ isActive }) =>
      `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-cyan-900/30 text-cyan-400'
          : 'text-navy-200 hover:bg-navy-800 hover:text-white'
      }`;

    return (
      <div className="space-y-1">
        <MenuLink to={link.to} onClick={onNavigate} className={baseClass}>
          {link.label}
        </MenuLink>
        <div className="pl-3 space-y-1">
          {link.children.map((child) => (
            <MenuLink key={child.to} to={child.to} onClick={onNavigate} className={baseClass}>
              {child.label}
            </MenuLink>
          ))}
        </div>
      </div>
    );
  }

  if (link.badge) {
    const labelEl = <ShopNavLabel label={link.label} />;

    if (isDesktop) {
      return (
        <MenuLink
          to={link.to}
          title="Shop — new"
          aria-label="Shop, new"
          className={({ isActive }) => `inline-flex items-end text-sm font-semibold tracking-wide transition-colors ${
            isActive ? 'text-cyan-400' : 'text-white hover:text-cyan-300'
          }`}
        >
          {labelEl}
        </MenuLink>
      );
    }

    return (
      <MenuLink
        to={link.to}
        onClick={onNavigate}
        title="Shop — new"
        aria-label="Shop, new"
        className={({ isActive }) =>
          `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isActive
              ? 'bg-cyan-900/30 text-cyan-400'
              : 'text-navy-200 hover:bg-navy-800 hover:text-white'
          }`
        }
      >
        {labelEl}
      </MenuLink>
    );
  }

  if (isDesktop) {
    return (
      <MenuLink
        to={link.to}
        end={link.to === '/'}
        className={({ isActive }) => `text-sm font-semibold tracking-wide transition-colors ${
          isActive ? 'text-cyan-400' : 'text-white hover:text-cyan-300'
        }`}
      >
        {link.label}
      </MenuLink>
    );
  }

  return (
    <MenuLink
      to={link.to}
      end={link.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-cyan-900/30 text-cyan-400'
            : 'text-navy-200 hover:bg-navy-800 hover:text-white'
        }`
      }
    >
      {link.label}
    </MenuLink>
  );
}

function AccountMenu({ user, profilePhotoUrl, accountOpen, setAccountOpen, onLogout }) {
  if (!user) {
    return (
      <Link
        to="/account/login"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-white hover:text-cyan-300 transition-colors px-2 py-1"
      >
        <LogIn size={15} />
        Sign In
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAccountOpen(!accountOpen)}
        className="flex items-center gap-2 text-sm font-medium text-white hover:text-cyan-300 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-cyan-700 flex items-center justify-center text-white text-xs font-bold overflow-hidden shrink-0">
          {profilePhotoUrl ? (
            <img src={profilePhotoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            user.name?.charAt(0).toUpperCase()
          )}
        </div>
        <span className="max-w-[100px] truncate hidden lg:inline">
          {user.name?.split(' ')[0]}
        </span>
      </button>
      {accountOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAccountOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-2 w-48 bg-navy-900 rounded-xl border border-navy-700 shadow-xl z-20 overflow-hidden">
            <div className="px-4 py-3 border-b border-navy-800">
              <p className="text-xs font-semibold text-white truncate">{user.name}</p>
              <p className="text-xs text-navy-400 truncate">{user.email}</p>
            </div>
            <Link
              to="/account/my-events"
              onClick={() => setAccountOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-navy-200 hover:bg-navy-800 hover:text-cyan-400 transition-colors"
            >
              <CalendarCheck size={15} />
              My Events
            </Link>
            <Link
              to="/account/profile"
              onClick={() => setAccountOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-navy-200 hover:bg-navy-800 hover:text-cyan-400 transition-colors"
            >
              <User size={15} />
              Profile
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-navy-200 hover:bg-navy-800 hover:text-red-400 transition-colors"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [eventsMenuOpen, setEventsMenuOpen] = useState(false);
  const { mainNavLinks: navLinks } = useSiteMenu();
  const { currentUser: user, userLogout } = useUserAuth();
  const { cartItemCount } = useBookStore();
  const navigate = useNavigate();
  const location = useLocation();

  const profilePhotoUrl = resolveMediaUrl(user?.profile_photo);
  const isHome = location.pathname === '/';
  const eventsActive = location.pathname.startsWith('/events');

  const badgeLabel = cartItemCount > 99 ? '99+' : String(cartItemCount);
  const cartAriaLabel = cartItemCount > 0
    ? `Cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`
    : 'Cart, empty';

  const mainNavLinks = navLinks.filter((link) => link.to !== '/');

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = '';
      return undefined;
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleLogout = () => {
    userLogout();
    setAccountOpen(false);
    setOpen(false);
    navigate('/');
  };

  const closeMobile = () => setOpen(false);

  const mobileCart = user ? (
    <CartIconButton
      count={cartItemCount}
      label={badgeLabel}
      ariaLabel={cartAriaLabel}
      compact
      ringClass="ring-navy-900"
    />
  ) : null;

  return (
    <header className="theme-fixed sticky top-0 z-50 shadow-md">
      <HeaderUtilityBar />

      <HeaderBrandBar
        onMenuToggle={() => setOpen(!open)}
        menuOpen={open}
        showMobileActions
        cartSlot={mobileCart}
      />

      {/* Tier 3 — main navigation (desktop) */}
      <div className="theme-fixed hidden md:block bg-navy-800 border-b border-navy-700/80 overflow-visible">
        <div className={`${containerClass} flex items-center justify-between gap-4 min-h-12 py-1 overflow-visible`}>
          <div className="flex items-center gap-1 min-w-0 overflow-visible">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center justify-center w-10 h-10 rounded-sm shrink-0 transition-colors ${
                  isActive || isHome
                    ? 'bg-navy-950 text-cyan-400'
                    : 'bg-navy-950 text-white hover:text-cyan-300'
                }`
              }
              aria-label="Home"
            >
              <Home size={18} />
            </NavLink>

            <div className="flex items-center gap-5 lg:gap-6 pl-3 overflow-visible">
              {mainNavLinks.map((link) => (
                <NavLinkItem
                  key={link.id || link.to}
                  link={link}
                  eventsMenuOpen={eventsMenuOpen}
                  setEventsMenuOpen={setEventsMenuOpen}
                  eventsActive={eventsActive}
                  variant="desktop"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {user && (
              <CartIconButton
                count={cartItemCount}
                label={badgeLabel}
                ariaLabel={cartAriaLabel}
                ringClass="ring-navy-800"
              />
            )}
            <AccountMenu
              user={user}
              profilePhotoUrl={profilePhotoUrl}
              accountOpen={accountOpen}
              setAccountOpen={setAccountOpen}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden bg-navy-950 border-t border-navy-800 max-h-[calc(100vh-8rem)] overflow-y-auto">
          <div className="px-4 py-3 border-b border-navy-800">
            <p className="text-[10px] uppercase tracking-wide text-navy-500 mb-2">Quick links</p>
            <div className="flex flex-wrap gap-2">
              {headerQuickLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={closeMobile}
                  className="text-xs text-navy-300 hover:text-cyan-400 bg-navy-900 px-2.5 py-1 rounded-md"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex flex-col gap-2 text-sm min-w-0">
                <a href={headerContact.phoneHref} className="flex items-center gap-2 text-navy-200">
                  <Phone size={14} className="text-cyan-400" />
                  {headerContact.phone}
                </a>
                <a href={headerContact.emailHref} className="flex items-center gap-2 text-navy-200">
                  <Mail size={14} className="text-cyan-400" />
                  {headerContact.email}
                </a>
              </div>
              <ThemeToggle variant="compact" />
            </div>
          </div>

          <div className="px-4 py-4 pb-6 space-y-2">
            {navLinks.map((link) => (
              <NavLinkItem
                key={link.id || link.to}
                link={link}
                eventsMenuOpen={eventsMenuOpen}
                setEventsMenuOpen={setEventsMenuOpen}
                eventsActive={eventsActive}
                variant="mobile"
                onNavigate={closeMobile}
              />
            ))}

            {user && (
              <NavLink
                to="/books/cart"
                onClick={closeMobile}
                aria-label={cartAriaLabel}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-cyan-900/30 text-cyan-400'
                      : 'text-navy-200 hover:bg-navy-800 hover:text-white'
                  }`
                }
              >
                <span className="inline-flex items-center gap-2">
                  <ShoppingCart size={15} />
                  Cart
                </span>
                {cartItemCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center rounded-full bg-cyan-500 text-navy-950 px-2 py-0.5 text-[11px] font-bold leading-none min-w-[20px]"
                  >
                    {badgeLabel}
                  </span>
                )}
              </NavLink>
            )}

            {user ? (
              <>
                <div className="px-3 py-2 border-t border-navy-800 mt-2">
                  <p className="text-xs text-navy-400">
                    Signed in as <span className="text-white font-medium">{user.name}</span>
                  </p>
                </div>
                <NavLink
                  to="/account/my-events"
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-cyan-900/30 text-cyan-400' : 'text-navy-200 hover:bg-navy-800 hover:text-white'
                    }`
                  }
                >
                  <CalendarCheck size={15} />
                  My Events
                </NavLink>
                <NavLink
                  to="/account/profile"
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-cyan-900/30 text-cyan-400' : 'text-navy-200 hover:bg-navy-800 hover:text-white'
                    }`
                  }
                >
                  <User size={15} />
                  Profile
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-red-400 transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/account/login"
                onClick={closeMobile}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-cyan-400 transition-colors"
              >
                <LogIn size={15} />
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function CartIconButton({
  count,
  label,
  ariaLabel,
  compact = false,
  ringClass = 'ring-navy-950',
}) {
  const sizePad = compact ? 'p-2' : 'px-2 py-1';
  const titleText = count > 0
    ? `Cart (${count} item${count === 1 ? '' : 's'})`
    : 'Cart';
  return (
    <Link
      to="/books/cart"
      aria-label={ariaLabel}
      title={titleText}
      className={`relative inline-flex items-center justify-center rounded-lg text-white hover:text-cyan-300 transition-colors ${sizePad} focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400`}
    >
      <ShoppingCart size={compact ? 22 : 20} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className={`absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-cyan-500 text-navy-950 px-1.5 py-0.5 text-[10px] font-bold leading-none min-w-[18px] ring-2 ${ringClass} shadow-sm`}
        >
          {label}
        </span>
      )}
    </Link>
  );
}
