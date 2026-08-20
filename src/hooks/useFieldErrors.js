import { useCallback, useEffect, useRef, useState } from 'react';
import { firstFieldErrorKey, focusFieldByName } from '../utils/formFieldHighlight';

export function useFieldErrors() {
  const [fieldErrors, setFieldErrors] = useState({});
  const pendingFocusRef = useRef(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    const key = firstFieldErrorKey(fieldErrors);
    if (key) focusFieldByName(key, rootRef.current || document);
  }, [fieldErrors]);

  const setErrors = useCallback((errors) => {
    const next = errors && typeof errors === 'object' ? errors : {};
    pendingFocusRef.current = Object.keys(next).some((key) => Boolean(next[key]));
    setFieldErrors(next);
  }, []);

  const clearAll = useCallback(() => {
    pendingFocusRef.current = false;
    setFieldErrors({});
  }, []);

  const clearField = useCallback((name) => {
    if (!name) return;
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const bindChange = useCallback((onChange) => (event) => {
    const name = event?.target?.name;
    if (name) clearField(name);
    onChange?.(event);
  }, [clearField]);

  return {
    fieldErrors,
    setErrors,
    clearField,
    clearAll,
    bindChange,
    rootRef,
  };
}
