export const SURVEY_QUESTION_TYPES = [
  { id: 'short_text', label: 'Short answer', hint: 'Single line' },
  { id: 'long_text', label: 'Long answer', hint: 'Paragraph' },
  { id: 'rating', label: 'Rating scale', hint: '1 to 5' },
  { id: 'nps', label: 'Score 0–10', hint: 'Net Promoter style' },
  { id: 'choice', label: 'Multiple choice', hint: 'Pick one' },
  { id: 'multi_choice', label: 'Checkboxes', hint: 'Pick many' },
  { id: 'yes_no', label: 'Yes / No', hint: 'Two options' },
];

const TYPE_IDS = new Set(SURVEY_QUESTION_TYPES.map((item) => item.id));

export const DEFAULT_EVENT_SURVEY_QUESTIONS = [
  {
    id: 'rating',
    type: 'rating',
    label: 'How would you rate this event overall?',
    required: true,
    min: 1,
    max: 5,
  },
  {
    id: 'valuable',
    type: 'long_text',
    label: 'What did you find most valuable?',
    required: true,
  },
  {
    id: 'improve',
    type: 'long_text',
    label: 'What could we improve for next time?',
    required: false,
  },
  {
    id: 'recommend',
    type: 'choice',
    label: 'Would you recommend this event to a colleague?',
    required: true,
    options: ['Yes', 'Maybe', 'No'],
  },
];

export function surveyQuestionTypeLabel(type) {
  return SURVEY_QUESTION_TYPES.find((item) => item.id === type)?.label || 'Question';
}

export function cloneDefaultSurveyQuestions() {
  return DEFAULT_EVENT_SURVEY_QUESTIONS.map((question) => ({
    ...question,
    options: Array.isArray(question.options) ? [...question.options] : undefined,
  }));
}

export function createSurveyQuestion(type = 'long_text') {
  const normalized = normalizeQuestionType(type);
  const question = {
    id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: normalized,
    label: '',
    required: normalized !== 'long_text',
  };
  if (normalized === 'rating') {
    question.min = 1;
    question.max = 5;
  }
  if (normalized === 'nps') {
    question.min = 0;
    question.max = 10;
  }
  if (normalized === 'choice' || normalized === 'multi_choice') {
    question.options = ['Option 1', 'Option 2'];
  }
  if (normalized === 'yes_no') {
    question.options = ['Yes', 'No'];
  }
  return question;
}

export function normalizeQuestionType(type) {
  const value = String(type || '').trim();
  if (value === 'text') return 'long_text';
  if (TYPE_IDS.has(value)) return value;
  return 'long_text';
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [];
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueOptions(options = []) {
  const seen = new Set();
  const out = [];
  for (const raw of options) {
    const text = String(raw || '').trim().slice(0, 120);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeSurveyQuestion(raw = {}, index = 0) {
  const type = normalizeQuestionType(raw.type);
  const id = String(raw.id || `q${index + 1}`).trim().slice(0, 80) || `q${index + 1}`;
  const question = {
    id,
    type,
    label: String(raw.label || '').trim().slice(0, 240),
    required: Boolean(raw.required),
  };
  const help = String(raw.help || '').trim().slice(0, 240);
  if (help) question.help = help;

  if (type === 'rating') {
    const min = Number(raw.min);
    const max = Number(raw.max);
    question.min = Number.isFinite(min) ? Math.max(0, Math.min(1, Math.round(min))) : 1;
    question.max = Number.isFinite(max) ? Math.max(question.min + 1, Math.min(10, Math.round(max))) : 5;
  }
  if (type === 'nps') {
    question.min = 0;
    question.max = 10;
  }
  if (type === 'choice' || type === 'multi_choice') {
    const options = uniqueOptions(raw.options);
    question.options = options.length >= 2 ? options : ['Option 1', 'Option 2'];
  }
  if (type === 'yes_no') {
    question.options = ['Yes', 'No'];
  }
  return question;
}

export function normalizeSurveyQuestions(value, { fallbackToDefault = false } = {}) {
  const list = parseJsonList(value)
    .map((item, index) => normalizeSurveyQuestion(item, index))
    .filter((item) => item.id);
  const seen = new Set();
  const unique = [];
  for (const question of list) {
    let id = question.id;
    if (seen.has(id)) id = `${id}-${unique.length + 1}`;
    seen.add(id);
    unique.push({ ...question, id });
    if (unique.length >= 30) break;
  }
  if (!unique.length && fallbackToDefault) return cloneDefaultSurveyQuestions();
  return unique;
}

export function resolveEventSurveyQuestions(event = {}) {
  return normalizeSurveyQuestions(event?.survey_questions, { fallbackToDefault: true });
}

export function validateSurveyQuestionList(questions = []) {
  const normalized = normalizeSurveyQuestions(questions);
  if (!normalized.length) {
    return { ok: false, message: 'Add at least one survey question, or restore the starter questions.' };
  }
  for (const [index, question] of normalized.entries()) {
    if (!question.label) {
      return { ok: false, message: `Question ${index + 1} needs a title.` };
    }
    if ((question.type === 'choice' || question.type === 'multi_choice') && (question.options || []).length < 2) {
      return { ok: false, message: `Question ${index + 1} needs at least two choices.` };
    }
  }
  return { ok: true, questions: normalized };
}

export function formatSurveyAnswerValue(question, raw) {
  if (question?.type === 'multi_choice') {
    const selected = Array.isArray(raw)
      ? raw
      : String(raw || '').split(',').map((item) => item.trim()).filter(Boolean);
    return selected.join(', ');
  }
  if (raw == null || raw === '') return '';
  return String(raw);
}

export function firstScaleQuestion(questions = []) {
  return (questions || []).find((question) => question.type === 'rating' || question.type === 'nps') || null;
}

export function computeSurveyAverageRating(responses = [], questions = []) {
  const scale = firstScaleQuestion(questions);
  if (!scale) return { average: null, max: null };
  const values = responses
    .map((item) => Number(item.answers?.[scale.id]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return { average: null, max: scale.max || 5 };
  const average = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  return { average, max: scale.max || 5 };
}

export function validateSurveyAnswers(answers = {}, questions = DEFAULT_EVENT_SURVEY_QUESTIONS) {
  const normalized = {};
  for (const question of normalizeSurveyQuestions(questions, { fallbackToDefault: true })) {
    const raw = answers[question.id];
    if (question.type === 'rating' || question.type === 'nps') {
      const value = Number(raw);
      const min = Number.isFinite(question.min) ? question.min : (question.type === 'nps' ? 0 : 1);
      const max = Number.isFinite(question.max) ? question.max : (question.type === 'nps' ? 10 : 5);
      if (!Number.isFinite(value) || value < min || value > max) {
        if (question.required) {
          return { ok: false, message: `Please answer: ${question.label || 'rating'}` };
        }
        continue;
      }
      normalized[question.id] = value;
      continue;
    }
    if (question.type === 'multi_choice') {
      const selected = (Array.isArray(raw) ? raw : [raw])
        .map((item) => String(item || '').trim())
        .filter((item) => (question.options || []).includes(item));
      if (question.required && !selected.length) {
        return { ok: false, message: `Please answer: ${question.label}` };
      }
      if (selected.length) normalized[question.id] = selected;
      continue;
    }
    const text = String(raw || '').trim();
    if (question.required && !text) {
      return { ok: false, message: `Please answer: ${question.label}` };
    }
    if ((question.type === 'choice' || question.type === 'yes_no') && text && !(question.options || []).includes(text)) {
      return { ok: false, message: `Choose a valid option for: ${question.label}` };
    }
    if (text) normalized[question.id] = text.slice(0, 4000);
  }
  return { ok: true, answers: normalized };
}
