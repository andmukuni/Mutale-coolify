import { useEffect, useState } from 'react';
import { Ticket, X, Download } from 'lucide-react';
import { buildTicketViewModel } from '../../../shared/ticketViewModel.js';
import TicketDocument from '../../../shared/TicketDocument.jsx';
import { downloadTicketPdfFromServer } from '../../utils/ticketPdfDownload.js';
import receiptLogo from '../../../Logo-Website-Mutale-08.png';
import { getAppOrigin } from '../../utils/apiBase.js';
import { useToast } from '../../context/ToastContext';
import { RECEIPT_PALETTE, RECEIPT_LIGHT_FILL } from '../../../shared/receiptTheme.js';

const { teal } = RECEIPT_PALETTE;

export default function TicketPreviewModal({ registration, event, onClose }) {
  const toast = useToast();
  const [viewModel, setViewModel] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const refCode = registration.reference_code || '—';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    buildTicketViewModel({
      registration,
      event: event || {},
      appOrigin: getAppOrigin(),
      logoDataUrl: receiptLogo,
    }).then((vm) => {
      if (!cancelled) setViewModel(vm);
    }).catch(() => {
      if (!cancelled) setViewModel(null);
    });
    return () => { cancelled = true; };
  }, [registration, event]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadTicketPdfFromServer(registration);
      toast.success('Ticket downloaded.');
    } catch (err) {
      console.error('[ticket] PDF download failed:', err);
      toast.error(err?.message || 'Could not download ticket PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ticket preview"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <Ticket size={16} style={{ color: teal }} />
            <h3 className="text-sm font-semibold text-gray-800">Ticket Preview</h3>
            <span className="text-xs text-gray-400 hidden sm:inline">·</span>
            <span className="text-xs text-gray-500 hidden sm:inline">{refCode}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto p-5 sm:p-8"
          style={{ backgroundColor: RECEIPT_LIGHT_FILL }}
        >
          {viewModel ? (
            <TicketDocument viewModel={viewModel} outerPadding={false} />
          ) : (
            <p className="text-sm text-gray-500 text-center py-12">Loading ticket…</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!viewModel || downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors shadow-sm hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: teal }}
          >
            <Download size={14} />
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
