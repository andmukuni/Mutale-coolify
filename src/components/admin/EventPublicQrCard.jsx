import { useEffect, useState, useCallback } from 'react';
import { Copy, ExternalLink, QrCode } from 'lucide-react';
import { buildPublicEventPageUrl, buildPublicEventQrDataUrl } from '../../../shared/receiptQr.js';
import { getAppOrigin } from '../../utils/apiBase.js';
import { useToast } from '../../context/ToastContext';

/**
 * Admin card: QR + link to the public event page (generated on the fly).
 * @param {{ event: { id?: string, slug?: string, title?: string }, compact?: boolean, className?: string }} props
 */
export default function EventPublicQrCard({ event = {}, compact = false, className = '' }) {
  const toast = useToast();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  const eventId = event.id;
  const eventSlug = event.slug;
  const eventTitle = event.title;

  useEffect(() => {
    const origin = getAppOrigin();
    const target = { id: eventId, slug: eventSlug };
    const url = buildPublicEventPageUrl(target, origin);
    setPublicUrl(url || '');
    if (!url) {
      setQrDataUrl('');
      return undefined;
    }
    let cancelled = false;
    buildPublicEventQrDataUrl(target, origin, { size: compact ? 140 : 180 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => { cancelled = true; };
  }, [eventId, eventSlug, compact]);

  const handleCopyLink = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Event link copied.');
    } catch {
      toast.error('Could not copy link.');
    }
  }, [publicUrl, toast]);

  if (!publicUrl) {
    return (
      <div className={`rounded-xl border border-navy-100 bg-navy-50/50 p-4 text-sm text-navy-500 ${className}`}>
        <p className="font-medium text-navy-700">Event QR code</p>
        <p className="mt-1 text-xs">Add a slug (or save the event) to generate a shareable QR code.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-cyan-100 bg-cyan-50/40 p-4 ${className}`}>
      <div className={`flex ${compact ? 'flex-col items-center text-center gap-3' : 'gap-4 items-start'}`}>
        <div className={compact ? '' : 'shrink-0'}>
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR code for public event page"
              className={`rounded-lg bg-white border border-white shadow-sm ${compact ? 'w-28 h-28' : 'w-32 h-32'}`}
              width={compact ? 112 : 128}
              height={compact ? 112 : 128}
            />
          ) : (
            <div
              className={`flex items-center justify-center rounded-lg bg-white border border-navy-100 text-navy-300 ${compact ? 'w-28 h-28' : 'w-32 h-32'}`}
              aria-hidden
            >
              <QrCode size={32} />
            </div>
          )}
          <p className="text-[10px] text-cyan-700 mt-1.5 text-center font-medium">Scan for event details</p>
        </div>

        <div className={`min-w-0 flex-1 space-y-2 ${compact ? 'w-full' : ''}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Public event link</p>
            {eventTitle && (
              <p className="text-sm font-medium text-navy-800 mt-0.5 truncate" title={eventTitle}>
                {eventTitle}
              </p>
            )}
          </div>
          <p className="text-xs text-navy-600 break-all leading-relaxed">{publicUrl}</p>
          <div className={`flex flex-wrap gap-2 ${compact ? 'justify-center' : ''}`}>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-cyan-200 text-cyan-800 hover:bg-cyan-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Copy size={13} />
              Copy link
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={13} />
              Open page
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
