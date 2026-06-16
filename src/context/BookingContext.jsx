/**
 * BookingContext — event registration / booking system.
 * Source of truth: backend `/api/registrations`.
 * LocalStorage (`mm_event_registrations`) is used as a cache/fallback only.
 *
 * Registration model:
 *   id, user_id, event_id, reference_code, registration_type,
 *   status, amount, payment_status, notes, registered_at
 *
 * Business rules enforced here (service layer):
 *   - must be authenticated
 *   - no duplicate (user_id + event_id + registration_type + attendee_slot; __self__ when booking for you)
 *   - event must be published + not cancelled/closed
 *   - deadline must not have passed
 *   - capacity must not be exceeded
 */
import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { checkEventAvailability, deriveAttendeeSlotKey } from '../utils/eventServices';
import { getApiBase } from '../utils/apiBase';
import { getSessionAuthHeaders, getUserAuthHeaders, hasSessionAuth, resolveUserBearerToken } from '../utils/authHeaders';
import { useAuth } from './AuthContext';
import { useUserAuth } from './UserAuthContext';

const BookingContext = createContext();
const API_BASE = getApiBase();

// ─── Reference code generator ───────────────────────────────────────────────
function generateRefCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MM-';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function BookingProvider({ children }) {
  const { user: adminUser } = useAuth();
  const { currentUser } = useUserAuth();
  const [cachedRegistrations, setCachedRegistrations] = useLocalStorage('mm_event_registrations', []);
  const [registrations, setRegistrations] = useState(cachedRegistrations);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState('');

  const refreshRegistrations = useCallback(async () => {
    if (!hasSessionAuth()) {
      setRegistrations([]);
      setSyncError('');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/registrations`, {
        cache: 'no-store',
        headers: getSessionAuthHeaders(),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok || !Array.isArray(json?.data)) {
        throw new Error(json?.message || 'Unable to load registrations.');
      }

      setRegistrations(json.data);
      setSyncError('');
    } catch (error) {
      setSyncError(error?.message || 'Unable to sync registrations from server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!hasSessionAuth()) {
        if (!cancelled) {
          setRegistrations([]);
          setSyncError('');
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/registrations`, {
          cache: 'no-store',
          headers: getSessionAuthHeaders(),
        });
        const json = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !json?.ok || !Array.isArray(json?.data)) {
          throw new Error(json?.message || 'Unable to load registrations.');
        }
        setRegistrations(json.data);
        setSyncError('');
      } catch (error) {
        if (cancelled) return;
        setSyncError(error?.message || 'Unable to sync registrations from server.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [adminUser?.id, currentUser?.id]);

  useEffect(() => {
    setCachedRegistrations(Array.isArray(registrations) ? registrations : []);
  }, [registrations, setCachedRegistrations]);

  const notifyRegistration = useCallback(async ({ registration, event, user }) => {
    try {
      await fetch(`${API_BASE}/notifications/registration`, {
        method: 'POST',
        headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ registration, event, user }),
      });
    } catch {
      // Notifications are best-effort and should never block booking UX.
    }
  }, []);

  /** Register a user for an event. Returns { success, registration, error } */
  const registerForEvent = useCallback(async ({
    user,
    event,
    registrationType,
    notes = '',
    amount,
    paymentAmount,
    paymentCurrency,
    paymentAmountZmw,
    paymentStatus,
    registrationStatus,
    referenceCode,
    paymentMethod,
    paymentReference,
    bookedForName,
    bookedForRelation,
    couponCode,
  }) => {
    if (!user) return { success: false, error: 'You must be logged in to register.' };
    if (!event?.id) return { success: false, error: 'Event not found.' };

    if (!resolveUserBearerToken()) {
      return { success: false, error: 'Your session has expired. Please sign in again to register.' };
    }

    const slotKey = deriveAttendeeSlotKey(bookedForName);
    const availability = checkEventAvailability(event, registrations, user.id, registrationType, {
      attendeeSlotKey: slotKey,
    });
    if (!availability.canBook) return { success: false, error: availability.reason };

    const guestName = String(bookedForName || '').trim();
    const relation = String(bookedForRelation || '').trim();
    const ccRaw = String(couponCode ?? '').trim();
    const coupon_code = ccRaw ? ccRaw : undefined;

    const payload = {
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      event_id: event.id,
      registration_type: registrationType,
      reference_code: referenceCode || generateRefCode(),
      status: registrationStatus || 'confirmed',
      amount: paymentAmount ?? amount ?? (event.is_free ? 0 : (event.price ?? 0)),
      currency: paymentCurrency || 'ZMW',
      amount_zmw: paymentAmountZmw ?? (event.is_free ? 0 : (event.price ?? 0)),
      payment_status: paymentStatus || (event.is_free ? 'not_required' : 'unpaid'),
      payment_method: paymentMethod || (event.is_free ? 'free' : ''),
      payment_reference: paymentReference || '',
      notes,
      ...(coupon_code ? { coupon_code } : {}),
      ...(guestName
        ? { booked_for_name: guestName, ...(relation ? { booked_for_relation: relation } : {}) }
        : {}),
    };

    try {
      const response = await fetch(`${API_BASE}/registrations`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok || !json?.data) {
        const message = json?.message || 'Unable to complete registration.';
        if (response.status === 401 && message === 'Authentication required.') {
          return { success: false, error: 'Your session has expired. Please sign in again to register.' };
        }
        return { success: false, error: message };
      }

      const registration = json.data;
      setRegistrations((prev) => [registration, ...prev.filter((item) => item.id !== registration.id)]);
      void notifyRegistration({ registration, event, user });

      return { success: true, registration };
    } catch {
      return { success: false, error: 'Unable to connect to the registration service.' };
    }
  }, [notifyRegistration, registrations, setRegistrations]);

  /** Update a registration by ID (used by payment polling to finalize status) */
  const updateRegistration = useCallback(async (registrationId, updates = {}) => {
    try {
      const response = await fetch(`${API_BASE}/registrations/${registrationId}`, {
        method: 'PATCH',
        headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(updates || {}),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok || !json?.data) {
        return null;
      }

      const updatedRegistration = json.data;
      setRegistrations((prev) => prev.map((r) => (
        r.id === registrationId ? updatedRegistration : r
      )));
      return updatedRegistration;
    } catch {
      return null;
    }
  }, [setRegistrations]);

  /** Cancel a registration */
  const cancelRegistration = useCallback(async (registrationId, userId) => {
    const existing = registrations.find((r) => r.id === registrationId);
    if (!existing || existing.user_id !== userId) return { success: false, error: 'Registration not found.' };

    const updated = await updateRegistration(registrationId, { status: 'cancelled' });
    if (!updated) return { success: false, error: 'Unable to cancel registration.' };
    return { success: true, registration: updated };
  }, [registrations, updateRegistration]);

  /** Get all registrations for a user */
  const getUserRegistrations = useCallback((userId) => {
    return registrations.filter(r => r.user_id === userId);
  }, [registrations]);

  /** Get all registrations for an event (admin) */
  const getEventRegistrations = useCallback((eventId) => {
    return registrations.filter(r => r.event_id === eventId);
  }, [registrations]);

  /** Check if a user is already registered for an event with a given type */
  const isUserRegistered = useCallback((userId, eventId, registrationType) => {
    return registrations.some(
      r => r.user_id === userId
        && r.event_id === eventId
        && r.registration_type === registrationType
        && r.status !== 'cancelled'
    );
  }, [registrations]);

  /** Count active registrations for an event (for capacity display) */
  const getEventRegistrationCount = useCallback((eventId) => {
    return registrations.filter(r => r.event_id === eventId && r.status !== 'cancelled').length;
  }, [registrations]);

  return (
    <BookingContext.Provider value={{
      registrations,
    loading,
    syncError,
    refreshRegistrations,
      registerForEvent,
    updateRegistration,
      cancelRegistration,
      getUserRegistrations,
      getEventRegistrations,
      isUserRegistered,
      getEventRegistrationCount,
    }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used within a BookingProvider');
  return ctx;
}
