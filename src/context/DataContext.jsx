import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { profileData } from '../data/profile';
import { defaultWebsitePages, mergeWebsitePages } from '../data/websitePages';
import { generateId, generateSlug } from '../utils/helpers';
import PageLoader from '../components/ui/PageLoader';
import { getApiBase } from '../utils/apiBase';

const DataContext = createContext();
const API_BASE = getApiBase();

async function apiFetch(path, options = {}) {
  const adminToken = localStorage.getItem('mm_admin_token');
  const authHeaders = adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
  const timeoutMs = Number(options.timeoutMs || 20000);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    signal: options.signal || controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {}),
    },
    ...options,
  }).catch((error) => {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    const primaryMessage =
      parsed?.message
      || parsed?.error
      || (text && !text.startsWith('<!doctype') ? text : '')
      || `Request failed (${response.status})`;

    const detail = parsed?.error && parsed?.error !== primaryMessage
      ? ` (${parsed.error})`
      : '';

    const error = new Error(`${primaryMessage}${detail}`);
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }

  return response.json();
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(v)) return false;
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseNestedJson(value, maxDepth = 4) {
  let current = value;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (typeof current !== 'string') break;
    const text = current.trim();
    if (!text) return null;
    try {
      current = JSON.parse(text);
    } catch {
      return null;
    }
  }
  return current;
}

function sanitizeProfilePayload(payload) {
  let value = parseNestedJson(payload);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  // Legacy compatibility: recover object spread from string keys "0","1","2",...
  const keys = Object.keys(value);
  const numericKeys = keys.filter((key) => /^\d+$/.test(key));
  if (numericKeys.length > 0) {
    const reconstructed = numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => String(value[key] ?? ''))
      .join('');
    const repaired = parseNestedJson(reconstructed);
    if (repaired && typeof repaired === 'object' && !Array.isArray(repaired)) {
      value = repaired;
    }
  }

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !/^\d+$/.test(key)),
  );
}

function isTransientWriteError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('epipe')
    || msg.includes('econreset')
    || msg.includes('socket hang up')
    || msg.includes('connection reset');
}

/** Strip full ISO timestamps (from MySQL) down to YYYY-MM-DD for date-only fields. */
function toDateOnly(value) {
  if (!value) return value;
  const s = String(value);
  // If it looks like "2026-06-19T22:00:00.000Z", keep only the date part.
  if (s.length > 10 && s.includes('T')) {
    return s.slice(0, 10);
  }
  return s;
}

function toTimeOnly(value) {
  if (!value) return value;
  const s = String(value);
  if (s.length >= 8 && s.includes(':')) return s.slice(0, 5);
  return s;
}

function normalizeEvent(event) {
  const inferredMode =
    event.event_mode
    || (String(event.location || '').toLowerCase().includes('virtual') ? 'virtual' : 'in_person');

  return {
    ...event,
    price: toNumber(event.price, 0),
    is_free: toBool(event.is_free, false),
    featured: toBool(event.featured, false),
    capacity: event.capacity === '' || event.capacity == null ? null : toNumber(event.capacity, null),
    booking_type: event.booking_type || 'subscription',
    event_mode: inferredMode,
    meeting_platform: event.meeting_platform || (inferredMode !== 'in_person' ? 'zoom' : ''),
    meeting_link: event.meeting_link || '',
    delivery_mode: event.delivery_mode || (inferredMode === 'in_person' ? 'physical' : 'virtual'),
    provider: event.provider || (event.meeting_platform === 'zoom' ? 'zoom' : 'internal'),
    zoom_meeting_id: event.zoom_meeting_id || null,
    zoom_join_url: event.zoom_join_url || null,
    zoom_start_url: event.zoom_start_url || null,
    zoom_password: event.zoom_password || null,
    zoom_status: event.zoom_status || null,
    zoom_host_email: event.zoom_host_email || '',
    start_date: toDateOnly(event.start_date),
    end_date: toDateOnly(event.end_date),
    start_time: toTimeOnly(event.start_time),
    end_time: toTimeOnly(event.end_time),
    registration_deadline: toDateOnly(event.registration_deadline),
    registration_deadline_time: toTimeOnly(event.registration_deadline_time),
  };
}

export function DataProvider({ children }) {
  const location = useLocation();
  const [profile, setProfile] = useState({ ...profileData, websitePages: defaultWebsitePages });
  const [events, setEvents] = useState([]);
  const [blogPosts, setBlogPosts] = useState([]);
  const [publications, setPublications] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const refreshingRef = useRef(false);
  const lastRefreshRef = useRef(0);

  // Reload helpers keep frontend in sync with DB truth.
  const reloadEvents = useCallback(async () => {
    const eventsRes = await apiFetch('/events');
    const loadedEvents = Array.isArray(eventsRes?.data) ? eventsRes.data : [];
    setEvents(loadedEvents.map(normalizeEvent));
  }, []);

  const reloadBlogAndProfile = useCallback(async () => {
    const [blogRes, profileRes] = await Promise.all([
      apiFetch('/blog'),
      apiFetch('/profile'),
    ]);
    const loadedBlogs = Array.isArray(blogRes?.data) ? blogRes.data : [];
    setBlogPosts(loadedBlogs);
    const profilePayload = sanitizeProfilePayload(profileRes?.data);
    const rawProfile = { ...profileData, ...profilePayload };
    // Ensure array fields from profileData are never replaced with null/non-arrays by the API
    const ARRAY_FIELDS = ['summary', 'skills', 'experience', 'education', 'relevantProfile', 'socialLinks'];
    const safeProfile = { ...rawProfile };
    for (const field of ARRAY_FIELDS) {
      if (!Array.isArray(safeProfile[field])) {
        safeProfile[field] = Array.isArray(profileData[field]) ? profileData[field] : [];
      }
    }
    safeProfile.websitePages = mergeWebsitePages(safeProfile.websitePages);
    setProfile(safeProfile);
  }, []);

  const reloadPublications = useCallback(async () => {
    const publicationsRes = await apiFetch('/publications');
    const loadedPublications = Array.isArray(publicationsRes?.data) ? publicationsRes.data : [];
    setPublications(loadedPublications);
  }, []);

  const refreshAllData = useCallback(async (force = false) => {
    const now = Date.now();
    const minIntervalMs = 10000;

    if (!force && (refreshingRef.current || now - lastRefreshRef.current < minIntervalMs)) {
      return;
    }

    refreshingRef.current = true;
    try {
      await Promise.all([reloadEvents(), reloadBlogAndProfile(), reloadPublications()]);
      lastRefreshRef.current = Date.now();
    } finally {
      refreshingRef.current = false;
    }
  }, [reloadEvents, reloadBlogAndProfile, reloadPublications]);

  // Initial load from API (MySQL). No static fallbacks — only show real DB data.
  useEffect(() => {
    let cancelled = false;
    let hardTimeoutId = null;

    const load = async () => {
      // Never let first paint stay blocked forever if one upstream request hangs.
      hardTimeoutId = window.setTimeout(() => {
        if (!cancelled) setIsDataLoaded(true);
      }, 15000);

      try {
        await refreshAllData(true);
      } catch {
        // API unreachable — leave arrays empty, UI handles empty states gracefully
      } finally {
        if (hardTimeoutId) {
          window.clearTimeout(hardTimeoutId);
          hardTimeoutId = null;
        }
        if (!cancelled) setIsDataLoaded(true);
      }
    };

    load();

    const handleFocusRefresh = () => {
      void refreshAllData().catch(() => {});
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') {
        void refreshAllData().catch(() => {});
      }
    };

    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshAllData().catch(() => {});
      }
    }, 120000);

    window.addEventListener('focus', handleFocusRefresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      cancelled = true;
      if (hardTimeoutId) {
        window.clearTimeout(hardTimeoutId);
      }
      window.removeEventListener('focus', handleFocusRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
      window.clearInterval(pollId);
    };
  }, [refreshAllData]);

  // Refresh on every route change (page visit inside SPA)
  useEffect(() => {
    void refreshAllData().catch(() => {});
  }, [location.pathname, refreshAllData]);

  // Event CRUD
  const addEvent = (event) => {
    const newEvent = normalizeEvent({ ...event, id: event.id || generateId('evt') });
    setEvents(prev => [newEvent, ...prev]);

    return apiFetch('/events', {
      method: 'POST',
      body: JSON.stringify(newEvent),
    })
      .then(() => refreshAllData(true))
      .catch((error) => {
        console.error('Failed to persist event:', error);
        void refreshAllData(true).catch(() => {});
        throw error;
      });
  };

  const updateEvent = (id, updates) => {
    let nextEvent = null;
    setEvents(prev => prev.map((e) => {
      if (e.id !== id) return e;
      nextEvent = normalizeEvent({ ...e, ...updates, id });
      return nextEvent;
    }));

    if (nextEvent) {
      const request = () => apiFetch(`/events/${id}`, {
        method: 'PUT',
        // Send only changed fields to avoid very large packets (e.g. base64 cover images).
        body: JSON.stringify(updates),
      });

      return request()
        .catch(async (error) => {
          if (!isTransientWriteError(error)) throw error;
          // One retry for transient socket/db interruptions.
          await new Promise((resolve) => setTimeout(resolve, 250));
          return request();
        })
        .then(() => refreshAllData(true))
        .catch((error) => {
          console.error('Failed to update event:', error);
          void refreshAllData(true).catch(() => {});
          throw error;
        });
    }
    return Promise.resolve();
  };

  const deleteEvent = (id) => {
    setEvents(prev => prev.filter(e => e.id !== id));

    void apiFetch(`/events/${id}`, {
      method: 'DELETE',
    })
      .then(() => refreshAllData(true))
      .catch((error) => {
      console.error('Failed to delete event:', error);
      void refreshAllData(true).catch(() => {});
    });
  };

  // Blog CRUD
  const addBlogPost = async (post) => {
    const newPost = {
      ...post,
      id: generateId('blog'),
      slug: generateSlug(post.title),
      date: post.date || new Date().toISOString().split('T')[0]
    };
    setBlogPosts(prev => [newPost, ...prev]);

    try {
      await apiFetch('/blog', {
        method: 'POST',
        body: JSON.stringify(newPost),
      });
      await refreshAllData(true);
      return newPost;
    } catch (error) {
      console.error('Failed to persist blog post:', error);
      void refreshAllData(true).catch(() => {});
      throw error;
    }
  };

  const updateBlogPost = async (id, updates) => {
    const existing = blogPosts.find((p) => p.id === id) || null;
    const nextPost = {
      ...(existing || {}),
      ...updates,
      id,
      ...(updates.title ? { slug: generateSlug(updates.title) } : {}),
    };

    setBlogPosts((prev) => {
      const hasLocal = prev.some((p) => p.id === id);
      if (!hasLocal) return [nextPost, ...prev];
      return prev.map((p) => (p.id === id ? nextPost : p));
    });

    try {
      await apiFetch(`/blog/${id}`, {
        method: 'PUT',
        body: JSON.stringify(nextPost),
      });
      await refreshAllData(true);
    } catch (error) {
      console.error('Failed to update blog post:', error);
      void refreshAllData(true).catch(() => {});
      throw error;
    }
  };

  const deleteBlogPost = async (id) => {
    setBlogPosts(prev => prev.filter(p => p.id !== id));

    try {
      await apiFetch(`/blog/${id}`, {
        method: 'DELETE',
      });
      await refreshAllData(true);
    } catch (error) {
      console.error('Failed to delete blog post:', error);
      void refreshAllData(true).catch(() => {});
      throw error;
    }
  };

  const updateProfile = async (updates) => {
    const merged = { ...profile, ...updates };
    merged.websitePages = mergeWebsitePages(merged.websitePages);
    setProfile(merged);

    const payload = { ...updates };
    if (payload.websitePages) {
      payload.websitePages = mergeWebsitePages(payload.websitePages);
    }

    return apiFetch('/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }).then((res) => {
      if (res?.data && typeof res.data === 'object') {
        const saved = { ...profile, ...res.data };
        saved.websitePages = mergeWebsitePages(saved.websitePages);
        setProfile(saved);
      }
      return res;
    }).catch((error) => {
      console.error('Failed to update profile:', error);
      void refreshAllData(true).catch(() => {});
      throw error;
    });
  };

  // Publications CRUD
  const addPublication = async (publication) => {
    const newPublication = {
      ...publication,
      id: publication.id || generateId('pub'),
      year: publication.year ? Number(publication.year) : null,
    };

    setPublications((prev) => [newPublication, ...prev]);

    try {
      await apiFetch('/publications', {
        method: 'POST',
        body: JSON.stringify(newPublication),
      });
      await refreshAllData(true);
      return newPublication;
    } catch (error) {
      console.error('Failed to persist publication:', error);
      void refreshAllData(true).catch(() => {});
      throw error;
    }
  };

  const updatePublication = async (id, updates) => {
    let nextPublication = null;
    setPublications((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      nextPublication = {
        ...p,
        ...updates,
        year: updates.year == null || updates.year === '' ? null : Number(updates.year),
      };
      return nextPublication;
    }));

    if (!nextPublication) return;

    try {
      await apiFetch(`/publications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(nextPublication),
      });
      await refreshAllData(true);
    } catch (error) {
      console.error('Failed to update publication:', error);
      void refreshAllData(true).catch(() => {});
      throw error;
    }
  };

  const deletePublication = async (id) => {
    setPublications((prev) => prev.filter((p) => p.id !== id));

    try {
      await apiFetch(`/publications/${id}`, {
        method: 'DELETE',
      });
      await refreshAllData(true);
    } catch (error) {
      console.error('Failed to delete publication:', error);
      void refreshAllData(true).catch(() => {});
      throw error;
    }
  };

  const resetToDefaults = () => {
    const defaultProfile = { ...profileData, websitePages: defaultWebsitePages };
    setProfile(defaultProfile);
    setEvents([]);
    setBlogPosts([]);
    setPublications([]);

    void apiFetch('/profile', {
      method: 'PUT',
      body: JSON.stringify(defaultProfile),
    }).catch((error) => {
      console.error('Failed to reset profile in DB:', error);
    });
  };

  return (
    <DataContext.Provider value={{
      profile,
      events,
      blogPosts,
      publications,
      isDataLoaded,
      addEvent,
      updateEvent,
      deleteEvent,
      addBlogPost,
      updateBlogPost,
      deleteBlogPost,
      addPublication,
      updatePublication,
      deletePublication,
      updateProfile,
      refreshData: () => refreshAllData(true),
      resetToDefaults
    }}>
      {isDataLoaded ? children : <PageLoader message="Loading your growth." />}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within a DataProvider');
  return context;
}
