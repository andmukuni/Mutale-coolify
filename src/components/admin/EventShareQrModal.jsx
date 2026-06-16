import { useCallback, useEffect, useState } from 'react';
import { X, QrCode, Share2, Copy, ExternalLink, Ticket } from 'lucide-react';
import { buildPublicEventPageUrl, buildPublicEventQrDataUrl } from '../../../shared/receiptQr.js';
import { getAppOrigin } from '../../utils/apiBase.js';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatTime } from '../../utils/helpers';
import { formatPrice } from '../../utils/eventServices';
import { sharePublicEvent } from '../../utils/shareEvent.js';
import { RECEIPT_PALETTE } from '../../../shared/receiptTheme.js';

const { teal } = RECEIPT_PALETTE;

/**
 * @param {{ event: object, onClose: () => void }} props
 */
export default function EventShareQrModal({ event, onClose }) {
  const toast = useToast();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [sharing, setSharing] = useState(false);

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
    const origin = getAppOrigin();
    const target = { id: event?.id, slug: event?.slug };
    const url = buildPublicEventPageUrl(target, origin);
    setPublicUrl(url || '');
    if (!url) {
      setQrDataUrl('');
      return undefined;
    }
    let cancelled = false;
    buildPublicEventQrDataUrl(target, origin, { size: 220 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => { cancelled = true; };
  }, [event?.id, event?.slug]);

  const handleCopyLink = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Event link copied.');
    } catch {
      toast.error('Could not copy link.');
    }
  }, [publicUrl, toast]);

  const handleShare = async () => {
    setSharing(true);
    try {
      const result = await sharePublicEvent(event, { qrDataUrl });
      if (result === 'clipboard') {
        toast.success('Event details and register link copied.');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        toast.error(err?.message || 'Could not share event.');
      }
    } finally {
      setSharing(false);
    }
  };

  const dateLabel = formatDate(event?.start_date || event?.date);
  const timeLabel = formatTime(event?.start_time || event?.time);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-share-qr-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <QrCode size={16} style={{ color: teal }} aria-hidden />
            <h3 id="event-share-qr-title" className="text-sm font-semibold text-gray-800 truncate">
              Event QR
            </h3>
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

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {!publicUrl ? (
            <p className="text-sm text-navy-500 text-center py-8">
              Add a slug or save this event to generate a shareable QR code.
            </p>
          ) : (
            <div className="flex flex-col items-center text-center gap-5">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt=""
                  className="w-52 h-52 rounded-xl bg-white border border-cyan-100 shadow-sm"
                  width={208}
                  height={208}
                />
              ) : (
                <div
                  className="w-52 h-52 flex items-center justify-center rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-400"
                  aria-hidden
                >
                  <QrCode size={40} />
                </div>
              )}
              <p className="text-[11px] font-medium text-cyan-700">Scan for event details</p>

              <div className="w-full text-left rounded-xl border border-navy-100 bg-navy-50/40 p-4 space-y-2">
                <p className="text-sm font-semibold text-navy-900 leading-snug">{event.title}</p>
                <dl className="text-xs text-navy-600 space-y-1">
                  <div className="flex justify-between gap-3">
                    <dt className="text-navy-400 shrink-0">Date</dt>
                    <dd className="font-medium text-navy-800 text-right">
                      {dateLabel}
                      {timeLabel ? ` · ${timeLabel}` : ''}
                    </dd>
                  </div>
                  {event.category && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-navy-400 shrink-0">Category</dt>
                      <dd className="font-medium text-navy-800 text-right">{event.category}</dd>
                    </div>
                  )}
                  {event.location && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-navy-400 shrink-0">Location</dt>
                      <dd className="font-medium text-navy-800 text-right">{event.location}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-navy-400 shrink-0">Registration</dt>
                    <dd className="font-medium text-navy-800 text-right">{formatPrice(event)}</dd>
                  </div>
                </dl>
                <p className="text-[11px] text-navy-500 break-all pt-1 border-t border-navy-100/80 mt-2">
                  {publicUrl}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors order-last sm:order-first sm:mr-auto"
          >
            Close
          </button>
          {publicUrl && (
            <>
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-navy-700 border border-navy-200 hover:bg-navy-50 transition-colors"
              >
                <Copy size={14} />
                Copy link
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-navy-700 border border-navy-200 hover:bg-navy-50 transition-colors"
              >
                <ExternalLink size={14} />
                Open page
              </a>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors shadow-sm hover:opacity-90"
                style={{ backgroundColor: teal }}
              >
                <Ticket size={14} />
                Register now
              </a>
              <button
                type="button"
                onClick={handleShare}
                disabled={sharing}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-navy-900 hover:bg-navy-800 text-white transition-colors disabled:opacity-60"
              >
                <Share2 size={14} />
                {sharing
                  ? 'Sharing…'
                  : (typeof navigator.share === 'function' ? 'Share' : 'Copy for sharing')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
