import { useEffect } from 'react';
import { X, Download } from 'lucide-react';

export default function CertificatePreviewModal({ pdfUrl, onClose, onDownload, title = 'Certificate Preview' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
          <div className="flex items-center gap-2">
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500"
              >
                <Download size={15} />
                Download
              </button>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-navy-50 text-navy-500">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-4">
          {pdfUrl ? (
            <iframe
              title="Certificate preview"
              src={pdfUrl}
              className="w-full h-[70vh] rounded-lg border border-navy-100"
            />
          ) : (
            <div className="h-[70vh] flex items-center justify-center text-navy-500">Loading preview…</div>
          )}
        </div>
      </div>
    </div>
  );
}
