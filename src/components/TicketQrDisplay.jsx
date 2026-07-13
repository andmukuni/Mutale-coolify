import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { buildTicketQrDataUrl, buildTicketScanUrl } from '../../shared/ticketQr.js';
import { getAppOrigin } from '../utils/apiBase.js';

/**
 * Entry QR code for a single event ticket (one per registration reference).
 */
export default function TicketQrDisplay({
  referenceCode = '',
  attendeeName = '',
  size = 168,
  compact = false,
  className = '',
}) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [scanUrl, setScanUrl] = useState('');

  useEffect(() => {
    const code = String(referenceCode || '').trim();
    if (!code) {
      setQrDataUrl('');
      setScanUrl('');
      return undefined;
    }

    const origin = getAppOrigin();
    const url = buildTicketScanUrl(code, origin);
    setScanUrl(url || '');
    if (!url) {
      setQrDataUrl('');
      return undefined;
    }

    let cancelled = false;
    buildTicketQrDataUrl(code, origin, { size })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => { cancelled = true; };
  }, [referenceCode, size]);

  if (!referenceCode) return null;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="rounded-xl border border-navy-100 bg-white p-3 shadow-sm">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`Entry QR for ticket ${referenceCode}`}
            width={size}
            height={size}
            className="block rounded-lg"
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-lg bg-navy-50 text-navy-400"
            style={{ width: size, height: size }}
          >
            <QrCode size={32} />
          </div>
        )}
      </div>
      {!compact && (
        <div className="mt-2 text-center space-y-0.5">
          {attendeeName ? (
            <p className="text-xs font-medium text-navy-800">{attendeeName}</p>
          ) : null}
          <p className="text-[10px] font-mono text-navy-500">{referenceCode}</p>
          <p className="text-[10px] text-cyan-700 font-medium">Show at gate for entry</p>
        </div>
      )}
      {scanUrl && !compact ? (
        <p className="sr-only">Ticket URL: {scanUrl}</p>
      ) : null}
    </div>
  );
}
