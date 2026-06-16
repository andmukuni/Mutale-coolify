import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Lock,
  Sparkles,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Smartphone,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { useUserAuth } from '../../context/UserAuthContext';
import { useToast } from '../../context/ToastContext';
import { buildCvStrengthSuggestions } from '../../../shared/cvStrengthSuggestions.js';
import { readStoredCvTemplateId } from '../../../shared/cvTemplates.js';
import { resolveMediaUrl } from '../../utils/mediaUrl.js';
import { openCvForPrint, downloadCvDocx } from '../../utils/cvGenerator.js';
import { fetchCvSuggestions } from '../../utils/cvApi.js';
import { useCvDownloadPayment } from '../../hooks/useCvDownloadPayment.js';
import { useThrottledCallback } from '../../utils/cvDownloadThrottle.js';

const PRIORITY_STYLES = {
  high: 'border-amber-200 bg-amber-50/80',
  medium: 'border-cyan-100 bg-cyan-50/50',
  low: 'border-navy-100 bg-navy-50/40',
};

/**
 * @param {{ certificates: object[], registrations: object[], onUnlocked?: () => void }} props
 */
export default function CvGeneratorPanel({ certificates = [], registrations = [], onUnlocked }) {
  const { currentUser } = useUserAuth();
  const toast = useToast();
  const [suggestions, setSuggestions] = useState([]);
  const [score, setScore] = useState(null);

  const developmentEvents = useMemo(
    () => registrations.filter((r) => r.status === 'attended'),
    [registrations],
  );

  const cvPayload = useMemo(() => ({
    user: currentUser,
    certificates,
    developmentEvents,
    templateId: readStoredCvTemplateId(),
    profilePhotoUrl: resolveMediaUrl(currentUser?.profile_photo) || '',
  }), [currentUser, certificates, developmentEvents]);

  const payment = useCvDownloadPayment({ onUnlocked });

  const runDownload = useCallback((format) => {
    if (format === 'pdf') {
      try {
        openCvForPrint(cvPayload);
      } catch (err) {
        toast.error(err?.message || 'Could not open CV for PDF.');
      }
    } else if (format === 'docx') {
      void downloadCvDocx(cvPayload).catch((err) => {
        toast.error(err?.message || 'Could not download Word file.');
      });
    }
  }, [cvPayload, toast]);

  const throttledRunDownload = useThrottledCallback(runDownload);

  const loadSuggestions = useCallback(async (signal) => {
    try {
      const data = await fetchCvSuggestions(signal);
      setSuggestions(data.suggestions || []);
      setScore(data.score ?? null);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      const local = buildCvStrengthSuggestions({
        user: currentUser,
        certificates,
        registrations,
      });
      setSuggestions(local.suggestions);
      setScore(local.score);
    }
  }, [currentUser, certificates, registrations]);

  useEffect(() => {
    const ac = new AbortController();
    void loadSuggestions(ac.signal);
    return () => ac.abort();
  }, [loadSuggestions]);

  if (payment.accessLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-navy-500 text-sm gap-2">
        <Loader2 size={18} className="animate-spin" />
        Loading CV generator…
      </div>
    );
  }

  if (payment.access?.enabled === false) {
    return (
      <div className="bg-white rounded-lg border border-navy-200/70 shadow-sm p-6 text-sm text-navy-500">
        The CV generator is not available at the moment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-lg border border-navy-200/70 shadow-sm p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-navy-900 flex items-center gap-2">
              <Sparkles size={18} className="text-cyan-600" />
              Strengthen your CV
            </h2>
            <p className="text-sm text-navy-500 mt-1 max-w-xl">
              Personalized tips based on your profile, events, and certificates.
            </p>
          </div>
          {score != null && (
            <div className="text-center px-4 py-2 rounded-xl border border-cyan-100 bg-cyan-50/60">
              <p className="text-[10px] uppercase tracking-wide text-cyan-800 font-semibold">Profile score</p>
              <p className="text-2xl font-bold text-navy-900">{score}%</p>
            </div>
          )}
        </div>
        <ul className="space-y-2">
          {suggestions.slice(0, 8).map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border px-4 py-3 ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.low}`}
            >
              <p className="text-sm font-semibold text-navy-900">{item.title}</p>
              <p className="text-xs text-navy-600 mt-0.5 leading-relaxed">{item.detail}</p>
            </li>
          ))}
        </ul>
        {suggestions.length === 0 && (
          <p className="text-sm text-navy-500">Your profile looks strong. Open your CV when ready.</p>
        )}
      </section>

      <section className="bg-white rounded-lg border border-navy-200/70 shadow-sm p-5 sm:p-6">
        <h2 className="text-base font-semibold text-navy-900">CV generator</h2>
        <p className="text-sm text-navy-500 mt-1">
          Preview your CV and pick from professional templates — free. Download as PDF or Word with a one-time payment
          {payment.priceZmw > 0 ? ` (${payment.priceLabel})` : ''}.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {payment.downloadsUnlocked && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
              <CheckCircle size={14} />
              Downloads unlocked
            </span>
          )}

          <Link
            to="/account/cv"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
          >
            View &amp; design my CV
            <ArrowRight size={16} />
          </Link>

          <button
            type="button"
            onClick={() => payment.requestDownload('pdf', throttledRunDownload)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-navy-200 text-navy-800 bg-white hover:bg-navy-50 transition-colors"
          >
            {!payment.canDownloadNow && <Lock size={14} className="text-navy-400" />}
            <Download size={16} />
            Download PDF
          </button>

          <button
            type="button"
            onClick={() => payment.requestDownload('docx', throttledRunDownload)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-navy-200 text-navy-800 bg-white hover:bg-navy-50 transition-colors"
          >
            {!payment.canDownloadNow && <Lock size={14} className="text-navy-400" />}
            <FileText size={16} />
            Download Word
          </button>
        </div>

        {payment.showPayment && !payment.canDownloadNow && (
          <PanelPaymentBlock payment={payment} onPay={() => payment.handlePayForDownloads(throttledRunDownload)} />
        )}

        <p className="mt-4 text-xs text-navy-400 flex items-center gap-1.5">
          <AlertCircle size={12} />
          Use the CV page to switch templates. Complete your profile for stronger content.
        </p>
      </section>
    </div>
  );
}

function PanelPaymentBlock({ payment, onPay }) {
  return (
    <div className="mt-5 rounded-xl border border-navy-200 bg-gradient-to-br from-navy-50 to-cyan-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white">
          <Lock size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-900">Pay to download your CV</p>
          <p className="text-xs text-navy-600 mt-1">
            One-time · {payment.priceLabel}. Unlocks PDF and Word downloads forever.
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
