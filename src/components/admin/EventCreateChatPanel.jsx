import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { useToast } from '../../context/ToastContext';
import { LoadingButton } from '../ui';

const API_BASE = getApiBase();

function newSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftRows(draft = {}) {
  return [
    ['Title', draft.title],
    ['Category', draft.category],
    ['Mode', draft.event_mode],
    ['Location', draft.location],
    ['Venue', draft.venue],
    ['Dates', [draft.start_date, draft.end_date].filter(Boolean).join(' → ')],
    ['Time', [draft.start_time, draft.end_time].filter(Boolean).join(' – ')],
    ['Deadline', [draft.registration_deadline, draft.registration_deadline_time].filter(Boolean).join(' ')],
    ['Price', draft.is_free ? 'Free' : (draft.price ? `ZMW ${draft.price}` : '')],
  ].filter(([, value]) => String(value || '').trim());
}

export default function EventCreateChatPanel({ onClose, onCreated }) {
  const toast = useToast();
  const listRef = useRef(null);
  const [sessionId] = useState(newSessionId);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [readyToCreate, setReadyToCreate] = useState(false);
  const [draft, setDraft] = useState({});
  const [created, setCreated] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Describe the event you want to create. I will look up best practice and ask for the details needed to save it as a draft.',
    },
  ]);

  const filledRows = useMemo(() => draftRows(draft), [draft]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, created]);

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
        body: JSON.stringify({ sessionId, message }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || `Chat failed (${response.status})`);
      }
      applyResult(json.data || {});
      if (json.data?.confirmed) {
        await createEvent();
      }
    } catch (error) {
      const msg = error.message || 'Could not reach the event assistant.';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const createEvent = async () => {
    setCreating(true);
    try {
      const response = await fetch(`${API_BASE}/events/chat/create`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sessionId, confirm: true }),
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
    setCreated(null);
    setReadyToCreate(false);
    setDraft({});
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
                  ? 'ml-auto bg-cyan-600 text-white'
                  : 'bg-navy-50 text-navy-800'
              }`}
            >
              {item.content}
            </div>
          ))}

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
              rows={2}
              placeholder="Type a reply…"
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
