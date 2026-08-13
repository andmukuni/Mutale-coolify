import {
  extractFunctionCalls,
  extractOpenAIOutputText,
  isConfirmIntent,
  isDeclineIntent,
  parseModelJson,
  searchWebForEventChat,
  browseUrlForEventChat,
} from './eventChatService.js';
import { normalizeCvSections } from '../shared/cvProfileSections.js';

const sessions = new Map();

export const SITE_GUIDE = [
  'You are the Mutale Mubanga website assistant for mutalemubanga.org.',
  'Help with the public site and the client portal. Be concise, warm, and specific. Use Markdown.',
  'Always reply as JSON: { "reply": "markdown", "cvDraft": {}, "saveCv": false, "signupDraft": {}, "eventIntent": {}, "pendingAction": null }.',
  'Only set saveCv=true when the user clearly confirms saving their CV and they are signed in.',
  '',
  'You complete signup, event registration, payment, and join in this chat. Do not send people to /account/register, /account/login, or /events/:slug/register.',
  'Never dump a Join or Register markdown link as the only help. Ask the next confirm question and set pendingAction.',
  'Ask one or two questions at a time. After each completed step, ask before doing the next one.',
  '',
  'Event join workflow:',
  '1. Use get_event_access (or list_upcoming_events) to find the event and the user\'s real access.',
  '2. If not signed in: collect signup fields into signupDraft (user_type local|international, name, email, whatsapp, nrc_id if local, password min 8).',
  '   If lookup_account_email says the email exists, switch to login: collect password and set pendingAction { "type": "login" }.',
  '   When signup fields are complete, ask "Shall I create your account now?" and set pendingAction { "type": "signup" }.',
  '3. After signup they must enter a 6-digit email/SMS code. Set pendingAction { "type": "verify_email" }.',
  '4. If signed in and not registered: ask "Would you like me to register you for [event] now?" and set pendingAction { "type": "register", "eventSlug": "...", "eventId": "...", "eventTitle": "..." }.',
  '5. If the event is paid: after they confirm register, set pendingAction { "type": "start_payment", "eventSlug": "...", "eventId": "...", "amount": 0, "currency": "ZMW" } and ask mobile money or card.',
  '6. If already registered and paid/free, and join is open: ask "Shall I take you into the session now?" and set pendingAction { "type": "join", "eventSlug": "..." }.',
  '7. If join is not open yet, say when it opens. Do not invent meeting URLs.',
  '',
  'CV help: collect name, profession, organization, about, specialties, LinkedIn/portfolio, education, experience, references in cvDraft.',
  'Never invent certificates, attendance, payment status, or meeting links. Use tools for real records.',
].join('\n');

export const SITE_CHAT_ACTION_TYPES = [
  'signup',
  'login',
  'verify_email',
  'register',
  'start_payment',
  'await_payment',
  'confirm_payment',
  'join',
];

export function createEmptyCvDraft() {
  return {
    name: '',
    profession: '',
    organization: '',
    about: '',
    specialties: [],
    portfolio_url: '',
    linkedin_url: '',
    education: [],
    experience: [],
    references: [],
  };
}

function asStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export function mergeCvDraft(current = {}, patch = {}) {
  const next = { ...createEmptyCvDraft(), ...(current || {}) };
  const incoming = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const scalars = ['name', 'profession', 'organization', 'about', 'portfolio_url', 'linkedin_url'];
  for (const key of scalars) {
    if (incoming[key] == null) continue;
    const value = String(incoming[key]).trim();
    if (value) next[key] = value;
  }
  if (incoming.specialties != null) next.specialties = asStringArray(incoming.specialties);
  const sections = normalizeCvSections({
    education: incoming.education != null ? incoming.education : next.education,
    experience: incoming.experience != null ? incoming.experience : next.experience,
    references: incoming.references != null ? incoming.references : next.references,
  });
  next.education = sections.education;
  next.experience = sections.experience;
  next.references = sections.references;
  return next;
}

export function cvDraftHasContent(draft = {}) {
  return Boolean(
    String(draft.name || '').trim()
    || String(draft.profession || '').trim()
    || String(draft.about || '').trim()
    || (Array.isArray(draft.education) && draft.education.length)
    || (Array.isArray(draft.experience) && draft.experience.length),
  );
}

export function listMissingCvFields(draft = {}) {
  const missing = [];
  if (!String(draft.name || '').trim()) missing.push('name');
  if (!String(draft.profession || '').trim()) missing.push('profession');
  if (!String(draft.about || '').trim()) missing.push('about');
  const hasWork = (draft.experience || []).length > 0 || (draft.education || []).length > 0;
  if (!hasWork) missing.push('experience_or_education');
  return missing;
}

export function createEmptySignupDraft() {
  return {
    user_type: '',
    name: '',
    email: '',
    whatsapp: '',
    nrc_id: '',
    password: '',
  };
}

export function mergeSignupDraft(current = {}, patch = {}) {
  const next = { ...createEmptySignupDraft(), ...(current || {}) };
  const incoming = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  if (incoming.user_type != null) {
    const type = String(incoming.user_type).trim().toLowerCase();
    if (type === 'local' || type === 'international') next.user_type = type;
  }
  if (incoming.name != null) {
    const value = String(incoming.name).trim();
    if (value) next.name = value;
  }
  if (incoming.email != null) {
    const value = String(incoming.email).trim().toLowerCase();
    if (value) next.email = value;
  }
  if (incoming.whatsapp != null || incoming.phone != null) {
    const value = String(incoming.whatsapp || incoming.phone || '').trim();
    if (value) next.whatsapp = value;
  }
  if (incoming.nrc_id != null || incoming.nrc != null) {
    const value = String(incoming.nrc_id || incoming.nrc || '').trim();
    if (value) next.nrc_id = value;
  }
  if (incoming.password != null) {
    const value = String(incoming.password);
    if (value) next.password = value;
  }
  return next;
}

export function listMissingSignupFields(draft = {}) {
  const missing = [];
  if (!['local', 'international'].includes(String(draft.user_type || ''))) missing.push('user_type');
  if (!String(draft.name || '').trim()) missing.push('name');
  if (!/^\S+@\S+\.\S+$/.test(String(draft.email || '').trim())) missing.push('email');
  if (!String(draft.whatsapp || '').trim()) missing.push('whatsapp');
  if (draft.user_type === 'local' && !String(draft.nrc_id || '').trim()) missing.push('nrc_id');
  if (String(draft.password || '').length < 8) missing.push('password');
  return missing;
}

export function sanitizeSignupDraft(draft = {}) {
  const next = mergeSignupDraft(createEmptySignupDraft(), draft);
  delete next.password;
  return next;
}

export function createEmptyEventIntent() {
  return { slug: '', title: '', id: '', query: '' };
}

export function mergeEventIntent(current = {}, patch = {}) {
  const next = { ...createEmptyEventIntent(), ...(current || {}) };
  const incoming = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  for (const key of ['slug', 'title', 'id', 'query']) {
    if (incoming[key] == null) continue;
    const value = String(incoming[key]).trim();
    if (value) next[key] = value;
  }
  return next;
}

export function sanitizePendingAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return null;
  const type = String(action.type || '').trim();
  if (!SITE_CHAT_ACTION_TYPES.includes(type)) return null;
  const amount = action.amount == null || action.amount === '' ? null : Number(action.amount);
  return {
    type,
    eventSlug: String(action.eventSlug || action.slug || '').trim(),
    eventId: String(action.eventId || action.id || '').trim(),
    eventTitle: String(action.eventTitle || action.title || '').trim(),
    label: String(action.label || '').trim(),
    confirmLabel: String(action.confirmLabel || '').trim(),
    method: String(action.method || '').trim(),
    amount: Number.isFinite(amount) ? amount : null,
    currency: String(action.currency || 'ZMW').trim() || 'ZMW',
    phone: String(action.phone || '').trim(),
    email: String(action.email || '').trim().toLowerCase(),
    paymentReference: String(action.paymentReference || action.reference || '').trim(),
    registrationId: String(action.registrationId || '').trim(),
  };
}

export function isCollectingPassword(session = {}) {
  const pending = session.pendingAction?.type;
  const missing = listMissingSignupFields(session.signupDraft || {});
  return pending === 'login' || pending === 'signup' || missing[0] === 'password';
}

export function redactSensitiveUserText(text, session = {}) {
  const raw = String(text || '');
  if (!raw) return raw;
  if (/^\d{6}$/.test(raw.trim()) && session.pendingAction?.type === 'verify_email') return raw.trim();
  if (isCollectingPassword(session) && !raw.includes('@') && !/\s/.test(raw) && raw.length >= 6) {
    return '••••••••';
  }
  return raw;
}

export function isPaidEligibleStatus(status) {
  return ['paid', 'not_required', 'waived'].includes(String(status || '').toLowerCase());
}

export function findSiteChatEvent(query, events = []) {
  const list = Array.isArray(events) ? events : [];
  const q = String(query || '').trim().toLowerCase();
  if (q) {
    return list.find((event) => (
      String(event.slug || '').toLowerCase() === q
      || String(event.id || '').toLowerCase() === q
      || String(event.title || '').toLowerCase().includes(q)
    )) || null;
  }
  return list.find((event) => event.joinWindow?.allowed || event.live) || list[0] || null;
}

export function resolveEventAccess({ query, events = [], user = null, signedIn = false } = {}) {
  const event = findSiteChatEvent(query, events);
  if (!event) {
    return { event: null, signedIn: Boolean(signedIn), registered: false, nextAction: null };
  }
  const registration = Array.isArray(user?.registrations)
    ? user.registrations.find((row) => (
      String(row.slug || '').toLowerCase() === String(event.slug || '').toLowerCase()
      || String(row.event_id || '').toLowerCase() === String(event.id || '').toLowerCase()
    ))
    : null;
  const registered = Boolean(registration);
  const paid = !registered || isPaidEligibleStatus(registration.payment_status);
  const canJoin = Boolean(registered && paid && event.joinWindow?.allowed);
  let nextAction = null;
  if (!signedIn) nextAction = 'signup';
  else if (user && user.email_verified === false) nextAction = 'verify_email';
  else if (registered && paid && canJoin) nextAction = 'join';
  else if (registered && !paid) nextAction = 'start_payment';
  else if (!registered) nextAction = 'register';
  return {
    event,
    signedIn: Boolean(signedIn),
    registered,
    paymentStatus: registration?.payment_status || '',
    canJoin,
    joinReason: event.joinWindow?.reason || '',
    joinFrom: event.joinWindow?.joinFrom || '',
    nextAction,
    registration: registration || null,
  };
}

export function buildSiteChatUi(session = {}) {
  const action = sanitizePendingAction(session.pendingAction);
  if (!action) {
    const missing = listMissingSignupFields(session.signupDraft || {});
    if (session.eventIntent?.slug && missing.length) {
      return { kind: 'signup', missing, nextField: missing[0] };
    }
    return null;
  }

  if (action.type === 'start_payment' || action.type === 'await_payment') {
    return {
      kind: 'payment',
      action: action.type,
      eventTitle: action.eventTitle,
      eventSlug: action.eventSlug,
      eventId: action.eventId,
      amount: action.amount,
      currency: action.currency || 'ZMW',
      paymentReference: action.paymentReference,
      confirmLabel: action.confirmLabel || 'Pay now',
    };
  }

  if (action.type === 'join') {
    return {
      kind: 'join',
      action: 'join',
      path: action.eventSlug ? `/events/${encodeURIComponent(action.eventSlug)}/join?autoJoin=1` : '',
      eventTitle: action.eventTitle,
      label: action.label || `You’re registered for ${action.eventTitle || 'this event'}. Shall I take you into the session now?`,
      confirmLabel: action.confirmLabel || 'Take me in now',
      declineLabel: 'Not yet',
    };
  }

  const defaults = {
    signup: {
      label: 'Shall I create your account now?',
      confirmLabel: 'Yes, create my account',
    },
    login: {
      label: 'Shall I sign you in now?',
      confirmLabel: 'Yes, sign me in',
    },
    verify_email: {
      label: 'Enter the 6-digit code I sent to your email or phone.',
      confirmLabel: 'Verify code',
    },
    register: {
      label: `Would you like me to register you for ${action.eventTitle || 'this event'} now?`,
      confirmLabel: 'Yes, register me',
    },
    confirm_payment: {
      label: 'Confirm that you have completed payment?',
      confirmLabel: 'Yes, I have paid',
    },
  };
  const copy = defaults[action.type] || {
    label: action.label || 'Shall I continue?',
    confirmLabel: action.confirmLabel || 'Yes',
  };
  return {
    kind: 'confirm',
    action: action.type,
    label: action.label || copy.label,
    confirmLabel: action.confirmLabel || copy.confirmLabel,
    declineLabel: 'Not yet',
  };
}

export function extractSiteAssistantReply(raw, parsed) {
  const fromJson = String(parsed?.reply || '').trim();
  if (fromJson) return fromJson;
  const stripped = String(raw || '')
    .replace(/```(?:json)?[\s\S]*?```/gi, '')
    .replace(/\{[\s\S]*\}/, '')
    .trim();
  return stripped || 'How can I help — events, tickets, your account, or building a CV?';
}

export const SITE_CHAT_FUNCTION_TOOLS = [
  {
    type: 'function',
    name: 'get_site_guide',
    description: 'How the Mutale website and client portal work.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'list_upcoming_events',
    description: 'List published upcoming or ongoing events.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'get_event_by_slug',
    description: 'Get one event by slug or title fragment.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_user_context',
    description: 'Get the signed-in user profile, registrations, and CV status.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'get_event_access',
    description: 'Get one event plus whether the visitor can register, pay, or join it.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'lookup_account_email',
    description: 'Check whether an email already has an account so you can switch to login.',
    parameters: {
      type: 'object',
      properties: { email: { type: 'string' } },
      required: ['email'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_shop_items',
    description: 'List published shop books and products.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'search_web',
    description: 'Search the public web when the user asks about a topic beyond the site.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browse_url',
    description: 'Read a public web page when the user shares a URL or asks for details from one.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
];

function chatCompletionTools() {
  return SITE_CHAT_FUNCTION_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export async function executeSiteChatTool(name, args = {}, context = {}) {
  if (name === 'get_site_guide') return SITE_GUIDE;
  if (name === 'list_upcoming_events') {
    const events = Array.isArray(context.events) ? context.events : [];
    if (!events.length) return 'No published events were loaded.';
    return events.map((event) => (
      `${event.title} — /events/${event.slug} — ${event.start_date || 'TBA'} — ${event.is_free ? 'Free' : `ZMW ${event.price || ''}`} — ${event.event_mode || 'virtual'}`
    )).join('\n');
  }
  if (name === 'get_event_by_slug') {
    const query = String(args.query || '').trim().toLowerCase();
    const events = Array.isArray(context.events) ? context.events : [];
    const match = events.find((event) => (
      String(event.slug || '').toLowerCase() === query
      || String(event.title || '').toLowerCase().includes(query)
    ));
    return match ? JSON.stringify(match) : `No event matched "${args.query}".`;
  }
  if (name === 'get_user_context') {
    if (!context.user) return 'The visitor is not signed in. Collect signup fields in chat, or log them in if the email already exists.';
    return JSON.stringify(context.user);
  }
  if (name === 'get_event_access') {
    return JSON.stringify(resolveEventAccess({
      query: args.query || context.eventQuery || '',
      events: context.events,
      user: context.user,
      signedIn: Boolean(context.user),
    }));
  }
  if (name === 'lookup_account_email') {
    if (typeof context.emailExists !== 'function') return 'Unable to check that email right now.';
    const exists = await context.emailExists(args.email);
    return exists
      ? 'An account already exists for this email. Ask for their password and set pendingAction to login.'
      : 'No account exists for this email. Continue collecting signup fields.';
  }
  if (name === 'list_shop_items') {
    const books = Array.isArray(context.books) ? context.books : [];
    if (!books.length) return 'No published shop items were loaded.';
    return books.map((book) => (
      `${book.title} — /shop/${book.slug} — ${book.currency || 'ZMW'} ${book.price ?? ''} — ${book.author || ''}`
    )).join('\n');
  }
  if (name === 'search_web') return searchWebForEventChat(args.query, context.fetchImpl || fetch);
  if (name === 'browse_url') return browseUrlForEventChat(args.url, context.fetchImpl || fetch);
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

export async function callOpenAISiteChat({
  apiKey,
  model = 'gpt-4o-mini',
  messages = [],
  toolContext = {},
  fetchImpl = fetch,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('The site assistant is not configured yet. Please try again later.');

  const resolvedModel = String(model || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  const system = messages.find((item) => item.role === 'system')?.content || SITE_GUIDE;
  const conversation = messages.filter((item) => item.role !== 'system');

  const responsesBody = {
    model: resolvedModel,
    instructions: system,
    input: conversation,
    tools: SITE_CHAT_FUNCTION_TOOLS,
    tool_choice: 'auto',
  };

  let lastError = '';
  let previousId = '';
  let pendingInput = conversation;

  for (let round = 0; round < 4; round += 1) {
    const body = { ...responsesBody, input: pendingInput };
    if (previousId) body.previous_response_id = previousId;
    const { response, data } = await postOpenAIJson(fetchImpl, 'https://api.openai.com/v1/responses', key, body);
    if (!response.ok) {
      lastError = data?.error?.message || `OpenAI request failed (HTTP ${response.status}).`;
      break;
    }
    previousId = data?.id || previousId;
    const calls = extractFunctionCalls(data);
    if (calls.length) {
      pendingInput = [];
      for (const call of calls) {
        const output = await executeSiteChatTool(call.name, call.arguments, toolContext);
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
    const { response, data } = await postOpenAIJson(fetchImpl, 'https://api.openai.com/v1/chat/completions', key, {
      model: resolvedModel,
      messages: chatMessages,
      tools: chatCompletionTools(),
      tool_choice: 'auto',
    });
    if (!response.ok) {
      throw new Error(data?.error?.message || lastError || `OpenAI request failed (HTTP ${response.status}).`);
    }
    const calls = extractFunctionCalls(data);
    const assistant = data?.choices?.[0]?.message;
    if (calls.length && assistant) {
      chatMessages.push(assistant);
      for (const call of calls) {
        const output = await executeSiteChatTool(call.name, call.arguments, toolContext);
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

export function siteSessionKey(_visitorId, sessionId) {
  return String(sessionId || '').trim();
}

export function exportSiteChatSession(session = {}) {
  return {
    messages: Array.isArray(session.messages) ? session.messages : [],
    cvDraft: session.cvDraft || createEmptyCvDraft(),
    readyToSaveCv: Boolean(session.readyToSaveCv),
    signupDraft: sanitizeSignupDraft(session.signupDraft || {}),
    eventIntent: session.eventIntent || createEmptyEventIntent(),
    pendingAction: sanitizePendingAction(session.pendingAction),
  };
}

export function importSiteChatSession(visitorId, sessionId, data = {}) {
  const existing = sessions.get(siteSessionKey(visitorId, sessionId));
  const session = {
    messages: Array.isArray(data.messages) ? data.messages : [],
    cvDraft: mergeCvDraft(createEmptyCvDraft(), data.cvDraft || {}),
    readyToSaveCv: Boolean(data.readyToSaveCv),
    signupDraft: mergeSignupDraft(existing?.signupDraft || createEmptySignupDraft(), data.signupDraft || {}),
    eventIntent: mergeEventIntent(createEmptyEventIntent(), data.eventIntent || {}),
    pendingAction: sanitizePendingAction(data.pendingAction),
  };
  if (existing?.signupDraft?.password) session.signupDraft.password = existing.signupDraft.password;
  sessions.set(siteSessionKey(visitorId, sessionId), session);
  return session;
}

export function getOrCreateSiteChatSession(visitorId, sessionId) {
  const key = siteSessionKey(visitorId, sessionId);
  if (!sessions.has(key)) {
    sessions.set(key, {
      messages: [],
      cvDraft: createEmptyCvDraft(),
      readyToSaveCv: false,
      signupDraft: createEmptySignupDraft(),
      eventIntent: createEmptyEventIntent(),
      pendingAction: null,
    });
  }
  return sessions.get(key);
}

export function resetSiteChatSession(visitorId, sessionId) {
  sessions.delete(siteSessionKey(visitorId, sessionId));
}

function absorbSignupHints(session, userText) {
  const text = String(userText || '').trim();
  if (!text) return;
  const missing = listMissingSignupFields(session.signupDraft);
  const nextField = missing[0];
  if (/^local$/i.test(text) || /zambia|zambian|nrc/i.test(text)) {
    session.signupDraft = mergeSignupDraft(session.signupDraft, { user_type: 'local' });
  } else if (/^international$/i.test(text) || /outside zambia|not zambian/i.test(text)) {
    session.signupDraft = mergeSignupDraft(session.signupDraft, { user_type: 'international' });
  }
  if (/^\S+@\S+\.\S+$/.test(text)) {
    session.signupDraft = mergeSignupDraft(session.signupDraft, { email: text });
  } else if (nextField === 'name' && !text.includes('@') && text.length < 80) {
    session.signupDraft = mergeSignupDraft(session.signupDraft, { name: text });
  } else if (nextField === 'whatsapp') {
    session.signupDraft = mergeSignupDraft(session.signupDraft, { whatsapp: text });
  } else if (nextField === 'nrc_id') {
    session.signupDraft = mergeSignupDraft(session.signupDraft, { nrc_id: text });
  } else if (nextField === 'password' && text.length >= 8 && !text.includes('@')) {
    session.signupDraft = mergeSignupDraft(session.signupDraft, { password: text });
  } else if (session.pendingAction?.type === 'login' && !session.signupDraft.password && text.length >= 6 && !text.includes('@')) {
    session.signupDraft = mergeSignupDraft(session.signupDraft, { password: text });
  }
}

function fillPendingActionFromSession(session, incoming) {
  const action = sanitizePendingAction(incoming);
  if (!action) return null;
  if (!action.eventSlug) action.eventSlug = session.eventIntent?.slug || '';
  if (!action.eventId) action.eventId = session.eventIntent?.id || '';
  if (!action.eventTitle) action.eventTitle = session.eventIntent?.title || '';
  if (!action.email) action.email = session.signupDraft?.email || '';
  return action;
}

export function siteChatTurnResult(session, extra = {}) {
  return {
    reply: extra.reply || '',
    cvDraft: session.cvDraft,
    readyToSaveCv: Boolean(extra.readyToSaveCv),
    saveCv: Boolean(extra.saveCv),
    missingCvFields: extra.missingCvFields || listMissingCvFields(session.cvDraft),
    pendingAction: sanitizePendingAction(session.pendingAction),
    ui: extra.ui !== undefined ? extra.ui : buildSiteChatUi(session),
    executeAction: Boolean(extra.executeAction),
    verifyCode: extra.verifyCode || '',
    signupDraft: sanitizeSignupDraft(session.signupDraft || {}),
    eventIntent: session.eventIntent || createEmptyEventIntent(),
  };
}

export async function processSiteChatTurn({
  visitorId,
  sessionId,
  message,
  cvDraft,
  signupDraft,
  eventIntent,
  signedIn = false,
  openai,
  toolContext = {},
} = {}) {
  const session = getOrCreateSiteChatSession(visitorId, sessionId);
  if (cvDraft) session.cvDraft = mergeCvDraft(session.cvDraft, cvDraft);
  if (signupDraft) session.signupDraft = mergeSignupDraft(session.signupDraft, signupDraft);
  if (eventIntent) session.eventIntent = mergeEventIntent(session.eventIntent, eventIntent);
  if (!session.signupDraft) session.signupDraft = createEmptySignupDraft();
  if (!session.eventIntent) session.eventIntent = createEmptyEventIntent();

  const userText = String(message || '').trim();
  absorbSignupHints(session, userText);
  session.messages.push({ role: 'user', content: redactSensitiveUserText(userText, session) });

  if (session.readyToSaveCv && isDeclineIntent(userText)) {
    session.readyToSaveCv = false;
    const reply = 'No problem — we can keep editing your CV. What should we change?';
    session.messages.push({ role: 'assistant', content: reply });
    return siteChatTurnResult(session, { reply, readyToSaveCv: false });
  }

  if (session.pendingAction && isDeclineIntent(userText)) {
    session.pendingAction = null;
    const reply = 'No problem. What would you like to do instead?';
    session.messages.push({ role: 'assistant', content: reply });
    return siteChatTurnResult(session, { reply });
  }

  const verifyCode = /^\d{6}$/.test(userText) ? userText : '';
  if (session.pendingAction && (isConfirmIntent(userText) || (session.pendingAction.type === 'verify_email' && verifyCode))) {
    return siteChatTurnResult(session, {
      reply: '',
      executeAction: true,
      verifyCode,
    });
  }

  if (typeof toolContext.emailExists === 'function' && session.signupDraft.email && !signedIn) {
    try {
      const exists = await toolContext.emailExists(session.signupDraft.email);
      if (exists) {
        const alreadyLogin = session.pendingAction?.type === 'login';
        session.pendingAction = sanitizePendingAction({
          type: 'login',
          email: session.signupDraft.email,
          eventSlug: session.eventIntent?.slug,
          eventId: session.eventIntent?.id,
          eventTitle: session.eventIntent?.title,
        });
        if (!alreadyLogin) {
          const reply = 'That email already has an account. What is your password so I can sign you in?';
          session.messages.push({ role: 'assistant', content: reply });
          return siteChatTurnResult(session, { reply });
        }
      }
    } catch {
      // continue into the model
    }
  }

  if (!signedIn && session.pendingAction?.type === 'login' && session.signupDraft.email && session.signupDraft.password && !isConfirmIntent(userText)) {
    const reply = 'Shall I sign you in now?';
    session.messages.push({ role: 'assistant', content: reply });
    return siteChatTurnResult(session, { reply });
  }

  if (!signedIn && listMissingSignupFields(session.signupDraft).length === 0 && session.pendingAction?.type !== 'signup') {
    session.pendingAction = sanitizePendingAction({
      type: 'signup',
      eventSlug: session.eventIntent?.slug,
      eventId: session.eventIntent?.id,
      eventTitle: session.eventIntent?.title,
    });
    const reply = 'I have everything I need. Shall I create your account now?';
    session.messages.push({ role: 'assistant', content: reply });
    return siteChatTurnResult(session, { reply });
  }

  const signupForModel = sanitizeSignupDraft(session.signupDraft);
  if (session.signupDraft.password) signupForModel.password = 'collected';

  const history = [
    { role: 'system', content: SITE_GUIDE },
    ...session.messages.slice(-16),
    {
      role: 'system',
      content: [
        `Signed in: ${signedIn ? 'yes' : 'no'}.`,
        `CV draft: ${JSON.stringify(session.cvDraft)}`,
        `Signup draft: ${JSON.stringify(signupForModel)}`,
        `Event intent: ${JSON.stringify(session.eventIntent)}`,
        `Pending action: ${JSON.stringify(sanitizePendingAction(session.pendingAction))}`,
      ].join(' '),
    },
  ];

  const raw = await callOpenAISiteChat({
    apiKey: openai?.apiKey,
    model: openai?.model,
    messages: history,
    toolContext,
  });
  const parsed = parseModelJson(raw);
  session.cvDraft = mergeCvDraft(session.cvDraft, parsed?.cvDraft || {});
  session.signupDraft = mergeSignupDraft(session.signupDraft, parsed?.signupDraft || {});
  session.eventIntent = mergeEventIntent(session.eventIntent, parsed?.eventIntent || {});
  if (parsed?.pendingAction) {
    session.pendingAction = fillPendingActionFromSession(session, parsed.pendingAction);
  }
  const reply = extractSiteAssistantReply(raw, parsed);
  session.messages.push({ role: 'assistant', content: reply });

  const missing = listMissingCvFields(session.cvDraft);
  const wantsSave = Boolean(parsed?.saveCv) || (session.readyToSaveCv && isConfirmIntent(userText));
  session.readyToSaveCv = cvDraftHasContent(session.cvDraft) && missing.length === 0 && (wantsSave || /save (my )?cv|looks good/i.test(userText));

  return siteChatTurnResult(session, {
    reply,
    readyToSaveCv: session.readyToSaveCv && missing.length === 0,
    saveCv: Boolean(wantsSave && signedIn && missing.length === 0),
    missingCvFields: missing,
  });
}

export function cvDraftToProfileUpdates(draft = {}) {
  const next = mergeCvDraft(createEmptyCvDraft(), draft);
  return {
    name: next.name,
    profession: next.profession,
    organization: next.organization,
    about: next.about,
    specialties: next.specialties,
    portfolio_url: next.portfolio_url,
    linkedin_url: next.linkedin_url,
    cv_sections: {
      education: next.education,
      experience: next.experience,
      references: next.references,
    },
  };
}
