import { promises as fs } from 'fs';
import {
  assertCanJoinByTicketReference,
  assertTicketJoinEligible,
  buildGuestPortalPayload,
  emailMatchesRegistration,
  guestForumUserId,
  issueGuestSessionToken,
  loadRegistrationByReference,
  resolveGuestDisplayName,
  storeAccessCode,
  verifyAccessCode,
  verifyGuestSessionToken,
} from './guestTicketService.js';
import { resolveAttendeeEmail } from '../shared/ticketViewModel.js';

function getBearerToken(req) {
  const header = String(req.headers?.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function guestCertificateAccessAllowed(req, registration, deps) {
  const emailQuery = String(req.query?.email || '').trim();
  if (emailQuery && emailMatchesRegistration(registration, emailQuery)) return true;

  const token = getBearerToken(req);
  if (token) {
    const claims = verifyGuestSessionToken(
      token,
      registration.reference_code,
      deps.verifyJwtHmacSha256,
      deps.AUTH_TOKEN_SECRET,
    );
    if (claims && String(claims.sub) === String(registration.id)) return true;
  }
  return false;
}

async function performGuestVideoJoinAuth({ registration, event, reqBody, deps }) {
  const joinCheck = assertCanJoinByTicketReference({
    registration,
    event,
    getJoinWindowForEvent: deps.getJoinWindowForEvent,
    providerLabel: 'the meeting',
  });
  if (!joinCheck.ok) return joinCheck;

  const videoSettings = await deps.getVideoSettings();
  const provider = deps.resolveEventVideoProvider(event, videoSettings);

  if (!deps.isVideoProviderEnabled(provider, videoSettings)) {
    return {
      ok: false,
      status: 400,
      message: `${provider === 'daily' ? 'Daily.co' : 'Zoom'} is disabled in site settings.`,
    };
  }

  const {
    registration: reg,
    windowState,
    userId,
    userEmail,
    userName,
    role,
  } = joinCheck;

  if (provider === 'daily') {
    const roomName = String(event.daily_room_name || '').trim();
    const dailyConfig = await deps.getDailyConfig();
    const roomUrl = deps.sanitizeMeetingJoinUrl(
      String(event.daily_room_url || '').trim()
        || (roomName && dailyConfig.domain ? `https://${dailyConfig.domain}/${roomName}` : ''),
    );
    if (!roomName || !roomUrl) {
      return { ok: false, status: 400, message: 'Daily room is not available for this event.' };
    }

    const { nbf, exp } = deps.getDailyRoomWindowForEvent(event);
    const tokenResponse = await deps.dailyRequest({
      dailyConfig,
      method: 'POST',
      path: '/meeting-tokens',
      body: {
        properties: {
          room_name: roomName,
          user_id: userId.slice(0, 36),
          user_name: userName,
          is_owner: role === 1,
          ...(nbf ? { nbf } : {}),
          ...(exp ? { exp } : {}),
        },
      },
    });
    const meetingToken = String(tokenResponse?.token || '').trim();
    if (!meetingToken) {
      return { ok: false, status: 502, message: 'Daily did not return a meeting token.' };
    }

    let regFinal = reg;
    try {
      regFinal = await deps.markEventRegistrationAttendance(reg.id, 'daily') || reg;
    } catch { /* best-effort */ }

    return {
      ok: true,
      provider: 'daily',
      auth: {
        roomUrl,
        roomName,
        token: meetingToken,
        userName,
        userEmail,
        isOwner: role === 1,
      },
      registration: deps.mapDbRegistration(regFinal),
      joinWindow: windowState,
      joinMode: 'embed',
    };
  }

  if (provider === 'zoom') {
    const rawJoinUrl = event.zoom_join_url || event.meeting_link || null;
    const joinUrl = deps.sanitizeMeetingJoinUrl(rawJoinUrl);
    const meetingNumber = deps.extractZoomMeetingNumber(event.zoom_meeting_id || '')
      || deps.extractZoomMeetingNumber(joinUrl || rawJoinUrl || '');
    if (!meetingNumber && !joinUrl) {
      return { ok: false, status: 400, message: 'Zoom meeting link is not available for this event.' };
    }

    const zoomConfig = await deps.getZoomConfig();
    let signature = null;
    if (zoomConfig.sdkKey && zoomConfig.sdkSecret && meetingNumber) {
      const iat = Math.floor(Date.now() / 1000) - 30;
      const exp = iat + (2 * 60 * 60);
      signature = deps.signJwtHmacSha256({
        sdkKey: zoomConfig.sdkKey,
        appKey: zoomConfig.sdkKey,
        mn: meetingNumber,
        role,
        iat,
        exp,
        tokenExp: exp,
      }, zoomConfig.sdkSecret);
    }

    let attendanceUpdated = null;
    try {
      attendanceUpdated = await deps.markEventRegistrationAttendance(reg.id, 'zoom');
    } catch { /* best-effort */ }

    const finalRegistration = attendanceUpdated || reg;
    const videoSettingsResolved = await deps.getVideoSettings();
    const wantsEmbed = videoSettingsResolved.joinMode === 'embed';
    const canEmbed = Boolean(
      zoomConfig.sdkKey && zoomConfig.sdkSecret && meetingNumber && signature,
    );

    return {
      ok: true,
      provider: 'zoom',
      auth: {
        sdkKey: zoomConfig.sdkKey || null,
        signature,
        meetingNumber: meetingNumber || null,
        password: event.zoom_password || null,
        userName,
        userEmail,
        joinUrl,
      },
      registration: deps.mapDbRegistration(finalRegistration),
      joinWindow: windowState,
      joinMode: videoSettingsResolved.joinMode,
      embedAvailable: wantsEmbed && canEmbed,
    };
  }

  return {
    ok: false,
    status: 400,
    message: 'This event does not use an integrated video provider. Open the meeting link from the event page.',
  };
}

export function registerGuestTicketRoutes(app, deps) {
  const rateLimitTicket = deps.rateLimitByKey({
    routeKey: 'guest-ticket',
    windowMs: 60_000,
    max: 60,
    getKey: (req) => `${req.params.reference || ''}:${req.path}:${req.ip || req.connection?.remoteAddress || 'unknown'}`,
  });

  app.get('/api/tickets/:reference/portal', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const appOrigin = deps.resolvePublicAppUrl(req);
      const portal = await buildGuestPortalPayload({
        pool: deps.pool,
        registration: loaded.registration,
        event: loaded.event,
        appOrigin,
        getJoinWindowForEvent: deps.getJoinWindowForEvent,
        isForumVisibleEvent: deps.isForumVisibleEvent,
        mapDbEventSession: deps.mapDbEventSession,
      });

      return res.json({ ok: true, data: portal });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load guest portal.', error: error.message });
    }
  });

  app.post('/api/tickets/:reference/join-auth', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const result = await performGuestVideoJoinAuth({
        registration: loaded.registration,
        event: loaded.event,
        reqBody: req.body || {},
        deps,
      });

      if (!result.ok) {
        return res.status(result.status || 400).json({
          ok: false,
          message: result.message,
          joinWindow: result.joinWindow || undefined,
        });
      }

      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to generate join authorization.', error: error.message });
    }
  });

  app.get('/api/tickets/:reference/video/presence', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      return res.json({
        ok: true,
        data: deps.mapMeetingPresence(loaded.registration),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to fetch meeting presence.', error: error.message });
    }
  });

  app.post('/api/tickets/:reference/video/presence', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const action = String(req.body?.action || '').trim().toLowerCase();
      if (!['enter', 'heartbeat', 'leave'].includes(action)) {
        return res.status(400).json({ ok: false, message: 'action must be enter, heartbeat, or leave.' });
      }

      const source = String(req.body?.source || 'native_sdk').slice(0, 30);
      const refreshed = await deps.updateRegistrationMeetingPresence(
        loaded.registration.id,
        action,
        source,
      );

      return res.json({
        ok: true,
        data: deps.mapMeetingPresence(refreshed || loaded.registration),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to update meeting presence.', error: error.message });
    }
  });

  app.post('/api/tickets/:reference/sessions/:sessionId/join', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const { registration, event } = loaded;
      const eligibility = assertTicketJoinEligible(
        registration,
        event,
        deps.getJoinWindowForEvent,
      );
      if (!eligibility.ok) {
        return res.status(eligibility.status).json({ ok: false, message: eligibility.message });
      }

      const sessionId = String(req.params.sessionId || '').trim();
      const [[session]] = await deps.pool.query(
        'SELECT * FROM event_sessions WHERE id = ? AND event_id = ? LIMIT 1',
        [sessionId, registration.event_id],
      );
      if (!session) {
        return res.status(404).json({ ok: false, message: 'Session not found.' });
      }

      const attendanceId = deps.generateEntityId('esa');
      await deps.pool.query(
        `INSERT INTO event_session_attendance (id, session_id, registration_id, attended_at, join_source)
         VALUES (?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE attended_at = COALESCE(attended_at, NOW()), join_source = VALUES(join_source), updated_at = NOW()`,
        [attendanceId, sessionId, registration.id, String(req.body?.join_source || 'guest_ticket').slice(0, 40)],
      );

      await deps.markEventRegistrationAttendance(registration.id, 'session');

      const meetingUrl = String(session.meeting_url || '').trim()
        || String(event?.zoom_join_url || event?.daily_room_url || event?.meeting_link || '').trim();

      return res.json({
        ok: true,
        data: {
          session: deps.mapDbEventSession(session),
          meeting_url: meetingUrl,
          registration_id: registration.id,
        },
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to join session.', error: error.message });
    }
  });

  app.get('/api/tickets/:reference/certificate', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const [[row]] = await deps.pool.query(
        'SELECT * FROM event_certificates WHERE registration_id = ? AND revoked = 0 LIMIT 1',
        [loaded.registration.id],
      );
      if (!row) {
        return res.json({ ok: true, data: null });
      }

      return res.json({
        ok: true,
        data: deps.mapDbCertificate(row),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load certificate.', error: error.message });
    }
  });

  app.get('/api/tickets/:reference/certificate/download', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      if (!guestCertificateAccessAllowed(req, loaded.registration, deps)) {
        return res.status(403).json({
          ok: false,
          message: 'Verify your email with an access code to download this certificate.',
          requires_verification: true,
        });
      }

      const [[row]] = await deps.pool.query(
        'SELECT * FROM event_certificates WHERE registration_id = ? AND revoked = 0 LIMIT 1',
        [loaded.registration.id],
      );
      if (!row) {
        return res.status(404).json({ ok: false, message: 'Certificate not found.' });
      }

      const absolutePath = await deps.ensureCertificatePdfOnDisk(row, deps.__appRoot, deps.pool);
      const pdfBuffer = await fs.readFile(absolutePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(pdfBuffer.length));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="Certificate-${row.certificate_code}.pdf"`,
      );
      return res.send(pdfBuffer);
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to download certificate.', error: error.message });
    }
  });

  app.post('/api/tickets/:reference/access-code', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const email = resolveAttendeeEmail(loaded.registration);
      if (!email) {
        return res.status(400).json({
          ok: false,
          message: 'No email is on file for this ticket. Contact the event organizer.',
        });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      storeAccessCode(loaded.registration.reference_code, email, code);

      const settings = await deps.getSystemSettings();
      const eventTitle = loaded.event.title || 'Event';
      await deps.sendEmailNotification({
        settings,
        to: email,
        subject: `Your access code for ${eventTitle}`,
        text: [
          `Your verification code is: ${code}`,
          '',
          'Use this code on your ticket page to download your certificate or verify access.',
          'This code expires in 15 minutes.',
        ].join('\n'),
        html: `<p>Your verification code is: <strong>${code}</strong></p>
<p>Use this code on your ticket page to download your certificate or verify access.</p>
<p>This code expires in 15 minutes.</p>`,
      });

      return res.json({ ok: true, message: 'Access code sent.', email_hint: email.replace(/(.{2}).*(@.*)/, '$1***$2') });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to send access code.', error: error.message });
    }
  });

  app.post('/api/tickets/:reference/verify-access-code', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const code = String(req.body?.code || '').trim();
      const email = resolveAttendeeEmail(loaded.registration);
      if (!code || !email) {
        return res.status(400).json({ ok: false, message: 'Access code is required.' });
      }

      if (!verifyAccessCode(loaded.registration.reference_code, code, email)) {
        return res.status(403).json({ ok: false, message: 'Invalid or expired access code.' });
      }

      const session = issueGuestSessionToken({
        registrationId: loaded.registration.id,
        referenceCode: loaded.registration.reference_code,
        signJwtHmacSha256: deps.signJwtHmacSha256,
        authSecret: deps.AUTH_TOKEN_SECRET,
      });

      return res.json({
        ok: true,
        guest_session_token: session.token,
        expires_at: session.expires_at,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to verify access code.', error: error.message });
    }
  });

  // Forum routes scoped to ticket reference
  app.get('/api/tickets/:reference/forum/topics', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      if (!deps.isForumVisibleEvent(loaded.event)) {
        return res.status(403).json({ ok: false, message: 'Forum is not available for this event.' });
      }

      const eligibility = assertTicketJoinEligible(
        loaded.registration,
        loaded.event,
        deps.getJoinWindowForEvent,
      );
      if (!eligibility.ok && !deps.isRegistrationTicketEligible(loaded.registration)) {
        return res.status(403).json({ ok: false, message: 'Ticket is not eligible for forum access.' });
      }

      const [rows] = await deps.pool.query(
        `SELECT * FROM event_forum_topics
         WHERE event_id = ? AND hidden = 0 AND moderation_status = 'approved'
         ORDER BY pinned DESC, last_activity_at DESC
         LIMIT 100`,
        [loaded.event.id],
      );

      return res.json({ ok: true, data: rows.map(deps.mapDbForumTopic) });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load forum topics.', error: error.message });
    }
  });

  app.post('/api/tickets/:reference/forum/topics', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      if (!deps.isForumVisibleEvent(loaded.event)) {
        return res.status(403).json({ ok: false, message: 'Forum is not available for this event.' });
      }

      if (!deps.isRegistrationTicketEligible(loaded.registration)) {
        return res.status(403).json({ ok: false, message: 'Ticket is not eligible for forum access.' });
      }

      const title = deps.sanitizeForumText(req.body?.title, 200);
      const body = deps.sanitizeForumText(req.body?.body, 5000);
      if (!title) return res.status(400).json({ ok: false, message: 'Topic title is required.' });
      if (!body) return res.status(400).json({ ok: false, message: 'Topic message is required.' });

      const preModerated = deps.parseBoolean(loaded.event?.forum_pre_moderated, false);
      const moderationStatus = preModerated ? 'pending' : 'approved';
      const topicId = deps.generateEntityId('eft');
      const userName = resolveGuestDisplayName(loaded.registration);
      const regId = String(loaded.registration.id);
      const now = new Date();

      await deps.pool.query(
        `INSERT INTO event_forum_topics (
          id, event_id, user_id, user_name, title, body, reply_count, last_activity_at, moderation_status, registration_id
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          topicId,
          loaded.event.id,
          guestForumUserId(regId),
          userName,
          title,
          body,
          now,
          moderationStatus,
          regId,
        ],
      );

      const [[row]] = await deps.pool.query('SELECT * FROM event_forum_topics WHERE id = ?', [topicId]);
      return res.status(201).json({
        ok: true,
        data: deps.mapDbForumTopic(row),
        pending_moderation: moderationStatus === 'pending',
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to create forum topic.', error: error.message });
    }
  });

  app.post('/api/tickets/:reference/forum/topics/:topicId/replies', rateLimitTicket, async (req, res) => {
    try {
      const loaded = await loadRegistrationByReference(deps.pool, req.params.reference);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      if (!deps.isForumVisibleEvent(loaded.event)) {
        return res.status(403).json({ ok: false, message: 'Forum is not available for this event.' });
      }

      if (!deps.isRegistrationTicketEligible(loaded.registration)) {
        return res.status(403).json({ ok: false, message: 'Ticket is not eligible for forum access.' });
      }

      const topicId = String(req.params.topicId || '').trim();
      const [[topicRow]] = await deps.pool.query(
        'SELECT * FROM event_forum_topics WHERE id = ? AND event_id = ? AND hidden = 0 LIMIT 1',
        [topicId, loaded.event.id],
      );
      if (!topicRow) return res.status(404).json({ ok: false, message: 'Topic not found.' });

      const body = deps.sanitizeForumText(req.body?.body, 3000);
      if (!body) return res.status(400).json({ ok: false, message: 'Reply message is required.' });

      const preModerated = deps.parseBoolean(loaded.event?.forum_pre_moderated, false);
      const moderationStatus = preModerated ? 'pending' : 'approved';
      const replyId = deps.generateEntityId('efr');
      const userName = resolveGuestDisplayName(loaded.registration);
      const regId = String(loaded.registration.id);

      await deps.pool.query(
        `INSERT INTO event_forum_replies (id, topic_id, event_id, user_id, user_name, body, moderation_status, registration_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [replyId, topicId, loaded.event.id, guestForumUserId(regId), userName, body, moderationStatus, regId],
      );

      if (moderationStatus === 'approved') {
        await deps.pool.query(
          `UPDATE event_forum_topics
           SET reply_count = reply_count + 1, last_activity_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [topicId],
        );
      }

      const [[row]] = await deps.pool.query('SELECT * FROM event_forum_replies WHERE id = ?', [replyId]);
      return res.status(201).json({
        ok: true,
        data: deps.mapDbForumReply(row),
        pending_moderation: moderationStatus === 'pending',
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to create forum reply.', error: error.message });
    }
  });
}
