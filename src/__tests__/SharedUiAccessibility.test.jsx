/**
 * Accessibility fixes in the shared UI used by the Speaking page and its admin:
 *  - FormField contrast classes, help text described-by, textarea maxLength.
 *  - Field border / focus-ring tokens and the index.css rules behind them (WCAG 1.4.3, 1.4.11).
 *  - StatusBadge "declined" readable in dark mode.
 *  - Nested Modal / ConfirmDialog: Escape and the Tab trap belong to the topmost dialog.
 *  - Navbar: collapsed bars are inert, the active page is underlined, the mobile menu
 *    closes on Escape and keeps Tab inside.
 *  - Cookie banner height feeds scroll-padding-bottom; toast live regions stay mounted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';

const css = readFileSync(resolve(cwd(), 'src/index.css'), 'utf8');

vi.mock('../context/UserAuthContext', () => ({
  useUserAuth: () => ({ currentUser: null, userLogout: vi.fn() }),
}));
vi.mock('../context/BookStoreContext', () => ({ useBookStore: () => ({ cartItemCount: 0 }) }));
vi.mock('../context/MenuContext', () => ({
  useSiteMenu: () => ({
    mainNavLinks: [
      { to: '/', label: 'Home' },
      { to: '/speaking', label: 'Speaking' },
      { to: '/blog', label: 'Blog' },
    ],
  }),
}));
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ preference: 'light', resolvedTheme: 'light', setPreference: vi.fn(), toggleTheme: vi.fn() }),
}));

import FormField from '../components/ui/FormField';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import StatusBadge from '../components/ui/StatusBadge';
import PageHeader from '../components/ui/PageHeader';
import Navbar from '../components/Navbar';
import CookieConsentBanner from '../components/CookieConsentBanner';
import { ToastProvider, useToast } from '../context/ToastContext';
import { FIELD_ERROR_CLASS, FIELD_OK_CLASS, fieldControlClass } from '../utils/formFieldHighlight';
import { resetConsentCacheForTests } from '../utils/cookieConsent';

/* ─── Contrast helpers, using the real tokens from index.css ─── */

function cssVar(name, block = ':root') {
  const body = css.match(new RegExp(`(?:^|\\n)${block.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] || '';
  return body.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
}

const theme = (token) => css.match(new RegExp(`--color-${token}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];

function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff';
const DARK_CARD = () => cssVar('--app-surface', '.dark');

describe('FormField', () => {
  it('links help text to the field, and the error replaces it', () => {
    const { rerender } = render(
      <FormField label="End date" name="end_date" value="" onChange={() => {}} helpText="For events over several days." />,
    );
    const input = screen.getByLabelText('End date');
    expect(input).toHaveAccessibleDescription('For events over several days.');
    expect(screen.getByText('For events over several days.')).toHaveClass('text-navy-600');

    rerender(
      <FormField label="End date" name="end_date" value="" onChange={() => {}} helpText="For events over several days." error="Choose a later date." />,
    );
    expect(input).toHaveAccessibleDescription('Choose a later date.');
    expect(screen.queryByText('For events over several days.')).not.toBeInTheDocument();
  });

  it('uses AA colours for the required marker, error label and message in both themes', () => {
    const { container } = render(
      <FormField label="Your name" name="organiser_name" value="" onChange={() => {}} required error="Your name is required." />,
    );
    const label = container.querySelector('label[for="organiser_name"]');
    expect(label).toHaveClass('text-red-700', 'dark:text-red-300');
    expect(within(label).getByText('*')).toHaveClass('text-red-700', 'dark:text-red-300');
    expect(screen.getByRole('alert')).toHaveClass('text-red-700', 'dark:text-red-300');
    // Tailwind red-700 #c10007 / red-300 #ffa2a2 against the white and dark cards.
    expect(contrast('#c10007', WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffa2a2', DARK_CARD())).toBeGreaterThanOrEqual(4.5);
  });

  it('passes maxLength to a textarea', () => {
    render(<FormField label="Private notes" name="admin_notes" value="" onChange={() => {}} textarea maxLength={5000} />);
    expect(screen.getByLabelText('Private notes')).toHaveAttribute('maxlength', '5000');
  });

  it('describes a custom child control by the help text', () => {
    render(
      <FormField label="Time zone" name="timezone" helpText="Decides when the event moves to Previous.">
        <select><option>Africa/Lusaka</option></select>
      </FormField>,
    );
    expect(screen.getByLabelText('Time zone')).toHaveAccessibleDescription('Decides when the event moves to Previous.');
  });
});

describe('field borders and focus rings', () => {
  it('uses border, placeholder and ring tokens that reach 3:1 (4.5:1 for placeholder text)', () => {
    expect(FIELD_OK_CLASS).toContain('border-navy-500');
    expect(FIELD_OK_CLASS).toContain('placeholder-navy-600');
    expect(FIELD_OK_CLASS).toContain('focus:ring-cyan-700');
    expect(FIELD_OK_CLASS).toContain('dark:focus:ring-cyan-400');
    expect(FIELD_ERROR_CLASS).toContain('placeholder-red-700');

    const navy50 = theme('navy-50');
    expect(contrast(theme('navy-500'), WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme('navy-500'), navy50)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme('navy-600'), navy50)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme('cyan-700'), WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme('cyan-700'), navy50)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme('cyan-400'), DARK_CARD())).toBeGreaterThanOrEqual(3);
    expect(contrast(theme('cyan-400'), cssVar('--app-input-bg', '.dark'))).toBeGreaterThanOrEqual(3);
  });

  it('gives dark inputs a 3:1 edge and 4.5:1 placeholders', () => {
    expect(css).toMatch(/\.dark select \{[^}]*border-color: var\(--app-text-muted\)/);
    expect(contrast(cssVar('--app-text-muted', '.dark'), DARK_CARD())).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/\.dark textarea::placeholder \{\s*color: var\(--color-navy-300\)/);
    expect(contrast(theme('navy-300'), cssVar('--app-input-bg', '.dark'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a focus outline for forced-colours mode', () => {
    expect(fieldControlClass(false)).toContain('focus:outline-hidden');
    expect(fieldControlClass(false)).not.toContain('outline-none');
    expect(css).toMatch(/\.field-has-error:focus \{[^}]*outline: 2px solid transparent;/);
  });

  it('shows a strong focus ring on invalid fields in both themes', () => {
    expect(css).toMatch(/\.field-has-error:focus \{\s*box-shadow: 0 0 0 2px #c10007/);
    expect(css).toMatch(/\.dark :is\(input, select, textarea\)\.field-has-error:focus \{\s*box-shadow: 0 0 0 2px #fca5a5/);
    expect(contrast('#c10007', WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrast('#fca5a5', DARK_CARD())).toBeGreaterThanOrEqual(3);
    // Light error border: Tailwind red-600.
    expect(css).toMatch(/\.field-has-error \{\s*border-color: #e7000b !important/);
    expect(contrast('#e7000b', WHITE)).toBeGreaterThanOrEqual(3);
  });

  it('keeps focused controls clear of the sticky header and cookie banner', () => {
    expect(css).toMatch(/html \{[^}]*scroll-padding-top: 4\.5rem;/);
    expect(css).toMatch(/html \{[^}]*scroll-padding-bottom: var\(--consent-banner-h, 0px\);/);
  });

  it('darkens, rather than lightens, hovered table rows in dark mode', () => {
    expect(css).toContain('.dark .hover\\:bg-navy-50\\/50:hover');
    expect(css).toContain('.dark .active\\:bg-navy-50:active');
  });
});

describe('StatusBadge', () => {
  it('shows "Declined" in a colour the dark theme remaps to a readable one', () => {
    render(<StatusBadge status="declined" />);
    const badge = screen.getByText('Declined');
    expect(badge).toHaveClass('text-navy-700', 'bg-slate-100');
    expect(badge.className).not.toMatch(/text-slate-/);
    expect(css).toMatch(/\.dark \.text-navy-700 \{ color: var\(--app-text-secondary\); \}/);
    expect(contrast(cssVar('--app-text-secondary', '.dark'), cssVar('--app-surface-muted', '.dark'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme('navy-700'), '#f1f5f9')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('PageHeader', () => {
  it('uses AA text for the subtitle and breadcrumbs', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Speaking Enquiries" subtitle="Never becomes public." breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Enquiries' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Never becomes public.')).toHaveClass('text-navy-600');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('text-navy-600');
    expect(contrast(theme('navy-600'), cssVar('--app-bg'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('nested dialogs', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>View enquiry</button>
        <Modal isOpen={open} onClose={() => setOpen(false)} title="Enquiry" subtitle="From Andrew">
          <button type="button" onClick={() => setConfirming(true)}>Delete</button>
        </Modal>
        <ConfirmDialog
          isOpen={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => setConfirming(false)}
          title="Delete enquiry"
          message="Delete this enquiry permanently?"
        />
      </>
    );
  }

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('lets only the topmost dialog handle Escape and Tab', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'View enquiry' }));
    const enquiry = screen.getByRole('dialog', { name: 'Enquiry' });
    expect(screen.getByText('From Andrew')).toHaveClass('text-navy-600');

    const deleteButton = within(enquiry).getByRole('button', { name: 'Delete' });
    deleteButton.focus();
    fireEvent.click(deleteButton);
    const confirm = screen.getByRole('dialog', { name: 'Delete enquiry' });
    expect(confirm).toHaveAccessibleDescription('Delete this enquiry permanently?');
    expect(confirm).toHaveFocus();

    // Shift+Tab from the panel itself wraps to the confirmation's last button.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    const confirmButton = within(confirm).getByRole('button', { name: 'Confirm' });
    expect(confirmButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(within(confirm).getByRole('button', { name: 'Close' })).toHaveFocus();

    // One Escape closes only the confirmation and returns focus to its opener.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Delete enquiry' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Enquiry' })).toBeInTheDocument();
    expect(deleteButton).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('Navbar', () => {
  const renderNavbar = (path = '/speaking') => render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
    </MemoryRouter>,
  );

  afterEach(() => {
    window.scrollY = 0;
    document.body.style.overflow = '';
  });

  it('keeps the hidden compact bar out of the Tab order at the top of the page', () => {
    const { container } = renderNavbar();
    const header = container.querySelector('header');
    const [topBlock, compactBar] = header.children;
    expect(topBlock).not.toHaveAttribute('inert');
    expect(compactBar).toHaveAttribute('inert');
  });

  it('makes the collapsed top bars inert once the header is compact', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(120);
    window.scrollY = 400;
    try {
      const { container } = renderNavbar();
      const [topBlock, compactBar] = container.querySelector('header').children;
      expect(topBlock).toHaveAttribute('inert');
      expect(compactBar).not.toHaveAttribute('inert');
    } finally {
      spy.mockRestore();
    }
  });

  it('underlines the current page as well as colouring it', () => {
    renderNavbar('/speaking');
    const [desktop] = screen.getAllByRole('link', { name: 'Speaking' });
    expect(desktop).toHaveAttribute('aria-current', 'page');
    expect(desktop).toHaveClass('underline', 'text-cyan-400');
    const [blog] = screen.getAllByRole('link', { name: 'Blog' });
    expect(blog).not.toHaveClass('underline');
  });

  it('closes the mobile menu on Escape, returns focus, and keeps Tab inside while open', () => {
    renderNavbar();
    const toggle = screen.getByRole('button', { name: 'Toggle menu' });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const signIn = screen.getAllByRole('link', { name: 'Sign In' }).at(-1);
    signIn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(toggle).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(signIn).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });
});

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    const data = new Map();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
        clear: () => data.clear(),
      },
    });
    resetConsentCacheForTests();
  });

  it('publishes its height while shown so focus can scroll clear of it', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180);
    try {
      render(<MemoryRouter><CookieConsentBanner /></MemoryRouter>);
      expect(document.documentElement.style.getPropertyValue('--consent-banner-h')).toBe('180px');
      fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));
      expect(document.documentElement.style.getPropertyValue('--consent-banner-h')).toBe('');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('toast live regions', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <>
        <button type="button" onClick={() => toast.success('Engagement published.')}>publish</button>
        <button type="button" onClick={() => toast.error('Could not save.')}>fail</button>
      </>
    );
  }

  it('are mounted before the first message, so it is announced', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    expect(status).toBeEmptyDOMElement();
    expect(alert).toBeEmptyDOMElement();

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'publish' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'fail' })); });
    expect(within(status).getByText('Engagement published.')).toBeInTheDocument();
    expect(within(alert).getByText('Could not save.')).toBeInTheDocument();
  });
});
