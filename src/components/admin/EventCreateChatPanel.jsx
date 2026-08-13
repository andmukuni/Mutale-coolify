import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { Download, ExternalLink, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { useToast } from '../../context/ToastContext';
import { chatMarkdownToHtml, CHAT_MARKDOWN_SANITIZE } from '../../utils/chatMarkdown';
import { LoadingButton } from '../ui';

const API_BASE = getApiBase();
const STORAGE_KEY = 'mutale.eventCreateChat.v1';

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: 'Tell me about the event in your own words — topic, who it is for, in person or online, and any date you have in mind. I will fill in as much as I can and only ask what is still missing.',
};

function newSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const THINKING_LABELS = [
  'Thinking…',
  'Searching the web…',
  'Checking event-form rules…',
  'Drafting a reply…',
];

function ThinkingBubble({ creating = false }) {
  const labels = creating ? ['Creating the draft…'] : THINKING_LABELS;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (labels.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % labels.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [labels.length]);

  const label = labels[index] || labels[0];

  return (
    <div
      className="max-w-[90%] rounded-2xl bg-navy-50 px-3.5 py-2.5 text-sm text-navy-600"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-600 animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-600 animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-600 animate-bounce" />
        </span>
        <span className="animate-pulse">{label}</span>
      </div>
    </div>
  );
}

function draftRows(draft = {}) {
  const priceLabel = draft.is_free === true
    ? 'Free'
    : (draft.is_free === false && draft.price ? `ZMW ${draft.price}` : '');

  return [
    ['Title', draft.title],
    ['Category', draft.category],
    ['Mode', draft.event_mode],
    ['Location', draft.location],
    ['Venue', draft.venue],
    ['Dates', [draft.start_date, draft.end_date].filter(Boolean).join(' → ')],
    ['Time', [draft.start_time, draft.end_time].filter(Boolean).join(' – ')],
    ['Deadline', [draft.registration_deadline, draft.registration_deadline_time].filter(Boolean).join(' ')],
    ['Price', priceLabel],
    ['Capacity', draft.capacity],
    ['Organizer', draft.organizer_name],
  ].filter(([, value]) => String(value || '').trim());
}

function readStoredChat() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredChat(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

function clearStoredChat() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function AssistantMarkdown({ content }) {
  const html = DOMPurify.sanitize(chatMarkdownToHtml(content), CHAT_MARKDOWN_SANITIZE);
  return (
    <div
      className="[&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-navy-900 [&_em]:italic [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1.5 [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-navy-900"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function EventCreateChatPanel({ onClose, onCreated, open = true }) {
  const toast = useToast();
  const listRef = useRef(null);
  const storedRef = useRef(typeof window === 'undefined' ? null : readStoredChat());
  const stored = storedRef.current;
  const [sessionId, setSessionId] = useState(() => stored?.sessionId || newSessionId());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [readyToCreate, setReadyToCreate] = useState(Boolean(stored?.readyToCreate));
  const [draft, setDraft] = useState(stored?.draft || {});
  const [created, setCreated] = useState(stored?.created || null);
  const [messages, setMessages] = useState(
    Array.isArray(stored?.messages) && stored.messages.length ? stored.messages : [WELCOME_MESSAGE],
  );

  const filledRows = useMemo(() => draftRows(draft), [draft]);

  useEffect(() => {
    writeStoredChat({
      sessionId,
      messages,
      draft,
      readyToCreate,
      created,
    });
  }, [sessionId, messages, draft, readyToCreate, created]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/events/chat/session?sessionId=${encodeURIComponent(sessionId)}`, {
          headers: getAdminAuthHeaders(),
        });
        const json = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || !json?.ok || !json.data) return;
        const remote = json.data;
        if (Array.isArray(remote.messages) && remote.messages.length) {
          setMessages((prev) => (prev.length > 1 ? prev : [
            WELCOME_MESSAGE,
            ...remote.messages.filter((item) => item?.content),
          ]));
        }
        if (remote.draft) setDraft((prev) => ({ ...prev, ...remote.draft }));
        if (remote.created?.event) setCreated((prev) => prev || remote.created);
        setReadyToCreate(Boolean(remote.awaitingConfirm || remote.readyToCreate));
      } catch {
        // keep local session
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, created, sending, creating]);

  const applyResult = (data) => {
    if (data?.reply) {
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    }
    if (data?.draft) setDraft(data.draft);
    setReadyToCreate(Boolean(data?.readyToCreate));
  };

  const sendMessage = async (text) => {
    const message = String(text || '').trim();
    if (!message || sending || creating) return;

    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');

    try {
      const response = await fetch(`${API_BASE}/events/chat`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sessionId, message, draft }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || `Chat failed (${response.status})`);
      }
      applyResult(json.data || {});
      if (json.data?.confirmed) {
        await createEvent(json.data.draft);
      }
    } catch (error) {
      const msg = error.message || 'Could not reach the event assistant.';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const createEvent = async (draftOverride) => {
    setCreating(true);
    try {
      const response = await fetch(`${API_BASE}/events/chat/create`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sessionId, confirm: true, draft: draftOverride || draft }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || `Create failed (${response.status})`);
      }
      setCreated(json.data || {});
      setReadyToCreate(false);
      toast.success('Draft event created.');
      onCreated?.(json.data?.event);
    } catch (error) {
      const msg = error.message || 'Could not create the event.';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const resetChat = async () => {
    const nextId = newSessionId();
    setCreated(null);
    setReadyToCreate(false);
    setDraft({});
    setSessionId(nextId);
    clearStoredChat();
    try {
      await fetch(`${API_BASE}/events/chat/reset`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // local reset still happens
    }
    setMessages([
      {
        role: 'assistant',
        content: 'Let us start again. What event would you like to create?',
      },
    ]);
  };

  const downloadQr = () => {
    if (!created?.qrDataUrl) return;
    const link = document.createElement('a');
    const slug = created.event?.slug || created.event?.id || 'event';
    link.href = created.qrDataUrl;
    link.download = `event-qr-${slug}.png`;
    link.click();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-navy-900/40"
        aria-label="Close event assistant"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600 text-white">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-navy-900">Event assistant</h2>
              <p className="text-xs text-navy-500">Creates a draft after you confirm</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={resetChat}
              className="rounded-lg p-2 text-navy-500 hover:bg-navy-50"
              title="Start over"
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-navy-500 hover:bg-navy-50"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {filledRows.length > 0 && (
          <div className="border-b border-navy-100 bg-navy-50/70 px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-navy-400">Draft so far</p>
            <dl className="grid grid-cols-1 gap-1 text-xs text-navy-700">
              {filledRows.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-20 shrink-0 text-navy-400">{label}</dt>
                  <dd className="min-w-0 truncate font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                item.role === 'user'
                  ? 'ml-auto whitespace-pre-wrap bg-cyan-600 text-white'
                  : 'bg-navy-50 text-navy-800'
              }`}
            >
              {item.role === 'assistant' ? <AssistantMarkdown content={item.content} /> : item.content}
            </div>
          ))}

          {(sending || creating) && !created && (
            <ThinkingBubble creating={creating} />
          )}

          {created && (
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-cyan-950 space-y-3">
              <p className="font-semibold">Draft event created</p>
              {created.publicUrl && (
                <a href={created.publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-cyan-800 underline">
                  Public page <ExternalLink size={14} />
                </a>
              )}
              {created.event?.id && (
                <Link to={`/admin/events/${created.event.id}`} className="flex items-center gap-1.5 text-cyan-800 underline">
                  Open in admin
                </Link>
              )}
              {created.qrDataUrl && (
                <div className="space-y-2">
                  <img src={created.qrDataUrl} alt="Event QR code" className="h-36 w-36 rounded-xl border border-cyan-200 bg-white p-2" />
                  <button
                    type="button"
                    onClick={downloadQr}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-800"
                  >
                    <Download size={14} />
                    Download QR
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <form
          className="border-t border-navy-100 p-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          {readyToCreate && !created && (
            <LoadingButton
              type="button"
              onClick={createEvent}
              loading={creating}
              loadingLabel="Creating…"
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium"
            >
              Create draft event
            </LoadingButton>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                sendMessage(input);
              }}
              rows={2}
              placeholder="Describe the event, or just say hello… Enter to send"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <LoadingButton
              type="submit"
              loading={sending}
              disabled={!input.trim() || sending || creating}
              className="shrink-0 rounded-xl bg-cyan-600 p-2.5 text-white hover:bg-cyan-500 disabled:opacity-50"
              aria-label="Send"
            >
              <Send size={16} />
            </LoadingButton>
          </div>
        </form>
      </aside>
    </div>
  );
}
