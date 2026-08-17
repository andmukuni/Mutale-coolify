import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QrCode, ScanLine, CheckCircle2, AlertCircle, ArrowLeft, UserPlus, Printer, Palette } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useBooking } from '../../context/BookingContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card } from '../../components/ui';
import { parseTicketReferenceFromScan } from '../../../shared/ticketQr.js';
import { getApiBase } from '../../utils/apiBase';
import { getSessionAuthHeaders } from '../../utils/authHeaders';
import { resolveEventMode } from '../../utils/eventServices';
import {
  createWalkInRegistration,
  downloadEventBadgePrintPdf,
  fetchEventBadgeTemplate,
} from '../../utils/badgeApi';

const API_BASE = getApiBase();

export default function EventCheckInPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { events } = useData();
  const { refreshRegistrations } = useBooking();
  const toast = useToast();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  const event = events.find((e) => e.id === id);
  const eventMode = event ? resolveEventMode(event) : 'virtual';
  const supportsOnsiteCheckIn = eventMode !== 'virtual';
  const [scanInput, setScanInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [walkInForm, setWalkInForm] = useState({ name: '', email: '', phone: '' });
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [badgeExportLoading, setBadgeExportLoading] = useState(false);
  const autoScanRef = useRef('');

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const performCheckIn = useCallback(async (rawValue) => {
    const referenceCode = parseTicketReferenceFromScan(rawValue);
    if (!referenceCode) {
      toast.error('Enter or scan a ticket reference.');
      return;
    }

    setLoading(true);
    setLastResult(null);
    try {
      const res = await fetch(`${API_BASE}/registrations/check-in`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          reference_code: referenceCode,
          event_id: id,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || 'Check-in failed.');
        setLastResult({ ok: false, message: json?.message || 'Check-in failed.', referenceCode });
        return;
      }

      const data = json.data || {};
      setLastResult({ ok: true, ...data });
      setRecent((prev) => [{
        reference_code: data.reference_code,
        attendee_name: data.attendee_name,
        already_checked_in: data.already_checked_in,
        at: new Date().toISOString(),
      }, ...prev].slice(0, 8));

      if (data.already_checked_in) {
        toast.info(`${data.attendee_name || referenceCode} was already checked in.`);
      } else {
        toast.success(`${data.attendee_name || referenceCode} checked in.`);
      }
      setScanInput('');

      if (String(searchParams.get('ref') || '').trim()) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('ref');
        setSearchParams(nextParams, { replace: true });
      }
    } catch {
      toast.error('Unable to connect to check-in service.');
    } finally {
      setLoading(false);
    }
  }, [id, toast, searchParams, setSearchParams]);

  useEffect(() => {
    const ref = String(searchParams.get('ref') || '').trim();
    if (!ref || ref === autoScanRef.current) return;
    autoScanRef.current = ref;
    void performCheckIn(ref);
  }, [searchParams, performCheckIn]);

  const handleWalkInSubmit = async (e) => {
    e.preventDefault();
    const name = String(walkInForm.name || '').trim();
    if (!name) {
      toast.error('Enter the walk-in attendee name.');
      return;
    }
    setWalkInLoading(true);
    try {
      const data = await createWalkInRegistration(id, {
        name,
        email: walkInForm.email,
        phone: walkInForm.phone,
      });
      const reg = data?.registration || {};
      setLastResult({
        ok: true,
        attendee_name: reg.booked_for_name || reg.user_name || name,
        reference_code: reg.reference_code,
        already_checked_in: false,
      });
      setRecent((prev) => [{
        reference_code: reg.reference_code,
        attendee_name: reg.booked_for_name || reg.user_name || name,
        already_checked_in: false,
        at: new Date().toISOString(),
      }, ...prev].slice(0, 8));
      setWalkInForm({ name: '', email: '', phone: '' });
      toast.success(`${name} added and checked in.`);
      void refreshRegistrations();
    } catch (error) {
      toast.error(error.message || 'Could not add walk-in attendee.');
    } finally {
      setWalkInLoading(false);
    }
  };

  const handleBadgeExport = async () => {
    setBadgeExportLoading(true);
    try {
      const templateData = await fetchEventBadgeTemplate(id);
      const template = templateData?.template;
      if (!template) {
        toast.error('Design a badge template first.');
        navigate(`/admin/events/${id}/badge-designer`);
        return;
      }
      if (!template.is_active) {
        toast.error('Publish the badge template before printing.');
        navigate(`/admin/events/${id}/badge-designer`);
        return;
      }

      const blob = await downloadEventBadgePrintPdf(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `badges-${event?.slug || id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Badge print sheet downloaded (2 per A4 page).');
    } catch (error) {
      toast.error(error.message || 'Badge export failed.');
    } finally {
      setBadgeExportLoading(false);
    }
  };

  const startCamera = useCallback(async () => {
    if (!('BarcodeDetector' in window)) {
      toast.error('Camera scanning is not supported in this browser. Enter the code manually.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      scanTimerRef.current = setInterval(async () => {
        if (!videoRef.current || loading) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes?.[0]?.rawValue;
          if (value) {
            stopCamera();
            void performCheckIn(value);
          }
        } catch {
          // ignore frame errors
        }
      }, 700);
    } catch {
      toast.error('Could not access camera.');
    }
  }, [loading, performCheckIn, stopCamera, toast]);

  if (!event) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>Event not found.</p>
        <Link to="/admin/events" className="text-cyan-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Events
        </Link>
      </div>
    );
  }

  if (!supportsOnsiteCheckIn) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Gate check-in"
          subtitle={event.title}
          actions={(
            <Link
              to={`/admin/events/${id}/attendees`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-800"
            >
              <ArrowLeft size={15} />
              Attendees
            </Link>
          )}
        />
        <Card className="p-6">
          <p className="text-sm text-navy-600">
            Gate check-in and name badges are only available for in-person and hybrid events.
            This event is configured as virtual.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate check-in"
        subtitle={event.title}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/admin/events/${id}/badge-designer`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-cyan-800 bg-white border border-navy-200 px-3 py-2 rounded-xl"
            >
              <Palette size={15} />
              Badge designer
            </Link>
            <button
              type="button"
              onClick={() => { void handleBadgeExport(); }}
              disabled={badgeExportLoading}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-cyan-800 bg-white border border-navy-200 px-3 py-2 rounded-xl disabled:opacity-60"
              title="A4 landscape — 2 badges per sheet"
            >
              <Printer size={15} />
              {badgeExportLoading ? 'Exporting…' : 'Print badges'}
            </button>
            <Link
              to={`/admin/events/${id}/attendees`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-800"
            >
              <ArrowLeft size={15} />
              Attendees
            </Link>
          </div>
        )}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-navy-900 font-semibold">
            <ScanLine size={18} className="text-cyan-600" />
            Scan or enter ticket
          </div>
          <p className="text-sm text-navy-500">
            Each ticket has a unique QR code. Scan it at the gate or paste the reference code below.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void performCheckIn(scanInput);
            }}
            className="space-y-3"
          >
            <input
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="MM-20260813-4821 or paste scanned URL"
              className="w-full rounded-xl border border-navy-200 px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                <CheckCircle2 size={16} />
                Check in
              </button>
              {!cameraOn ? (
                <button
                  type="button"
                  onClick={() => { void startCamera(); }}
                  className="inline-flex items-center gap-2 bg-white border border-navy-200 hover:bg-navy-50 text-navy-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  <QrCode size={16} />
                  Use camera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="inline-flex items-center gap-2 bg-white border border-navy-200 hover:bg-navy-50 text-navy-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  Stop camera
                </button>
              )}
            </div>
          </form>

          {cameraOn && (
            <div className="rounded-xl overflow-hidden border border-navy-200 bg-black">
              <video ref={videoRef} className="w-full max-h-64 object-cover" muted playsInline />
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <div className="text-navy-900 font-semibold">Latest scan</div>
          {!lastResult && (
            <p className="text-sm text-navy-500">Scan a ticket to see attendee details here.</p>
          )}
          {lastResult && (
            <div className={`rounded-xl border p-4 text-sm ${
              lastResult.ok
                ? 'bg-green-50 border-green-200 text-green-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {lastResult.ok ? (
                <>
                  <p className="font-semibold text-base">{lastResult.attendee_name || 'Attendee'}</p>
                  <p className="font-mono text-xs mt-1">{lastResult.reference_code}</p>
                  <p className="mt-2">
                    {lastResult.already_checked_in ? 'Already checked in earlier.' : 'Checked in successfully.'}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <p>{lastResult.message}</p>
                  </div>
                  {lastResult.referenceCode && (
                    <p className="font-mono text-xs mt-2">{lastResult.referenceCode}</p>
                  )}
                </>
              )}
            </div>
          )}

          {recent.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-navy-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Recent</p>
              {recent.map((row) => (
                <div key={`${row.reference_code}-${row.at}`} className="flex justify-between gap-2 text-xs text-navy-600">
                  <span className="truncate">{row.attendee_name || row.reference_code}</span>
                  <span className="shrink-0 text-navy-400 font-mono">{row.reference_code}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-navy-900 font-semibold">
          <UserPlus size={18} className="text-cyan-600" />
          Walk-in attendee
        </div>
        <p className="text-sm text-navy-500">
          Register someone who arrived without a prior booking. They will be checked in immediately and receive a ticket reference for badges.
        </p>
        <form onSubmit={handleWalkInSubmit} className="grid sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={walkInForm.name}
            onChange={(e) => setWalkInForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Full name *"
            className="rounded-xl border border-navy-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
            required
          />
          <input
            type="email"
            value={walkInForm.email}
            onChange={(e) => setWalkInForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="Email (optional)"
            className="rounded-xl border border-navy-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
          />
          <input
            type="tel"
            value={walkInForm.phone}
            onChange={(e) => setWalkInForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="Phone (optional)"
            className="rounded-xl border border-navy-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
          />
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={walkInLoading}
              className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              <UserPlus size={16} />
              {walkInLoading ? 'Adding…' : 'Add & check in'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
