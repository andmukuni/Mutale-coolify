import { useEffect, useMemo } from 'react';
import { FileUser, X, Download } from 'lucide-react';
import { renderCvDocumentHtml } from '../../../shared/cvDocumentHtml.js';
import { openCvForPrint } from '../../utils/cvGenerator.js';
import { useToast } from '../../context/ToastContext';
import { RECEIPT_PALETTE } from '../../../shared/receiptTheme.js';

const { teal } = RECEIPT_PALETTE;

/**
 * @param {{ record: object, cvDocument: object | null, loading?: boolean, onClose: () => void }} props
 */
export default function CvPreviewModal({ record, cvDocument, loading = false, onClose }) {
  const toast = useToast();
  const title = record?.user_name || 'CV Preview';

  const html = useMemo(() => {
    if (!cvDocument?.user) return '';
    return renderCvDocumentHtml({
      user: cvDocument.user,
      certificates: cvDocument.certificates || [],
      developmentEvents: cvDocument.developmentEvents || [],
    });
  }, [cvDocument]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    window.document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      window.document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleDownload = () => {
    if (!cvDocument?.user) return;
    try {
      openCvForPrint({
        user: cvDocument.user,
        certificates: cvDocument.certificates || [],
        developmentEvents: cvDocument.developmentEvents || [],
      });
    } catch (err) {
      toast.error(err?.message || 'Could not open CV for print.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="CV preview"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <FileUser size={16} style={{ color: teal }} />
            <h3 className="text-sm font-semibold text-gray-800 truncate">CV Preview</h3>
            <span className="text-xs text-gray-400 hidden sm:inline">·</span>
            <span className="text-xs text-gray-500 hidden sm:inline truncate">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-navy-50/40 min-h-[320px]">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-12">Loading CV…</p>
          ) : html ? (
            <iframe
              title={`CV — ${title}`}
              srcDoc={html}
              className="w-full h-full min-h-[480px] border-0 bg-white"
              sandbox="allow-same-origin"
            />
          ) : (
            <p className="text-sm text-gray-500 text-center py-12">Could not load CV preview.</p>
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
            disabled={!cvDocument?.user || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors shadow-sm hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: teal }}
          >
            <Download size={14} />
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
