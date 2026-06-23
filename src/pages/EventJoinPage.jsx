import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ExternalLink, Loader2, Video } from 'lucide-react';
import DailyIframe from '@daily-co/daily-js';
import { useData } from '../context/DataContext';
import { useUserAuth } from '../context/UserAuthContext';
import { useBooking } from '../context/BookingContext';
import { getApiBase } from '../utils/apiBase';
import { getUserAuthHeaders } from '../utils/authHeaders';
import { canEmbedZoomJoin, isMobileBrowser, openZoomJoinUrl } from '../utils/zoomMeeting';

const ZoomMeetingEmbed = lazy(() => import('../components/meetings/ZoomMeetingEmbed'));

const API_BASE = getApiBase();

function resolveEventVideoProvider(event = {}) {
  const platform = String(event.meeting_platform || event.provider || '').toLowerCase();
  if (platform === 'zoom' || platform === 'daily') return platform;
  return 'zoom';
}

export default function EventJoinPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { events } = useData();
  const { currentUser, isUserAuthenticated } = useUserAuth();
  const { isUserRegistered } = useBooking();

  const event = useMemo(() => events.find((item) => item.slug === slug), [events, slug]);
  const [loading, setLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinNotice, setJoinNotice] = useState('');
  const [joinSession, setJoinSession] = useState(null);
  const [pendingZoomAuth, setPendingZoomAuth] = useState(null);
  const dailyContainerRef = useRef(null);
  const dailyFrameRef = useRef(null);
  const zoomEmbedRef = useRef(null);

  const videoProvider = event ? resolveEventVideoProvider(event) : 'zoom';
  const providerLabel = videoProvider === 'daily' ? 'Daily.co' : 'Zoom';
  const isMobile = isMobileBrowser();

  const isRegistered = event ? isUserRegistered(currentUser?.id, event.id, 'subscription') : false;

  useEffect(() => () => {
    if (dailyFrameRef.current) {
      try {
        dailyFrameRef.current.destroy();
      } catch { /* ignore */ }
      dailyFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!joinSession || joinSession.provider !== 'daily' || !dailyContainerRef.current) return undefined;

    const { roomUrl, token } = joinSession.auth || {};
    if (!roomUrl || !token) return undefined;

    if (dailyFrameRef.current) {
      try {
        dailyFrameRef.current.destroy();
      } catch { /* ignore */ }
    }

    const frame = DailyIframe.createFrame(dailyContainerRef.current, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: '0',
        borderRadius: '12px',
      },
      showLeaveButton: true,
      showFullscreenButton: true,
    });

    dailyFrameRef.current = frame;
    frame.join({ url: roomUrl, token }).catch((err) => {
      setJoinError(String(err?.message || 'Unable to join the meeting room.'));
    });

    return () => {
      try {
        frame.destroy();
      } catch { /* ignore */ }
      if (dailyFrameRef.current === frame) dailyFrameRef.current = null;
    };
  }, [joinSession]);

  if (!event) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-navy-600 font-medium">Event not found.</p>
          <Link to="/events" className="text-cyan-600 hover:underline text-sm">Back to events</Link>
        </div>
      </div>
    );
  }

  const startZoomEmbed = (json) => {
    setJoinSession({ provider: 'zoom', auth: json.auth, registration: json.registration });
    setPendingZoomAuth(null);
    setJoinNotice('');
  };

  const fallbackToZoomRedirect = (json, reason) => {
    const joinUrl = String(json?.auth?.joinUrl || '').trim();
    if (!joinUrl) {
      throw new Error(reason || `${providerLabel} join link is not available for this event. Please contact the organizer.`);
    }
    setJoinNotice(reason || 'Opening Zoom in a new tab…');
    openZoomJoinUrl(joinUrl);
  };

  const handleJoin = async ({ forceEmbed = false } = {}) => {
    setJoinError('');
    setJoinNotice('');
    setJoinSession(null);
    setPendingZoomAuth(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/events/${event.id}/video/join-auth`, {
        method: 'POST',
        headers: getUserAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ role: 0 }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'Unable to verify join access right now.');
      }

      const provider = String(json?.provider || videoProvider).toLowerCase();

      if (provider === 'daily' && json?.auth?.token && json?.auth?.roomUrl) {
        setJoinSession({ provider: 'daily', auth: json.auth, registration: json.registration });
        return;
      }

      const embedReady = canEmbedZoomJoin({
        joinMode: json.joinMode,
        embedAvailable: json.embedAvailable,
        auth: json.auth,
      });

      if (embedReady && isMobile && !forceEmbed) {
        setPendingZoomAuth(json);
        return;
      }

      if (embedReady && (!isMobile || forceEmbed)) {
        startZoomEmbed(json);
        return;
      }

      const reason = json.embedReason
        ? `${json.embedReason} Opening Zoom in a new tab instead.`
        : 'In-page Zoom join is unavailable. Opening Zoom in a new tab…';
      fallbackToZoomRedirect(json, reason);
    } catch (error) {
      const msg = String(error?.message || '').trim() || `Unable to open this ${providerLabel} meeting right now.`;
      setJoinError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveMeeting = async () => {
    if (joinSession?.provider === 'zoom') {
      try {
        await zoomEmbedRef.current?.leave?.();
      } catch { /* ignore */ }
    }
    setJoinSession(null);
    setPendingZoomAuth(null);
    setJoinNotice('');
  };

  const inMeeting = joinSession?.provider === 'daily' || joinSession?.provider === 'zoom';
  const zoomJoinCopy = videoProvider === 'zoom'
    ? 'Click below to verify access and join the meeting on this page. If in-page join is unavailable, we open Zoom in a new tab.'
    : 'Click below to verify access and join the meeting in this page.';

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="bg-white rounded-2xl border border-navy-100 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-2 text-cyan-700 mb-2">
          <Video size={18} />
          <span className="text-xs tracking-wide font-semibold">Secure access</span>
        </div>

        <h1 className="text-2xl font-bold text-navy-900 mb-1">Join {event.title}</h1>
        <p className="text-sm text-navy-500 mb-6">
          We verify your account and registration first, then connect you via {providerLabel}.
        </p>

        {!isUserAuthenticated && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-2">
            <p className="font-medium">Please sign in first.</p>
            <p>
              <Link to="/account/login" state={{ from: { pathname: `/events/${slug}/join` } }} className="text-cyan-700 hover:underline">Sign in</Link>
              {' '}to continue.
            </p>
          </div>
        )}

        {isUserAuthenticated && !isRegistered && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            You are not registered for this event yet. Please register first from the event page.
          </div>
        )}

        {isUserAuthenticated && isRegistered && !inMeeting && !pendingZoomAuth && (
          <div className="space-y-4">
            {joinError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}

            {joinNotice && (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3.5 text-sm text-cyan-800">
                {joinNotice}
              </div>
            )}

            <div className="rounded-xl bg-navy-50 border border-navy-100 p-4">
              <p className="text-sm text-navy-700 font-medium">{zoomJoinCopy}</p>
            </div>

            <button
              onClick={() => handleJoin()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-base transition-colors"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Video size={18} />}
              {loading ? 'Verifying access…' : 'Join Meeting Now'}
            </button>
          </div>
        )}

        {isUserAuthenticated && isRegistered && pendingZoomAuth && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
              <p className="font-medium">Mobile device detected</p>
              <p>
                Zoom works best in the Zoom app or mobile browser. You can open Zoom directly, or try joining in this page.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  try {
                    fallbackToZoomRedirect(pendingZoomAuth, 'Opening Zoom…');
                  } catch (error) {
                    setJoinError(String(error?.message || 'Unable to open Zoom.'));
                  }
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition-colors"
              >
                <ExternalLink size={16} />
                Open in Zoom
              </button>
              <button
                type="button"
                onClick={() => handleJoin({ forceEmbed: true })}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-navy-200 hover:bg-navy-50 text-navy-700 font-medium text-sm transition-colors"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                Try in-page join
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPendingZoomAuth(null)}
              className="text-sm text-navy-500 hover:text-navy-700"
            >
              Back
            </button>
          </div>
        )}

        {isUserAuthenticated && isRegistered && joinSession?.provider === 'daily' && (
          <div className="space-y-4">
            {joinError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}
            <div
              ref={dailyContainerRef}
              className="w-full min-h-[420px] sm:min-h-[480px] rounded-xl overflow-hidden bg-navy-900"
            />
            <button
              type="button"
              onClick={handleLeaveMeeting}
              className="text-sm text-navy-500 hover:text-navy-700"
            >
              Leave and return to join options
            </button>
          </div>
        )}

        {isUserAuthenticated && isRegistered && joinSession?.provider === 'zoom' && (
          <div className="space-y-4">
            {joinError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}
            <Suspense
              fallback={(
                <div className="w-full min-h-[420px] sm:min-h-[480px] rounded-xl bg-navy-900 flex items-center justify-center text-white/80 text-sm">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  Loading Zoom meeting…
                </div>
              )}
            >
              <ZoomMeetingEmbed
                ref={zoomEmbedRef}
                auth={joinSession.auth}
                onError={(error) => {
                  const msg = String(error?.message || error?.reason || 'Unable to join in-page. Opening Zoom in a new tab…');
                  setJoinError(msg);
                  try {
                    fallbackToZoomRedirect(joinSession, msg);
                  } catch { /* ignore */ }
                  setJoinSession(null);
                }}
              />
            </Suspense>
            <button
              type="button"
              onClick={handleLeaveMeeting}
              className="text-sm text-navy-500 hover:text-navy-700"
            >
              Leave and return to join options
            </button>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-navy-100 flex items-center gap-4 text-sm">
          <button onClick={() => navigate(-1)} className="text-navy-500 hover:text-navy-700">Go back</button>
          <Link to={`/events/${slug}`} className="text-cyan-700 hover:underline">Event details</Link>
        </div>
      </div>
    </section>
  );
}
