import { useCallback, useEffect, useState } from 'react';
import { useUserAuth } from '../context/UserAuthContext';
import { useToast } from '../context/ToastContext';
import { useCurrency } from '../context/CurrencyContext';
import {
  fetchCvAccess,
  initiateCvMobileCheckout,
  createCvCardCheckoutSession,
  verifyCvPayment,
  pollLencoPayment,
} from '../utils/cvApi.js';
import {
  extractLencoPaymentStatus,
  isLencoFailedStatus,
  isLencoSuccessStatus,
} from '../utils/lencoPaymentStatus.js';
import { runLencoCardWidget } from '../utils/lencoCardPayment.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function detectMobileProvider(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  const prefix = digits.startsWith('260') ? digits.slice(3, 5) : digits.slice(0, 2);
  if (['096', '076'].includes(prefix)) return 'MTN';
  if (['097', '077'].includes(prefix)) return 'Airtel';
  if (['095', '075'].includes(prefix)) return 'Zamtel';
  return null;
}

/**
 * Shared CV download entitlement + Lenco checkout flow.
 * @param {{ onUnlocked?: () => void }} [options]
 */
export function useCvDownloadPayment({ onUnlocked } = {}) {
  const { currentUser, applySessionUser } = useUserAuth();
  const toast = useToast();
  const { isZambia, geoLoading } = useCurrency();

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [paymentMethod, setPaymentMethod] = useState('mobile_money');
  const [paying, setPaying] = useState(false);
  const [paymentStep, setPaymentStep] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(null);

  const downloadsUnlocked = Boolean(
    access?.downloadsUnlocked
    ?? access?.unlocked
    ?? currentUser?.cv_unlocked_at,
  );
  const priceZmw = Number(access?.priceZmw ?? 0);
  const downloadIsFree = priceZmw <= 0;
  const canDownloadNow = downloadsUnlocked || downloadIsFree;

  const priceLabel = priceZmw > 0
    ? `ZMW ${priceZmw.toLocaleString('en-ZM', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : 'Free';

  const loadAccess = useCallback(async (signal) => {
    setAccessLoading(true);
    try {
      const data = await fetchCvAccess(signal);
      setAccess(data);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      toast.error(err?.message || 'Could not load CV access.');
    } finally {
      if (!signal?.aborted) setAccessLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const ac = new AbortController();
    void loadAccess(ac.signal);
    return () => ac.abort();
  }, [loadAccess]);

  useEffect(() => {
    if (!geoLoading) setPaymentMethod(isZambia ? 'mobile_money' : 'card');
  }, [geoLoading, isZambia]);

  useEffect(() => {
    setPhone(currentUser?.phone || '');
  }, [currentUser?.phone]);

  const pollUntilPaid = async (reference) => {
    const timeoutMs = 180000;
    const intervalMs = 5000;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(intervalMs);
      setPaymentStep('Waiting for payment confirmation…');
      const { res, json } = await pollLencoPayment(reference);
      const status = extractLencoPaymentStatus(json);
      if (res.ok && json?.ok && isLencoSuccessStatus(status)) {
        return true;
      }
      if (isLencoFailedStatus(status)) {
        throw new Error('Payment was not successful.');
      }
    }
    throw new Error('Payment confirmation timed out. If you paid, refresh the page or contact support.');
  };

  const finishDownloadUnlock = useCallback(async (reference, onAfterUnlock) => {
    const data = await verifyCvPayment(reference);
    if (data?.user) {
      applySessionUser(data.user);
    }
    await loadAccess();
    onUnlocked?.();
    setShowPayment(false);
    toast.success('Downloads unlocked. You can save your CV as PDF or Word.');
    const format = pendingDownload;
    setPendingDownload(null);
    onAfterUnlock?.(format);
  }, [applySessionUser, loadAccess, onUnlocked, pendingDownload, toast]);

  const requestDownload = useCallback((format, onAfterUnlock) => {
    if (canDownloadNow) {
      onAfterUnlock?.(format);
      return;
    }
    setPendingDownload(format);
    setShowPayment(true);
  }, [canDownloadNow]);

  const handlePayForDownloads = useCallback(async (onAfterUnlock) => {
    if (downloadIsFree) {
      try {
        const data = await verifyCvPayment('');
        if (data?.user) applySessionUser(data.user);
        await loadAccess();
        onUnlocked?.();
        setShowPayment(false);
        toast.success('CV downloads are ready.');
        const format = pendingDownload;
        setPendingDownload(null);
        if (format) onAfterUnlock?.(format);
      } catch (err) {
        toast.error(err?.message || 'Could not enable downloads.');
      }
      return;
    }

    setPaying(true);
    setPaymentStep('Starting checkout…');
    try {
      if (paymentMethod === 'mobile_money') {
        if (!phone.trim()) {
          toast.error('Enter your mobile money number.');
          return;
        }
        const checkout = await initiateCvMobileCheckout({ amount: priceZmw, phone });
        const reference = checkout?.reference;
        if (!reference) throw new Error('No payment reference returned.');
        setPaymentStep(
          detectMobileProvider(phone)
            ? `Check your ${detectMobileProvider(phone)} phone to approve the payment.`
            : 'Check your phone to approve the payment.',
        );
        const paid = await pollUntilPaid(reference);
        if (!paid) return;
        await finishDownloadUnlock(reference, onAfterUnlock);
      } else {
        const session = await createCvCardCheckoutSession({
          amount: priceZmw,
          currency: 'ZMW',
          billingAmountZmw: priceZmw,
        });
        setPaymentStep('Complete card payment in the window…');
        const reference = await runLencoCardWidget(session);
        const { res, json } = await pollLencoPayment(reference);
        const status = extractLencoPaymentStatus(json);
        if (!res.ok || !json?.ok || !isLencoSuccessStatus(status)) {
          throw new Error('Card payment was not confirmed.');
        }
        await finishDownloadUnlock(reference, onAfterUnlock);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        toast.error(err?.message || 'Payment failed.');
      }
    } finally {
      setPaying(false);
      setPaymentStep('');
    }
  }, [
    downloadIsFree,
    applySessionUser,
    loadAccess,
    onUnlocked,
    pendingDownload,
    toast,
    paymentMethod,
    phone,
    priceZmw,
    finishDownloadUnlock,
  ]);

  const cancelPayment = useCallback(() => {
    setShowPayment(false);
    setPendingDownload(null);
  }, []);

  return {
    access,
    accessLoading,
    downloadsUnlocked,
    canDownloadNow,
    downloadIsFree,
    priceZmw,
    priceLabel,
    phone,
    setPhone,
    paymentMethod,
    setPaymentMethod,
    paying,
    paymentStep,
    showPayment,
    setShowPayment,
    requestDownload,
    handlePayForDownloads,
    cancelPayment,
  };
}
