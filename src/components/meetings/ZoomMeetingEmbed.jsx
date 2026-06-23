import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Zoom Meeting SDK Component View — renders the meeting inside a container div.
 * Auth payload comes from POST /api/events/:id/video/join-auth (server-signed).
 */
const ZoomMeetingEmbed = forwardRef(function ZoomMeetingEmbed(
  { auth, onError, onJoined, onLeft },
  ref,
) {
  const containerRef = useRef(null);
  const clientRef = useRef(null);

  useImperativeHandle(ref, () => ({
    async leave() {
      const client = clientRef.current;
      if (!client) return;
      try {
        await client.leaveMeeting();
      } catch {
        // ignore teardown errors
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let client = null;

    const run = async () => {
      if (!containerRef.current || !auth?.signature || !auth?.sdkKey || !auth?.meetingNumber) {
        return;
      }

      try {
        const { default: ZoomMtgEmbedded } = await import('@zoom/meetingsdk/embedded');
        if (cancelled) return;

        client = ZoomMtgEmbedded.createClient();
        clientRef.current = client;

        await client.init({
          zoomAppRoot: containerRef.current,
          language: 'en-US',
          patchJsMedia: true,
        });

        if (cancelled) return;

        await client.join({
          sdkKey: auth.sdkKey,
          signature: auth.signature,
          meetingNumber: String(auth.meetingNumber),
          password: String(auth.password || ''),
          userName: String(auth.userName || 'Guest'),
          userEmail: String(auth.userEmail || ''),
        });

        if (!cancelled) onJoined?.();
      } catch (error) {
        if (!cancelled) onError?.(error);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (client) {
        client.leaveMeeting().catch(() => {});
      }
      clientRef.current = null;
      onLeft?.();
    };
  }, [auth, onError, onJoined, onLeft]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[420px] sm:min-h-[480px] rounded-xl overflow-hidden bg-navy-900"
    />
  );
});

export default ZoomMeetingEmbed;
