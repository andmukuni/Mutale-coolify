import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Radio, X } from 'lucide-react';

export default function LiveSessionJoinBalloon({
  sessionTitle,
  timeLabel,
  joinHref,
  joinLabel = 'Join the live session',
  joinHint,
  joinState,
  onDismiss,
}) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-label="Live session is in progress"
      className="session-join-balloon absolute left-1/2 bottom-full z-30 mb-3 w-[min(22rem,calc(100vw-3rem))] -translate-x-1/2"
    >
      <div className="relative overflow-hidden rounded-2xl border border-[#00A79D]/40 bg-[#141D45] px-4 py-3.5 text-white shadow-[0_12px_32px_rgba(20,29,69,0.28)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#00A79D]/25 blur-2xl" />
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-2 top-2 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss join invitation"
        >
          <X size={14} />
        </button>

        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7ee8e0]">
          <Radio size={12} className="animate-pulse" />
          Live now
        </p>
        <p className="mt-1.5 pr-6 text-base font-semibold leading-snug">
          {sessionTitle || 'This session'}
        </p>
        {timeLabel ? (
          <p className="mt-0.5 text-xs text-white/65">{timeLabel}</p>
        ) : null}
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          {joinHint || 'This is the session happening right now. Jump in while it is live.'}
        </p>

        {joinHref ? (
          <Link
            to={joinHref}
            state={joinState}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-[#00A79D] px-3 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(0,167,157,0.35)] transition hover:bg-[#00b8ad]"
          >
            {joinLabel}
          </Link>
        ) : null}
      </div>
      <span className="session-join-balloon-caret mx-auto block h-0 w-0 border-x-[9px] border-t-[10px] border-x-transparent border-t-[#141D45]" />
    </div>
  );
}
