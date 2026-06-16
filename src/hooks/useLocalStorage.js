import { useState, useEffect } from 'react';
import { getFromLocalStorage, saveToLocalStorage } from '../utils/helpers';

export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => getFromLocalStorage(key, defaultValue));

  useEffect(() => {
    saveToLocalStorage(key, value);
  }, [key, value]);

  // Keep state in sync across tabs/windows and page instances.
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== key) return;
      setValue(getFromLocalStorage(key, defaultValue));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key, defaultValue]);

  return [value, setValue];
}
