import { getApiBase } from './apiBase';
import { getAdminAuthHeaders, getSessionAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function authHeaders(admin = false) {
  return admin ? getAdminAuthHeaders() : getSessionAuthHeaders();
}

export async function fetchForumTopics(eventId, { admin = false } = {}) {
  const res = await fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}/forum/topics`, {
    cache: 'no-store',
    headers: authHeaders(admin),
  });
  const json = await readJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load forum topics.');
  }
  return Array.isArray(json.data) ? json.data : [];
}

export async function fetchForumTopic(eventId, topicId, { admin = false } = {}) {
  const res = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}/forum/topics/${encodeURIComponent(topicId)}`,
    { cache: 'no-store', headers: authHeaders(admin) },
  );
  const json = await readJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load topic.');
  }
  return json.data;
}

export async function createForumTopic(eventId, { title, body }) {
  const res = await fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}/forum/topics`, {
    method: 'POST',
    headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title, body }),
  });
  const json = await readJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to create topic.');
  }
  return json.data;
}

export async function createForumReply(eventId, topicId, body) {
  const res = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}/forum/topics/${encodeURIComponent(topicId)}/replies`,
    {
      method: 'POST',
      headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ body }),
    },
  );
  const json = await readJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to post reply.');
  }
  return json.data;
}

export async function moderateForumTopic(eventId, topicId, updates) {
  const res = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}/forum/topics/${encodeURIComponent(topicId)}`,
    {
      method: 'PATCH',
      headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    },
  );
  const json = await readJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to update topic.');
  }
  return json.data;
}

export async function deleteForumTopic(eventId, topicId) {
  const res = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}/forum/topics/${encodeURIComponent(topicId)}`,
    { method: 'DELETE', headers: getAdminAuthHeaders() },
  );
  const json = await readJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to delete topic.');
  }
  return json;
}

export async function moderateForumReply(eventId, replyId, hidden) {
  const res = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}/forum/replies/${encodeURIComponent(replyId)}`,
    {
      method: 'PATCH',
      headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ hidden }),
    },
  );
  const json = await readJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to update reply.');
  }
  return json.data;
}

export async function deleteForumReply(eventId, replyId) {
  const res = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}/forum/replies/${encodeURIComponent(replyId)}`,
    { method: 'DELETE', headers: getAdminAuthHeaders() },
  );
  const json = await readJson(res);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to delete reply.');
  }
  return json;
}
