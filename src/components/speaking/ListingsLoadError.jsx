import { RefreshCw } from 'lucide-react';

/** Shown in place of the listings when they can't be loaded. */
export default function ListingsLoadError({ onRetry, buttonRef }) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-6 text-center" role="alert">
      <p className="text-navy-700">Speaking engagements couldn’t be loaded right now.</p>
      <button
        ref={buttonRef}
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
      >
        <RefreshCw size={15} aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}
