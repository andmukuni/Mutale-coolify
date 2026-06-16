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
}) {
  const baseClass = `w-full px-4 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
    error
      ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-300'
      : 'border-navy-200 bg-navy-50 text-navy-900 placeholder-navy-400'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  const renderInput = () => {
    if (type === 'select') {
      return (
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
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

    if (textarea) {
      return (
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          className={`${baseClass} resize-none`}
        />
      );
    }

    return (
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={baseClass}
      />
    );
  };

  return (
    <div>
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium text-navy-700 mb-1.5"
        >
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      {renderInput()}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {(helpText || helpLink) && !error && (
        <p className="mt-1 text-xs text-navy-400">
          {helpText}
          {helpText && helpLink ? ' ' : null}
          {helpLink?.href && helpLink?.label ? (
            <a
              href={helpLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 hover:text-cyan-700 hover:underline font-medium"
            >
              {helpLink.label}
            </a>
          ) : null}
        </p>
      )}
    </div>
  );
}
