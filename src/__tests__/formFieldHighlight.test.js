import { describe, expect, it } from 'vitest';
import {
  FIELD_ERROR_CLASS,
  fieldControlClass,
  firstFieldErrorKey,
  inferFieldErrors,
  isHighlightableField,
} from '../utils/formFieldHighlight';

describe('formFieldHighlight', () => {
  it('applies error classes when a field is invalid', () => {
    expect(fieldControlClass(true)).toContain(FIELD_ERROR_CLASS);
    expect(fieldControlClass(false)).not.toContain('field-has-error');
  });

  it('skips non-text controls', () => {
    expect(isHighlightableField({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isHighlightableField({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isHighlightableField({ tagName: 'TEXTAREA', type: 'textarea' })).toBe(true);
  });

  it('maps messages onto matching field names', () => {
    expect(inferFieldErrors('Title is required.', ['title', 'slug'])).toEqual({
      title: 'Title is required.',
    });
    expect(firstFieldErrorKey({ slug: '', title: 'Event title is required.' })).toBe('title');
  });
});
