import { useEffect, useState } from 'react';

/**
 * @param {T} value
 * @param {number} delayMs
 * @returns {T}
 * @template T
 */
export function useDebouncedValue(value, delayMs = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
