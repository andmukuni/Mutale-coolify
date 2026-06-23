import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  User,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

function MenuLink({ to, icon: Icon, children, onSelect, external = false }) {
  const className = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-navy-700 hover:bg-navy-50 hover:text-navy-900 rounded-lg transition-colors text-left';

  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={className} onClick={onSelect}>
        <Icon size={16} className="text-navy-400 shrink-0" />
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={className} onClick={onSelect}>
      <Icon size={16} className="text-navy-400 shrink-0" />
      {children}
    </Link>
  );
}

export default function AdminUserMenu() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  const handleLogout = () => {
    close();
    logout();
    navigate('/admin/login');
  };

  const displayName = user?.name || 'Admin';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'A';

  const canSettings = hasPermission('settings.manage');
  const canAccessControl = hasPermission('rbac.manage');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm transition-colors ${
          open
            ? 'border-cyan-200 bg-cyan-50 text-navy-800'
            : 'border-navy-200 bg-white text-navy-700 hover:border-navy-300 hover:bg-navy-50'
        }`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="hidden sm:flex flex-col items-start leading-tight max-w-[140px]">
          <span className="font-medium truncate w-full text-left">{displayName}</span>
          <span className="text-[11px] text-navy-400 truncate w-full text-left capitalize">{user?.role || 'Administrator'}</span>
        </span>
        <ChevronDown size={16} className={`text-navy-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-xl border border-navy-100 bg-white py-2 shadow-lg shadow-navy-900/10"
        >
          <div className="px-3 pb-2 mb-2 border-b border-navy-100">
            <p className="text-sm font-semibold text-navy-900 truncate">{displayName}</p>
            <p className="text-xs text-navy-400 truncate">{user?.email}</p>
          </div>

          <div className="px-2 space-y-0.5">
            {user?.id && (
              <MenuLink to={`/admin/users/${user.id}`} icon={User} onSelect={close}>
                My admin profile
              </MenuLink>
            )}
            <MenuLink to="/account/profile" icon={UserCircle} onSelect={close}>
              Public account profile
            </MenuLink>
            <MenuLink to="/admin" icon={LayoutDashboard} onSelect={close}>
              Dashboard
            </MenuLink>
            {canSettings && (
              <MenuLink to="/admin/settings" icon={Settings} onSelect={close}>
                System settings
              </MenuLink>
            )}
            {canAccessControl && (
              <MenuLink to="/admin/access-control" icon={Shield} onSelect={close}>
                Access control
              </MenuLink>
            )}
            <MenuLink to="/" icon={ExternalLink} onSelect={close} external>
              View website
            </MenuLink>
          </div>

          <div className="mt-2 pt-2 px-2 border-t border-navy-100">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
