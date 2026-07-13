import { Link } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import Modal from './ui/Modal';

const modalSizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function RegistrationShell({
  layout = 'modal',
  isOpen = true,
  onClose,
  title,
  subtitle,
  backHref,
  backLabel = 'Back to event',
  children,
  footer,
  size = 'md',
}) {
  if (layout === 'page') {
    return (
      <div className="min-h-screen bg-navy-50">
        <div className="border-b border-navy-100 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              {backHref ? (
                <Link
                  to={backHref}
                  onClick={(e) => {
                    if (onClose) {
                      e.preventDefault();
                      onClose();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-cyan-700 transition-colors mb-1"
                >
                  <ArrowLeft size={14} />
                  {backLabel}
                </Link>
              ) : null}
              {title && (
                <h1 className="text-xl sm:text-2xl font-bold text-navy-900 truncate">{title}</h1>
              )}
              {subtitle && (
                <p className="text-sm text-navy-500 mt-0.5">{subtitle}</p>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 transition-colors shrink-0"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="bg-white rounded-2xl border border-navy-100 shadow-sm">
            <div className="px-4 sm:px-6 py-5 sm:py-6">{children}</div>
            {footer && (
              <div className="px-4 sm:px-6 py-4 border-t border-navy-100 flex flex-wrap items-center justify-end gap-3 bg-navy-50/40 rounded-b-2xl">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
      size={size}
    >
      {children}
    </Modal>
  );
}

export { modalSizeClasses };
