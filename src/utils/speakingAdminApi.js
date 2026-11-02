import { getApiBase } from './apiBase';
import { getAdminAuthHeaders } from './authHeaders';
import { compressImageFile } from './compressImageFile';
import { readFileAsDataUrl } from './uploadBlogImage';

const API_BASE = getApiBase();
const BASE = `${API_BASE}/admin/speaking/engagements`;

/** Errors carry `fieldErrors` when the server rejected specific fields. */
async function request(url, { method = 'GET', body, fallback } = {}) {
  const res = await fetch(url, {
    method,
    headers: getAdminAuthHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const error = new Error(json?.message || fallback);
    error.status = res.status;
    error.fieldErrors = json?.errors || null;
    throw error;
  }
  return json.data;
}

export const fetchSpeakingEngagements = () => request(BASE, { fallback: 'Failed to load speaking engagements.' });

export const fetchSpeakingEngagement = (id) => request(`${BASE}/${encodeURIComponent(id)}`, {
  fallback: 'Failed to load the speaking engagement.',
});

export const createSpeakingEngagement = (payload) => request(BASE, {
  method: 'POST', body: payload, fallback: 'Failed to save the speaking engagement.',
});

export const updateSpeakingEngagement = (id, payload) => request(`${BASE}/${encodeURIComponent(id)}`, {
  method: 'PUT', body: payload, fallback: 'Failed to update the speaking engagement.',
});

export const duplicateSpeakingEngagement = (id) => request(`${BASE}/${encodeURIComponent(id)}/duplicate`, {
  method: 'POST', body: {}, fallback: 'Failed to duplicate the speaking engagement.',
});

export const publishSpeakingEngagement = (id) => request(`${BASE}/${encodeURIComponent(id)}/publish`, {
  method: 'POST', body: {}, fallback: 'Failed to publish the speaking engagement.',
});

export const hideSpeakingEngagement = (id) => request(`${BASE}/${encodeURIComponent(id)}/hide`, {
  method: 'POST', body: {}, fallback: 'Failed to hide the speaking engagement.',
});

export const deleteSpeakingEngagement = (id) => request(`${BASE}/${encodeURIComponent(id)}`, {
  method: 'DELETE', fallback: 'Failed to delete the speaking engagement.',
});

export async function uploadSpeakingImage(file) {
  if (!file) throw new Error('No image selected.');
  const prepared = await compressImageFile(file);
  const image = await readFileAsDataUrl(prepared);
  const res = await fetch(`${API_BASE}/admin/speaking/upload-image`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ image }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json?.url) throw new Error(json?.message || `Image upload failed (${res.status}).`);
  // Keep the site-relative /uploads path, so a domain change can't break the image.
  return json.url;
}

const MAX_PROFILE_BYTES = 7 * 1024 * 1024;

/** Upload the approved speaker profile PDF and return its /uploads URL. */
export async function uploadSpeakerProfilePdf(file) {
  if (!file) throw new Error('No file selected.');
  if (file.type !== 'application/pdf') throw new Error('Upload a PDF file.');
  if (file.size > MAX_PROFILE_BYTES) throw new Error('The PDF must be 7 MB or smaller.');
  const res = await fetch(`${API_BASE}/admin/speaking/speaker-profile`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ file: await readFileAsDataUrl(file) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json?.url) throw new Error(json?.message || `Upload failed (${res.status}).`);
  return json.url;
}

const ENQUIRIES = `${API_BASE}/admin/speaking/enquiries`;

export const fetchSpeakingEnquiries = () => request(ENQUIRIES, { fallback: 'Failed to load speaking enquiries.' });

export const updateSpeakingEnquiry = (id, payload) => request(`${ENQUIRIES}/${encodeURIComponent(id)}`, {
  method: 'PUT', body: payload, fallback: 'Failed to update the enquiry.',
});

export const deleteSpeakingEnquiry = (id) => request(`${ENQUIRIES}/${encodeURIComponent(id)}`, {
  method: 'DELETE', fallback: 'Failed to delete the enquiry.',
});

/** Explicit admin action: returns { engagement, enquiry }. The engagement is an unpublished draft. */
export const createDraftFromSpeakingEnquiry = (id) => request(`${ENQUIRIES}/${encodeURIComponent(id)}/create-draft`, {
  method: 'POST', body: {}, fallback: 'Failed to create the draft engagement.',
});

/** Email the organiser from the site's address. Returns the updated enquiry. */
export const replyToSpeakingEnquiry = (id, payload) => request(`${ENQUIRIES}/${encodeURIComponent(id)}/reply`, {
  method: 'POST', body: payload, fallback: 'The reply could not be sent.',
});

/** Activity totals: { days, page: { profile_download, enquiries }, engagements: { [id]: { [metric]: { total, recent } } } } */
export const fetchSpeakingMetrics = () => request(`${API_BASE}/admin/speaking/metrics`, {
  fallback: 'Failed to load speaking activity.',
});

/** Number of enquiries still marked "New", for the admin sidebar badge. */
export const fetchNewEnquiryCount = () => request(`${API_BASE}/admin/speaking/enquiries-summary`, {
  fallback: 'Failed to count speaking enquiries.',
}).then((data) => Number(data?.new || 0));

// Lets the sidebar badge refresh as soon as an enquiry's status changes.
export const ENQUIRIES_CHANGED_EVENT = 'mm:speaking-enquiries-changed';
export const announceEnquiriesChanged = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ENQUIRIES_CHANGED_EVENT));
};
