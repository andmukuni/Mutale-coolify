import { useEffect, useMemo, useState } from 'react';
import { PageHeader, DataTable, FormField, LoadingButton } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

export default function ContactMessagesPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [markingReadId, setMarkingReadId] = useState(null);
  const [replyNotice, setReplyNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/contact-messages`, {
          headers: getAdminAuthHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to load contact messages.');
        setMessages(Array.isArray(json?.data) ? json.data : []);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load contact messages.');
        setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const markAsRead = async (id) => {
    setMarkingReadId(id);
    try {
      const res = await fetch(`${API_BASE}/contact-messages/${id}/read`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'Failed to update message status.');
      }

      setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, is_read: 1 } : msg)));
    } catch (err) {
      setError(err?.message || 'Failed to update message status.');
    } finally {
      setMarkingReadId(null);
    }
  };

  const openMessage = async (message) => {
    setSelectedMessage(message);
    setReplyNotice(null);
    setReplySubject(`Re: ${message?.subject || 'Your message'}`);
    setReplyBody('');
    if (!message?.is_read) {
      await markAsRead(message.id);
      setSelectedMessage((prev) => (prev ? { ...prev, is_read: 1 } : prev));
    }
  };

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return messages.filter((msg) => {
      const read = Boolean(msg.is_read);
      const statusMatch = statusFilter === 'all' || (statusFilter === 'read' ? read : !read);
      if (!statusMatch) return false;
      if (!term) return true;

      const haystack = [msg.name, msg.email, msg.phone, msg.subject, msg.message]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return haystack.includes(term);
    });
  }, [messages, query, statusFilter]);

  const columns = [
    {
      key: 'name',
      label: 'From',
      render: (_val, row) => (
        <div>
          <p className="font-medium text-navy-800">{row.name}</p>
          <p className="text-xs text-navy-500">{row.email}</p>
          <p className="text-xs text-navy-500">{row.phone || '—'}</p>
        </div>
      ),
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (val) => <span className="text-navy-700 font-medium">{val}</span>,
    },
    {
      key: 'message',
      label: 'Message',
      render: (val) => (
        <span className="text-navy-500 text-sm block max-w-md truncate">
          {val}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Received',
      render: (val) => <span className="text-xs text-navy-500">{formatDate(val)}</span>,
    },
    {
      key: 'is_read',
      label: 'Status',
      render: (val) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${val ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {val ? 'Read' : 'New'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_val, row) => (
        <div className="flex justify-end">
          {!row.is_read ? (
            <LoadingButton
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void markAsRead(row.id);
              }}
              loading={markingReadId === row.id}
              loadingLabel="Marking…"
              spinnerSize={12}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors"
            >
              Mark as read
            </LoadingButton>
          ) : (
            <span className="text-xs text-navy-400">—</span>
          )}
        </div>
      ),
    },
  ];

  const handleSendReply = async () => {
    if (!selectedMessage?.id) return;
    if (!replySubject.trim() || !replyBody.trim()) {
      setReplyNotice({ type: 'error', message: 'Reply subject and message are required.' });
      return;
    }

    setSendingReply(true);
    setReplyNotice(null);
    try {
      const res = await fetch(`${API_BASE}/contact-messages/${selectedMessage.id}/reply`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ subject: replySubject, message: replyBody }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'Failed to send reply.');
      }

      setReplyNotice({ type: 'success', message: 'Reply sent successfully to guest email.' });
      setMessages((prev) => prev.map((m) => (m.id === selectedMessage.id ? { ...m, is_read: 1 } : m)));
    } catch (err) {
      setReplyNotice({ type: 'error', message: err?.message || 'Failed to send reply.' });
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Contact Messages"
        subtitle={`${messages.length} total message(s)`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Messages' },
        ]}
      />

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <FormField
          label="Search"
          name="message-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, subject, message"
        />
        <FormField
          label="Status"
          name="message-status"
          type="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread' },
            { value: 'read', label: 'Read' },
          ]}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        onRowClick={(row) => { void openMessage(row); }}
        emptyTitle="No messages yet"
        emptyDescription="Messages sent from the contact form will appear here."
      />

      {selectedMessage && (
        <div className="mt-5 rounded-2xl border border-navy-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-navy-900">{selectedMessage.subject}</h3>
              <p className="text-sm text-navy-500 mt-0.5">
                From <span className="font-medium text-navy-700">{selectedMessage.name}</span>
                {' '}· {selectedMessage.email}
                {selectedMessage.phone ? ` · ${selectedMessage.phone}` : ''}
              </p>
              <p className="text-xs text-navy-400 mt-1">
                Received {selectedMessage.created_at ? formatDate(selectedMessage.created_at) : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMessage(null)}
                className="px-3 py-2 rounded-lg border border-navy-200 bg-white text-navy-600 text-sm font-medium hover:bg-navy-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-navy-100 bg-navy-50/40 p-4 whitespace-pre-wrap text-sm text-navy-700 leading-relaxed">
            {selectedMessage.message}
          </div>

          <div className="mt-4 rounded-xl border border-navy-100 bg-white p-4 space-y-3">
            <h4 className="text-sm font-semibold text-navy-900">Reply to Guest</h4>

            {replyNotice && (
              <div className={`rounded-lg border px-3 py-2 text-sm ${replyNotice.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {replyNotice.message}
              </div>
            )}

            <FormField
              label="Subject"
              name="reply-subject"
              value={replySubject}
              onChange={(e) => setReplySubject(e.target.value)}
              placeholder="Reply subject"
            />

            <FormField
              label="Message"
              name="reply-body"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              textarea
              rows={5}
              placeholder="Type your response to the guest..."
            />

            <div className="flex items-center justify-end">
              <LoadingButton
                type="button"
                onClick={() => { void handleSendReply(); }}
                loading={sendingReply}
                loadingLabel="Sending…"
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
              >
                Send Reply
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
