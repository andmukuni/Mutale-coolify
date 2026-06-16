import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Pin,
  Send,
  ArrowLeft,
  Loader2,
  AlertCircle,
  EyeOff,
  Trash2,
  Plus,
} from 'lucide-react';
import { useUserAuth } from '../context/UserAuthContext';
import { useBooking } from '../context/BookingContext';
import {
  createForumReply,
  createForumTopic,
  fetchForumTopic,
  fetchForumTopics,
  moderateForumReply,
  moderateForumTopic,
  deleteForumReply,
  deleteForumTopic,
} from '../utils/eventForumApi';

function formatForumDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EventForumPanel({
  event,
  adminMode = false,
  compact = false,
  loginPath = '/account/login',
}) {
  const { currentUser, isUserAuthenticated } = useUserAuth();
  const { isUserRegistered } = useBooking();

  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [topicDetail, setTopicDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [showNewTopic, setShowNewTopic] = useState(false);

  const registered = event?.id && currentUser?.id
    ? isUserRegistered(currentUser.id, event.id, 'subscription')
    : false;
  const canPost = adminMode || (isUserAuthenticated && registered);

  const loadTopics = useCallback(async () => {
    if (!event?.id) return;
    setLoading(true);
    setError('');
    try {
      const rows = await fetchForumTopics(event.id, { admin: adminMode });
      setTopics(rows);
    } catch (err) {
      setError(err?.message || 'Could not load forum.');
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [adminMode, event?.id]);

  const loadTopicDetail = useCallback(async (topicId) => {
    if (!event?.id || !topicId) return;
    setDetailLoading(true);
    setError('');
    try {
      const data = await fetchForumTopic(event.id, topicId, { admin: adminMode });
      setTopicDetail(data);
    } catch (err) {
      setError(err?.message || 'Could not load topic.');
      setTopicDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [adminMode, event?.id]);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    if (activeTopicId) {
      void loadTopicDetail(activeTopicId);
    } else {
      setTopicDetail(null);
    }
  }, [activeTopicId, loadTopicDetail]);

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    if (!canPost) return;
    setSubmitting(true);
    setError('');
    try {
      await createForumTopic(event.id, { title: newTitle.trim(), body: newBody.trim() });
      setNewTitle('');
      setNewBody('');
      setShowNewTopic(false);
      await loadTopics();
    } catch (err) {
      setError(err?.message || 'Failed to create topic.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!canPost || !activeTopicId) return;
    setSubmitting(true);
    setError('');
    try {
      await createForumReply(event.id, activeTopicId, replyBody.trim());
      setReplyBody('');
      await loadTopicDetail(activeTopicId);
      await loadTopics();
    } catch (err) {
      setError(err?.message || 'Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleModerateTopic = async (topicId, updates) => {
    try {
      await moderateForumTopic(event.id, topicId, updates);
      await loadTopics();
      if (activeTopicId === topicId) await loadTopicDetail(topicId);
    } catch (err) {
      setError(err?.message || 'Moderation failed.');
    }
  };

  const handleDeleteTopic = async (topicId) => {
    if (!window.confirm('Delete this topic and all replies?')) return;
    try {
      await deleteForumTopic(event.id, topicId);
      if (activeTopicId === topicId) setActiveTopicId(null);
      await loadTopics();
    } catch (err) {
      setError(err?.message || 'Failed to delete topic.');
    }
  };

  const handleModerateReply = async (replyId, hidden) => {
    try {
      await moderateForumReply(event.id, replyId, hidden);
      if (activeTopicId) await loadTopicDetail(activeTopicId);
    } catch (err) {
      setError(err?.message || 'Failed to update reply.');
    }
  };

  const handleDeleteReply = async (replyId) => {
    if (!window.confirm('Delete this reply?')) return;
    try {
      await deleteForumReply(event.id, replyId);
      if (activeTopicId) {
        await loadTopicDetail(activeTopicId);
        await loadTopics();
      }
    } catch (err) {
      setError(err?.message || 'Failed to delete reply.');
    }
  };

  if (!event?.forum_enabled && !adminMode) {
    return null;
  }

  const rootClass = [
    adminMode ? 'bg-white rounded-lg shadow-sm border border-navy-100' : 'bg-white rounded-2xl border border-navy-100 shadow-sm',
    compact ? 'p-5' : 'p-6 sm:p-8',
  ].join(' ');

  return (
    <div className={rootClass}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-navy-900 flex items-center gap-2">
            <MessageSquare size={20} className="text-cyan-600" />
            Event Forum
          </h2>
          <p className="text-sm text-navy-500 mt-1">
            Discuss this event with other registered attendees.
          </p>
        </div>
        {canPost && !activeTopicId && (
          <button
            type="button"
            onClick={() => setShowNewTopic((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-600"
          >
            <Plus size={15} />
            New topic
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {!canPost && !adminMode && (
        <div className="mb-4 p-3.5 bg-navy-50 border border-navy-100 rounded-xl text-sm text-navy-600">
          {isUserAuthenticated ? (
            <>Register for this event to start or join discussions.</>
          ) : (
            <>
              <Link to={loginPath} className="text-cyan-600 hover:underline font-medium">Sign in</Link>
              {' '}and register to join the forum.
            </>
          )}
        </div>
      )}

      {showNewTopic && canPost && !activeTopicId && (
        <form onSubmit={handleCreateTopic} className="mb-6 p-4 rounded-xl border border-cyan-100 bg-cyan-50/40 space-y-3">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Topic title"
            maxLength={200}
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-navy-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="What would you like to discuss?"
            rows={4}
            maxLength={5000}
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-navy-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowNewTopic(false)}
              className="px-4 py-2 text-sm text-navy-600 hover:text-navy-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-60"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Post topic
            </button>
          </div>
        </form>
      )}

      {activeTopicId ? (
        <div>
          <button
            type="button"
            onClick={() => setActiveTopicId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-cyan-700 hover:text-cyan-600 mb-4"
          >
            <ArrowLeft size={14} />
            Back to topics
          </button>

          {detailLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 size={24} className="animate-spin text-cyan-600" />
            </div>
          ) : topicDetail?.topic ? (
            <div className="space-y-5">
              <article className="rounded-xl border border-navy-100 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {topicDetail.topic.pinned && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Pin size={11} /> Pinned
                      </span>
                    )}
                    {topicDetail.topic.hidden && adminMode && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                        <EyeOff size={11} /> Hidden
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-navy-900">{topicDetail.topic.title}</h3>
                  </div>
                  {adminMode && (
                    <div className="flex flex-wrap gap-1">
                      <ModButton
                        label={topicDetail.topic.pinned ? 'Unpin' : 'Pin'}
                        onClick={() => handleModerateTopic(topicDetail.topic.id, { pinned: !topicDetail.topic.pinned })}
                      />
                      <ModButton
                        label={topicDetail.topic.hidden ? 'Show' : 'Hide'}
                        onClick={() => handleModerateTopic(topicDetail.topic.id, { hidden: !topicDetail.topic.hidden })}
                      />
                      <ModButton label="Delete" danger onClick={() => handleDeleteTopic(topicDetail.topic.id)} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-navy-400 mb-3">
                  {topicDetail.topic.user_name} · {formatForumDate(topicDetail.topic.created_at)}
                </p>
                <p className="text-sm text-navy-700 whitespace-pre-wrap leading-relaxed">{topicDetail.topic.body}</p>
              </article>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-navy-800">
                  {topicDetail.replies?.length || 0} {topicDetail.replies?.length === 1 ? 'reply' : 'replies'}
                </h4>
                {(topicDetail.replies || []).map((reply) => (
                  <article
                    key={reply.id}
                    className={`rounded-xl border p-4 ${reply.hidden ? 'border-red-100 bg-red-50/30' : 'border-navy-100 bg-navy-50/40'}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                      <p className="text-xs text-navy-500">
                        <span className="font-semibold text-navy-700">{reply.user_name}</span>
                        {' · '}
                        {formatForumDate(reply.created_at)}
                      </p>
                      {adminMode && (
                        <div className="flex flex-wrap gap-1">
                          <ModButton
                            label={reply.hidden ? 'Show' : 'Hide'}
                            onClick={() => handleModerateReply(reply.id, !reply.hidden)}
                          />
                          <ModButton label="Delete" danger onClick={() => handleDeleteReply(reply.id)} />
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-navy-700 whitespace-pre-wrap leading-relaxed">{reply.body}</p>
                  </article>
                ))}
              </div>

              {canPost && (
                <form onSubmit={handleReply} className="pt-2 space-y-3">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a reply…"
                    rows={3}
                    maxLength={3000}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-navy-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-60"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Reply
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </div>
      ) : loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 size={24} className="animate-spin text-cyan-600" />
        </div>
      ) : topics.length === 0 ? (
        <p className="text-sm text-navy-500 py-6 text-center">No discussions yet. Be the first to start one.</p>
      ) : (
        <ul className="divide-y divide-navy-100">
          {topics.map((topic) => (
            <li key={topic.id}>
              <button
                type="button"
                onClick={() => setActiveTopicId(topic.id)}
                className="w-full text-left py-4 px-1 hover:bg-navy-50/60 rounded-lg transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {topic.pinned && <Pin size={12} className="text-amber-600 shrink-0" />}
                      {topic.hidden && adminMode && <EyeOff size={12} className="text-red-500 shrink-0" />}
                      <span className="font-semibold text-navy-900 group-hover:text-cyan-700 transition-colors truncate">
                        {topic.title}
                      </span>
                    </div>
                    <p className="text-xs text-navy-400">
                      {topic.user_name} · {formatForumDate(topic.last_activity_at || topic.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-navy-500 bg-navy-100 px-2 py-1 rounded-full">
                    {topic.reply_count} {topic.reply_count === 1 ? 'reply' : 'replies'}
                  </span>
                </div>
                {adminMode && (
                  <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    <ModButton
                      label={topic.pinned ? 'Unpin' : 'Pin'}
                      onClick={() => handleModerateTopic(topic.id, { pinned: !topic.pinned })}
                    />
                    <ModButton
                      label={topic.hidden ? 'Show' : 'Hide'}
                      onClick={() => handleModerateTopic(topic.id, { hidden: !topic.hidden })}
                    />
                    <ModButton label="Delete" danger onClick={() => handleDeleteTopic(topic.id)} />
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModButton({ label, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
        danger
          ? 'text-red-700 hover:bg-red-50'
          : 'text-navy-600 hover:bg-navy-100'
      }`}
    >
      {danger && <Trash2 size={11} />}
      {label}
    </button>
  );
}
