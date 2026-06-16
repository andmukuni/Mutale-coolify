/**
 * BookingModal — handles the event booking / subscription flow.
 * Shows registration type selection, confirms, and submits.
 */
import { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Calendar, MapPin, Ticket, ShoppingBag } from 'lucide-react';
import Modal from './ui/Modal';
import EventMerchUpsellModal from './EventMerchUpsellModal';
import { useBooking } from '../context/BookingContext';
import { useUserAuth } from '../context/UserAuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import { checkEventAvailability, deriveAttendeeSlotKey, getRegistrationAttendeeSlotKey } from '../utils/eventServices';
import { formatDate, formatTime } from '../utils/helpers';
import { getApiBase } from '../utils/apiBase';
import { getSessionAuthHeaders } from '../utils/authHeaders';
import { runLencoCardWidget } from '../utils/lencoCardPayment';

const API_BASE = getApiBase();

function getNumericAmount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCouponCodeInput(raw = '') {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'just now';

  const diffMs = Date.now() - Number(timestamp);
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function normalizePhone(raw = '') {
  const trimmed = String(raw || '').replace(/\s+/g, '').trim();
  if (!trimmed) return '';

  let digits = trimmed;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = `260${digits.slice(1)}`;
  return digits;
}

function detectMobileProvider(raw = '') {
  const digits = normalizePhone(raw);
  const local = digits.startsWith('260') ? `0${digits.slice(3)}` : digits;
  const prefix = local.slice(0, 3);

  if (['097', '077'].includes(prefix)) return { code: 'airtel', name: 'Airtel Money' };
  if (['096', '076'].includes(prefix)) return { code: 'mtn', name: 'MTN MoMo' };
  if (['095', '075'].includes(prefix)) return { code: 'zamtel', name: 'Zamtel Kwacha' };
  return null;
}

function isLencoSuccessStatus(rawStatus = '') {
  const status = String(rawStatus || '').toLowerCase();
  return ['successful', 'success', 'paid', 'completed'].includes(status);
}

function isLencoFailedStatus(rawStatus = '') {
  const status = String(rawStatus || '').toLowerCase();
  return ['failed', 'cancelled', 'declined', 'reversed'].includes(status);
}

function extractLencoPaymentStatus(payload = {}) {
  const candidates = [
    payload?.data?.data?.status,
    payload?.data?.paymentStatus,
    payload?.data?.transaction?.status,
    payload?.data?.status,
    payload?.status,
  ];

  const textStatus = candidates.find((value) => typeof value === 'string' && value.trim());
  return String(textStatus || '').toLowerCase();
}

export default function BookingModal({ event, isOpen, onClose }) {
  const { currentUser } = useUserAuth();
  const { registerForEvent, updateRegistration, getEventRegistrationCount, registrations } = useBooking();
  const {
    isZambia,
    loading: geoLoading,
    formatEventPrice,
    convertFromZMW,
    getPriceBoth,
    exchangeRate,
    rateLastFetched,
  } = useCurrency();

  const pollCancelledRef = useRef(false);

  const regCount = getEventRegistrationCount(event?.id || '');
  const profilePhone = String(currentUser?.phone || '').trim();

  const regType = 'subscription';
  // Default to card for non-Zambian users, mobile_money for Zambian users
  const [paymentMethod, setPaymentMethod] = useState(() => isZambia ? 'mobile_money' : 'card');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [bookingTarget, setBookingTarget] = useState('self');
  const [attendeeName, setAttendeeName] = useState('');
  const [attendeeRelation, setAttendeeRelation] = useState('');
  const [result, setResult] = useState(null); // { success, registration, error }
  const [loading, setLoading] = useState(false);
  const [paymentJourney, setPaymentJourney] = useState(null);
  const toast = useToast();
  const toastedResultRef = useRef(null);

  // Fire a toast once per result change so users get feedback even if the
  // success screen renders below the fold or briefly.
  useEffect(() => {
    if (!result || toastedResultRef.current === result) return;
    toastedResultRef.current = result;
    if (result.success) {
      toast.success(
        result.registration?.payment_status === 'paid'
          ? 'Registration confirmed — payment received.'
          : 'Registration submitted.',
      );
    } else if (result.error) {
      toast.error(result.error);
    }
  }, [result, toast]);
  // Post-payment merch upsell
  const [merchProducts, setMerchProducts] = useState([]);
  const [showMerchUpsell, setShowMerchUpsell] = useState(false);
  const [merchPrefetched, setMerchPrefetched] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponMeta, setAppliedCouponMeta] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponFieldError, setCouponFieldError] = useState('');

  // Update payment method when geo detection completes
  useEffect(() => {
    if (!geoLoading) {
      setPaymentMethod(isZambia ? 'mobile_money' : 'card');
    }
  }, [geoLoading, isZambia]);

  // Auto-fill mobile payment number from user profile when booking opens.
  useEffect(() => {
    if (!isOpen) {
      // Cancel any in-progress payment polling when modal is closed
      pollCancelledRef.current = true;
      return;
    }
    if (paymentMethod !== 'mobile_money' || !isZambia) return;
    if (phone.trim()) return;
    if (!profilePhone) return;
    setPhone(profilePhone);
  }, [isOpen, paymentMethod, isZambia, phone, profilePhone]);

  useEffect(() => {
    if (!isOpen) return;
    setCouponInput('');
    setAppliedCouponMeta(null);
    setCouponFieldError('');
  }, [isOpen, event?.id]);

  // Prefetch event-attached merch when the registration succeeds with a paid status,
  // so we can offer the post-payment upsell modal.
  useEffect(() => {
    if (!isOpen) return;
    if (!result?.success) return;
    if (merchPrefetched) return;
    const reg = result.registration;
    if (!reg) return;
    const paid = isLencoSuccessStatus(reg.payment_status);
    if (!paid) return;
    const eid = event?.id || reg.event_id;
    if (!eid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/events/${encodeURIComponent(eid)}/products`, {
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        const list = Array.isArray(json?.data) ? json.data : [];
        setMerchProducts(list);
      } catch {
        if (!cancelled) setMerchProducts([]);
      } finally {
        if (!cancelled) setMerchPrefetched(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, result, merchPrefetched, event?.id]);

  const applyCouponPreview = async () => {
    setCouponFieldError('');
    const codeNorm = normalizeCouponCodeInput(couponInput);
    if (!codeNorm) {
      setAppliedCouponMeta(null);
      return;
    }
    setCouponBusy(true);
    try {
      const res = await fetch(`${API_BASE}/events/${encodeURIComponent(event.id)}/coupon-preview`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ coupon_code: couponInput.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.data) {
        setAppliedCouponMeta(null);
        setCouponFieldError(json?.message || 'That code is not valid for this event.');
        return;
      }
      setAppliedCouponMeta({ codeNorm, preview: json.data });
      setCouponFieldError('');
    } catch {
      setAppliedCouponMeta(null);
      setCouponFieldError('Could not validate the coupon right now. Try again.');
    } finally {
      setCouponBusy(false);
    }
  };

  if (!event) return null;

  const baseAvailability = checkEventAvailability(event, registrations, currentUser?.id, regType, {
    skipDuplicateCheck: true,
  });
  const detectedProvider = detectMobileProvider(phone);
  const selfRegistration = registrations.find(
    (r) => r.user_id === currentUser?.id
      && r.event_id === event.id
      && r.registration_type === regType
      && r.status !== 'cancelled'
      && getRegistrationAttendeeSlotKey(r) === '__self__',
  );
  const spotsLeft = event.capacity ? Math.max(0, event.capacity - regCount) : null;
  const canBookAdditional = spotsLeft === null || spotsLeft > 0;

  const pollMobilePaymentStatus = async (reference) => {
    pollCancelledRef.current = false;
    const startedAt = Date.now();
    const timeoutMs = 180000;
    const intervalMs = 5000;
    let attempt = 0;

    while (Date.now() - startedAt < timeoutMs) {
      await sleep(intervalMs);
      if (pollCancelledRef.current) return { success: false, cancelled: true };
      attempt += 1;

      setPaymentJourney((prev) => ({
        ...prev,
        step: attempt < 3 ? 'waiting_confirmation' : 'processing_delay',
        title: attempt < 3 ? 'Waiting for confirmation' : 'Still checking your payment…',
        subtitle: attempt < 3
          ? 'Almost there. We’re confirming your payment status with the gateway.'
          : 'It’s taking a little longer than usual, but confirmation is often on the way.',
        attempt,
      }));

      try {
        const verifyRes = await fetch(`${API_BASE}/payments/lenco/verify`, {
          method: 'POST',
          headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ reference }),
        });
        const verifyJson = await verifyRes.json().catch(() => ({}));

        if (pollCancelledRef.current) return { success: false, cancelled: true };

        const verifyStatus = extractLencoPaymentStatus(verifyJson);

        if (verifyRes.ok && verifyJson?.ok && isLencoSuccessStatus(verifyStatus)) {
          return { success: true, status: verifyStatus };
        }

        if (isLencoFailedStatus(verifyStatus)) {
          return { success: false, failed: true, status: verifyStatus };
        }
      } catch {
        // Keep polling and keep user encouraged.
      }
    }

    return { success: false, timeout: true };
  };

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);

    if (!baseAvailability.canBook) {
      setResult({ success: false, error: baseAvailability.reason || 'This event is not available for registration.' });
      setLoading(false);
      return;
    }

    if (bookingTarget === 'other' && !attendeeName.trim()) {
      setResult({ success: false, error: 'Enter the name of the person you are registering.' });
      setLoading(false);
      return;
    }

    const slotKey = bookingTarget === 'other' ? deriveAttendeeSlotKey(attendeeName) : '__self__';
    const slotAvailability = checkEventAvailability(event, registrations, currentUser?.id, regType, {
      attendeeSlotKey: slotKey,
    });
    if (!slotAvailability.canBook) {
      setResult({ success: false, error: slotAvailability.reason });
      setLoading(false);
      return;
    }

    const guestPayload = bookingTarget === 'other'
      ? { bookedForName: attendeeName.trim(), bookedForRelation: attendeeRelation.trim() }
      : {};

    const liveNorm = normalizeCouponCodeInput(couponInput);
    const previewOk = Boolean(appliedCouponMeta && appliedCouponMeta.codeNorm === liveNorm);
    const couponForRegistration = previewOk ? liveNorm : '';

    if (!event.is_free && liveNorm && !previewOk) {
      setResult({ success: false, error: 'Press “Apply coupon” to validate this code, or clear the coupon field.' });
      setLoading(false);
      return;
    }

    try {
      await new Promise(r => setTimeout(r, 250));

      if (event.is_free) {
        const freeReg = await registerForEvent({
          user: currentUser,
          event,
          registrationType: regType,
          notes,
          paymentStatus: 'not_required',
          registrationStatus: 'confirmed',
          paymentMethod: 'free',
          ...guestPayload,
        });
        setResult(freeReg);
        return;
      }

      const listZmw = getNumericAmount(event.price);
      const effectiveZmw = previewOk ? getNumericAmount(appliedCouponMeta.preview.final_zmw) : listZmw;

      if (effectiveZmw <= 0 && previewOk) {
        const waivedReg = await registerForEvent({
          user: currentUser,
          event,
          registrationType: regType,
          notes,
          paymentStatus: 'not_required',
          registrationStatus: 'confirmed',
          paymentMethod: 'free',
          couponCode: couponForRegistration,
          ...guestPayload,
        });
        setResult(waivedReg);
        return;
      }

      const checkoutCurrency = paymentMethod === 'card' && !isZambia ? 'USD' : 'ZMW';
      const checkoutAmount = checkoutCurrency === 'USD'
        ? convertFromZMW(effectiveZmw, 'USD')
        : effectiveZmw;
      const customerName = currentUser?.name || '';
      const customerEmail = currentUser?.email || '';

      if (paymentMethod === 'mobile_money') {
        if (!phone.trim()) {
          setResult({ success: false, error: 'Phone number is required for mobile money checkout.' });
          return;
        }

        setPaymentJourney({
          step: 'sending_prompt',
          title: 'Sending payment prompt…',
          subtitle: detectedProvider
            ? `Sending a prompt to ${detectedProvider.name}. Please check your phone.`
            : 'Sending a prompt to your mobile money wallet. Please check your phone.',
          attempt: 0,
          reference: '',
        });

        const mobileRes = await fetch(`${API_BASE}/payments/lenco/mobile-money/checkout`, {
          method: 'POST',
          headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            amount: effectiveZmw,
            currency: 'ZMW',
            phone,
            eventId: event.id,
            eventTitle: event.title,
            customerName,
            customerEmail,
            coupon_code: couponForRegistration,
          }),
        });

        const mobileJson = await mobileRes.json().catch(() => ({}));
        if (!mobileRes.ok || !mobileJson?.ok) {
          throw new Error(mobileJson?.message || 'Failed to initiate mobile money checkout.');
        }

        const reg = await registerForEvent({
          user: currentUser,
          event,
          registrationType: regType,
          notes,
          amount: effectiveZmw,
          paymentAmount: effectiveZmw,
          paymentCurrency: 'ZMW',
          paymentAmountZmw: effectiveZmw,
          paymentStatus: 'pending',
          registrationStatus: 'pending',
          paymentMethod: 'mobile_money',
          paymentReference: mobileJson?.data?.reference || '',
          referenceCode: mobileJson?.data?.reference || undefined,
          couponCode: couponForRegistration,
          ...guestPayload,
        });

        if (!reg?.success) {
          throw new Error(reg?.error || 'Failed to create pending registration.');
        }

        const reference = mobileJson?.data?.reference || reg.registration.reference_code;

        setPaymentJourney({
          step: 'prompt_sent',
          title: 'Payment prompt sent',
          subtitle: 'Approve the request on your phone. We’ll keep checking automatically every 5 seconds.',
          attempt: 0,
          reference,
        });

        const pollResult = await pollMobilePaymentStatus(reference);

        if (pollResult.success) {
          const updated = await updateRegistration(reg.registration.id, {
            payment_status: 'paid',
            status: 'confirmed',
          }) || {
            ...reg.registration,
            payment_status: 'paid',
            status: 'confirmed',
          };

          setPaymentJourney({
            step: 'confirmed',
            title: 'Payment confirmed',
            subtitle: 'Great news — your payment is confirmed and your subscription is active.',
            attempt: 0,
            reference,
          });

          setResult({ success: true, registration: updated });
          return;
        }

        if (pollResult.failed) {
          setPaymentJourney({
            step: 'failed',
            title: 'Payment not completed',
            subtitle: 'Your payment was not confirmed. You can try again with the same or another method.',
            attempt: 0,
            reference,
          });
          setResult({ success: false, error: 'Payment was not completed. Please try again.' });
          return;
        }

        // Timed out waiting — keep hope and keep registration pending.
        setPaymentJourney({
          step: 'processing_delay',
          title: 'Still processing your confirmation',
          subtitle: 'No worries — this can take a bit longer. Your payment update is on its way, and your registration is saved as pending.',
          attempt: 0,
          reference,
        });

        setResult({
          success: true,
          registration: {
            ...reg.registration,
            payment_status: 'pending',
            status: 'pending',
          },
        });
        return;
      }

      const cardPayload = {
        amount: checkoutAmount,
        currency: checkoutCurrency,
        eventId: event.id,
        eventTitle: event.title,
        customerName,
        customerEmail,
        coupon_code: couponForRegistration,
      };
      if (checkoutCurrency !== 'ZMW') {
        cardPayload.billingAmountZmw = effectiveZmw;
      }

      const cardSessionRes = await fetch(`${API_BASE}/payments/lenco/card/checkout-session`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(cardPayload),
      });

      const cardSession = await cardSessionRes.json().catch(() => ({}));
      if (!cardSessionRes.ok || !cardSession?.ok) {
        throw new Error(cardSession?.message || 'Failed to prepare card checkout.');
      }

      if (cardSession.data?.sandboxMode) {
        toast.warning(
          'Lenco sandbox mode is on. Use sandbox test cards, or disable sandbox in Admin → Payment settings for live card payments.',
        );
      }

      const lencoReference = await runLencoCardWidget(cardSession.data);

      const verifyRes = await fetch(`${API_BASE}/payments/lenco/verify`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ reference: lencoReference }),
      });
      const verifyJson = await verifyRes.json().catch(() => ({}));

      const verifyStatus = extractLencoPaymentStatus(verifyJson);
      const paid = verifyRes.ok && verifyJson?.ok && ['successful', 'success', 'paid', 'completed'].includes(verifyStatus);

      const reg = await registerForEvent({
        user: currentUser,
        event,
        registrationType: regType,
        notes,
        amount: checkoutAmount,
        paymentAmount: checkoutAmount,
        paymentCurrency: checkoutCurrency,
        paymentAmountZmw: effectiveZmw,
        paymentStatus: paid ? 'paid' : 'pending',
        registrationStatus: paid ? 'confirmed' : 'pending',
        paymentMethod: 'card',
        paymentReference: lencoReference,
        referenceCode: lencoReference,
        couponCode: couponForRegistration,
        ...guestPayload,
      });

      setResult(reg);
    } catch (error) {
      setResult({ success: false, error: error.message || 'Unable to process payment.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setNotes('');
    setPhone('');
    setBookingTarget('self');
    setAttendeeName('');
    setAttendeeRelation('');
    setPaymentMethod(isZambia ? 'mobile_money' : 'card');
    setPaymentJourney(null);
    setCouponInput('');
    setAppliedCouponMeta(null);
    setCouponFieldError('');
    onClose();
  };

  if (!loading && !result?.success && selfRegistration && !canBookAdditional) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} size="sm">
        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-50 text-cyan-600 mb-4">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-navy-900 mb-1">You&rsquo;re already registered</h2>
          <p className="text-sm text-navy-500 mb-5">
            {selfRegistration.payment_status === 'paid'
              ? 'Payment is complete and your subscription is active.'
              : selfRegistration.payment_status === 'pending'
                ? 'Your registration was created and payment is still pending confirmation.'
                : 'Your registration is already on record for this event.'}
          </p>

          <div className="bg-navy-50 rounded-xl p-4 text-left space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-navy-500">Reference</span>
              <span className="font-mono font-semibold text-navy-900">{selfRegistration.reference_code}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-navy-500">Status</span>
              <span className="font-medium text-green-700 capitalize">{selfRegistration.status}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-navy-500">Payment</span>
              <span className="font-medium text-navy-700 capitalize">{String(selfRegistration.payment_status || '').replace('_', ' ')}</span>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-3 rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (result?.success) {
    const reg = result.registration;
    const paidSuccess = isLencoSuccessStatus(reg.payment_status);
    const hasMerch = paidSuccess && merchPrefetched && merchProducts.length > 0;
    return (
      <>
        <Modal isOpen={isOpen && !showMerchUpsell} onClose={handleClose} size="sm">
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-50 text-green-600 mb-4">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-navy-900 mb-1">You&rsquo;re registered!</h2>
            <p className="text-sm text-navy-500 mb-5">
              {reg.payment_status === 'pending'
                ? 'Your registration is created and payment is pending confirmation.'
                : 'Your registration has been confirmed.'}
            </p>

            <div className="bg-navy-50 rounded-xl p-4 text-left space-y-2 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-navy-500">Reference</span>
                <span className="font-mono font-semibold text-navy-900">{reg.reference_code}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-navy-500">Event</span>
                <span className="font-medium text-navy-800 text-right max-w-[200px]">{reg.event_title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-navy-500">Type</span>
                <span className="capitalize font-medium text-cyan-700">{reg.registration_type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-navy-500">Status</span>
                <span className="font-medium text-green-700 capitalize">{reg.status}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-navy-500">Payment</span>
                <span className="font-medium text-navy-700 capitalize">{reg.payment_status.replace('_', ' ')}</span>
              </div>
              {String(reg.booked_for_name || '').trim() && (
                <div className="flex justify-between text-sm">
                  <span className="text-navy-500">Ticket for</span>
                  <span className="font-medium text-navy-800 text-right max-w-[200px]">
                    {reg.booked_for_name}
                    {reg.booked_for_relation ? ` (${reg.booked_for_relation})` : ''}
                  </span>
                </div>
              )}
            </div>

            {hasMerch ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowMerchUpsell(true)}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-3 rounded-xl transition-colors inline-flex items-center justify-center gap-2"
                >
                  <ShoppingBag size={16} />
                  Take home some merch
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full bg-white border border-navy-200 hover:bg-navy-50 text-navy-700 font-medium py-2.5 rounded-xl transition-colors text-sm"
                >
                  Maybe later
                </button>
              </div>
            ) : (
              <button
                onClick={handleClose}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-3 rounded-xl transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </Modal>

        <EventMerchUpsellModal
          isOpen={isOpen && showMerchUpsell}
          onClose={() => {
            setShowMerchUpsell(false);
            handleClose();
          }}
          eventId={event?.id || reg.event_id}
          eventTitle={event?.title || reg.event_title}
          autoLoad={false}
          products={merchProducts}
        />
      </>
    );
  }

  if (loading && paymentJourney?.step) {
    const reference = paymentJourney.reference;

    return (
      <Modal isOpen={isOpen} onClose={handleClose} size="sm" title="Processing Payment">
        <div className="py-4 space-y-4">
          <div className="flex items-center justify-center">
            <div className="h-16 w-16 rounded-full border-4 border-cyan-200 border-t-cyan-600 animate-spin" />
          </div>

          <div className="text-center space-y-1">
            <h3 className="text-lg font-semibold text-navy-900">{paymentJourney.title}</h3>
            <p className="text-sm text-navy-500">{paymentJourney.subtitle}</p>
          </div>

          <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-xs text-cyan-800 space-y-1">
            {detectedProvider && (
              <p>
                Network detected: <span className="font-semibold">{detectedProvider.name}</span>
              </p>
            )}
            {reference && (
              <p>
                Reference: <span className="font-mono font-semibold">{reference}</span>
              </p>
            )}
            {(paymentJourney.step === 'waiting_confirmation' || paymentJourney.step === 'processing_delay' || paymentJourney.step === 'prompt_sent') && (
              <p className="animate-pulse">Auto-checking every 5 seconds…</p>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  // ── Booking form ──────────────────────────────────────────────────────────
  const displayPrice = getPriceBoth(event.price, event.is_free);
  const fxRateLabel = exchangeRate
    ? `1 ZMW ≈ $${Number(exchangeRate).toFixed(4)}`
    : 'Using fallback FX rate';

  const couponLiveNorm = normalizeCouponCodeInput(couponInput);
  const couponPreviewOk = Boolean(appliedCouponMeta && appliedCouponMeta.codeNorm === couponLiveNorm);
  const effectiveZmwDisplay = couponPreviewOk
    ? getNumericAmount(appliedCouponMeta.preview.final_zmw)
    : getNumericAmount(event.price);
  const showDiscountBreakdown = Boolean(
    couponPreviewOk && getNumericAmount(appliedCouponMeta.preview.discount_zmw) > 0.005,
  );
  const displayPriceEffective = getPriceBoth(effectiveZmwDisplay, Boolean(!event.is_free && effectiveZmwDisplay <= 0.005));

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Register for Event"
      size="md"
      footer={
        <>
          <button
            onClick={handleClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              loading
              || !baseAvailability.canBook
              || (bookingTarget === 'other' && !attendeeName.trim())
            }
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-2"
          >
            {loading && <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {event.is_free || (!event.is_free && effectiveZmwDisplay <= 0.005 && couponPreviewOk)
              ? 'Confirm Registration'
              : 'Proceed to Payment'}
          </button>
        </>
      }
    >
      {/* Event summary */}
      <div className="bg-navy-50 rounded-xl p-4 mb-5">
        <h3 className="font-semibold text-navy-900 text-sm mb-2">{event.title}</h3>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-navy-500">
            <Calendar size={12} />
            {formatDate(event.start_date || event.date)}
            {event.start_time && ` · ${formatTime(event.start_time)}`}
          </div>
          <div className="flex items-center gap-2 text-xs text-navy-500">
            <MapPin size={12} />
            {event.venue ? `${event.venue}, ${event.location}` : event.location}
          </div>
          {spotsLeft !== null && (
            <div className="flex items-center gap-2 text-xs text-navy-500">
              <Ticket size={12} />
              {spotsLeft === 0 ? (
                <span className="text-red-600 font-medium">No spots remaining</span>
              ) : (
                <span>{spotsLeft} of {event.capacity} spots remaining</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Availability error */}
      {!baseAvailability.canBook && (
        <div className="flex items-start gap-2 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {baseAvailability.reason}
        </div>
      )}

      <div className="mb-4 text-xs text-navy-500">
        Registration type: <span className="font-semibold text-cyan-700">Subscription</span>
      </div>

      <div className="mb-4 space-y-2">
        <label className="block text-sm font-medium text-navy-700">Registering for</label>
        <div className="grid sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setBookingTarget('self')}
            className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${bookingTarget === 'self' ? 'bg-cyan-50 text-cyan-700 border-cyan-300' : 'bg-white text-navy-600 border-navy-200 hover:bg-navy-50'}`}
          >
            Myself
          </button>
          <button
            type="button"
            onClick={() => setBookingTarget('other')}
            className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${bookingTarget === 'other' ? 'bg-cyan-50 text-cyan-700 border-cyan-300' : 'bg-white text-navy-600 border-navy-200 hover:bg-navy-50'}`}
          >
            Someone else
          </button>
        </div>
        {bookingTarget === 'other' && (
          <div className="space-y-2 pt-1">
            <div>
              <label className="block text-xs font-medium text-navy-600 mb-1">Their full name</label>
              <input
                type="text"
                value={attendeeName}
                onChange={(e) => setAttendeeName(e.target.value)}
                placeholder="e.g. child or guest name"
                className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy-600 mb-1">Relationship <span className="text-navy-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={attendeeRelation}
                onChange={(e) => setAttendeeRelation(e.target.value)}
                placeholder="e.g. child, spouse"
                className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <p className="text-[11px] text-navy-400">
              You stay the account holder; Zoom join still uses your signed-in profile.
            </p>
          </div>
        )}
      </div>

      {!event.is_free && (
        <div className="mb-4 space-y-2">
          <label className="block text-sm font-medium text-navy-700">Discount code</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="Enter a code"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 uppercase focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder:normal-case placeholder:text-navy-400"
            />
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={applyCouponPreview}
                disabled={couponBusy || !normalizeCouponCodeInput(couponInput)}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-medium bg-navy-800 text-white hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {couponBusy ? 'Checking…' : 'Apply'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCouponInput('');
                  setAppliedCouponMeta(null);
                  setCouponFieldError('');
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-navy-200 text-navy-700 hover:bg-navy-50 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          {couponPreviewOk && showDiscountBreakdown && (
            <p className="text-xs text-emerald-700 font-medium">
              Coupon applied · you save ZMW {getNumericAmount(appliedCouponMeta.preview.discount_zmw).toFixed(2)}
            </p>
          )}
          {couponFieldError && (
            <p className="text-xs text-red-600">{couponFieldError}</p>
          )}
        </div>
      )}

      {/* Price */}
      <div className="py-3 border-t border-navy-100 space-y-2 text-sm mb-4">
        {event.is_free ? (
          <div className="flex items-center justify-between">
            <span className="text-navy-600">Registration fee</span>
            <span className={`font-semibold ${event.is_free ? 'text-green-600' : 'text-navy-900'}`}>
              {formatEventPrice(event)}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-navy-600">{showDiscountBreakdown ? 'List price' : 'Registration fee'}</span>
              <span className={`font-semibold text-right ${showDiscountBreakdown ? 'line-through text-navy-400 tabular-nums' : 'text-navy-900 tabular-nums'}`}>
                {displayPrice.zmw}
              </span>
            </div>
            {showDiscountBreakdown && (
              <>
                <div className="flex items-center justify-between gap-4 text-emerald-700">
                  <span>Discount ({couponLiveNorm})</span>
                  <span className="font-semibold tabular-nums">
                    -ZMW {getNumericAmount(appliedCouponMeta.preview.discount_zmw).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 pt-1 border-t border-navy-100">
                  <span className="text-navy-800 font-medium">You pay</span>
                  <span className={`font-semibold tabular-nums ${effectiveZmwDisplay <= 0.005 ? 'text-green-600' : 'text-navy-900'}`}>
                    {effectiveZmwDisplay <= 0.005 ? 'Free' : displayPriceEffective.zmw}
                  </span>
                </div>
              </>
            )}
            {!showDiscountBreakdown && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-navy-600">Due now</span>
                <span className="font-semibold text-navy-900 tabular-nums">{displayPriceEffective.zmw}</span>
              </div>
            )}
          </>
        )}
      </div>

      {!event.is_free && !isZambia && (
        <div className="-mt-2 mb-4 space-y-1">
          <p className="text-xs text-navy-500">
            Checkout (ZMW): <span className="font-medium">{displayPriceEffective.zmw}</span>
            {!showDiscountBreakdown && (
              <span className="text-navy-400">{' '}(list {displayPrice.zmw})</span>
            )}
          </p>
          <p className="text-[11px] text-navy-400">
            FX: <span className="font-medium text-navy-500">{fxRateLabel}</span>
            {' '}• updated {formatRelativeTime(rateLastFetched)}
          </p>
        </div>
      )}

      {!event.is_free && (
        <div className="mb-4 space-y-3">
          <label className="block text-sm font-medium text-navy-700">Checkout method</label>
          
          {/* Show both options for Zambian users, only card for others */}
          {isZambia ? (
            <div className="grid sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('mobile_money')}
                className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${paymentMethod === 'mobile_money' ? 'bg-cyan-50 text-cyan-700 border-cyan-300' : 'bg-white text-navy-600 border-navy-200 hover:bg-navy-50'}`}
              >
                Mobile Money (Direct)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${paymentMethod === 'card' ? 'bg-cyan-50 text-cyan-700 border-cyan-300' : 'bg-white text-navy-600 border-navy-200 hover:bg-navy-50'}`}
              >
                Card Checkout
              </button>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-xl border text-sm font-medium bg-cyan-50 text-cyan-700 border-cyan-300">
              Card Checkout
              <span className="ml-2 text-xs text-navy-400 font-normal">
                (Available for your region)
              </span>
            </div>
          )}

          {paymentMethod === 'mobile_money' && isZambia && (
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1.5">Mobile Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 09777"
                className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-navy-400">
                  We’ll send an approval prompt to this number.
                  {profilePhone ? ' (Prefilled from your profile.)' : ''}
                </p>
                {phone.trim() && (
                  <p className={`text-xs font-medium ${detectedProvider ? 'text-emerald-700' : 'text-amber-600'}`}>
                    {detectedProvider ? `Detected: ${detectedProvider.name}` : 'Detecting network…'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optional notes */}
      <div>
        <label className="block text-sm font-medium text-navy-700 mb-1.5">
          Additional notes <span className="text-navy-400 font-normal">(optional)</span>
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any special requirements or messages…"
          className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50 text-sm text-navy-900 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
      </div>

      {/* Error from booking attempt */}
      {result?.error && (
        <div className="flex items-start gap-2 mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {result.error}
        </div>
      )}
    </Modal>
  );
}
