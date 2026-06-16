import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CvGeneratorPanel from '../components/account/CvGeneratorPanel.jsx';

vi.mock('../context/UserAuthContext.jsx', () => ({
  useUserAuth: () => ({
    currentUser: {
      id: 'usr-1',
      name: 'Test User',
      email: 'test@example.com',
      profession: 'Engineer',
    },
    applySessionUser: vi.fn(),
  }),
}));

vi.mock('../context/ToastContext.jsx', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

vi.mock('../context/CurrencyContext.jsx', () => ({
  useCurrency: () => ({ isZambia: true, geoLoading: false }),
}));

vi.mock('../utils/cvApi.js', () => ({
  fetchCvAccess: vi.fn(),
  fetchCvSuggestions: vi.fn(),
  initiateCvMobileCheckout: vi.fn(),
  createCvCardCheckoutSession: vi.fn(),
  verifyCvPayment: vi.fn(),
  pollLencoPayment: vi.fn(),
}));

vi.mock('../utils/cvGenerator.js', () => ({
  openCvForPrint: vi.fn(),
  downloadCvDocx: vi.fn(),
}));

vi.mock('../hooks/useCvDownloadPayment.js', () => ({
  useCvDownloadPayment: vi.fn(),
}));

import { fetchCvSuggestions } from '../utils/cvApi.js';
import { useCvDownloadPayment } from '../hooks/useCvDownloadPayment.js';
import { openCvForPrint } from '../utils/cvGenerator.js';

function renderPanel() {
  return render(
    <MemoryRouter>
      <CvGeneratorPanel certificates={[]} registrations={[]} />
    </MemoryRouter>,
  );
}

describe('CvGeneratorPanel', () => {
  let requestDownload;

  beforeEach(() => {
    vi.clearAllMocks();
    requestDownload = vi.fn();
    fetchCvSuggestions.mockResolvedValue({
      suggestions: [{ id: 'about', title: 'Add summary', detail: 'Tip', priority: 'high' }],
      score: 40,
    });
    useCvDownloadPayment.mockReturnValue({
      access: { enabled: true, priceZmw: 75 },
      accessLoading: false,
      downloadsUnlocked: false,
      canDownloadNow: false,
      priceZmw: 75,
      priceLabel: 'ZMW 75',
      phone: '',
      setPhone: vi.fn(),
      paymentMethod: 'mobile_money',
      setPaymentMethod: vi.fn(),
      paying: false,
      paymentStep: '',
      showPayment: false,
      requestDownload,
      handlePayForDownloads: vi.fn(),
      cancelPayment: vi.fn(),
    });
  });

  it('links to the CV design page', async () => {
    renderPanel();
    const link = await screen.findByRole('link', { name: /view & design my cv/i });
    expect(link).toHaveAttribute('href', '/account/cv');
  });

  it('shows download buttons', async () => {
    renderPanel();
    expect(await screen.findByRole('button', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download word/i })).toBeInTheDocument();
  });

  it('shows payment UI when hook exposes showPayment', async () => {
    useCvDownloadPayment.mockReturnValue({
      access: { enabled: true, priceZmw: 75 },
      accessLoading: false,
      downloadsUnlocked: false,
      canDownloadNow: false,
      priceZmw: 75,
      priceLabel: 'ZMW 75',
      phone: '',
      setPhone: vi.fn(),
      paymentMethod: 'mobile_money',
      setPaymentMethod: vi.fn(),
      paying: false,
      paymentStep: '',
      showPayment: true,
      requestDownload: vi.fn(),
      handlePayForDownloads: vi.fn(),
      cancelPayment: vi.fn(),
    });
    renderPanel();
    expect(await screen.findByText(/pay to download your cv/i)).toBeInTheDocument();
  });

  it('calls openCvForPrint when PDF is clicked and downloads are unlocked', async () => {
    requestDownload.mockImplementation((format, onAfterUnlock) => {
      onAfterUnlock?.(format);
    });
    useCvDownloadPayment.mockReturnValue({
      access: { enabled: true, priceZmw: 75 },
      accessLoading: false,
      downloadsUnlocked: true,
      canDownloadNow: true,
      priceZmw: 75,
      priceLabel: 'ZMW 75',
      phone: '',
      setPhone: vi.fn(),
      paymentMethod: 'mobile_money',
      setPaymentMethod: vi.fn(),
      paying: false,
      paymentStep: '',
      showPayment: false,
      requestDownload,
      handlePayForDownloads: vi.fn(),
      cancelPayment: vi.fn(),
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /download pdf/i }));
    expect(requestDownload).toHaveBeenCalledWith('pdf', expect.any(Function));
    expect(openCvForPrint).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ name: 'Test User' }),
      }),
    );
  });

  it('gates PDF download behind payment when not entitled', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /download pdf/i }));
    expect(requestDownload).toHaveBeenCalledWith('pdf', expect.any(Function));
    expect(openCvForPrint).not.toHaveBeenCalled();
  });

  it('throttles rapid PDF clicks when downloads are unlocked', async () => {
    requestDownload.mockImplementation((format, onAfterUnlock) => {
      onAfterUnlock?.(format);
    });
    useCvDownloadPayment.mockReturnValue({
      access: { enabled: true, priceZmw: 75 },
      accessLoading: false,
      downloadsUnlocked: true,
      canDownloadNow: true,
      priceZmw: 75,
      priceLabel: 'ZMW 75',
      phone: '',
      setPhone: vi.fn(),
      paymentMethod: 'mobile_money',
      setPaymentMethod: vi.fn(),
      paying: false,
      paymentStep: '',
      showPayment: false,
      requestDownload,
      handlePayForDownloads: vi.fn(),
      cancelPayment: vi.fn(),
    });
    renderPanel();
    const btn = await screen.findByRole('button', { name: /download pdf/i });
    vi.useFakeTimers();
    fireEvent.click(btn);
    fireEvent.click(btn);
    vi.useRealTimers();
    expect(openCvForPrint).toHaveBeenCalledTimes(1);
  });

  it('shows downloads unlocked badge when entitled', async () => {
    useCvDownloadPayment.mockReturnValue({
      access: { enabled: true, priceZmw: 75 },
      accessLoading: false,
      downloadsUnlocked: true,
      canDownloadNow: true,
      priceZmw: 75,
      priceLabel: 'ZMW 75',
      phone: '',
      setPhone: vi.fn(),
      paymentMethod: 'mobile_money',
      setPaymentMethod: vi.fn(),
      paying: false,
      paymentStep: '',
      showPayment: false,
      requestDownload: vi.fn(),
      handlePayForDownloads: vi.fn(),
      cancelPayment: vi.fn(),
    });
    renderPanel();
    expect(await screen.findByText(/downloads unlocked/i)).toBeInTheDocument();
  });
});
