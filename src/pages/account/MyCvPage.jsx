import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Lock,
  CheckCircle,
  CreditCard,
  Smartphone,
  Maximize2,
} from 'lucide-react';
import { useUserAuth } from '../../context/UserAuthContext';
import { useToast } from '../../context/ToastContext';
import { useBooking } from '../../context/BookingContext';
import { useData } from '../../context/DataContext';
import { fetchMyCertificates } from '../../utils/certificateApi';
import { renderCvDocumentHtml } from '../../../shared/cvDocumentHtml.js';
import {
  readStoredCvTemplateId,
  storeCvTemplateId,
  CV_TEMPLATES,
} from '../../../shared/cvTemplates.js';
import CvTemplatePicker from '../../components/account/CvTemplatePicker.jsx';
import CvA4LivePreview, { CvA4FullscreenOverlay } from '../../components/account/CvA4LivePreview.jsx';
import { openCvForPrint, downloadCvDocx } from '../../utils/cvGenerator.js';
import { useCvDownloadPayment } from '../../hooks/useCvDownloadPayment.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { useThrottledCallback } from '../../utils/cvDownloadThrottle.js';
import { resolveMediaUrl } from '../../utils/mediaUrl.js';

export default function MyCvPage() {
  const { currentUser } = useUserAuth();
  const toast = useToast();
  const { getUserRegistrations } = useBooking();
  const { events } = useData();

  const [certificates, setCertificates] = useState([]);
  const [certsLoading, setCertsLoading] = useState(true);
  const [templateId, setTemplateId] = useState(readStoredCvTemplateId);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  const debouncedTemplateId = useDebouncedValue(templateId, 200);

  const eventsById = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      if (e?.id) map.set(e.id, e);
    }
    return map;
  }, [events]);

  const myRegistrations = useMemo(
    () => getUserRegistrations(currentUser?.id || ''),
    [getUserRegistrations, currentUser?.id],
  );

  const developmentEvents = useMemo(() => {
    return myRegistrations
      .map((reg) => {
        const event = eventsById.get(reg.event_id);
        return {
          ...reg,
          event,
          event_title: event?.title || reg.event_title,
        };
      })
      .filter((r) => r.status === 'attended');
  }, [myRegistrations, eventsById]);

  const profilePhotoUrl = resolveMediaUrl(currentUser?.profile_photo) || '';

  const cvPayload = useMemo(() => ({
    user: currentUser,
    certificates,
    developmentEvents,
    templateId: debouncedTemplateId,
    profilePhotoUrl,
  }), [currentUser, certificates, developmentEvents, debouncedTemplateId, profilePhotoUrl]);

  const previewHtml = useMemo(() => {
    if (!currentUser) return '';
    return renderCvDocumentHtml(cvPayload);
  }, [currentUser, cvPayload]);

  const runDownload = useCallback((format) => {
    if (format === 'pdf') {
      try {
        openCvForPrint({ ...cvPayload, html: previewHtml });
      } catch (err) {
        toast.error(err?.message || 'Could not open CV for PDF.');
      }
    } else if (format === 'docx') {
      downloadCvDocx(cvPayload).catch((err) => {
        toast.error(err?.message || 'Could not download Word file.');
      });
    }
  }, [cvPayload, previewHtml, toast]);

  const throttledRunDownload = useThrottledCallback(runDownload);

  const payment = useCvDownloadPayment();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setCertsLoading(true);
      try {
        const rows = await fetchMyCertificates();
        if (!cancelled) setCertificates(rows);
      } catch {
        if (!cancelled) setCertificates([]);
      } finally {
        if (!cancelled) setCertsLoading(false);
      }
    };
    if (currentUser?.id) void load();
    else {
      setCertificates([]);
      setCertsLoading(false);
    }
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const handleTemplateSelect = (id) => {
    setTemplateId(id);
    storeCvTemplateId(id);
  };

  const handleDownloadPdf = () => {
    payment.requestDownload('pdf', throttledRunDownload);
  };

  const handleDownloadWord = () => {
    payment.requestDownload('docx', throttledRunDownload);
  };

  const selectedTemplate = CV_TEMPLATES.find((t) => t.id === templateId);

  if (payment.accessLoading || certsLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-navy-500 text-sm gap-2">
        <Loader2 size={20} className="animate-spin" />
        Loading your CV…
      </div>
    );
  }

  if (payment.access?.enabled === false) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <BackLink />
        <p className="text-sm text-navy-500 mt-6">The CV generator is not available at the moment.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <BackLink />
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-3">My CV</h1>
          <p className="text-sm text-navy-500 mt-1 max-w-xl">
            Choose a template, preview your CV, then download as PDF or Word.
            Viewing is free; downloads require a one-time payment
            {payment.priceZmw > 0 ? ` (${payment.priceLabel})` : ''}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {payment.downloadsUnlocked && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
              <CheckCircle size={13} />
              Downloads unlocked
            </span>
          )}
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-navy-200 text-navy-800 bg-white hover:bg-navy-50 transition-colors"
          >
            {!payment.canDownloadNow && <Lock size={14} className="text-navy-400" />}
            <Download size={15} />
            PDF
          </button>
          <button
            type="button"
            onClick={handleDownloadWord}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-navy-200 text-navy-800 bg-white hover:bg-navy-50 transition-colors"
          >
            {!payment.canDownloadNow && <Lock size={14} className="text-navy-400" />}
            <FileText size={15} />
            Word
          </button>
        </div>
      </div>

      {payment.showPayment && !payment.canDownloadNow && (
        <PaymentCard payment={payment} onPay={() => payment.handlePayForDownloads(throttledRunDownload)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_1fr] gap-6">
        <aside className="space-y-4">
          <section className="bg-white rounded-xl border border-navy-200/70 shadow-sm p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-navy-900 mb-1">Templates</h2>
            <p className="text-xs text-navy-500 mb-4">
              {selectedTemplate
                ? `${selectedTemplate.label} — ${selectedTemplate.description}`
                : 'Pick a design for your CV.'}
            </p>
            <CvTemplatePicker selectedId={templateId} onSelect={handleTemplateSelect} />
          </section>
          <p className="text-xs text-navy-400 px-1">
            Update your profile on{' '}
            <Link to="/account/profile" className="text-cyan-700 hover:underline font-medium">
              Edit profile
            </Link>
            {' '}to improve CV content.
          </p>
        </aside>

        <section className="bg-white rounded-xl border border-navy-200/70 shadow-sm overflow-hidden flex flex-col min-h-[min(72vh,720px)] lg:max-h-[calc(100vh-7rem)] lg:sticky lg:top-20">
          <div className="px-4 py-3 border-b border-navy-100 bg-navy-50/50 flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-navy-500">
              Live preview · A4
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-navy-400 truncate hidden sm:inline">
                {selectedTemplate?.label}
              </span>
              <button
                type="button"
                onClick={() => setPreviewFullscreen(true)}
                disabled={!previewHtml}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-navy-700 bg-white border border-navy-200 hover:bg-navy-50 transition-colors disabled:opacity-50 shrink-0"
                aria-label="View CV preview in fullscreen"
              >
                <Maximize2 size={14} />
                Full screen
              </button>
            </div>
          </div>
          {!previewFullscreen && (
            <div className="flex-1 min-h-0 bg-slate-100/80 relative overflow-hidden">
              <CvA4LivePreview
                html={previewHtml}
                title={`CV preview — ${currentUser?.name || 'User'}`}
                className="absolute inset-0"
              />
            </div>
          )}
          {previewFullscreen && (
            <div className="flex-1 min-h-0 bg-slate-100/80 flex items-center justify-center px-4 py-8">
              <p className="text-sm text-navy-500 text-center">Fullscreen preview is open.</p>
            </div>
          )}
        </section>
      </div>

      {previewFullscreen && previewHtml && (
        <CvA4FullscreenOverlay
          html={previewHtml}
          title={`CV preview — ${currentUser?.name || 'User'}`}
          templateLabel={selectedTemplate?.label}
          onClose={() => setPreviewFullscreen(false)}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/account/profile"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-600 transition-colors"
    >
      <ArrowLeft size={16} />
      Back to profile
    </Link>
  );
}

function PaymentCard({ payment, onPay }) {
  return (
    <div className="mb-6 rounded-xl border border-navy-200 bg-gradient-to-br from-navy-50 to-cyan-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white">
          <Lock size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-900">Pay to download your CV</p>
          <p className="text-xs text-navy-600 mt-1">
            One-time · {payment.priceLabel}. Unlocks PDF and Word forever. Preview stays free.
          </p>

          {payment.priceZmw > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => payment.setPaymentMethod('mobile_money')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    payment.paymentMethod === 'mobile_money'
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : 'bg-white text-navy-700 border-navy-200'
                  }`}
                >
                  <Smartphone size={13} />
                  Mobile money
                </button>
                <button
                  type="button"
                  onClick={() => payment.setPaymentMethod('card')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    payment.paymentMethod === 'card'
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : 'bg-white text-navy-700 border-navy-200'
                  }`}
                >
                  <CreditCard size={13} />
                  Card
                </button>
              </div>
              {payment.paymentMethod === 'mobile_money' && (
                <input
                  type="tel"
                  value={payment.phone}
                  onChange={(e) => payment.setPhone(e.target.value)}
                  placeholder="Mobile money number"
                  className="w-full max-w-xs px-3 py-2 rounded-lg border border-navy-200 text-sm"
                />
              )}
            </div>
          )}

          {payment.paymentStep && (
            <p className="mt-3 text-xs text-cyan-800 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin shrink-0" />
              {payment.paymentStep}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPay}
              disabled={payment.paying}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 disabled:opacity-60 transition-colors"
            >
              {payment.paying ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Lock size={15} />
                  {payment.priceZmw > 0 ? `Pay ${payment.priceLabel} to download` : 'Enable free downloads'}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={payment.cancelPayment}
              disabled={payment.paying}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-navy-600 border border-navy-200 hover:bg-white transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
