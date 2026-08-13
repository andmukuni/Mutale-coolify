import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';
import { getSessionAuthHeaders } from '../utils/authHeaders';
import { useUserAuth } from '../context/UserAuthContext';
import { chatMarkdownToHtml, CHAT_MARKDOWN_SANITIZE } from '../utils/chatMarkdown';
import { LoadingButton } from './ui';

const API_BASE = getApiBase();
const STORAGE_KEY = 'mutale.siteAssistant.v1';

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: 'Hi — I can help with events, tickets, your account, or building a CV right here. What do you need?',
};

function newSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `site-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStored() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '');
    return parsed?.sessionId ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function clearStored() {
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
      className="[&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-navy-900 [&_em]:italic [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1.5 [&_a]:font-medium [&_a]:text-cyan-700 [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function cvRows(draft = {}) {
  return [
    ['Name', draft.name],
    ['Profession', draft.profession],
    ['Organization', draft.organization],
    ['About', draft.about],
    ['Experience', (draft.experience || []).map((row) => row.title || row.company).filter(Boolean).join(', ')],
    ['Education', (draft.education || []).map((row) => row.institution || row.degree).filter(Boolean).join(', ')],
  ].filter(([, value]) => String(value || '').trim());
}

export default function SiteAssistantPanel({ open = true, onClose }) {
  const { isUserAuthenticated, currentUser, applySessionUser } = useUserAuth();
  const listRef = useRef(null);
  const storedRef = useRef(typeof window === 'undefined' ? null : readStored());
  const stored = storedRef.current;
  const [sessionId, setSessionId] = useState(() => stored?.sessionId || newSessionId());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cvDraft, setCvDraft] = useState(stored?.cvDraft || {});
  const [readyToSaveCv, setReadyToSaveCv] = useState(Boolean(stored?.readyToSaveCv));
  const [savedCv, setSavedCv] = useState(false);
  const [messages, setMessages] = useState(
    Array.isArray(stored?.messages) && stored.messages.length ? stored.messages : [WELCOME_MESSAGE],
  );

  const filledRows = useMemo(() => cvRows(cvDraft), [cvDraft]);

  useEffect(() => {
    writeStored({ sessionId, messages, cvDraft, readyToSaveCv });
  }, [sessionId, messages, cvDraft, readyToSaveCv]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending, saving]);

  const applyResult = (data) => {
    if (data?.reply) setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    if (data?.cvDraft) setCvDraft(data.cvDraft);
    setReadyToSaveCv(Boolean(data?.readyToSaveCv));
  };

  const sendMessage = async (text) => {
    const message = String(text || '').trim();
    if (!message || sending || saving) return;
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    try {
      const response = await fetch(`${API_BASE}/site-chat`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sessionId, message, cvDraft }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) throw new Error(json?.message || 'Chat failed.');
      applyResult(json.data || {});
      if (json.data?.saveCv && isUserAuthenticated) {
        await saveCv(json.data.cvDraft);
      }
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: error.message || 'I could not reach the assistant. Please try again.',
      }]);
    } finally {
      setSending(false);
    }
  };

  const saveCv = async (draftOverride) => {
    if (!isUserAuthenticated) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sign in at /account/login so I can save this CV to your profile.',
      }]);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/site-chat/save-cv`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sessionId, cvDraft: draftOverride || cvDraft }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) throw new Error(json?.message || 'Could not save the CV.');
      if (json.data?.user) applySessionUser?.(json.data.user);
      setSavedCv(true);
      setReadyToSaveCv(false);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Your CV is saved to your profile. Open **[My CV](/account/cv)** to pick a template and download it.',
      }]);
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: error.message || 'Could not save the CV.',
      }]);
    } finally {
      setSaving(false);
    }
  };

  const resetChat = async () => {
    const nextId = newSessionId();
    setSavedCv(false);
    setReadyToSaveCv(false);
    setCvDraft({});
    setSessionId(nextId);
    clearStored();
    try {
      await fetch(`${API_BASE}/site-chat/reset`, {
        method: 'POST',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // local reset still happens
    }
    setMessages([{ role: 'assistant', content: 'Fresh start. How can I help?' }]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-navy-900/40" aria-label="Close assistant" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#141D45] text-white">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-navy-900">Ask Mutale</h2>
              <p className="text-xs text-navy-500">
                {isUserAuthenticated ? `Hi ${currentUser?.name || 'there'} — site & CV help` : 'Site, tickets, account & CV help'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={resetChat} className="rounded-lg p-2 text-navy-500 hover:bg-navy-50" title="Start over">
              <RotateCcw size={16} />
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-navy-500 hover:bg-navy-50" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>

        {filledRows.length > 0 && (
          <div className="border-b border-navy-100 bg-navy-50/70 px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-navy-400">CV so far</p>
            <dl className="grid gap-1 text-xs text-navy-700">
              {filledRows.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-navy-400">{label}</dt>
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
                item.role === 'user' ? 'ml-auto whitespace-pre-wrap bg-[#141D45] text-white' : 'bg-navy-50 text-navy-800'
              }`}
            >
              {item.role === 'assistant' ? <AssistantMarkdown content={item.content} /> : item.content}
            </div>
          ))}
          {(sending || saving) && (
            <div className="max-w-[90%] rounded-2xl bg-navy-50 px-3.5 py-2.5 text-sm text-navy-600" role="status">
              {saving ? 'Saving your CV…' : 'Thinking…'}
            </div>
          )}
        </div>

        <div className="border-t border-navy-100 p-3 space-y-2">
          {!isUserAuthenticated && (
            <p className="text-[11px] text-navy-500">
              <Link to="/account/login" className="font-medium text-cyan-700 hover:underline">Sign in</Link>
              {' '}to save a CV or look up your tickets.
            </p>
          )}
          {readyToSaveCv && isUserAuthenticated && !savedCv && (
            <LoadingButton
              type="button"
              onClick={() => saveCv()}
              loading={saving}
              className="w-full rounded-xl bg-[#00A79D] py-2.5 text-sm font-semibold text-white"
            >
              Save CV to my profile
            </LoadingButton>
          )}
          {savedCv && (
            <Link to="/account/cv" className="block w-full rounded-xl bg-cyan-50 py-2.5 text-center text-sm font-semibold text-cyan-800">
              Open My CV
            </Link>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(input);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(input);
                }
              }}
              rows={2}
              placeholder="Ask about events, tickets, or start a CV…"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-navy-200 px-3 py-2 text-sm text-navy-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
            <button
              type="submit"
              disabled={sending || saving || !input.trim()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#141D45] text-white disabled:opacity-50"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
