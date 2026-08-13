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
  'Always reply as JSON: { "reply": "markdown", "cvDraft": {}, "saveCv": false }.',
  'Only set saveCv=true when the user clearly confirms saving their CV and they are signed in.',
  '',
  'Public pages:',
  '- / events listing, /events/:slug details, /events/:slug/register to buy a ticket',
  '- Virtual events: join at /events/:slug/join on the event day after registering',
  '- Tickets: /tickets/:code. Certificates verify at /certificates/verify/:code',
  '- Shop /books, blog /blog, publications /publications, about /about, experience /experience, contact /contact',
  '- Account: /account/login, /account/register, /account/profile, /account/my-events, /account/cv',
  '',
  'Events: one registration can cover a session series. Status is upcoming / in progress / passed in Africa/Lusaka.',
  'Paid events use Lenco (mobile money or card). Free events still need registration.',
  'After an event ends, eligible attendees may get a certificate by email if the event has certificates enabled.',
  '',
  'CV help: you can build a CV in this chat.',
  'Collect: name, profession, organization, about, specialties, LinkedIn/portfolio, education, experience, references.',
  'Ask one or two questions at a time. Put structured fields in cvDraft.',
  'Signed-in users can save to their profile, then open /account/cv to pick a template and download (download may require a one-time fee).',
  'If they are not signed in, collect the draft and ask them to sign in at /account/login so you can save it.',
  'Never invent certificates or event attendance. Use get_user_context for their real records.',
  'Never invent payment, meeting links, or admin actions. Link to the right page instead.',
].join('\n');

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
    if (!context.user) return 'The visitor is not signed in. Ask them to sign in at /account/login for account or CV save help.';
    return JSON.stringify(context.user);
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
  };
}

export function importSiteChatSession(visitorId, sessionId, data = {}) {
  const session = {
    messages: Array.isArray(data.messages) ? data.messages : [],
    cvDraft: mergeCvDraft(createEmptyCvDraft(), data.cvDraft || {}),
    readyToSaveCv: Boolean(data.readyToSaveCv),
  };
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
    });
  }
  return sessions.get(key);
}

export function resetSiteChatSession(visitorId, sessionId) {
  sessions.delete(siteSessionKey(visitorId, sessionId));
}

export async function processSiteChatTurn({
  visitorId,
  sessionId,
  message,
  cvDraft,
  signedIn = false,
  openai,
  toolContext = {},
} = {}) {
  const session = getOrCreateSiteChatSession(visitorId, sessionId);
  if (cvDraft) session.cvDraft = mergeCvDraft(session.cvDraft, cvDraft);

  const userText = String(message || '').trim();
  session.messages.push({ role: 'user', content: userText });

  if (session.readyToSaveCv && isDeclineIntent(userText)) {
    session.readyToSaveCv = false;
    const reply = 'No problem — we can keep editing your CV. What should we change?';
    session.messages.push({ role: 'assistant', content: reply });
    return { reply, cvDraft: session.cvDraft, readyToSaveCv: false, saveCv: false };
  }

  const history = [
    { role: 'system', content: SITE_GUIDE },
    ...session.messages.slice(-16),
    {
      role: 'system',
      content: `Signed in: ${signedIn ? 'yes' : 'no'}. Current CV draft: ${JSON.stringify(session.cvDraft)}`,
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
  const reply = extractSiteAssistantReply(raw, parsed);
  session.messages.push({ role: 'assistant', content: reply });

  const missing = listMissingCvFields(session.cvDraft);
  const wantsSave = Boolean(parsed?.saveCv) || (session.readyToSaveCv && isConfirmIntent(userText));
  session.readyToSaveCv = cvDraftHasContent(session.cvDraft) && missing.length === 0 && (wantsSave || /save (my )?cv|looks good/i.test(userText));

  return {
    reply,
    cvDraft: session.cvDraft,
    readyToSaveCv: session.readyToSaveCv && missing.length === 0,
    saveCv: Boolean(wantsSave && signedIn && missing.length === 0),
    missingCvFields: missing,
  };
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
