import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** A4 at 96 CSS dpi (matches print preview) */
export const CV_PAGE_WIDTH_PX = 794;
export const CV_PAGE_HEIGHT_PX = 1123;

/**
 * @param {{ html: string, title?: string, className?: string, footerClassName?: string }} props
 */
export function CvA4LivePreview({ html, title = 'CV preview', className = '', footerClassName = '' }) {
  const displayRef = useRef(null);
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const [scale, setScale] = useState(0.72);
  const [pageCount, setPageCount] = useState(1);
  const [docHeightPx, setDocHeightPx] = useState(CV_PAGE_HEIGHT_PX);

  const updateScale = useCallback(() => {
    const container = containerRef.current;
    const scrollEl = scrollRef.current;
    if (!container) return;

    const pad = 16;
    const w = container.clientWidth - pad;
    const h = (scrollEl?.clientHeight ?? container.clientHeight) - pad;
    if (w <= 0) return;

    const widthScale = Math.min(1, w / CV_PAGE_WIDTH_PX);
    const heightScale = h > 0 ? h / (CV_PAGE_HEIGHT_PX + 28) : widthScale;

    if (pageCount <= 1) {
      setScale(Math.min(widthScale, heightScale, 1));
    } else {
      setScale(widthScale);
    }
  }, [pageCount]);

  const measureFromIframe = useCallback(() => {
    const iframe = displayRef.current;
    const docEl = iframe?.contentDocument?.documentElement;
    if (!docEl) return;
    const docH = Math.max(docEl.scrollHeight, CV_PAGE_HEIGHT_PX);
    setDocHeightPx(docH);
    setPageCount(Math.max(1, Math.ceil(docH / CV_PAGE_HEIGHT_PX)));
  }, []);

  useEffect(() => {
    setPageCount(1);
    setDocHeightPx(CV_PAGE_HEIGHT_PX);
  }, [html]);

  useEffect(() => {
    updateScale();
    const nodes = [containerRef.current, scrollRef.current].filter(Boolean);
    if (!nodes.length || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(updateScale);
    nodes.forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [updateScale]);

  useEffect(() => {
    updateScale();
  }, [pageCount, docHeightPx, updateScale]);

  if (!html) {
    return (
      <p className="text-sm text-navy-500 text-center py-16">Could not generate preview.</p>
    );
  }

  const scaledWidth = CV_PAGE_WIDTH_PX * scale;
  const scaledDocHeight = docHeightPx * scale;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full min-h-0 ${className}`.trim()}
    >
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y px-1 sm:px-2"
        style={{ overscrollBehavior: 'contain' }}
        aria-label="CV preview pages"
      >
        <div className="flex flex-col items-center py-3 min-h-min">
          <div
            className="relative bg-white shadow-lg rounded-sm ring-1 ring-navy-200/50 overflow-hidden shrink-0"
            style={{ width: scaledWidth, height: scaledDocHeight }}
          >
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{
                width: CV_PAGE_WIDTH_PX,
                height: docHeightPx,
                transform: `scale(${scale})`,
              }}
            >
              <iframe
                ref={displayRef}
                title={title}
                srcDoc={html}
                sandbox="allow-same-origin"
                className="block border-0 bg-white w-full"
                style={{
                  width: CV_PAGE_WIDTH_PX,
                  height: docHeightPx,
                  minHeight: CV_PAGE_HEIGHT_PX,
                }}
                onLoad={measureFromIframe}
              />
            </div>
          </div>
          <p className="text-[10px] font-medium text-navy-400 mt-2 tabular-nums">
            {pageCount} A4 page{pageCount !== 1 ? 's' : ''} · scroll to view all
          </p>
        </div>
      </div>

      <p
        className={`text-[10px] text-navy-400 text-center px-2 py-2 border-t border-navy-100/80 shrink-0 ${footerClassName}`.trim()}
      >
        Scroll inside preview · A4 (210 × 297 mm) · {pageCount} page
        {pageCount !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

/**
 * @param {{ html: string, title?: string, onClose: () => void, templateLabel?: string }} props
 */
export function CvA4FullscreenOverlay({
  html,
  title = 'CV preview',
  onClose,
  templateLabel,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!html) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-navy-950"
      role="dialog"
      aria-modal="true"
      aria-label="CV fullscreen preview"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0 bg-navy-900">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">CV preview · A4</p>
          {(templateLabel || title) && (
            <p className="text-xs text-navy-300 truncate mt-0.5">
              {[templateLabel, title !== 'CV preview' ? title : null].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/20 transition-colors shrink-0"
          aria-label="Exit fullscreen"
        >
          <X size={16} />
          Close
        </button>
      </div>

      <div className="flex-1 min-h-0 relative bg-slate-800/90">
        <CvA4LivePreview
          html={html}
          title={title}
          className="absolute inset-0"
          footerClassName="bg-slate-800/90 border-white/10 text-navy-300"
        />
      </div>
    </div>,
    document.body,
  );
}

export default CvA4LivePreview;
