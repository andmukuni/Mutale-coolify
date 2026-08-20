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
    type: 'text',
    label: 'What did you find most valuable?',
    required: true,
  },
  {
    id: 'improve',
    type: 'text',
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

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || '')) || fallback;
  } catch {
    return fallback;
  }
}

export async function ensureEventSurveySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_survey_responses (
      id VARCHAR(90) PRIMARY KEY,
      event_id VARCHAR(80) NOT NULL,
      registration_id VARCHAR(90) NOT NULL,
      reference_code VARCHAR(80) NOT NULL,
      answers JSON NOT NULL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_event_survey_registration (registration_id),
      INDEX idx_event_survey_event (event_id),
      INDEX idx_event_survey_reference (reference_code)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_survey_analyses (
      id VARCHAR(90) PRIMARY KEY,
      event_id VARCHAR(80) NOT NULL,
      model VARCHAR(80) NULL,
      summary JSON NOT NULL,
      response_count INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_event_survey_analysis (event_id)
    )
  `);
}

export function getEventSurveyQuestions() {
  return DEFAULT_EVENT_SURVEY_QUESTIONS;
}

export function validateSurveyAnswers(answers = {}) {
  const normalized = {};
  for (const question of DEFAULT_EVENT_SURVEY_QUESTIONS) {
    const raw = answers[question.id];
    if (question.type === 'rating') {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < question.min || value > question.max) {
        if (question.required) {
          return { ok: false, message: `Please rate the event from ${question.min} to ${question.max}.` };
        }
        continue;
      }
      normalized[question.id] = value;
      continue;
    }
    const text = String(raw || '').trim();
    if (question.required && !text) {
      return { ok: false, message: `Please answer: ${question.label}` };
    }
    if (question.type === 'choice' && text && !(question.options || []).includes(text)) {
      return { ok: false, message: `Choose a valid option for: ${question.label}` };
    }
    if (text) normalized[question.id] = text.slice(0, 4000);
  }
  return { ok: true, answers: normalized };
}

export async function loadSurveyResponse(pool, registrationId) {
  const [[row]] = await pool.query(
    'SELECT * FROM event_survey_responses WHERE registration_id = ? LIMIT 1',
    [String(registrationId || '')],
  );
  return row || null;
}

export async function submitSurveyResponse(pool, {
  eventId,
  registrationId,
  referenceCode,
  answers,
}) {
  const validated = validateSurveyAnswers(answers);
  if (!validated.ok) return validated;

  const existing = await loadSurveyResponse(pool, registrationId);
  if (existing) {
    return { ok: false, status: 409, message: 'You have already submitted this survey.' };
  }

  const id = newId('survey');
  await pool.query(
    `INSERT INTO event_survey_responses (id, event_id, registration_id, reference_code, answers)
     VALUES (?, ?, ?, ?, ?)`,
    [id, eventId, registrationId, referenceCode, JSON.stringify(validated.answers)],
  );

  return { ok: true, id, answers: validated.answers };
}

export async function listEventSurveyResults(pool, eventId) {
  const [rows] = await pool.query(
    `SELECT r.*, er.booked_for_name, er.user_name, er.attended_at
     FROM event_survey_responses r
     LEFT JOIN event_registrations er ON er.id = r.registration_id
     WHERE r.event_id = ?
     ORDER BY r.submitted_at DESC`,
    [eventId],
  );
  const responses = (rows || []).map((row) => ({
    id: row.id,
    registration_id: row.registration_id,
    reference_code: row.reference_code,
    attendee_name: row.booked_for_name || row.user_name || 'Attendee',
    attended_at: row.attended_at || null,
    answers: parseJson(row.answers, {}),
    submitted_at: row.submitted_at,
  }));

  const [[analysis]] = await pool.query(
    'SELECT * FROM event_survey_analyses WHERE event_id = ? LIMIT 1',
    [eventId],
  );

  const ratings = responses
    .map((item) => Number(item.answers?.rating))
    .filter((value) => Number.isFinite(value));
  const averageRating = ratings.length
    ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10
    : null;

  return {
    questions: DEFAULT_EVENT_SURVEY_QUESTIONS,
    responses,
    response_count: responses.length,
    average_rating: averageRating,
    analysis: analysis
      ? {
        id: analysis.id,
        model: analysis.model,
        summary: parseJson(analysis.summary, {}),
        response_count: analysis.response_count,
        updated_at: analysis.updated_at,
      }
      : null,
  };
}

export async function analyzeEventSurveyWithAI({
  pool,
  event,
  apiKey,
  model = 'gpt-4o-mini',
  fetchImpl = fetch,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) {
    return { ok: false, status: 400, message: 'OpenAI API key is missing. Add it in Admin → Settings → Integrations.' };
  }

  const results = await listEventSurveyResults(pool, event.id);
  if (!results.response_count) {
    return { ok: false, status: 400, message: 'No survey responses to analyze yet.' };
  }

  const payload = results.responses.map((item) => ({
    attendee: item.attendee_name,
    answers: item.answers,
  }));

  const prompt = [
    `Analyze post-event survey responses for "${event.title || 'this event'}".`,
    'Return compact JSON only with keys:',
    'headline (string), sentiment (positive|mixed|negative),',
    'average_rating (number or null), themes (array of {theme, count, evidence}),',
    'highlights (string[]), improvements (string[]), recommendation (string).',
    'Use only the responses. Do not invent attendees.',
    '',
    JSON.stringify(payload).slice(0, 12000),
  ].join('\n');

  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: String(model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a concise event-feedback analyst. Reply with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      message: data?.error?.message || `OpenAI request failed (HTTP ${response.status}).`,
    };
  }

  const summary = parseJson(data?.choices?.[0]?.message?.content, {});
  if (!summary || typeof summary !== 'object' || !summary.headline) {
    return { ok: false, status: 502, message: 'OpenAI returned an unusable analysis.' };
  }

  const id = newId('surveyai');
  await pool.query(
    `INSERT INTO event_survey_analyses (id, event_id, model, summary, response_count)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       model = VALUES(model),
       summary = VALUES(summary),
       response_count = VALUES(response_count)`,
    [id, event.id, model, JSON.stringify(summary), results.response_count],
  );

  return {
    ok: true,
    analysis: {
      id,
      model,
      summary,
      response_count: results.response_count,
      updated_at: new Date().toISOString(),
    },
  };
}
