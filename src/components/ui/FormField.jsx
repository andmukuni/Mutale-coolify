import { cloneElement, isValidElement, useId } from 'react';
import { FIELD_ERROR_CLASS, fieldControlClass } from '../../utils/formFieldHighlight';

export default function FormField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  textarea = false,
  rows = 4,
  placeholder = '',
  error = '',
  helpText = '',
  helpLink = null,
  disabled = false,
  options = [],
  min,
  max,
  step,
  maxLength,
  autoComplete,
  children,
  onClearError,
}) {
  const uid = useId();
  const fieldId = name || `field-${uid}`;
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  const hasError = Boolean(error);
  const showHelp = Boolean(helpText || helpLink) && !hasError;
  const baseClass = `${fieldControlClass(hasError)} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  const handleChange = (event) => {
    if (hasError) onClearError?.(name || fieldId);
    onChange?.(event);
  };

  // The error replaces the help text, so point at whichever one is shown.
  const describedBy = hasError ? errorId : (showHelp ? helpId : undefined);

  const renderInput = () => {
    if (children) {
      if (!isValidElement(children)) return children;
      const childClass = [children.props.className, hasError ? FIELD_ERROR_CLASS : '']
        .filter(Boolean)
        .join(' ');
      return cloneElement(children, {
        id: children.props.id || fieldId,
        'aria-invalid': hasError || children.props['aria-invalid'],
        'aria-describedby': describedBy || children.props['aria-describedby'],
        className: childClass,
        onChange: (event) => {
          if (hasError) onClearError?.(name || fieldId);
          children.props.onChange?.(event);
        },
      });
    }

    if (type === 'select') {
      return (
        <select
          id={fieldId}
          name={name}
          value={value}
          onChange={handleChange}
          required={required}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={baseClass}
        >
          {options.map((opt) => {
            const optValue = typeof opt === 'string' ? opt : opt.value;
            const optLabel = typeof opt === 'string' ? opt : opt.label;
            return (
              <option key={optValue} value={optValue}>
                {optLabel}
              </option>
            );
          })}
        </select>
      );
    }

    if (textarea || type === 'textarea') {
      return (
        <textarea
          id={fieldId}
          name={name}
          value={value}
          onChange={handleChange}
          required={required}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={`${baseClass} min-h-[6.5rem] resize-y overflow-auto`}
        />
      );
    }

    return (
      <input
        id={fieldId}
        name={name}
        type={type}
        value={value}
        onChange={handleChange}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className={baseClass}
      />
    );
  };

  return (
    <div data-field-wrapper={name || undefined}>
      {label && (
        <label
          htmlFor={fieldId}
          className={`block text-sm font-medium mb-1.5 ${hasError ? 'text-red-700 dark:text-red-300' : 'text-navy-700'}`}
        >
          {label} {required && <span className="text-red-700 dark:text-red-300">*</span>}
        </label>
      )}
      {renderInput()}
      {hasError && (
        <p id={errorId} className="mt-1 text-xs text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}
      {showHelp && (
        <p id={helpId} className="mt-1 text-xs text-navy-600">
          {helpText}
          {helpText && helpLink ? ' ' : null}
          {helpLink?.href && helpLink?.label ? (
            <a
              href={helpLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-700 hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200 hover:underline font-medium"
            >
              {helpLink.label}
            </a>
          ) : null}
        </p>
      )}
    </div>
  );
}
