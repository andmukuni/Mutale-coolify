import { fieldControlClass } from "../../../utils/formFieldHighlight";

// Class tokens mirroring the shared admin UI (see NotificationTemplatesPage,
// EventsListPage) so every campaign screen looks and themes the same way.
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 bg-white border border-navy-200 text-navy-700 hover:bg-navy-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_DANGER =
  "inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_ICON =
  "inline-flex items-center justify-center p-2 rounded-lg text-navy-500 hover:text-navy-800 hover:bg-navy-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export const LINK_ACTION =
  "inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed";
export const LINK_MUTED =
  "inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800 disabled:opacity-50 disabled:cursor-not-allowed";
export const LINK_DANGER =
  "inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed";

export const INPUT = `${fieldControlClass(false)} disabled:opacity-60 disabled:cursor-not-allowed`;
// Compact control for dense editors (block fields, toolbars, filters).
export const INPUT_SM =
  "w-full px-3 py-2 rounded-xl border border-navy-200 bg-white text-sm text-navy-900 placeholder-navy-400 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed";
export const CHECKBOX =
  "h-4 w-4 shrink-0 rounded border-navy-300 accent-cyan-600 focus:ring-cyan-500";

export const SECTION_TITLE = "text-base font-semibold text-navy-900";
export const MUTED_TEXT = "text-sm text-navy-500";

// Underline section tab, matching EventProfilePage.
export const tabClass = (active) =>
  `relative inline-flex items-center gap-2 px-4 py-3.5 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-wait ${
    active
      ? "text-cyan-700"
      : "text-navy-500 hover:bg-navy-50 hover:text-navy-800"
  }`;
