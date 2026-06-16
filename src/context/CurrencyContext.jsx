/**
 * CurrencyContext — handles geo-based currency detection and conversion.
 * - Detects user location (Zambia vs international)
 * - Fetches live ZMW/USD exchange rate
 * - Provides formatPrice helper for dynamic currency display
 */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CurrencyContext = createContext(null);

// Fallback exchange rate if API fails (approximate ZMW to USD)
const FALLBACK_RATE = 0.038; // 1 ZMW ≈ 0.038 USD (roughly 26 ZMW = 1 USD)

// Cache exchange rate for 1 hour
const RATE_CACHE_MS = 60 * 60 * 1000;

// Check timezone immediately (synchronous)
function getInitialCurrencyState() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const isZambiaTimezone = tz.toLowerCase().includes('lusaka');
  
  // Check cached rate
  let cachedRate = null;
  let cachedTimestamp = null;
  try {
    const cached = localStorage.getItem('zmw_usd_rate');
    if (cached) {
      const { rate, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < RATE_CACHE_MS) {
        cachedRate = rate;
        cachedTimestamp = timestamp;
      }
    }
  } catch {
    // Ignore cache errors
  }

  return {
    code: isZambiaTimezone ? 'ZMW' : 'USD',
    symbol: isZambiaTimezone ? 'ZMW' : '$',
    isZambia: isZambiaTimezone,
    loading: !isZambiaTimezone, // Only need to fetch if not detected via timezone
    country: isZambiaTimezone ? 'ZM' : null,
    exchangeRate: cachedRate,
    rateLastFetched: cachedTimestamp,
  };
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(getInitialCurrencyState);

  // Detect user location via IP if not already detected
  useEffect(() => {
    // Skip if already detected as Zambia via timezone
    if (currency.country === 'ZM') return;

    const controller = new AbortController();

    fetch('https://ipapi.co/json/', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        const countryCode = (data?.country_code || data?.country || '').toUpperCase();
        const isZambia = countryCode === 'ZM';

        setCurrency(prev => ({
          ...prev,
          isZambia,
          code: isZambia ? 'ZMW' : 'USD',
          symbol: isZambia ? 'ZMW' : '$',
          country: countryCode || null,
          loading: false,
        }));
      })
      .catch(() => {
        // Default to Zambia on error
        setCurrency(prev => ({
          ...prev,
          isZambia: true,
          code: 'ZMW',
          symbol: 'ZMW',
          loading: false,
        }));
      });

    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch exchange rate for non-Zambian users
  useEffect(() => {
    if (currency.isZambia || currency.loading || currency.exchangeRate) return;

    fetch('https://api.exchangerate-api.com/v4/latest/ZMW')
      .then(res => res.json())
      .then(data => {
        const rate = data?.rates?.USD || FALLBACK_RATE;
        const timestamp = Date.now();

        // Cache the rate
        localStorage.setItem('zmw_usd_rate', JSON.stringify({ rate, timestamp }));

        setCurrency(prev => ({
          ...prev,
          exchangeRate: rate,
          rateLastFetched: timestamp,
        }));
      })
      .catch(() => {
        // Use fallback rate on error
        setCurrency(prev => ({
          ...prev,
          exchangeRate: FALLBACK_RATE,
          rateLastFetched: Date.now(),
        }));
      });
  }, [currency.isZambia, currency.loading, currency.exchangeRate]);

  /**
   * Format a price based on user's detected location.
   * @param {number} amountZMW - Price in ZMW
   * @param {boolean} isFree - Whether the event is free
   * @returns {string} Formatted price string
   */
  const formatPrice = useCallback((amountZMW, isFree = false) => {
    if (isFree) return 'Free';

    const amount = Number(amountZMW || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 'Free';

    if (currency.isZambia) {
      // Show in ZMW for Zambian users
      const hasDecimals = !Number.isInteger(amount);
      return `ZMW ${amount.toLocaleString('en-ZM', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2,
      })}`;
    }

    // Convert to USD for international users
    const rate = currency.exchangeRate || FALLBACK_RATE;
    const usdAmount = amount * rate;

    // Round to nearest cent
    const roundedUsd = Math.round(usdAmount * 100) / 100;

    return `$${roundedUsd.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USD`;
  }, [currency.isZambia, currency.exchangeRate]);

  const convertFromZMW = useCallback((amountZMW, targetCurrency = 'USD') => {
    const amount = Number(amountZMW || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;

    const normalizedTarget = String(targetCurrency || 'USD').toUpperCase();
    if (normalizedTarget === 'ZMW') return amount;

    const rate = currency.exchangeRate || FALLBACK_RATE;
    if (normalizedTarget === 'USD') {
      return Math.round(amount * rate * 100) / 100;
    }

    return amount;
  }, [currency.exchangeRate]);

  /**
   * Format price from an event object
   */
  const formatEventPrice = useCallback((event) => {
    if (!event) return 'Free';
    return formatPrice(event.price, event.is_free);
  }, [formatPrice]);

  /**
   * Get both ZMW and USD prices for display
   */
  const getPriceBoth = useCallback((amountZMW, isFree = false) => {
    if (isFree) return { zmw: 'Free', usd: 'Free', isFree: true };

    const amount = Number(amountZMW || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { zmw: 'Free', usd: 'Free', isFree: true };
    }

    const hasDecimals = !Number.isInteger(amount);
    const zmwFormatted = `ZMW ${amount.toLocaleString('en-ZM', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;

    const rate = currency.exchangeRate || FALLBACK_RATE;
    const usdAmount = Math.round(amount * rate * 100) / 100;
    const usdFormatted = `$${usdAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    return {
      zmw: zmwFormatted,
      usd: usdFormatted,
      isFree: false,
    };
  }, [currency.exchangeRate]);

  const value = {
    ...currency,
    formatPrice,
    formatEventPrice,
    getPriceBoth,
    convertFromZMW,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

export default CurrencyContext;
