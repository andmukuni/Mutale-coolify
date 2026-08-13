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
    meeting_platform: '',
    meeting_link: '',
    venue: '',
    location: '',
    start_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    timezone: '',
    capacity: '',
    booking_type: 'subscription',
    price: '',
    is_free: null,
    status: 'draft',
    registration_deadline: '',
    registration_deadline_time: '',
    visibility: '',
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
        next[key] = '';
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
  if (next.is_free !== false) {
    next.is_free = true;
    next.price = 0;
  }
  if (next.start_date && !next.end_date) next.end_date = next.start_date;
  if (!next.short_description && next.description) {
    next.short_description = String(next.description).replace(/\s+/g, ' ').trim().slice(0, 180);
  }
  return next;
}

export function listMissingEventFields(draft = {}) {
  const next = { ...(draft || {}) };
  if (next.start_date && !next.end_date) next.end_date = next.start_date;
  const missing = [];
  for (const field of REQUIRED_EVENT_DRAFT_FIELDS) {
    if (!String(next[field] || '').trim()) missing.push(field);
  }
  if (next.is_free === false && !(Number(next.price) > 0)) missing.push('price');
  if (next.event_mode === 'in_person' && !String(next.venue || '').trim() && !String(next.location || '').trim()) {
    missing.push('venue');
  }
  return missing;
}

export function draftHasUserContent(draft = {}) {
  return Boolean(
    String(draft.title || '').trim()
    || String(draft.description || '').trim()
    || String(draft.location || '').trim()
    || String(draft.venue || '').trim()
    || String(draft.start_date || '').trim()
    || String(draft.category || '').trim()
    || String(draft.event_mode || '').trim()
    || draft.is_free === true
    || draft.is_free === false,
  );
}

export function extractAssistantReply(raw, parsed) {
  const fromJson = String(parsed?.reply || '').trim();
  if (fromJson) return fromJson;

  const stripped = String(raw || '')
    .replace(/```(?:json)?[\s\S]*?```/gi, '')
    .replace(/\{[\s\S]*\}/, '')
    .trim();
  return stripped || 'Happy to help. Tell me about the event — topic, who it is for, and whether it is in person or online.';
}

export function isSmallTalk(text) {
  return /^(hi|hello|hey|hiya|howdy|yo|thanks|thank you|ok|okay|good (morning|afternoon|evening))[\s!.]*$/i.test(
    String(text || '').trim(),
  );
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
  if (/^(yes|y|yeah|yep|yup|ok|okay|sure|please|do it|go ahead|confirm|confirmed|create|create it|create the event|create this event|create the draft|save it|save the draft|post it)\.?$/.test(normalized)) {
    return true;
  }
  return /\b(yes|create (it|the event|this event|the draft)|save (it|the draft)|go ahead|please create)\b/.test(normalized)
    && !/\b(not|don't|dont|no)\b/.test(normalized);
}

export function isCreateClaim(text) {
  return /\b(i('ve| have)? (just )?(created|saved|posted)|draft (is|has been) (created|saved)|creating (the|this) (event|draft) now|saved as a draft)\b/i.test(
    String(text || ''),
  );
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

export const EVENT_CREATE_PLAYBOOK = [
  'This is the live mutalemubanga.org event-creation form (Admin → Events → New). Treat it as source of truth.',
  'Wizard steps: 1 Basic Details, 2 Schedule & Venue, 3 Registration Setup, 4 Speakers & Partners, 5 Review & Publish.',
  'Chat always saves status=draft. The admin publishes later from the form.',
  'Required before save: title, slug (from title), description, location/city, start_date, end_date, registration_deadline + registration_deadline_time.',
  'Cover image is required on the form; chat may omit it and a category Unsplash placeholder is applied at create.',
  'Categories: Workshop, Seminar, Training, Conference, Masterclass, Review, Webinar, Meeting, Other.',
  'Modes: virtual | in_person | hybrid. Virtual/hybrid may use meeting_platform zoom|daily|teams|google_meet|webex|other. Never invent a join URL.',
  'In-person needs a city and preferably a venue. Location examples: Lusaka, Zambia.',
  'Dates YYYY-MM-DD, times HH:MM. End cannot be before start. Deadline cannot be after the event ends. Default timezone Africa/Lusaka.',
  'Registration: capacity blank = unlimited. booking_type is always subscription. visibility public|private.',
  'Price is ZMW. Free events set is_free=true and price=0. Paid events need a price > 0.',
  'Optional: featured (homepage), forum_enabled, organizer_name/email/phone, featured_speakers, featured_guests, partners as [{name,title,organisation}].',
  'Site focus: quality assurance, diagnostics, ISO 15189, laboratory leadership, Zambia / Southern Africa.',
].join('\n');

export function todayInLusaka(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lusaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function shouldResearchWeb(text, draft = {}) {
  if (isSmallTalk(text)) return false;
  const value = String(text || '').trim();
  if (value.length >= 12) return true;
  return draftHasUserContent(draft);
}

export function isPublicHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) return false;
    if (host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function htmlToReadableText(html, limit = 6000) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function parseJsonLoose(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return fallback;
  }
}

export function formatSiteEvents(events = []) {
  return (Array.isArray(events) ? events : []).slice(0, 12).map((event) => (
    `- ${event.title} (${event.category || 'Event'}, ${event.location || 'TBA'}, ${event.event_mode || 'virtual'}${event.is_free ? ', free' : (event.price ? `, ZMW ${event.price}` : '')}${event.start_date ? `, ${event.start_date}` : ''})`
  ));
}

export function buildSystemPrompt({
  draft,
  missing,
  examples = [],
  siteContext = {},
  research = false,
} = {}) {
  const exampleLines = formatSiteEvents(examples.length ? examples : siteContext.events);
  const organizer = siteContext.organizer || {};
  const today = siteContext.today || todayInLusaka();

  return [
    'You are a senior event producer embedded in the mutalemubanga.org admin. You know the create-event form and may research the public web.',
    'Talk like a trusted colleague. Greetings get a warm welcome and an invitation to describe the event. Do not invent draft fields from small talk.',
    'When the admin describes an event, work freely: infer title, category, short and full description with a practical agenda, format, city/venue, duration, free vs paid, and organizer if known.',
    research
      ? 'This turn needs live research. Use web_search and/or search_web before you recommend duration, agenda, venue style, fees, or standards. Cite sources in plain language.'
      : 'If a fact could be stale (fees, venues, ISO guidance, public holidays), search the web. You may also call get_event_create_rules, list_site_events, get_site_context, or browse_url.',
    'Offer a clear recommendation, then let them correct it. Propose dates only if they gave a timeframe. Never invent a Zoom/Teams join URL. Status stays draft.',
    EVENT_CREATE_PLAYBOOK,
    `Today in Africa/Lusaka: ${today}.`,
    organizer.name ? `Default organizer: ${[organizer.name, organizer.email, organizer.phone, organizer.location].filter(Boolean).join(' · ')}` : '',
    'If they dump everything in one paragraph, fill the draft and summarise. If they are vague, ask the most useful next question — usually audience, format, and date — not "the next field".',
    'When required fields are present, recap in plain language and ask if they want you to create the draft. Never say you already created or saved it unless create is true in your JSON — the server is what writes the row.',
    'If the admin asks you to create, save, or post the draft and required fields are present, set create:true. The server will insert a draft event and it will appear on Admin → Events immediately.',
    'Return JSON with keys reply (natural conversational prose, no field-name jargon), draft (only fields you are confident about), and optional create (boolean). You may wrap JSON in a fence.',
    `Known so far: ${JSON.stringify(draft || {})}`,
    `Still needed before create: ${(missing || []).join(', ') || 'none — recap and ask to create'}`,
    exampleLines.length ? `Recent site events for tone:\n${exampleLines.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export function extractOpenAIOutputText(payload = {}) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const chunks = [];
  for (const item of output) {
    if (typeof item?.text === 'string') chunks.push(item.text);
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') chunks.push(part.text);
      if (typeof part?.output_text === 'string') chunks.push(part.output_text);
    }
  }
  if (chunks.length) return chunks.join('\n').trim();
  const choice = payload?.choices?.[0]?.message?.content;
  if (typeof choice === 'string') return choice.trim();
  return '';
}

export function extractFunctionCalls(payload = {}) {
  const calls = [];
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    if (item?.type === 'function_call' && item.name) {
      calls.push({
        name: item.name,
        arguments: parseJsonLoose(item.arguments, {}),
        call_id: item.call_id || item.id,
      });
    }
  }
  const toolCalls = payload?.choices?.[0]?.message?.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const tool of toolCalls) {
      if (!tool?.function?.name) continue;
      calls.push({
        name: tool.function.name,
        arguments: parseJsonLoose(tool.function.arguments, {}),
        call_id: tool.id,
      });
    }
  }
  return calls;
}

export const EVENT_CHAT_FUNCTION_TOOLS = [
  {
    type: 'function',
    name: 'get_event_create_rules',
    description: 'Read the mutalemubanga.org event-creation form rules from the codebase: required fields, categories, modes, dates, pricing, and save constraints.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'list_site_events',
    description: 'List recent events already on the site for tone, pricing, category, and location examples.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'get_site_context',
    description: 'Get today\'s date in Africa/Lusaka plus the default organizer profile for this site.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'search_web',
    description: 'Search the public internet for current best practice, venues, fees, standards, agendas, or reference material.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browse_url',
    description: 'Fetch a public http(s) page and return readable text for reference. Do not use for private or local URLs.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Public http or https URL' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
];

function chatCompletionTools() {
  return EVENT_CHAT_FUNCTION_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function webSearchTool() {
  return {
    type: 'web_search',
    user_location: {
      type: 'approximate',
      country: 'ZM',
      city: 'Lusaka',
      region: 'Lusaka',
      timezone: 'Africa/Lusaka',
    },
  };
}

export async function searchWebForEventChat(query, fetchImpl = fetch) {
  const q = String(query || '').trim();
  if (!q) return 'No search query provided.';

  const notes = [];
  try {
    const ddg = await fetchImpl(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, {
      headers: { Accept: 'application/json' },
    });
    const data = await ddg.json().catch(() => ({}));
    if (data?.AbstractText) notes.push(data.AbstractText);
    if (data?.AbstractURL) notes.push(`Source: ${data.AbstractURL}`);
    const related = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
    for (const item of related.slice(0, 6)) {
      const text = item.Text || item.Topics?.[0]?.Text;
      const link = item.FirstURL || item.Topics?.[0]?.FirstURL;
      if (text) notes.push(link ? `${text} (${link})` : text);
    }
  } catch {
    // try Wikipedia next
  }

  try {
    const wiki = await fetchImpl(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=5&namespace=0&format=json`, {
      headers: { Accept: 'application/json' },
    });
    const payload = await wiki.json().catch(() => []);
    const titles = Array.isArray(payload?.[1]) ? payload[1] : [];
    const links = Array.isArray(payload?.[3]) ? payload[3] : [];
    titles.forEach((title, index) => {
      notes.push(links[index] ? `${title} (${links[index]})` : title);
    });
  } catch {
    // ignore
  }

  return notes.length
    ? notes.join('\n')
    : `No web results for "${q}". Use your event-form knowledge and say what you are assuming.`;
}

export async function browseUrlForEventChat(url, fetchImpl = fetch) {
  if (!isPublicHttpUrl(url)) {
    return 'That URL is not a public http(s) page I can open.';
  }
  const response = await fetchImpl(url, {
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    redirect: 'follow',
  });
  const raw = await response.text();
  const text = htmlToReadableText(raw);
  return text || `Opened ${url} but found no readable text.`;
}

export async function executeEventChatTool(name, args = {}, context = {}) {
  const fetchImpl = context.fetchImpl || fetch;
  const siteContext = context.siteContext || {};

  if (name === 'get_event_create_rules') return EVENT_CREATE_PLAYBOOK;
  if (name === 'list_site_events') {
    const lines = formatSiteEvents(siteContext.events);
    return lines.length ? lines.join('\n') : 'No existing events were loaded.';
  }
  if (name === 'get_site_context') {
    return JSON.stringify({
      today: siteContext.today || todayInLusaka(),
      organizer: siteContext.organizer || {},
    });
  }
  if (name === 'search_web') return searchWebForEventChat(args.query, fetchImpl);
  if (name === 'browse_url') return browseUrlForEventChat(args.url, fetchImpl);
  return `Unknown tool: ${name}`;
}

async function postOpenAIJson(fetchImpl, url, apiKey, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function callOpenAIEventChat({
  apiKey,
  model = 'gpt-4o-mini',
  messages = [],
  siteContext = {},
  forceWebSearch = false,
  fetchImpl = fetch,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('OpenAI API key is missing. Add it in Admin → Settings → Integrations.');

  const resolvedModel = String(model || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  const system = messages.find((item) => item.role === 'system')?.content || '';
  const conversation = messages.filter((item) => item.role !== 'system');
  const toolContext = { fetchImpl, siteContext };

  const responsesBody = {
    model: resolvedModel,
    instructions: system,
    input: conversation,
    tools: [webSearchTool(), ...EVENT_CHAT_FUNCTION_TOOLS],
    tool_choice: forceWebSearch ? { type: 'web_search' } : 'auto',
    include: ['web_search_call.action.sources'],
  };

  let lastError = '';
  let previousId = '';
  let pendingInput = conversation;

  for (let round = 0; round < 4; round += 1) {
    const body = {
      ...responsesBody,
      input: pendingInput,
    };
    if (previousId) body.previous_response_id = previousId;
    if (round > 0) body.tool_choice = 'auto';

    const { response, data } = await postOpenAIJson(
      fetchImpl,
      'https://api.openai.com/v1/responses',
      key,
      body,
    );

    if (!response.ok) {
      lastError = data?.error?.message || `OpenAI request failed (HTTP ${response.status}).`;
      if (round === 0 && forceWebSearch) {
        responsesBody.tool_choice = 'auto';
        pendingInput = conversation;
        previousId = '';
        continue;
      }
      break;
    }

    previousId = data?.id || previousId;
    const calls = extractFunctionCalls(data);
    if (calls.length) {
      pendingInput = [];
      for (const call of calls) {
        const output = await executeEventChatTool(call.name, call.arguments, toolContext);
        pendingInput.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: String(output || '').slice(0, 8000),
        });
      }
      continue;
    }

    const text = extractOpenAIOutputText(data);
    if (text) return text;
    lastError = 'OpenAI returned an empty response.';
    break;
  }

  const chatMessages = messages.map((item) => ({ role: item.role, content: item.content }));
  for (let round = 0; round < 4; round += 1) {
    const { response, data } = await postOpenAIJson(
      fetchImpl,
      'https://api.openai.com/v1/chat/completions',
      key,
      {
        model: resolvedModel,
        messages: chatMessages,
        tools: chatCompletionTools(),
        tool_choice: 'auto',
      },
    );

    if (!response.ok) {
      throw new Error(data?.error?.message || lastError || `OpenAI request failed (HTTP ${response.status}).`);
    }

    const calls = extractFunctionCalls(data);
    const assistant = data?.choices?.[0]?.message;
    if (calls.length && assistant) {
      chatMessages.push(assistant);
      for (const call of calls) {
        const output = await executeEventChatTool(call.name, call.arguments, toolContext);
        chatMessages.push({
          role: 'tool',
          tool_call_id: call.call_id,
          content: String(output || '').slice(0, 8000),
        });
      }
      continue;
    }

    const text = extractOpenAIOutputText(data);
    if (text) return text;
    throw new Error(lastError || 'OpenAI returned an empty response.');
  }

  throw new Error(lastError || 'OpenAI returned an empty response.');
}

export function sessionKey(adminId, sessionId) {
  return `${String(adminId || 'admin').trim()}::${String(sessionId || '').trim()}`;
}

export function exportChatSession(session = {}) {
  return {
    messages: Array.isArray(session.messages) ? session.messages : [],
    draft: session.draft || createEmptyDraft(),
    awaitingConfirm: Boolean(session.awaitingConfirm),
    confirmed: Boolean(session.confirmed),
    createdEventId: session.createdEventId || '',
    created: session.created || null,
  };
}

export function importChatSession(adminId, sessionId, data = {}) {
  const session = {
    messages: Array.isArray(data.messages) ? data.messages : [],
    draft: mergeEventDraft(createEmptyDraft(), data.draft || {}),
    awaitingConfirm: Boolean(data.awaitingConfirm),
    confirmed: Boolean(data.confirmed),
    createdEventId: data.createdEventId || '',
    created: data.created || null,
  };
  sessions.set(sessionKey(adminId, sessionId), session);
  return session;
}

export function peekChatSession(adminId, sessionId) {
  return sessions.get(sessionKey(adminId, sessionId)) || null;
}

export function getOrCreateChatSession(adminId, sessionId) {
  const key = sessionKey(adminId, sessionId);
  if (!sessions.has(key)) {
    sessions.set(key, {
      messages: [],
      draft: createEmptyDraft(),
      awaitingConfirm: false,
      confirmed: false,
      createdEventId: '',
      created: null,
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
  siteContext = {},
  openaiCall = callOpenAIEventChat,
} = {}) {
  const text = String(userMessage || '').trim();
  if (!text) {
    throw new Error('Message is required.');
  }

  if (isConfirmIntent(text)) {
    try {
      const draft = assertDraftReadyToCreate(session.draft);
      session.draft = draft;
      session.confirmed = true;
      session.awaitingConfirm = true;
      return {
        reply: 'Creating the event now.',
        draft,
        missing: [],
        readyToCreate: true,
        awaitingConfirm: true,
        confirmed: true,
      };
    } catch (error) {
      if (draftHasUserContent(session.draft) || session.awaitingConfirm) {
        session.awaitingConfirm = false;
        session.confirmed = false;
        const missing = error.missing || listMissingEventFields(session.draft);
        return {
          reply: `I still need a few details before I can create it: ${missing.join(', ')}.`,
          draft: session.draft,
          missing,
          readyToCreate: false,
          awaitingConfirm: false,
          confirmed: false,
        };
      }
    }
  }

  if (session.awaitingConfirm && isDeclineIntent(text)) {
    session.awaitingConfirm = false;
    session.confirmed = false;
    return {
      reply: 'No problem. What should we change?',
      draft: session.draft,
      missing: listMissingEventFields(session.draft),
      readyToCreate: false,
      awaitingConfirm: false,
      confirmed: false,
    };
  }

  session.confirmed = false;
  session.messages.push({ role: 'user', content: text });

  const missingForPrompt = listMissingEventFields(session.draft);
  const resolvedContext = {
    today: siteContext.today || todayInLusaka(),
    organizer: siteContext.organizer || {},
    events: Array.isArray(siteContext.events) && siteContext.events.length ? siteContext.events : exampleEvents,
  };
  const research = shouldResearchWeb(text, session.draft);
  const modelMessages = [
    {
      role: 'system',
      content: buildSystemPrompt({
        draft: session.draft,
        missing: missingForPrompt,
        examples: resolvedContext.events,
        siteContext: resolvedContext,
        research,
      }),
    },
    ...session.messages.slice(-20),
  ];

  const raw = await openaiCall({
    apiKey,
    model,
    messages: modelMessages,
    siteContext: resolvedContext,
    forceWebSearch: research,
  });
  const parsed = parseModelJson(raw) || {};
  const patch = parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : {};
  const ignoreInventedDraft = isSmallTalk(text) && !draftHasUserContent(session.draft);
  if (!ignoreInventedDraft) {
    session.draft = mergeEventDraft(session.draft, patch);
  }
  if (session.draft.start_date && !session.draft.end_date) {
    session.draft.end_date = session.draft.start_date;
  }
  const missing = listMissingEventFields(session.draft);
  const ready = missing.length === 0 && Boolean(String(session.draft.title || '').trim());
  const reply = extractAssistantReply(raw, parsed);
  const wantsCreate = parsed.create === true
    || parsed.action === 'create'
    || isCreateClaim(reply)
    || isConfirmIntent(text);

  if (ready && wantsCreate) {
    try {
      const prepared = assertDraftReadyToCreate(session.draft);
      session.draft = prepared;
      session.confirmed = true;
      session.awaitingConfirm = true;
      session.messages.push({ role: 'assistant', content: reply || 'Creating the event now.' });
      return {
        reply: reply || 'Creating the event now.',
        draft: prepared,
        missing: [],
        readyToCreate: true,
        awaitingConfirm: true,
        confirmed: true,
      };
    } catch {
      // keep the conversational reply and wait for the missing fields
    }
  }

  session.awaitingConfirm = ready;
  session.confirmed = false;
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
