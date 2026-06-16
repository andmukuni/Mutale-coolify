import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';
import Spinner from './Spinner';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed? This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}) {
  const variantStyles = {
    danger:
      'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    primary:
      'bg-cyan-600 hover:bg-cyan-500 text-white focus:ring-cyan-500',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex items-start gap-4">
        <div
          className={`p-2.5 rounded-xl flex-shrink-0 ${
            variant === 'danger'
              ? 'bg-red-50 text-red-600'
              : 'bg-cyan-50 text-cyan-600'
          }`}
        >
          <AlertTriangle size={20} />
        </div>
        <p className="text-sm text-navy-600 leading-relaxed pt-1">{message}</p>
      </div>
      <div className="flex items-center justify-end gap-3 mt-6">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-100 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            variantStyles[variant]
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="inline-flex items-center gap-2">
            {loading ? <Spinner size={14} /> : null}
            {loading ? 'Processing...' : confirmLabel}
          </span>
        </button>
      </div>
    </Modal>
  );
}
