import { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, innermost last. Only the topmost one answers Escape and traps Tab,
// so a confirmation opened over another dialog closes on its own.
const openStack = [];

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  describedBy,
}) {
  const titleId = useId();
  const panelRef = useRef(null);

  const handleKeyDown = useCallback(
    (e) => {
      if (openStack[openStack.length - 1] !== titleId) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Keep keyboard focus inside the dialog while it is open.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Focus on the panel itself, or outside it, counts as an edge in both directions.
      const outside = active === panelRef.current || !panelRef.current.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose, titleId]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Kept apart from the listener so a new onClose never reorders the stack.
  useEffect(() => {
    if (!isOpen) return undefined;
    openStack.push(titleId);
    document.body.style.overflow = 'hidden';
    return () => {
      const index = openStack.lastIndexOf(titleId);
      if (index !== -1) openStack.splice(index, 1);
      if (openStack.length === 0) document.body.style.overflow = '';
    };
  }, [isOpen, titleId]);

  // Move focus into the dialog when it opens and back to the opener when it closes.
  useEffect(() => {
    if (!isOpen) return undefined;
    const opener = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative app-card bg-white rounded-2xl border border-navy-100 shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 focus:outline-none`}
      >
        {/* Header */}
        {(title || onClose) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-navy-100">
            <div>
              {title && (
                <h2 id={titleId} className="text-lg font-semibold text-navy-900">{title}</h2>
              )}
              {subtitle && (
                <p className="text-sm text-navy-600 mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-500 hover:text-navy-700 transition-colors"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-navy-100 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
