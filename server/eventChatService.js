/**
 * Event-creation chatbot helpers.
 * Interview logic and draft merge are testable without calling OpenAI.
 */

export const EVENT_CHAT_CATEGORIES = [
  'Workshop',
  'Seminar',
  'Training',
  'Conference',
  'Masterclass',
  'Review',
  'Webinar',
  'Meeting',
  'Other',
];

export const REQUIRED_EVENT_DRAFT_FIELDS = [
  'title',
  'description',
  'location',
  'start_date',
  'end_date',
  'registration_deadline',
  'registration_deadline_time',
];

const ALLOWED_DRAFT_KEYS = [
  'title',
  'slug',
  'short_description',
  'description',
  'cover_image',
  'event_mode',
  'meeting_platform',
  'meeting_link',
  'venue',
  'location',
  'start_date',
  'end_date',
  'start_time',
  'end_time',
  'timezone',
  'capacity',
  'booking_type',
  'price',
  'is_free',
  'status',
  'registration_deadline',
  'registration_deadline_time',
  'visibility',
  'organizer_name',
  'organizer_email',
  'organizer_phone',
  'category',
  'featured',
  'featured_speakers',
  'featured_guests',
  'partners',
  'forum_enabled',
];

const CATEGORY_COVERS = {
  Workshop: 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=800&q=80',
  Seminar: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80',
  Training: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=800&q=80',
  Conference: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
  Masterclass: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80',
  Review: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80',
  Webinar: 'https://images.unsplash.com/photo-1588196749597-9ff075ee6b5b?auto=format&fit=crop&w=800&q=80',
  Meeting: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80',
  Other: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80',
};

const sessions = new Map();

export function generateEventSlug(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function coverImageForCategory(category) {
  const key = String(category || '').trim();
  return CATEGORY_COVERS[key] || CATEGORY_COVERS.Other;
}

export function createEmptyDraft() {
  return {
    title: '',
    slug: '',
    short_description: '',
    description: '',
    cover_image: '',
    event_mode: '',
    meeting_platform: 'zoom',
    meeting_link: '',
    venue: '',
    location: '',
    start_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    timezone: 'Africa/Lusaka',
    capacity: '',
    booking_type: 'subscription',
    price: 0,
    is_free: true,
    status: 'draft',
    registration_deadline: '',
    registration_deadline_time: '',
    visibility: 'public',
    organizer_name: '',
    organizer_email: '',
    organizer_phone: '',
    category: '',
    featured: false,
    featured_speakers: [],
    featured_guests: [],
    partners: [],
    forum_enabled: false,
  };
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'free'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'paid'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTimeInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

export function mergeEventDraft(current = {}, patch = {}) {
  const next = { ...createEmptyDraft(), ...(current || {}) };
  const incoming = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};

  for (const key of ALLOWED_DRAFT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    const value = incoming[key];
    if (value == null) continue;
    if (['start_date', 'end_date', 'registration_deadline'].includes(key)) {
      const normalized = normalizeDateInput(value);
      if (normalized) next[key] = normalized;
      continue;
    }
    if (['start_time', 'end_time', 'registration_deadline_time'].includes(key)) {
      const normalized = normalizeTimeInput(value);
      if (normalized) next[key] = normalized;
      continue;
    }
    if (key === 'is_free' || key === 'featured' || key === 'forum_enabled') {
      next[key] = toBoolean(value, next[key]);
      continue;
    }
    if (key === 'price' || key === 'capacity') {
      if (value === '' || value == null) {
        next[key] = key === 'price' ? 0 : '';
      } else {
        next[key] = Number(value);
      }
      continue;
    }
    if (['featured_speakers', 'featured_guests', 'partners'].includes(key)) {
      next[key] = Array.isArray(value) ? value : next[key];
      continue;
    }
    next[key] = typeof value === 'string' ? value.trim() : value;
  }

  if (incoming.title && (!incoming.slug || incoming.slug === current.slug)) {
    next.slug = generateEventSlug(next.title);
  }

  return next;
}

export function applyDraftDefaults(draft = {}) {
  const next = { ...createEmptyDraft(), ...(draft || {}) };
  if (next.title && !next.slug) next.slug = generateEventSlug(next.title);
  if (!next.category) next.category = 'Workshop';
  if (!EVENT_CHAT_CATEGORIES.includes(next.category)) next.category = 'Other';
  if (!next.cover_image) next.cover_image = coverImageForCategory(next.category);
  if (!next.event_mode) next.event_mode = 'virtual';
  if (next.event_mode === 'in_person') {
    next.meeting_platform = '';
    next.meeting_link = '';
  } else if (!next.meeting_platform) {
    next.meeting_platform = 'zoom';
  }
  if (!next.timezone) next.timezone = 'Africa/Lusaka';
  next.status = 'draft';
  next.booking_type = next.booking_type || 'subscription';
  next.visibility = next.visibility || 'public';
  if (Number(next.price) > 0) next.is_free = false;
  if (next.is_free) next.price = 0;
  if (next.start_date && !next.end_date) next.end_date = next.start_date;
  if (!next.short_description && next.description) {
    next.short_description = String(next.description).replace(/\s+/g, ' ').trim().slice(0, 180);
  }
  return next;
}

export function listMissingEventFields(draft = {}) {
  const prepared = applyDraftDefaults(draft);
  const missing = [];
  for (const field of REQUIRED_EVENT_DRAFT_FIELDS) {
    if (!String(prepared[field] || '').trim()) missing.push(field);
  }
  if (!prepared.is_free && !(Number(prepared.price) > 0)) missing.push('price');
  if (prepared.event_mode === 'in_person' && !String(prepared.venue || '').trim() && !String(prepared.location || '').trim()) {
    missing.push('venue');
  }
  return missing;
}

export function assertDraftReadyToCreate(draft = {}) {
  const prepared = applyDraftDefaults(draft);
  const missing = listMissingEventFields(prepared);
  if (missing.length) {
    const error = new Error(`Event draft is incomplete. Missing: ${missing.join(', ')}.`);
    error.code = 'INCOMPLETE_DRAFT';
    error.missing = missing;
    throw error;
  }
  if (!prepared.title || !prepared.slug) {
    const error = new Error('Title and slug are required.');
    error.code = 'INCOMPLETE_DRAFT';
    error.missing = ['title', 'slug'];
    throw error;
  }
  return prepared;
}

export function isConfirmIntent(text) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  if (/^(yes|y|yeah|yep|yup|ok|okay|sure|please|do it|go ahead|confirm|confirmed|create|create it|create the event|create this event)\.?$/.test(normalized)) {
    return true;
  }
  return /\b(yes|create (it|the event|this event)|go ahead|please create)\b/.test(normalized)
    && !/\b(not|don't|dont|no)\b/.test(normalized);
}

export function isDeclineIntent(text) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  return /^(no|nope|not yet|wait|don't|dont|cancel|hold on|change|edit)\b/.test(normalized);
}

export function parseModelJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function buildSystemPrompt({ draft, missing, examples = [] } = {}) {
  const exampleLines = (Array.isArray(examples) ? examples : []).slice(0, 5).map((event) => (
    `- ${event.title} (${event.category || 'Event'}, ${event.location || 'TBA'}, ${event.event_mode || 'virtual'})`
  ));

  return [
    'You are Mutale Mubanga\'s admin assistant for creating events on mutalemubanga.org.',
    'Interview the admin one or two missing fields at a time. Use web search for best practice (typical duration, agenda, venue style, and pricing) based on what they describe.',
    'Return ONLY JSON with keys: reply (string), draft (object of event fields to merge).',
    'Draft fields you may set: title, short_description, description, event_mode (virtual|in_person), meeting_platform, venue, location, start_date (YYYY-MM-DD), end_date, start_time (HH:MM), end_time, timezone, capacity, price, is_free, registration_deadline, registration_deadline_time, visibility, organizer_name, organizer_email, organizer_phone, category.',
    `Categories: ${EVENT_CHAT_CATEGORIES.join(', ')}.`,
    'Default timezone Africa/Lusaka. Status must stay draft. Do not invent a meeting join URL.',
    'When enough fields are present, summarise the draft in reply and ask if they want you to create the event.',
    `Current draft: ${JSON.stringify(draft || {})}`,
    `Still missing: ${(missing || []).join(', ') || 'none'}`,
    exampleLines.length ? `Existing Mutale events for tone:\n${exampleLines.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export function extractOpenAIOutputText(payload = {}) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const chunks = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  if (chunks.length) return chunks.join('\n').trim();
  const choice = payload?.choices?.[0]?.message?.content;
  if (typeof choice === 'string') return choice.trim();
  return '';
}

export async function callOpenAIEventChat({
  apiKey,
  model = 'gpt-4o-mini',
  messages = [],
  fetchImpl = fetch,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('OpenAI API key is missing. Add it in Admin → Settings → Integrations.');

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: String(model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
      tools: [{ type: 'web_search' }],
      input: messages,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (response.ok) {
    const text = extractOpenAIOutputText(data);
    if (text) return text;
  }

  const fallback = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: String(model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  const fallbackData = await fallback.json().catch(() => ({}));
  if (!fallback.ok) {
    throw new Error(
      fallbackData?.error?.message
      || data?.error?.message
      || `OpenAI request failed (HTTP ${fallback.status}).`,
    );
  }

  const text = extractOpenAIOutputText(fallbackData);
  if (!text) throw new Error('OpenAI returned an empty response.');
  return text;
}

export function sessionKey(adminId, sessionId) {
  return `${String(adminId || 'admin').trim()}::${String(sessionId || '').trim()}`;
}

export function getOrCreateChatSession(adminId, sessionId) {
  const key = sessionKey(adminId, sessionId);
  if (!sessions.has(key)) {
    sessions.set(key, {
      messages: [],
      draft: createEmptyDraft(),
      awaitingConfirm: false,
      confirmed: false,
    });
  }
  return sessions.get(key);
}

export function resetChatSession(adminId, sessionId) {
  sessions.delete(sessionKey(adminId, sessionId));
  return getOrCreateChatSession(adminId, sessionId);
}

export function resetAllChatSessionsForTests() {
  sessions.clear();
}

export async function processEventChatTurn({
  session,
  userMessage,
  apiKey,
  model,
  exampleEvents = [],
  openaiCall = callOpenAIEventChat,
} = {}) {
  const text = String(userMessage || '').trim();
  if (!text) {
    throw new Error('Message is required.');
  }

  if (session.awaitingConfirm && isConfirmIntent(text)) {
    try {
      const draft = assertDraftReadyToCreate(session.draft);
      session.draft = draft;
      session.confirmed = true;
      return {
        reply: 'Creating the event now.',
        draft,
        missing: [],
        readyToCreate: true,
        awaitingConfirm: true,
        confirmed: true,
      };
    } catch (error) {
      session.awaitingConfirm = false;
      session.confirmed = false;
      const missing = error.missing || listMissingEventFields(session.draft);
      return {
        reply: `I still need a few details before I can create it: ${missing.join(', ')}.`,
        draft: applyDraftDefaults(session.draft),
        missing,
        readyToCreate: false,
        awaitingConfirm: false,
        confirmed: false,
      };
    }
  }

  if (session.awaitingConfirm && isDeclineIntent(text)) {
    session.awaitingConfirm = false;
    session.confirmed = false;
    const draft = applyDraftDefaults(session.draft);
    return {
      reply: 'No problem. What should we change?',
      draft,
      missing: listMissingEventFields(draft),
      readyToCreate: false,
      awaitingConfirm: false,
      confirmed: false,
    };
  }

  session.confirmed = false;
  session.messages.push({ role: 'user', content: text });

  const draftForPrompt = applyDraftDefaults(session.draft);
  const missingForPrompt = listMissingEventFields(draftForPrompt);
  const modelMessages = [
    { role: 'system', content: buildSystemPrompt({ draft: draftForPrompt, missing: missingForPrompt, examples: exampleEvents }) },
    ...session.messages.slice(-12),
  ];

  const raw = await openaiCall({ apiKey, model, messages: modelMessages });
  const parsed = parseModelJson(raw) || {};
  session.draft = applyDraftDefaults(mergeEventDraft(session.draft, parsed.draft || {}));
  const missing = listMissingEventFields(session.draft);
  const ready = missing.length === 0;
  session.awaitingConfirm = ready;

  const reply = String(parsed.reply || '').trim()
    || (ready
      ? 'I have enough information to create this event as a draft. Shall I create it?'
      : 'Thanks — what is the next detail?');

  session.messages.push({ role: 'assistant', content: reply });

  return {
    reply,
    draft: session.draft,
    missing,
    readyToCreate: ready,
    awaitingConfirm: ready,
    confirmed: false,
  };
}
