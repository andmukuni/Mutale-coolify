import { useEffect } from 'react';
import {
  clearFieldInvalid,
  isHighlightableField,
  markFieldInvalid,
  markFormValidated,
} from '../utils/formFieldHighlight';

/**
 * System-wide: after a submit attempt, highlight native invalid fields
 * (required, type=email, etc.) and clear the highlight once the field is valid.
 */
export default function FormErrorHighlight() {
  useEffect(() => {
    const onInvalid = (event) => {
      const el = event.target;
      if (!isHighlightableField(el)) return;
      const form = el.closest('form');
      if (form) markFormValidated(form);
      markFieldInvalid(el);

      if (form && !form.dataset.firstInvalidFocused) {
        form.dataset.firstInvalidFocused = '1';
        requestAnimationFrame(() => {
          try {
            el.focus({ preventScroll: true });
          } catch {
            el.focus();
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          delete form.dataset.firstInvalidFocused;
        });
      }
    };

    const onSubmit = (event) => {
      const form = event.target;
      if (form?.tagName === 'FORM') markFormValidated(form);
    };

    const onInput = (event) => {
      const el = event.target;
      if (!isHighlightableField(el)) return;
      if (el.checkValidity?.()) clearFieldInvalid(el);
    };

    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);

    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onInput, true);
    };
  }, []);

  return null;
}
