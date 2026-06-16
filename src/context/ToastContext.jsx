/* eslint-disable react-refresh/only-export-components */
/**
 * ToastContext — lightweight, dependency-free toast system.
 *
 * Two ways to fire toasts:
 *   1. React components:
 *        const toast = useToast();
 *        toast.success('Saved!');
 *
 *   2. Anywhere else (helpers, fetch wrappers, event handlers):
 *        import { toast } from '../context/ToastContext';
 *        toast.error('Network error');
 *
 * Both delegate to the same internal queue, so the toast viewport is the
 * single source of truth.
 *
 * API surface
 * ───────────
 *   toast(msg, opts?)          → info-by-default
 *   toast.success(msg, opts?)
 *   toast.error(msg, opts?)
 *   toast.warning(msg, opts?)
 *   toast.info(msg, opts?)
 *   toast.loading(msg, opts?)  → no auto-dismiss; returns id
 *   toast.dismiss(id?)          → dismiss one or (no arg) all
 *   toast.update(id, patch)     → swap content / variant (e.g. promise resolved)
 *   toast.promise(p, msgs)      → loading → success/error
 *
 * opts: { id?, duration?, action?: { label, onClick }, description? }
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Check, AlertTriangle, AlertCircle, Info, Loader2, X } from 'lucide-react';

const ToastContext = createContext(null);

// Default per-variant durations (ms). 0 = sticky.
const DEFAULT_DURATIONS = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 7000,
  loading: 0,
};

const MAX_TOASTS = 5;

// ─── External bridge so non-React callers can fire toasts ─────────────────
const externalBridge = {
  push: null,   // (toast) => id
  update: null, // (id, patch) => void
  dismiss: null, // (id?) => void
};

function nextId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normaliseInput(input, fallbackVariant) {
  if (input == null) return { message: '', variant: fallbackVariant };
  if (typeof input === 'string') return { message: input, variant: fallbackVariant };
  return { variant: fallbackVariant, ...input };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map()); // id → timeout handle

  const clearTimer = useCallback((id) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback((id) => {
    if (id == null) {
      // Clear everything
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      setToasts([]);
      return;
    }
    clearTimer(id);
    setToasts((current) => current.filter((t) => t.id !== id));
  }, [clearTimer]);

  const scheduleAutoDismiss = useCallback((id, duration) => {
    clearTimer(id);
    if (!duration || duration <= 0) return;
    const handle = setTimeout(() => {
      // Animate out — set a leaving flag, then drop after 200ms.
      setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      const removeHandle = setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, 200);
      timersRef.current.set(id, removeHandle);
    }, duration);
    timersRef.current.set(id, handle);
  }, [clearTimer]);

  const push = useCallback((input) => {
    const t = normaliseInput(input, 'info');
    const id = t.id || nextId();
    const variant = t.variant || 'info';
    const duration = t.duration != null ? t.duration : DEFAULT_DURATIONS[variant] ?? 4000;
    const next = {
      id,
      variant,
      message: t.message ?? '',
      description: t.description,
      action: t.action,
      createdAt: Date.now(),
      leaving: false,
    };

    setToasts((current) => {
      // Replace if same id exists (idempotent), else prepend.
      const without = current.filter((c) => c.id !== id);
      const combined = [next, ...without];
      // Drop oldest beyond cap.
      return combined.slice(0, MAX_TOASTS);
    });

    scheduleAutoDismiss(id, duration);
    return id;
  }, [scheduleAutoDismiss]);

  const update = useCallback((id, patch) => {
    if (!id || !patch) return;
    const t = normaliseInput(patch, 'info');
    setToasts((current) => current.map((c) => (c.id === id ? { ...c, ...t, leaving: false } : c)));
    // Re-arm dismiss timer if duration changed or variant implies one.
    const duration = patch.duration != null
      ? patch.duration
      : DEFAULT_DURATIONS[t.variant] ?? null;
    if (duration != null) scheduleAutoDismiss(id, duration);
  }, [scheduleAutoDismiss]);

  // Wire the external bridge once
  useEffect(() => {
    externalBridge.push = push;
    externalBridge.update = update;
    externalBridge.dismiss = dismiss;
    return () => {
      externalBridge.push = null;
      externalBridge.update = null;
      externalBridge.dismiss = null;
    };
  }, [push, update, dismiss]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  // Build the React-side API
  const api = useMemo(() => {
    const make = (variant) => (msg, opts = {}) =>
      push({ ...normaliseInput(msg, variant), ...opts, variant });
    const base = (msg, opts = {}) =>
      push({ ...normaliseInput(msg, 'info'), ...opts });
    base.success = make('success');
    base.error = make('error');
    base.warning = make('warning');
    base.info = make('info');
    base.loading = (msg, opts = {}) =>
      push({ ...normaliseInput(msg, 'loading'), ...opts, variant: 'loading' });
    base.dismiss = dismiss;
    base.update = update;
    base.promise = async (promiseLike, messages = {}) => {
      const loadingMsg = messages.loading || 'Working…';
      const id = base.loading(loadingMsg);
      try {
        const result = await promiseLike;
        const okMsg = typeof messages.success === 'function'
          ? messages.success(result)
          : messages.success || 'Done.';
        update(id, { variant: 'success', message: okMsg, duration: DEFAULT_DURATIONS.success });
        return result;
      } catch (err) {
        const errMsg = typeof messages.error === 'function'
          ? messages.error(err)
          : messages.error || (err?.message || 'Something went wrong.');
        update(id, { variant: 'error', message: errMsg, duration: DEFAULT_DURATIONS.error });
        throw err;
      }
    };
    return base;
  }, [push, dismiss, update]);

  const value = useMemo(() => ({ toasts, toast: api, dismiss, push }), [toasts, api, dismiss, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ─── Hook ──────────────────────────────────────────────────────────── */

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Stub when used outside a provider (e.g. isolated unit tests).
    // Logs to console so accidental misuse is visible without crashing.
    const noop = () => undefined;
    const stub = (msg) => { if (msg) console.log('[toast:no-provider]', msg); };
    stub.success = stub;
    stub.error = stub;
    stub.warning = stub;
    stub.info = stub;
    stub.loading = stub;
    stub.dismiss = noop;
    stub.update = noop;
    stub.promise = async (p) => p;
    return stub;
  }
  return ctx.toast;
}

/* ─── Imperative bridge for non-React code ─────────────────────────── */

function bridgeCall(fnName, ...args) {
  const fn = externalBridge[fnName];
  if (typeof fn === 'function') return fn(...args);
  // No provider mounted yet (e.g. very early in bootstrap) — log so a dev sees it.
  if (typeof console !== 'undefined') console.log(`[toast:${fnName}] no provider yet`, ...args);
  return undefined;
}

function imperativeBase(msg, opts = {}) {
  return bridgeCall('push', { ...normaliseInput(msg, 'info'), ...opts });
}
imperativeBase.success = (msg, opts = {}) => bridgeCall('push', { ...normaliseInput(msg, 'success'), ...opts, variant: 'success' });
imperativeBase.error   = (msg, opts = {}) => bridgeCall('push', { ...normaliseInput(msg, 'error'),   ...opts, variant: 'error' });
imperativeBase.warning = (msg, opts = {}) => bridgeCall('push', { ...normaliseInput(msg, 'warning'), ...opts, variant: 'warning' });
imperativeBase.info    = (msg, opts = {}) => bridgeCall('push', { ...normaliseInput(msg, 'info'),    ...opts, variant: 'info' });
imperativeBase.loading = (msg, opts = {}) => bridgeCall('push', { ...normaliseInput(msg, 'loading'), ...opts, variant: 'loading' });
imperativeBase.dismiss = (id) => bridgeCall('dismiss', id);
imperativeBase.update  = (id, patch) => bridgeCall('update', id, patch);
imperativeBase.promise = async (p, messages = {}) => {
  const id = imperativeBase.loading(messages.loading || 'Working…');
  try {
    const result = await p;
    const okMsg = typeof messages.success === 'function' ? messages.success(result) : messages.success || 'Done.';
    bridgeCall('update', id, { variant: 'success', message: okMsg, duration: DEFAULT_DURATIONS.success });
    return result;
  } catch (err) {
    const errMsg = typeof messages.error === 'function' ? messages.error(err) : messages.error || (err?.message || 'Something went wrong.');
    bridgeCall('update', id, { variant: 'error', message: errMsg, duration: DEFAULT_DURATIONS.error });
    throw err;
  }
};

export const toast = imperativeBase;

/* ─── Viewport + Toast ──────────────────────────────────────────────── */

const VARIANT_STYLES = {
  success: {
    Icon: Check,
    container: 'border-emerald-200 bg-white text-navy-900',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    accent: 'border-l-emerald-500',
  },
  error: {
    Icon: AlertCircle,
    container: 'border-red-200 bg-white text-navy-900',
    iconWrap: 'bg-red-100 text-red-700',
    accent: 'border-l-red-500',
  },
  warning: {
    Icon: AlertTriangle,
    container: 'border-amber-200 bg-white text-navy-900',
    iconWrap: 'bg-amber-100 text-amber-700',
    accent: 'border-l-amber-500',
  },
  info: {
    Icon: Info,
    container: 'border-cyan-200 bg-white text-navy-900',
    iconWrap: 'bg-cyan-100 text-cyan-700',
    accent: 'border-l-cyan-500',
  },
  loading: {
    Icon: Loader2,
    container: 'border-navy-200 bg-white text-navy-900',
    iconWrap: 'bg-navy-100 text-navy-700',
    accent: 'border-l-navy-400',
  },
};

function ToastViewport({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div
      // Top-right on desktop; full-width pinned to top on mobile.
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex flex-col items-center gap-2 px-3 pt-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end sm:gap-3 sm:px-0 sm:pt-0"
      aria-live="polite"
      aria-atomic="false"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }) {
  const variant = VARIANT_STYLES[t.variant] || VARIANT_STYLES.info;
  const { Icon } = variant;
  const isLoading = t.variant === 'loading';
  const isError = t.variant === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={[
        'pointer-events-auto w-full sm:w-[360px] max-w-full overflow-hidden rounded-2xl border border-l-4 shadow-lg',
        'transition-all duration-200 ease-out',
        variant.container,
        variant.accent,
        t.leaving
          ? '-translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2'
          : 'translate-y-0 opacity-100',
      ].join(' ')}
    >
      <div className="flex items-start gap-3 p-3.5">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${variant.iconWrap}`}>
          <Icon size={18} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          {t.message && (
            <p className="text-sm font-semibold leading-snug break-words">{t.message}</p>
          )}
          {t.description && (
            <p className="mt-0.5 text-xs text-navy-500 break-words">{t.description}</p>
          )}
          {t.action && typeof t.action.onClick === 'function' && (
            <button
              type="button"
              onClick={() => {
                try { t.action.onClick(); } finally { onDismiss(); }
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-navy-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-navy-800"
            >
              {t.action.label || 'OK'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-navy-400 hover:bg-navy-50 hover:text-navy-700"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
