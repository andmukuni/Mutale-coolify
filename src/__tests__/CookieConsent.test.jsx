import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CookieConsentBanner from '../components/CookieConsentBanner';
import {
  CONSENT_STORAGE_KEY,
  getConsent,
  hasConsent,
  openCookieSettings,
  resetConsentCacheForTests,
  saveConsent,
} from '../utils/cookieConsent';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}

function renderBanner() {
  render(
    <MemoryRouter>
      <CookieConsentBanner />
    </MemoryRouter>,
  );
}

const stored = () => JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));

describe('cookie consent', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true });
    resetConsentCacheForTests();
  });

  it('asks first-time visitors and treats only necessary storage as allowed', () => {
    renderBanner();
    expect(screen.getByRole('region', { name: /cookie consent/i })).toBeInTheDocument();
    expect(getConsent()).toBeNull();
    expect(hasConsent('necessary')).toBe(true);
    expect(hasConsent('analytics')).toBe(false);
    expect(hasConsent('preferences')).toBe(false);
  });

  it('records a rejection and stops asking', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));
    expect(stored()).toMatchObject({ version: 1, necessary: true, preferences: false, analytics: false });
    expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument();
  });

  it('records acceptance of everything', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(stored()).toMatchObject({ preferences: true, analytics: true });
    expect(hasConsent('analytics')).toBe(true);
  });

  it('saves exactly what the visitor customises', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Customise' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Analytics' }));
    expect(screen.getByRole('switch', { name: 'Strictly necessary' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save my choices' }));
    expect(stored()).toMatchObject({ preferences: false, analytics: true });
  });

  it('reopens the settings from the footer link after a decision', () => {
    saveConsent({ preferences: true, analytics: false });
    renderBanner();
    expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument();
    act(() => openCookieSettings());
    expect(screen.getByRole('switch', { name: 'Preferences' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Analytics' })).toHaveAttribute('aria-checked', 'false');
  });

  it('deletes stored analytics data when analytics consent is withdrawn', () => {
    saveConsent({ analytics: true });
    window.localStorage.setItem('mm_site_traffic', '{"daily":{}}');
    saveConsent({ analytics: false });
    expect(window.localStorage.getItem('mm_site_traffic')).toBeNull();
  });

  it('asks again when the saved choice is from an older policy version', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: 0, analytics: true }));
    resetConsentCacheForTests();
    expect(getConsent()).toBeNull();
  });
});
