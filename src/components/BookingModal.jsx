/**
 * Event registration flow — booking / subscription for events.
 * Renders as a modal or full page depending on `layout`.
 */
import { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Calendar, MapPin, Ticket, ShoppingBag, X } from 'lucide-react';
import RegistrationShell from './RegistrationShell';
import EventMerchUpsellModal from './EventMerchUpsellModal';
import TicketDocument from '../../shared/TicketDocument.jsx';
import { buildTicketViewModel } from '../../shared/ticketViewModel.js';
import receiptLogo from '../../Logo-Website-Mutale-08.png';
import { RECEIPT_LIGHT_FILL } from '../../shared/receiptTheme.js';
import { useBooking } from '../context/BookingContext';
import { useUserAuth } from '../context/UserAuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import {
  allowsMultiAttendeeRegistration,
  checkEventAvailability,
  computeRegistrationTicketCount,
  deriveGuestAttendeeSlotKey,
  getMaxGuestTickets,
  getRegistrationAttendeeSlotKey,
  isOnlineEvent,
  normalizeAttendeeType,
  validateGuestAttendees,
} from '../utils/eventServices';
import { formatDate, formatTime } from '../utils/helpers';
import { getApiBase, getAppOrigin } from '../utils/apiBase';
import { getSessionAuthHeaders } from '../utils/authHeaders';
import { runLencoCardWidget } from '../utils/lencoCardPayment';

const API_BASE = getApiBase();

function SuccessTicketPreview({ registration, event }) {
  const [viewModel, setViewModel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    buildTicketViewModel({
      registration,
      event: event || {},
      appOrigin: getAppOrigin(),
      logoDataUrl: receiptLogo,
    }).then((vm) => {
      if (!cancelled) setViewModel(vm);
    }).catch(() => {
      if (!cancelled) setViewModel(null);
    });
    return () => { cancelled = true; };
  }, [registration, event]);

  if (!viewModel) {
    return (
      <div className="rounded-xl border border-navy-100 bg-white p-6 text-center text-sm text-navy-500">
        Loading ticket…
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-navy-100">
      <TicketDocument viewModel={viewModel} outerPadding={false} />
    </div>
  );
}

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

function createEmptyGuest() {
  return {
    key: `guest-${Math.random().toString(36).slice(2, 9)}`,
    name: '',
    email: '',
    phone: '',
    attendee_type: 'adult',
    relation: '',
    lookupHint: '',
  };
}

function resizeGuestList(current = [], nextCount = 0) {
  const count = Math.max(0, Math.floor(Number(nextCount) || 0));
  if (count === current.length) return current;
  if (count < current.length) return current.slice(0, count);
  const next = [...current];
  while (next.length < count) next.push(createEmptyGuest());
  return next;
}

async function lookupGuestEmail(email, apiBase, headers) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized.includes('@')) return null;
  try {
    const res = await fetch(`${apiBase}/users/lookup?email=${encodeURIComponent(normalized)}`, { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok || !json?.data?.found) return null;
    return String(json.data.name || '').trim() || null;
  } catch {
    return null;
  }
}

export default function EventRegistrationFlow({
  event,
  isOpen = true,
  onClose,
  layout = 'modal',
  backHref = '',
}) {
  const isPage = layout === 'page';
  const isActive = isPage || isOpen;
  const { currentUser } = useUserAuth();
  const { registerForEvent, registerForEventBatch, updateRegistration, getEventRegistrationCount, registrations } = useBooking();
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
  const selfRegistration = event && currentUser?.id
    ? registrations.find(
      (r) => r.user_id === currentUser.id
        && r.event_id === event.id
        && r.registration_type === regType
        && r.status !== 'cancelled'
        && getRegistrationAttendeeSlotKey(r) === '__self__',
    )
    : null;
  // Default to card for non-Zambian users, mobile_money for Zambian users
  const [paymentMethod, setPaymentMethod] = useState(() => isZambia ? 'mobile_money' : 'card');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [includeSelf, setIncludeSelf] = useState(true);
  const [guestAttendees, setGuestAttendees] = useState([]);
  const [result, setResult] = useState(null); // { success, registration, registrations, error }
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
  const [registrationStep, setRegistrationStep] = useState('details');

  const isOnline = isOnlineEvent(event);
  const allowsMultiAttendee = allowsMultiAttendeeRegistration(event);
  const guestCount = guestAttendees.length;
  const ticketCount = allowsMultiAttendee
    ? computeRegistrationTicketCount({ includeSelf, guestCount })
    : 1;
  const maxGuestTickets = allowsMultiAttendee
    ? getMaxGuestTickets(event, regCount, { includeSelf, hardCap: 20 })
    : 0;
  const couponLiveNorm = normalizeCouponCodeInput(couponInput);
  const couponPreviewOk = Boolean(appliedCouponMeta && appliedCouponMeta.codeNorm === couponLiveNorm);
  const unitZmwDisplay = couponPreviewOk
    ? getNumericAmount(appliedCouponMeta.preview.unit_final_zmw ?? appliedCouponMeta.preview.final_zmw)
    : getNumericAmount(event?.price);
  const totalZmwDisplay = couponPreviewOk
    ? getNumericAmount(appliedCouponMeta.preview.total_final_zmw ?? (unitZmwDisplay * ticketCount))
    : unitZmwDisplay * ticketCount;
  const effectiveZmwDisplay = unitZmwDisplay;
  const isFullyWaived = !event?.is_free && totalZmwDisplay <= 0.005 && couponPreviewOk;
  const needsPaymentStage = Boolean(
    event && !isOnline && !event.is_free && !isFullyWaived,
  );
  const onPaymentStep = needsPaymentStage && registrationStep === 'payment';

  // Update payment method when geo detection completes
  useEffect(() => {
    if (!geoLoading) {
      setPaymentMethod(isZambia ? 'mobile_money' : 'card');
    }
  }, [geoLoading, isZambia]);

  // Auto-fill mobile payment number from user profile when booking opens.
  useEffect(() => {
    if (!isActive) {
      // Cancel any in-progress payment polling when flow is closed
      pollCancelledRef.current = true;
      return;
    }
    if (paymentMethod !== 'mobile_money' || !isZambia) return;
    if (phone.trim()) return;
    if (!profilePhone) return;
    setPhone(profilePhone);
  }, [isActive, paymentMethod, isZambia, phone, profilePhone]);

  useEffect(() => {
    if (!isActive) return;
    setCouponInput('');
    setAppliedCouponMeta(null);
    setCouponFieldError('');
    setRegistrationStep('details');
    setIncludeSelf(!selfRegistration);
    setGuestAttendees([]);
  }, [isActive, event?.id, selfRegistration]);

  useEffect(() => {
    if (!allowsMultiAttendee) return;
    setGuestAttendees((prev) => (prev.length > maxGuestTickets ? prev.slice(0, maxGuestTickets) : prev));
  }, [maxGuestTickets, allowsMultiAttendee]);

  // Prefetch event-attached merch when the registration succeeds with a paid status,
  // so we can offer the post-payment upsell modal.
  useEffect(() => {
    if (!isActive) return;
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
  }, [isActive, result, merchPrefetched, event?.id]);

  useEffect(() => {
    if (!isActive || !event?.id || event.is_free) return;
    const volEnabled = Boolean(event.volume_discount_enabled);
    const minQty = Number(event.volume_discount_min_qty) || 5;
    const hasCoupon = Boolean(normalizeCouponCodeInput(couponInput));
    if (!hasCoupon && !(volEnabled && ticketCount >= minQty)) {
      if (!hasCoupon) setAppliedCouponMeta(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/events/${encodeURIComponent(event.id)}/coupon-preview`, {
          method: 'POST',
          headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            coupon_code: couponInput.trim(),
            quantity: Math.max(1, ticketCount),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json?.ok && json?.data) {
          const codeNorm = normalizeCouponCodeInput(couponInput);
          setAppliedCouponMeta({ codeNorm, preview: json.data });
        }
      } catch {
        //
      }
    })();
    return () => { cancelled = true; };
  }, [isActive, event?.id, event?.is_free, event?.volume_discount_enabled, event?.volume_discount_min_qty, ticketCount, couponInput]);

  const shellProps = (overrides = {}) => ({
    layout,
    isOpen,
    onClose: handleClose,
    backHref,
    backLabel: 'Back to event',
    ...overrides,
  });

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
        body: JSON.stringify({
          coupon_code: couponInput.trim(),
          quantity: Math.max(1, ticketCount),
        }),
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
  const spotsLeft = event.capacity ? Math.max(0, event.capacity - regCount) : null;

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

  const validateRegistrationDetails = () => {
    if (!baseAvailability.canBook) {
      return baseAvailability.reason || 'This event is not available for registration.';
    }

    if (allowsMultiAttendee) {
      if (ticketCount < 1) {
        return 'Select at least one ticket (yourself and/or guests).';
      }

      if (includeSelf && selfRegistration) {
        return 'You are already registered for this event. Uncheck “Register myself” or register guests only.';
      }

      if (includeSelf) {
        const selfAvailability = checkEventAvailability(event, registrations, currentUser?.id, regType, {
          attendeeSlotKey: '__self__',
        });
        if (!selfAvailability.canBook) return selfAvailability.reason;
      }

      const guestValidation = validateGuestAttendees(guestAttendees);
      if (!guestValidation.ok) return guestValidation.error;

      for (let i = 0; i < guestAttendees.length; i += 1) {
        const guest = guestAttendees[i];
        const slotKey = deriveGuestAttendeeSlotKey(guest.name, i);
        const slotAvailability = checkEventAvailability(event, registrations, currentUser?.id, regType, {
          attendeeSlotKey: slotKey,
        });
        if (!slotAvailability.canBook) {
          return slotAvailability.reason || `Guest ${i + 1} could not be registered.`;
        }
      }

      if (event.capacity && spotsLeft !== null && ticketCount > spotsLeft) {
        return `Only ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} remaining for this event.`;
      }
    }

    const liveNorm = normalizeCouponCodeInput(couponInput);
    const previewOk = Boolean(appliedCouponMeta && appliedCouponMeta.codeNorm === liveNorm);

    if (!event.is_free && liveNorm && !previewOk) {
      return 'Press “Apply coupon” to validate this code, or clear the coupon field.';
    }

    return null;
  };

  const buildBatchPayload = () => ({
    includeSelf: allowsMultiAttendee ? includeSelf : false,
    attendees: allowsMultiAttendee
      ? guestAttendees.map((guest) => ({
        name: guest.name.trim(),
        email: guest.email.trim(),
        phone: guest.phone.trim(),
        attendee_type: normalizeAttendeeType(guest.attendee_type),
        relation: String(guest.relation || '').trim(),
      }))
      : [],
  });

  const submitBatchRegistration = async ({
    paymentReference = '',
    paymentMethod: method = 'free',
    paymentStatus = 'not_required',
    registrationStatus = 'confirmed',
    couponCode = '',
    paymentAmount = null,
    paymentCurrency = 'ZMW',
    paymentAmountZmw = null,
  } = {}) => {
    const batchPayload = buildBatchPayload();
    return registerForEventBatch({
      user: currentUser,
      event,
      registrationType: regType,
      notes,
      includeSelf: batchPayload.includeSelf,
      attendees: batchPayload.attendees,
      paymentReference,
      paymentMethod: method,
      paymentStatus,
      registrationStatus,
      couponCode,
      paymentAmount,
      paymentCurrency,
      paymentAmountZmw,
    });
  };

  const handleContinueToPayment = () => {
    setResult(null);
    const validationError = validateRegistrationDetails();
    if (validationError) {
      setResult({ success: false, error: validationError });
      return;
    }
    setRegistrationStep('payment');
  };

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);

    const validationError = validateRegistrationDetails();
    if (validationError) {
      setResult({ success: false, error: validationError });
      setLoading(false);
      return;
    }

    const liveNorm = normalizeCouponCodeInput(couponInput);
    const previewOk = Boolean(appliedCouponMeta && appliedCouponMeta.codeNorm === liveNorm);
    const couponForRegistration = previewOk ? liveNorm : '';
    const unitZmw = previewOk ? unitZmwDisplay : getNumericAmount(event.price);
    const orderTotalZmw = previewOk ? totalZmwDisplay : unitZmw * ticketCount;

    const finalizeBatchResult = (batchResult) => {
      if (!batchResult?.success) return batchResult;
      const created = batchResult.registrations || [];
      return {
        ...batchResult,
        registration: created[0] || batchResult.registration || null,
        registrations: created,
        ticketCount: batchResult.ticketCount || created.length,
      };
    };

    try {
      await new Promise((r) => setTimeout(r, 250));

      if (event.is_free || (orderTotalZmw <= 0.005 && previewOk)) {
        if (allowsMultiAttendee) {
          setResult(finalizeBatchResult(await submitBatchRegistration({
            paymentMethod: 'free',
            couponCode: couponForRegistration,
          })));
        } else {
          setResult(await registerForEvent({
            user: currentUser,
            event,
            registrationType: regType,
            notes,
            paymentStatus: 'not_required',
            registrationStatus: 'confirmed',
            paymentMethod: 'free',
            couponCode: couponForRegistration,
          }));
        }
        return;
      }

      const checkoutCurrency = paymentMethod === 'card' && !isZambia ? 'USD' : 'ZMW';
      const checkoutAmount = checkoutCurrency === 'USD'
        ? convertFromZMW(orderTotalZmw, 'USD')
        : orderTotalZmw;
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
            amount: orderTotalZmw,
            currency: 'ZMW',
            phone,
            eventId: event.id,
            eventTitle: event.title,
            customerName,
            customerEmail,
            coupon_code: couponForRegistration,
            quantity: ticketCount,
          }),
        });

        const mobileJson = await mobileRes.json().catch(() => ({}));
        if (!mobileRes.ok || !mobileJson?.ok) {
          throw new Error(mobileJson?.message || 'Failed to initiate mobile money checkout.');
        }

        const reference = mobileJson?.data?.reference || '';

        if (allowsMultiAttendee) {
          const batchPending = finalizeBatchResult(await submitBatchRegistration({
            paymentReference: reference,
            paymentMethod: 'mobile_money',
            paymentStatus: 'pending',
            registrationStatus: 'pending',
            couponCode: couponForRegistration,
            paymentAmount: orderTotalZmw,
            paymentCurrency: 'ZMW',
            paymentAmountZmw: unitZmw,
          }));
          if (!batchPending?.success) {
            throw new Error(batchPending?.error || 'Failed to create pending registrations.');
          }

          setPaymentJourney({
            step: 'prompt_sent',
            title: 'Payment prompt sent',
            subtitle: 'Approve the request on your phone. We’ll keep checking automatically every 5 seconds.',
            attempt: 0,
            reference,
          });

          const pollResult = await pollMobilePaymentStatus(reference);

          if (pollResult.success) {
            const updatedRows = await Promise.all(
              (batchPending.registrations || []).map((row) => updateRegistration(row.id, {
                payment_status: 'paid',
                status: 'confirmed',
              }) || Promise.resolve({ ...row, payment_status: 'paid', status: 'confirmed' })),
            );

            setPaymentJourney({
              step: 'confirmed',
              title: 'Payment confirmed',
              subtitle: 'Great news — your payment is confirmed and your registrations are active.',
              attempt: 0,
              reference,
            });

            setResult({
              success: true,
              registrations: updatedRows.filter(Boolean),
              registration: updatedRows[0] || batchPending.registration,
              ticketCount: batchPending.ticketCount,
            });
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

          setPaymentJourney({
            step: 'processing_delay',
            title: 'Still processing your confirmation',
            subtitle: 'No worries — this can take a bit longer. Your registrations are saved as pending.',
            attempt: 0,
            reference,
          });

          setResult({
            success: true,
            ...batchPending,
            registrations: (batchPending.registrations || []).map((row) => ({
              ...row,
              payment_status: 'pending',
              status: 'pending',
            })),
          });
          return;
        }

        const reg = await registerForEvent({
          user: currentUser,
          event,
          registrationType: regType,
          notes,
          amount: orderTotalZmw,
          paymentAmount: orderTotalZmw,
          paymentCurrency: 'ZMW',
          paymentAmountZmw: unitZmw,
          paymentStatus: 'pending',
          registrationStatus: 'pending',
          paymentMethod: 'mobile_money',
          paymentReference: reference,
          referenceCode: reference || undefined,
          couponCode: couponForRegistration,
        });

        if (!reg?.success) {
          throw new Error(reg?.error || 'Failed to create pending registration.');
        }

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
        quantity: ticketCount,
      };
      if (checkoutCurrency !== 'ZMW') {
        cardPayload.billingAmountZmw = orderTotalZmw;
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

      if (allowsMultiAttendee) {
        setResult(finalizeBatchResult(await submitBatchRegistration({
          paymentReference: lencoReference,
          paymentMethod: 'card',
          paymentStatus: paid ? 'paid' : 'pending',
          registrationStatus: paid ? 'confirmed' : 'pending',
          couponCode: couponForRegistration,
          paymentAmount: checkoutAmount,
          paymentCurrency: checkoutCurrency,
          paymentAmountZmw: unitZmw,
        })));
        return;
      }

      setResult(await registerForEvent({
        user: currentUser,
        event,
        registrationType: regType,
        notes,
        amount: checkoutAmount,
        paymentAmount: checkoutAmount,
        paymentCurrency: checkoutCurrency,
        paymentAmountZmw: unitZmw,
        paymentStatus: paid ? 'paid' : 'pending',
        registrationStatus: paid ? 'confirmed' : 'pending',
        paymentMethod: 'card',
        paymentReference: lencoReference,
        referenceCode: lencoReference,
        couponCode: couponForRegistration,
      }));
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
    setIncludeSelf(true);
    setGuestAttendees([]);
    setPaymentMethod(isZambia ? 'mobile_money' : 'card');
    setPaymentJourney(null);
    setCouponInput('');
    setAppliedCouponMeta(null);
    setCouponFieldError('');
    setRegistrationStep('details');
    onClose();
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (result?.success) {
    const reg = result.registration;
    const batchRegs = Array.isArray(result.registrations) ? result.registrations : (reg ? [reg] : []);
    const paidSuccess = batchRegs.some((row) => isLencoSuccessStatus(row?.payment_status));
    const hasMerch = paidSuccess && merchPrefetched && merchProducts.length > 0;
    const ticketSummaryCount = result.ticketCount || batchRegs.length || 1;
    return (
      <>
        <RegistrationShell
          {...shellProps({
            size: isPage ? 'xl' : 'sm',
            isOpen: isActive && !showMerchUpsell,
            title: isPage ? 'Registration confirmed' : undefined,
          })}
        >
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-50 text-green-600 mb-4">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-navy-900 mb-1">You&rsquo;re registered!</h2>
            <p className="text-sm text-navy-500 mb-5">
              {batchRegs.some((row) => row?.payment_status === 'pending')
                ? 'Your registration is created and payment is pending confirmation.'
                : ticketSummaryCount > 1
                  ? `${ticketSummaryCount} tickets have been confirmed.`
                  : 'Your registration has been confirmed.'}
            </p>

            <div className="bg-navy-50 rounded-xl p-4 text-left space-y-2 mb-6 max-h-64 overflow-y-auto">
              {batchRegs.map((row) => (
                <div key={row.id || row.reference_code} className="border-b border-navy-100 last:border-0 pb-2 last:pb-0 mb-2 last:mb-0">
                  <div className="flex justify-between text-sm gap-3">
                    <span className="text-navy-500">Reference</span>
                    <span className="font-mono font-semibold text-navy-900">{row.reference_code}</span>
                  </div>
                  <div className="flex justify-between text-sm gap-3">
                    <span className="text-navy-500">Ticket for</span>
                    <span className="font-medium text-navy-800 text-right">
                      {String(row.booked_for_name || '').trim() || 'You'}
                    </span>
                  </div>
                  {String(row.booked_for_email || '').trim() && (
                    <div className="flex justify-between text-sm gap-3">
                      <span className="text-navy-500">Email</span>
                      <span className="text-navy-700 text-right">{row.booked_for_email}</span>
                    </div>
                  )}
                </div>
              ))}
              {reg && (
                <>
                  <div className="flex justify-between text-sm pt-1 border-t border-navy-100">
                    <span className="text-navy-500">Event</span>
                    <span className="font-medium text-navy-800 text-right max-w-[200px]">{reg.event_title}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-navy-500">Payment</span>
                    <span className="font-medium text-navy-700 capitalize">{String(reg.payment_status || '').replace('_', ' ')}</span>
                  </div>
                </>
              )}
            </div>

            {allowsMultiAttendee && batchRegs.length > 0 && (
              <div className="mb-6 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-400 mb-3 text-center">
                  Your entry ticket{batchRegs.length > 1 ? 's' : ''}
                </p>
                <div
                  className={`grid gap-4 max-h-[420px] overflow-y-auto p-3 rounded-xl ${batchRegs.length > 1 ? 'grid-cols-1' : 'grid-cols-1'}`}
                  style={{ backgroundColor: RECEIPT_LIGHT_FILL }}
                >
                  {batchRegs.map((row) => (
                    <SuccessTicketPreview
                      key={row.id || row.reference_code}
                      registration={row}
                      event={event}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-navy-500 mt-3 text-center">
                  Show the QR code at the gate for entry. Ticket emails were sent when payment is confirmed.
                </p>
              </div>
            )}

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
        </RegistrationShell>

        <EventMerchUpsellModal
          isOpen={isActive && showMerchUpsell}
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
      <RegistrationShell {...shellProps({ size: 'sm', title: 'Processing Payment' })}>
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
      </RegistrationShell>
    );
  }

  // ── Booking form ──────────────────────────────────────────────────────────
  const displayPrice = getPriceBoth(event.price, event.is_free);
  const fxRateLabel = exchangeRate
    ? `1 ZMW ≈ $${Number(exchangeRate).toFixed(4)}`
    : 'Using fallback FX rate';

  const showDiscountBreakdown = Boolean(
    couponPreviewOk && (
      getNumericAmount(appliedCouponMeta.preview.discount_zmw) > 0.005
      || getNumericAmount(appliedCouponMeta.preview.volume_discount_zmw) > 0.005
      || getNumericAmount(appliedCouponMeta.preview.total_discount_zmw) > 0.005
    ),
  );
  const volumeDiscountEach = couponPreviewOk
    ? getNumericAmount(appliedCouponMeta.preview.volume_discount_zmw)
    : 0;
  const couponDiscountEach = couponPreviewOk
    ? getNumericAmount(appliedCouponMeta.preview.coupon_discount_zmw ?? appliedCouponMeta.preview.discount_zmw)
    : 0;
  const displayPriceTotal = getPriceBoth(totalZmwDisplay, Boolean(!event.is_free && totalZmwDisplay <= 0.005));
  const displayPriceUnit = getPriceBoth(unitZmwDisplay, Boolean(!event.is_free && unitZmwDisplay <= 0.005));
  const guestValidation = allowsMultiAttendee ? validateGuestAttendees(guestAttendees) : { ok: true };
  const canSubmitTickets = !allowsMultiAttendee || (ticketCount >= 1 && guestValidation.ok);
  const confirmLabel = event.is_free || isFullyWaived
    ? 'Confirm Registration'
    : (needsPaymentStage && !onPaymentStep ? 'Continue to Payment' : 'Proceed to Payment');
  const primaryAction = needsPaymentStage && !onPaymentStep ? handleContinueToPayment : handleSubmit;

  return (
    <RegistrationShell
      {...shellProps({
        title: onPaymentStep ? 'Complete Payment' : 'Register for Event',
        size: isPage ? 'xl' : 'md',
        footer: (
          <>
            {onPaymentStep ? (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setRegistrationStep('details');
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-100 transition-colors"
              >
                Back
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-100 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={primaryAction}
              disabled={
                loading
                || !baseAvailability.canBook
                || !canSubmitTickets
              }
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-2"
            >
              {loading && <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {confirmLabel}
            </button>
          </>
        ),
      })}
    >
      {/* Event summary */}
      <div className="bg-navy-50 rounded-xl p-4 mb-5 flex gap-4 items-start">
        <div className="flex-1 min-w-0">
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
        {event.cover_image ? (
          <img
            src={event.cover_image}
            alt=""
            className={`shrink-0 rounded-xl object-cover border border-navy-100 bg-white shadow-sm ${
              isPage ? 'w-24 h-24 sm:w-32 sm:h-32' : 'w-20 h-20'
            }`}
          />
        ) : null}
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

      {allowsMultiAttendee && !onPaymentStep && (
        <div className="mb-4 space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-navy-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSelf}
              disabled={Boolean(selfRegistration)}
              onChange={(e) => setIncludeSelf(e.target.checked)}
              className="rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
            />
            Register myself
            {selfRegistration && (
              <span className="text-xs font-normal text-navy-400">(already registered)</span>
            )}
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-navy-700">Additional attendees</label>
              <div className="inline-flex items-center rounded-xl border border-navy-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGuestAttendees((prev) => resizeGuestList(prev, prev.length - 1))}
                  disabled={guestAttendees.length <= 0}
                  className="px-3 py-1.5 text-sm text-navy-600 hover:bg-navy-50 disabled:opacity-40"
                >
                  −
                </button>
                <span className="px-3 py-1.5 text-sm font-medium text-navy-800 min-w-[2rem] text-center">{guestAttendees.length}</span>
                <button
                  type="button"
                  onClick={() => setGuestAttendees((prev) => resizeGuestList(prev, prev.length + 1))}
                  disabled={guestAttendees.length >= maxGuestTickets}
                  className="px-3 py-1.5 text-sm text-navy-600 hover:bg-navy-50 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
            <p className="text-[11px] text-navy-400">
              {ticketCount} ticket{ticketCount === 1 ? '' : 's'} selected
              {maxGuestTickets < 20 && guestAttendees.length >= maxGuestTickets ? ' · guest limit reached' : ''}
            </p>
          </div>

          {guestAttendees.length > 0 && (
            <div className={isPage ? 'grid lg:grid-cols-2 gap-3' : 'space-y-3'}>
              {guestAttendees.map((guest, index) => (
                <div key={guest.key} className="rounded-xl border border-navy-100 bg-navy-50/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-navy-600">Attendee {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => setGuestAttendees((prev) => prev.filter((_, i) => i !== index))}
                      className="p-1.5 rounded-lg text-navy-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label={`Remove guest ${index + 1}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-navy-600 mb-1">Attendee type</label>
                      <select
                        value={guest.attendee_type || 'adult'}
                        onChange={(e) => setGuestAttendees((prev) => prev.map((row, i) => (
                          i === index ? { ...row, attendee_type: e.target.value } : row
                        )))}
                        className="w-full px-3 py-2.5 rounded-xl border border-navy-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="adult">Adult</option>
                        <option value="child">Child</option>
                      </select>
                    </div>
                    {normalizeAttendeeType(guest.attendee_type) === 'child' && (
                      <div>
                        <label className="block text-xs font-medium text-navy-600 mb-1">Your relationship <span className="text-red-500">*</span></label>
                        <select
                          value={guest.relation || ''}
                          onChange={(e) => setGuestAttendees((prev) => prev.map((row, i) => (
                            i === index ? { ...row, relation: e.target.value } : row
                          )))}
                          className="w-full px-3 py-2.5 rounded-xl border border-navy-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          <option value="">Select…</option>
                          <option value="parent">Parent</option>
                          <option value="guardian">Guardian</option>
                          <option value="teacher">Teacher</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-navy-600 mb-1">Full name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={guest.name}
                      onChange={(e) => setGuestAttendees((prev) => prev.map((row, i) => (
                        i === index ? { ...row, name: e.target.value } : row
                      )))}
                      placeholder={normalizeAttendeeType(guest.attendee_type) === 'child' ? 'Child full name' : 'Attendee full name'}
                      className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-navy-600 mb-1">
                        Email
                        {normalizeAttendeeType(guest.attendee_type) === 'child' ? (
                          <span className="text-navy-400 font-normal"> (not required for children)</span>
                        ) : (
                          <span className="text-navy-400 font-normal"> (optional)</span>
                        )}
                      </label>
                      <input
                        type="email"
                        value={guest.email}
                        onChange={(e) => setGuestAttendees((prev) => prev.map((row, i) => (
                          i === index ? { ...row, email: e.target.value, lookupHint: '' } : row
                        )))}
                        onBlur={async () => {
                          const name = await lookupGuestEmail(
                            guest.email,
                            API_BASE,
                            getSessionAuthHeaders(),
                          );
                          if (!name) return;
                          setGuestAttendees((prev) => prev.map((row, i) => (
                            i === index
                              ? {
                                ...row,
                                name: row.name.trim() ? row.name : name,
                                lookupHint: 'Existing member',
                              }
                              : row
                          )));
                        }}
                        placeholder="guest@email.com"
                        className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                      {guest.lookupHint && (
                        <p className="text-[11px] text-cyan-700 mt-1">{guest.lookupHint}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-navy-600 mb-1">
                        {normalizeAttendeeType(guest.attendee_type) === 'child' ? 'Guardian phone' : 'Phone'}
                        <span className="text-navy-400 font-normal"> (optional)</span>
                      </label>
                      <input
                        type="tel"
                        value={guest.phone}
                        onChange={(e) => setGuestAttendees((prev) => prev.map((row, i) => (
                          i === index ? { ...row, phone: e.target.value } : row
                        )))}
                        placeholder="e.g. 0977..."
                        className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  {normalizeAttendeeType(guest.attendee_type) === 'child' && (
                    <p className="text-[11px] text-navy-500">
                      Tickets and certificates for children are sent to your account email.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!event.is_free && !onPaymentStep && (
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
            {allowsMultiAttendee && ticketCount > 1 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-navy-600">Tickets</span>
                <span className="font-medium text-navy-800 tabular-nums">{ticketCount} × {displayPriceUnit.zmw}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="text-navy-600">{showDiscountBreakdown ? 'List price (each)' : 'Registration fee (each)'}</span>
              <span className={`font-semibold text-right ${showDiscountBreakdown ? 'line-through text-navy-400 tabular-nums' : 'text-navy-900 tabular-nums'}`}>
                {displayPrice.zmw}
              </span>
            </div>
            {showDiscountBreakdown && (
              <>
                {volumeDiscountEach > 0.005 && (
                  <div className="flex items-center justify-between gap-4 text-emerald-700">
                    <span>Group discount{ticketCount > 1 ? ' (each)' : ''}</span>
                    <span className="font-semibold tabular-nums">-ZMW {volumeDiscountEach.toFixed(2)}</span>
                  </div>
                )}
                {couponDiscountEach > 0.005 && couponLiveNorm && (
                  <div className="flex items-center justify-between gap-4 text-emerald-700">
                    <span>Coupon ({couponLiveNorm}){ticketCount > 1 ? ' (each)' : ''}</span>
                    <span className="font-semibold tabular-nums">-ZMW {couponDiscountEach.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4 pt-1 border-t border-navy-100">
                  <span className="text-navy-800 font-medium">You pay</span>
                  <span className={`font-semibold tabular-nums ${totalZmwDisplay <= 0.005 ? 'text-green-600' : 'text-navy-900'}`}>
                    {totalZmwDisplay <= 0.005 ? 'Free' : displayPriceTotal.zmw}
                  </span>
                </div>
              </>
            )}
            {!showDiscountBreakdown && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-navy-600">Due now</span>
                <span className="font-semibold text-navy-900 tabular-nums">{displayPriceTotal.zmw}</span>
              </div>
            )}
          </>
        )}
      </div>

      {!event.is_free && (onPaymentStep || isOnline || !needsPaymentStage) && !isZambia && (
        <div className="-mt-2 mb-4 space-y-1">
          <p className="text-xs text-navy-500">
            Checkout (ZMW): <span className="font-medium">{displayPriceTotal.zmw}</span>
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

      {!event.is_free && (onPaymentStep || isOnline || !needsPaymentStage) && (
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

      {onPaymentStep && allowsMultiAttendee && ticketCount > 0 && (
        <div className="mb-4 rounded-xl border border-navy-100 bg-navy-50 px-4 py-3 text-sm space-y-1">
          <p className="text-navy-500">Order summary</p>
          <p className="font-medium text-navy-900">{ticketCount} ticket{ticketCount === 1 ? '' : 's'} · {displayPriceTotal.zmw}</p>
          {includeSelf && !selfRegistration && <p className="text-navy-700">Includes your ticket</p>}
          {guestAttendees.filter((g) => g.name.trim()).map((guest, index) => (
            <p key={guest.key} className="text-navy-700">
              Guest {index + 1}: {guest.name.trim()}
            </p>
          ))}
        </div>
      )}

      {/* Optional notes */}
      {!onPaymentStep && (
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
      )}

      {/* Error from booking attempt */}
      {result?.error && (
        <div className="flex items-start gap-2 mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {result.error}
        </div>
      )}
    </RegistrationShell>
  );
}
