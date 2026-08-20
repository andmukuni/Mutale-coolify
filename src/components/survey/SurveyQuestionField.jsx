export default function SurveyQuestionField({
  question,
  value,
  onChange,
  disabled = false,
}) {
  const required = Boolean(question.required);
  const label = (
    <span className="text-sm font-medium text-navy-800">
      {question.label}
      {required ? ' *' : ''}
    </span>
  );
  const help = question.help
    ? <p className="text-xs text-navy-400 mt-1">{question.help}</p>
    : null;

  const setValue = (next) => onChange?.(next);

  if (question.type === 'short_text') {
    return (
      <label className="block">
        {label}
        {help}
        <input
          type="text"
          className="mt-2 w-full rounded-xl border border-navy-200 px-3 py-2.5 text-sm"
          value={value || ''}
          onChange={(e) => setValue(e.target.value)}
          required={required}
          disabled={disabled}
        />
      </label>
    );
  }

  if (question.type === 'rating' || question.type === 'nps') {
    const min = question.type === 'nps' ? 0 : (Number(question.min) || 1);
    const max = question.type === 'nps' ? 10 : (Number(question.max) || 5);
    const options = [];
    for (let n = min; n <= max; n += 1) options.push(n);
    return (
      <fieldset className="block" disabled={disabled}>
        <legend className="text-sm font-medium text-navy-800">
          {question.label}
          {required ? ' *' : ''}
        </legend>
        {help}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((n) => {
            const selected = String(value) === String(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => setValue(n)}
                className={`min-w-9 h-9 px-2 rounded-lg border text-sm font-medium ${
                  selected
                    ? 'bg-cyan-600 text-white border-cyan-600'
                    : 'bg-white text-navy-700 border-navy-200 hover:border-cyan-400'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (question.type === 'yes_no' || question.type === 'choice') {
    const options = question.options || (question.type === 'yes_no' ? ['Yes', 'No'] : []);
    return (
      <fieldset className="block" disabled={disabled}>
        <legend className="text-sm font-medium text-navy-800">
          {question.label}
          {required ? ' *' : ''}
        </legend>
        {help}
        <div className="mt-2 space-y-2">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-navy-700">
              <input
                type="radio"
                name={question.id}
                value={option}
                checked={String(value || '') === option}
                onChange={() => setValue(option)}
                required={required}
                disabled={disabled}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.type === 'multi_choice') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="block" disabled={disabled}>
        <legend className="text-sm font-medium text-navy-800">
          {question.label}
          {required ? ' *' : ''}
        </legend>
        {help}
        <div className="mt-2 space-y-2">
          {(question.options || []).map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={option} className="flex items-center gap-2 text-sm text-navy-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setValue(checked
                      ? selected.filter((item) => item !== option)
                      : [...selected, option]);
                  }}
                  disabled={disabled}
                />
                {option}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <label className="block">
      {label}
      {help}
      <textarea
        className="mt-2 w-full rounded-xl border border-navy-200 px-3 py-2.5 text-sm min-h-[90px]"
        value={value || ''}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}
