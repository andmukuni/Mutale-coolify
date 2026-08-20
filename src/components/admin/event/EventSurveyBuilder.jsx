import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  SURVEY_QUESTION_TYPES,
  cloneDefaultSurveyQuestions,
  createSurveyQuestion,
  surveyQuestionTypeLabel,
} from '../../../../shared/eventSurveyQuestions.js';
import SurveyQuestionField from '../../survey/SurveyQuestionField';

export default function EventSurveyBuilder({
  questions = [],
  onChange,
  disabled = false,
}) {
  const update = (next) => onChange?.(next);

  const addQuestion = (type) => {
    update([...(questions || []), createSurveyQuestion(type)]);
  };

  const patchQuestion = (index, patch) => {
    const next = [...questions];
    next[index] = { ...next[index], ...patch };
    update(next);
  };

  const moveQuestion = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    update(next);
  };

  const removeQuestion = (index) => {
    update(questions.filter((_, i) => i !== index));
  };

  const changeType = (index, type) => {
    const current = questions[index] || {};
    const created = createSurveyQuestion(type);
    patchQuestion(index, {
      type: created.type,
      min: created.min,
      max: created.max,
      options: created.options || current.options,
      required: current.required,
      label: current.label,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy-900">Guest survey questions</h3>
        <p className="text-xs text-navy-500 mt-1">
          Guests see these after the event ends. Add, reorder, and choose a type the way you would in Forms or SurveyMonkey.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SURVEY_QUESTION_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            disabled={disabled}
            onClick={() => addQuestion(type.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-navy-200 bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-cyan-400 hover:text-cyan-700 disabled:opacity-50"
          >
            <Plus size={12} />
            {type.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => update(cloneDefaultSurveyQuestions())}
          className="inline-flex items-center gap-1 rounded-lg border border-navy-200 bg-navy-50 px-2.5 py-1.5 text-xs font-medium text-navy-600 hover:bg-navy-100 disabled:opacity-50"
        >
          <RotateCcw size={12} />
          Starter questions
        </button>
      </div>

      {(questions || []).length === 0 && (
        <p className="text-sm text-navy-400 italic rounded-xl border border-dashed border-navy-200 p-4">
          No questions yet. Add a type above, or restore the starter set.
        </p>
      )}

      <div className="space-y-3">
        {(questions || []).map((question, index) => (
          <div key={question.id || index} className="rounded-xl border border-navy-100 bg-navy-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-navy-500">
                Question {index + 1}
                <span className="ml-2 font-normal text-navy-400">{surveyQuestionTypeLabel(question.type)}</span>
              </p>
              <div className="flex items-center gap-1">
                <button type="button" disabled={disabled || index === 0} onClick={() => moveQuestion(index, -1)} className="p-1 text-navy-400 hover:text-navy-700 disabled:opacity-30" aria-label="Move up">
                  <ChevronUp size={15} />
                </button>
                <button type="button" disabled={disabled || index === questions.length - 1} onClick={() => moveQuestion(index, 1)} className="p-1 text-navy-400 hover:text-navy-700 disabled:opacity-30" aria-label="Move down">
                  <ChevronDown size={15} />
                </button>
                <button type="button" disabled={disabled} onClick={() => removeQuestion(index)} className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30" aria-label="Delete question">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-navy-700">Question title</span>
                <input
                  type="text"
                  disabled={disabled}
                  value={question.label || ''}
                  onChange={(e) => patchQuestion(index, { label: e.target.value })}
                  placeholder="Ask something specific"
                  className="mt-1.5 w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-navy-700">Type</span>
                <select
                  disabled={disabled}
                  value={question.type}
                  onChange={(e) => changeType(index, e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm"
                >
                  {SURVEY_QUESTION_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 mt-6 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={Boolean(question.required)}
                  onChange={(e) => patchQuestion(index, { required: e.target.checked })}
                  className="h-4 w-4 rounded border-navy-300 text-cyan-600"
                />
                <span className="text-sm text-navy-700">Required</span>
              </label>
            </div>

            {(question.type === 'choice' || question.type === 'multi_choice') && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-navy-600">Choices</p>
                {(question.options || []).map((option, optionIndex) => (
                  <div key={`${question.id}-opt-${optionIndex}`} className="flex items-center gap-2">
                    <input
                      type="text"
                      disabled={disabled}
                      value={option}
                      onChange={(e) => {
                        const options = [...(question.options || [])];
                        options[optionIndex] = e.target.value;
                        patchQuestion(index, { options });
                      }}
                      className="flex-1 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      disabled={disabled || (question.options || []).length <= 2}
                      onClick={() => patchQuestion(index, {
                        options: (question.options || []).filter((_, i) => i !== optionIndex),
                      })}
                      className="text-xs text-red-400 hover:text-red-600 disabled:opacity-30"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => patchQuestion(index, {
                    options: [...(question.options || []), `Option ${(question.options || []).length + 1}`],
                  })}
                  className="text-xs font-medium text-cyan-700 hover:text-cyan-600"
                >
                  + Add choice
                </button>
              </div>
            )}

            {question.type === 'rating' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium text-navy-700">From</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    disabled={disabled}
                    value={question.min ?? 1}
                    onChange={(e) => patchQuestion(index, { min: Number(e.target.value) })}
                    className="mt-1.5 w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-navy-700">To</span>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    disabled={disabled}
                    value={question.max ?? 5}
                    onChange={(e) => patchQuestion(index, { max: Number(e.target.value) })}
                    className="mt-1.5 w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            {question.label && (
              <div className="rounded-xl border border-dashed border-navy-200 bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-navy-400 mb-2">Guest preview</p>
                <SurveyQuestionField question={question} value="" onChange={() => {}} disabled />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
