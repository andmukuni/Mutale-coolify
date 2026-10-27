import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Lock } from 'lucide-react';
import { Modal } from './ui';
import useCookieConsent from '../hooks/useCookieConsent';
import {
  CONSENT_CATEGORIES,
  OPEN_COOKIE_SETTINGS_EVENT,
  saveConsent,
} from '../utils/cookieConsent';

const primary =
  'inline-flex items-center justify-center rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500';
const secondary =
  'inline-flex items-center justify-center rounded-xl border border-navy-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy-800 transition-colors hover:bg-navy-50';

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${
        checked ? 'bg-cyan-600' : 'bg-navy-200'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function CookieConsentBanner() {
  const consent = useCookieConsent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState({ preferences: false, analytics: false });

  const openSettings = () => {
    setDraft({
      preferences: consent?.preferences ?? false,
      analytics: consent?.analytics ?? false,
    });
    setSettingsOpen(true);
  };

  useEffect(() => {
    const onOpen = () => {
      setDraft({
        preferences: consent?.preferences ?? false,
        analytics: consent?.analytics ?? false,
      });
      setSettingsOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
  }, [consent]);

  const decide = (choice) => {
    saveConsent(choice);
    setSettingsOpen(false);
  };

  return (
    <>
      {!consent && !settingsOpen && (
        <section
          role="region"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4"
        >
          <div className="app-card mx-auto max-w-4xl rounded-2xl border border-navy-100 bg-white p-5 shadow-xl sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="shrink-0 rounded-xl bg-cyan-50 p-2.5 text-cyan-700">
                  <Cookie size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-navy-900">
                    Your privacy choices
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-navy-600">
                    We use essential browser storage to run the site. With your permission we also
                    detect your country to show local prices and count page visits. Change this any
                    time under <strong className="font-medium">Cookie settings</strong> in the
                    footer.{' '}
                    <Link
                      to="/cookie-policy"
                      className="font-medium text-cyan-700 underline hover:text-cyan-600"
                    >
                      Cookie Policy
                    </Link>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row lg:shrink-0">
                <button
                  type="button"
                  className={`${secondary} order-last col-span-2 py-2 sm:order-none sm:py-2.5`}
                  onClick={openSettings}
                >
                  Customise
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => decide({ preferences: false, analytics: false })}
                >
                  Reject all
                </button>
                <button
                  type="button"
                  className={primary}
                  onClick={() => decide({ preferences: true, analytics: true })}
                >
                  Accept all
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Cookie settings"
        subtitle="Choose which optional features may store or send data. Strictly necessary storage is always on."
        size="lg"
        footer={(
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              className={secondary}
              onClick={() => decide({ preferences: false, analytics: false })}
            >
              Reject all
            </button>
            <button type="button" className={secondary} onClick={() => decide(draft)}>
              Save my choices
            </button>
            <button
              type="button"
              className={primary}
              onClick={() => decide({ preferences: true, analytics: true })}
            >
              Accept all
            </button>
          </div>
        )}
      >
        <ul>
          {CONSENT_CATEGORIES.map((category) => (
            <li
              key={category.key}
              className="flex items-start justify-between gap-4 border-b border-navy-100 py-4 first:pt-0 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                  {category.label}
                  {category.locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-500">
                      <Lock size={11} />
                      Always on
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-navy-600">
                  {category.description}
                </p>
              </div>
              <Switch
                label={category.label}
                checked={category.locked ? true : draft[category.key]}
                disabled={category.locked}
                onChange={(value) => setDraft((prev) => ({ ...prev, [category.key]: value }))}
              />
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-navy-500">
          Full details are in our{' '}
          <Link
            to="/cookie-policy"
            onClick={() => setSettingsOpen(false)}
            className="font-medium text-cyan-700 underline hover:text-cyan-600"
          >
            Cookie Policy
          </Link>
          .
        </p>
      </Modal>
    </>
  );
}
