import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Video } from 'lucide-react';
import DailyIframe from '@daily-co/daily-js';
import { getApiBase } from '../utils/apiBase';
import { canEmbedZoomJoin, isMobileBrowser, openZoomJoinUrl } from '../utils/zoomMeeting';

const ZoomMeetingEmbed = lazy(() => import('../components/meetings/ZoomMeetingEmbed'));

const API_BASE = getApiBase();

export default function GuestTicketJoinPage() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  const joinToken = searchParams.get('token') || '';
  const [loading, setLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinNotice, setJoinNotice] = useState('');
  const [joinSession, setJoinSession] = useState(null);
  const [pendingZoomAuth, setPendingZoomAuth] = useState(null);
  const [ticketTitle, setTicketTitle] = useState('');
  const dailyContainerRef = useRef(null);
  const dailyFrameRef = useRef(null);
  const zoomEmbedRef = useRef(null);
  const isMobile = isMobileBrowser();

  useEffect(() => () => {
    if (dailyFrameRef.current) {
      try { dailyFrameRef.current.destroy(); } catch { /* ignore */ }
      dailyFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!joinSession || joinSession.provider !== 'daily' || !dailyContainerRef.current) return undefined;
    const { roomUrl, token } = joinSession.auth || {};
    if (!roomUrl || !token) return undefined;

    if (dailyFrameRef.current) {
      try { dailyFrameRef.current.destroy(); } catch { /* ignore */ }
    }

    const frame = DailyIframe.createFrame(dailyContainerRef.current, {
      iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '12px' },
      showLeaveButton: true,
      showFullscreenButton: true,
    });
    dailyFrameRef.current = frame;
    frame.join({ url: roomUrl, token }).catch((err) => {
      setJoinError(String(err?.message || 'Unable to join the meeting room.'));
    });

    return () => {
      try { frame.destroy(); } catch { /* ignore */ }
      if (dailyFrameRef.current === frame) dailyFrameRef.current = null;
    };
  }, [joinSession]);

  const startZoomEmbed = (json) => {
    setJoinSession({ provider: 'zoom', auth: json.auth, registration: json.registration });
    setPendingZoomAuth(null);
    setJoinNotice('');
  };

  const fallbackToZoomRedirect = (json, reason) => {
    const joinUrl = String(json?.auth?.joinUrl || '').trim();
    if (!joinUrl) throw new Error(reason || 'Zoom join link is not available.');
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
      const response = await fetch(
        `${API_BASE}/tickets/${encodeURIComponent(code || '')}/join-auth`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: joinToken }),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Unable to verify join access.');
      }

      if (json?.registration?.event_title) {
        setTicketTitle(json.registration.event_title);
      }

      const provider = String(json?.provider || 'zoom').toLowerCase();

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

      fallbackToZoomRedirect(json, json.embedReason || 'Opening Zoom in a new tab…');
    } catch (error) {
      setJoinError(String(error?.message || 'Unable to join meeting.'));
    } finally {
      setLoading(false);
    }
  };

  const inMeeting = joinSession?.provider === 'daily' || joinSession?.provider === 'zoom';

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="bg-white rounded-2xl border border-navy-100 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-2 text-cyan-700 mb-2">
          <Video size={18} />
          <span className="text-xs tracking-wide font-semibold">Guest ticket join</span>
        </div>

        <h1 className="text-2xl font-bold text-navy-900 mb-1">
          Join {ticketTitle || 'live event'}
        </h1>
        <p className="text-sm text-navy-500 mb-6">
          Using your personal ticket link — no account required.
        </p>

        {!inMeeting && !pendingZoomAuth && (
          <div className="space-y-4">
            {joinError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}
            {joinNotice && <p className="text-sm text-navy-600">{joinNotice}</p>}
            <button
              type="button"
              onClick={() => void handleJoin()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 text-white font-medium hover:bg-cyan-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Video size={18} />}
              Join meeting
            </button>
            <p className="text-xs text-navy-500">
              <Link to={`/tickets/${encodeURIComponent(code || '')}`} className="text-cyan-700 hover:underline">
                Back to ticket
              </Link>
            </p>
          </div>
        )}

        {pendingZoomAuth && (
          <div className="space-y-3">
            <p className="text-sm text-navy-600">Join in the Zoom app or continue in browser.</p>
            <button
              type="button"
              onClick={() => fallbackToZoomRedirect(pendingZoomAuth, 'Opening Zoom…')}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm"
            >
              Open Zoom app
            </button>
            <button
              type="button"
              onClick={() => void handleJoin({ forceEmbed: true })}
              className="px-4 py-2 rounded-lg border border-navy-200 text-sm ml-2"
            >
              Join in browser
            </button>
          </div>
        )}

        {joinSession?.provider === 'daily' && (
          <div ref={dailyContainerRef} className="w-full h-[60vh] min-h-[320px] rounded-xl overflow-hidden bg-navy-900" />
        )}

        {joinSession?.provider === 'zoom' && (
          <Suspense fallback={<Loader2 className="animate-spin mx-auto" />}>
            <ZoomMeetingEmbed ref={zoomEmbedRef} auth={joinSession.auth} onLeave={() => setJoinSession(null)} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
