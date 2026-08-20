export const FORM_VALIDATED_CLASS = 'was-validated';
export const FIELD_HAS_ERROR_CLASS = 'field-has-error';

export const FIELD_BASE_CLASS =
  'w-full px-4 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:border-transparent';

export const FIELD_OK_CLASS =
  'border-navy-200 bg-navy-50 text-navy-900 placeholder-navy-400 focus:ring-cyan-500';

export const FIELD_ERROR_CLASS =
  'border-red-400 bg-red-50 text-red-900 placeholder-red-300 focus:ring-red-400 ring-1 ring-red-200 field-has-error';

const SKIP_TYPES = new Set([
  'checkbox',
  'radio',
  'hidden',
  'file',
  'submit',
  'button',
  'reset',
  'image',
]);

export function isHighlightableField(el) {
  if (!el || !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return false;
  return !SKIP_TYPES.has(String(el.type || '').toLowerCase());
}

export function fieldControlClass(hasError, extra = '') {
  return [FIELD_BASE_CLASS, hasError ? FIELD_ERROR_CLASS : FIELD_OK_CLASS, extra]
    .filter(Boolean)
    .join(' ');
}

export function markFormValidated(form) {
  if (!form || form.tagName !== 'FORM') return;
  form.classList.add(FORM_VALIDATED_CLASS);
}

export function markFieldInvalid(el) {
  if (!isHighlightableField(el)) return;
  el.classList.add(FIELD_HAS_ERROR_CLASS);
  el.setAttribute('aria-invalid', 'true');
}

export function clearFieldInvalid(el) {
  if (!el) return;
  el.classList.remove(FIELD_HAS_ERROR_CLASS);
  if (el.checkValidity?.()) {
    el.removeAttribute('aria-invalid');
  }
}

export function focusFieldByName(name, root = document) {
  const key = String(name || '').trim();
  if (!key || !root?.querySelector) return null;

  let el = null;
  try {
    el = root.querySelector(`#${CSS.escape(key)}`)
      || root.querySelector(`[name="${CSS.escape(key)}"]`)
      || root.querySelector(`[data-field="${CSS.escape(key)}"]`);
  } catch {
    el = root.getElementById?.(key) || null;
  }

  if (!el) return null;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof el.focus === 'function') {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
  return el;
}

export function firstFieldErrorKey(errors = {}) {
  return Object.keys(errors).find((key) => Boolean(errors[key])) || '';
}

/** Map a free-text error to known field names when the message mentions them. */
export function inferFieldErrors(message, fieldKeys = []) {
  const msg = String(message || '').trim();
  if (!msg) return {};
  const lower = msg.toLowerCase();
  const errors = {};
  for (const key of fieldKeys) {
    const name = String(key || '').trim();
    if (!name) continue;
    const label = name.replace(/[_-]+/g, ' ');
    if (lower.includes(name.toLowerCase()) || lower.includes(label)) {
      errors[name] = msg;
    }
  }
  return errors;
}
