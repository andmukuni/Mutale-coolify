/**
 * ToastContext — covers:
 *  - Renders messages fired via useToast() and the imperative `toast` API.
 *  - Auto-dismisses after the variant's default duration.
 *  - Manual dismiss removes a specific toast and toast.dismiss() clears all.
 *  - Caps the stack at MAX_TOASTS (5) by dropping the oldest.
 *  - toast.promise() transitions loading → success and loading → error.
 *  - Returns a stub when useToast() is used outside the provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider, useToast, toast as imperativeToast } from '../context/ToastContext';

function Trigger({ onMount, onClick }) {
  const toast = useToast();
  // Allow tests to capture the toast API
  if (onMount) onMount(toast);
  return (
    <button type="button" onClick={() => onClick && onClick(toast)}>
      fire
    </button>
  );
}

function renderWithProvider(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a success toast with the message and ARIA region', () => {
    renderWithProvider(
      <Trigger onClick={(t) => t.success('Saved!')} />,
    );
    act(() => { fireEvent.click(screen.getByText('fire')); });
    expect(screen.getByText('Saved!')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument();
    // success uses role=status
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error toast with role=alert', () => {
    renderWithProvider(
      <Trigger onClick={(t) => t.error('Boom')} />,
    );
    act(() => { fireEvent.click(screen.getByText('fire')); });
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('auto-dismisses success toasts after the default duration', async () => {
    renderWithProvider(
      <Trigger onClick={(t) => t.success('Bye soon')} />,
    );
    act(() => { fireEvent.click(screen.getByText('fire')); });
    expect(screen.getByText('Bye soon')).toBeInTheDocument();

    // success default duration = 4000ms, then 200ms leaving animation
    await act(async () => { vi.advanceTimersByTime(4001); });
    await act(async () => { vi.advanceTimersByTime(250); });

    expect(screen.queryByText('Bye soon')).toBeNull();
  });

  it('loading toasts do NOT auto-dismiss', async () => {
    renderWithProvider(
      <Trigger onClick={(t) => t.loading('Working…')} />,
    );
    act(() => { fireEvent.click(screen.getByText('fire')); });
    expect(screen.getByText('Working…')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(screen.getByText('Working…')).toBeInTheDocument();
  });

  it('manual dismiss via the X button removes the toast', () => {
    renderWithProvider(
      <Trigger onClick={(t) => t.info('Manual close')} />,
    );
    act(() => { fireEvent.click(screen.getByText('fire')); });
    expect(screen.getByText('Manual close')).toBeInTheDocument();

    act(() => { fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i })); });
    expect(screen.queryByText('Manual close')).toBeNull();
  });

  it('toast.dismiss() with no id clears every toast', () => {
    let apiRef = null;
    renderWithProvider(
      <Trigger onMount={(t) => { apiRef = t; }} />,
    );
    act(() => {
      apiRef.success('a');
      apiRef.success('b');
      apiRef.success('c');
    });
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
    act(() => { apiRef.dismiss(); });
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.queryByText('b')).toBeNull();
    expect(screen.queryByText('c')).toBeNull();
  });

  it('caps the stack at MAX_TOASTS by dropping the oldest', () => {
    let apiRef = null;
    renderWithProvider(<Trigger onMount={(t) => { apiRef = t; }} />);
    act(() => {
      apiRef.info('one');
      apiRef.info('two');
      apiRef.info('three');
      apiRef.info('four');
      apiRef.info('five');
      apiRef.info('six'); // pushes the cap; oldest ("one") drops
    });
    expect(screen.queryByText('one')).toBeNull();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('six')).toBeInTheDocument();
  });

  it('imperative `toast` API delegates to the active provider', () => {
    renderWithProvider(<Trigger />);
    act(() => { imperativeToast.success('Hi from non-react'); });
    expect(screen.getByText('Hi from non-react')).toBeInTheDocument();
  });

  it('toast.promise() transitions loading → success', async () => {
    // Real timers needed for awaiting microtasks across the promise lifecycle.
    vi.useRealTimers();
    let apiRef = null;
    renderWithProvider(<Trigger onMount={(t) => { apiRef = t; }} />);

    let resolvePromise;
    const p = new Promise((res) => { resolvePromise = res; });

    let pending;
    act(() => { pending = apiRef.promise(p, { loading: 'Saving…', success: 'Saved.' }); });
    expect(screen.getByText('Saving…')).toBeInTheDocument();

    resolvePromise('ok');
    await act(async () => { await pending; });
    expect(screen.getByText('Saved.')).toBeInTheDocument();
  });

  it('toast.promise() transitions loading → error and rethrows', async () => {
    vi.useRealTimers();
    let apiRef = null;
    renderWithProvider(<Trigger onMount={(t) => { apiRef = t; }} />);

    let rejectPromise;
    const p = new Promise((_, rej) => { rejectPromise = rej; });

    let pending;
    act(() => {
      pending = apiRef.promise(p, { loading: 'Going…', error: (e) => `Nope: ${e.message}` })
        .catch(() => { /* expected — toast.promise rethrows */ });
    });
    expect(screen.getByText('Going…')).toBeInTheDocument();

    rejectPromise(new Error('boom'));
    await act(async () => { await pending; });
    expect(screen.getByText('Nope: boom')).toBeInTheDocument();
  });

  it('useToast() returns a safe stub when used without a provider', () => {
    function Probe() {
      const t = useToast();
      // Should not throw and should expose all expected methods.
      t.success('ignored');
      t.error('also ignored');
      return <span data-testid="probe">{typeof t.dismiss}</span>;
    }
    // Quiet the [toast:no-provider] console noise during this assertion.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('function');
    logSpy.mockRestore();
  });
});
