import crypto from "node:crypto";
import {
  getCampaignDirectory,
  upsertCampaignContact,
  saveCampaignGroup,
  setCampaignGroupMembers,
  saveCampaignMembership,
  saveCampaignSender,
  refreshCampaignSenders,
  campaignSuppressions,
  updateSubscription,
  jsonValue,
} from "./campaignDirectoryService.js";
import {
  archiveCampaign,
  getCampaignWithRevision,
  listCampaigns,
  saveDesignTemplate,
  writeAudit,
} from "./emailCampaignService.js";
import { getCampaignReport } from "./emailWebhookService.js";
import {
  campaignReadiness,
  previewCampaignEmail,
  returnCampaignToDraft,
  readPreferenceToken,
} from "./emailOutboxService.js";
import {
  invitationContext,
  respondToInvitation,
  recordCampaignClick,
  ensureEventInvitee,
  saveCampaignSurvey,
  getCampaignSurvey,
  submitCampaignSurvey,
} from "./campaignInvitationService.js";
import { reconcileCampaignJob } from "./campaignReconciliationService.js";

const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (!res.headersSent)
      res.status(error.status || 400).json({
        ok: false,
        message: error.message || "Unable to complete request.",
      });
  }
};
const send = (res, data) => res.json({ ok: true, data });
export function csvDocument(headers, rows) {
  const escape = (value) =>
    `"${String(value ?? "")
      .replace(/^(\s*[=+@-])/, "'$1")
      .replaceAll('"', '""')}"`;
  return (
    "\ufeff" +
    [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")
  );
}

export function registerCampaignWorkspaceRoutes(
  app,
  { pool, actorId, getJwtAuth, uploadImage },
) {
  app.get(
    "/api/admin/campaigns/assets",
    safe(async (_req, res) => {
      const [assets] = await pool.query(
        "SELECT * FROM campaign_assets ORDER BY created_at DESC",
      );
      send(res, assets);
    }),
  );
  app.post(
    "/api/admin/campaigns/assets",
    safe(async (req, res) => {
      if (
        !uploadImage ||
        !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(
          req.body.image || "",
        ) ||
        req.body.image.length > 8000000
      )
        throw new Error("Upload a PNG, JPEG, WebP or GIF under 5 MB.");
      const stored = await uploadImage(req.body.image, req);
      const relative = stored.includes("/uploads/")
        ? `/uploads/${stored.split("/uploads/")[1]}`
        : stored;
      const url = new URL(
        relative,
        process.env.APP_URL || "https://mutalemubanga.org",
      ).href;
      const asset = {
        id: `asset-${crypto.randomUUID()}`,
        name: String(req.body.name || "Campaign image").slice(0, 255),
        url,
      };
      await pool.query(
        "INSERT INTO campaign_assets (id,name,url) VALUES (?,?,?)",
        [asset.id, asset.name, asset.url],
      );
      send(res, asset);
    }),
  );
  app.get(
    "/api/admin/campaigns/events",
    safe(async (_req, res) => {
      const [events] = await pool.query(
        "SELECT id,title,slug,start_date,start_time,end_date,end_time,timezone,event_mode,location,venue,booking_type,status FROM events ORDER BY start_date DESC",
      );
      send(res, events);
    }),
  );
  app.get(
    "/api/admin/campaigns/events/:eventId/registrants",
    safe(async (req, res) => {
      const [rows] = await pool.query(
        `SELECT id,COALESCE(NULLIF(booked_for_name,''),user_name) AS name,COALESCE(NULLIF(booked_for_email,''),user_email) AS email,status,payment_status,registration_type,attendee_type,attended_at,created_at FROM event_registrations WHERE event_id=?`,
        [req.params.eventId],
      );
      send(res, rows);
    }),
  );
  app.get(
    "/api/admin/campaigns/directory",
    safe(async (_req, res) => send(res, await getCampaignDirectory(pool))),
  );
  app.post(
    "/api/admin/campaigns/contacts",
    safe(async (req, res) => {
      const contact = await upsertCampaignContact(
        pool,
        { ...req.body, source: "manual" },
        { consent: req.body.marketing_opt_in === true },
      );
      await writeAudit(pool, {
        actorId: actorId(req),
        action: "contact.saved",
        detail: contact.id,
      });
      send(res, contact);
    }),
  );
  app.put(
    "/api/admin/campaigns/contacts/:id",
    safe(async (req, res) => {
      const [[old]] = await pool.query(
        "SELECT * FROM campaign_contacts WHERE id=?",
        [req.params.id],
      );
      if (!old || req.body.email_normalized !== old.email_normalized)
        throw new Error(
          "Contact email identities cannot be changed. Add a new contact instead.",
        );
      send(
        res,
        await upsertCampaignContact(
          pool,
          { ...req.body, id: old.id, source: "manual" },
          { consent: req.body.marketing_opt_in === true },
        ),
      );
    }),
  );
  app.post(
    "/api/admin/campaigns/contacts/import",
    safe(async (req, res) => {
      const rows = req.body.contacts;
      if (!Array.isArray(rows) || rows.length > 5000)
        throw new Error("Import up to 5,000 contacts at a time.");
      let imported = 0;
      const errors = [];
      for (const [index, row] of rows.entries()) {
        try {
          await upsertCampaignContact(
            pool,
            { ...row, source: "manual" },
            {
              consent:
                row.marketing_opt_in === true &&
                req.body.confirmed_consent === true,
            },
          );
          imported++;
        } catch (error) {
          errors.push({ row: index + 1, message: error.message });
        }
      }
      await writeAudit(pool, {
        actorId: actorId(req),
        action: "contacts.imported",
        detail: `${imported} contacts`,
      });
      send(res, { imported, errors });
    }),
  );
  app.get(
    "/api/admin/campaigns/archived",
    safe(async (_req, res) => {
      const [groups] = await pool.query(
        "SELECT id,kind,name FROM campaign_groups WHERE archived_at IS NOT NULL",
      );
      const [templates] = await pool.query(
        "SELECT id,name,campaign_type FROM email_design_templates WHERE archived_at IS NOT NULL",
      );
      const [contacts] = await pool.query(
        "SELECT id,full_name,email_normalized FROM campaign_contacts WHERE archived_at IS NOT NULL",
      );
      send(res, { groups, templates, contacts });
    }),
  );
  for (const [kind, table] of [
    ["groups", "campaign_groups"],
    ["templates", "email_design_templates"],
    ["contacts", "campaign_contacts"],
  ])
    app.post(
      `/api/admin/campaigns/${kind}/:id/restore`,
      safe(async (req, res) => {
        const [result] = await pool.query(
          `UPDATE ${table} SET archived_at=NULL WHERE id=? AND archived_at IS NOT NULL`,
          [req.params.id],
        );
        if (!result.affectedRows) throw new Error("Archived item not found.");
        send(res, { restored: true });
      }),
    );
  app.post(
    "/api/admin/campaigns/contacts/:id/archive",
    safe(async (req, res) => {
      const [result] = await pool.query(
        "UPDATE campaign_contacts SET archived_at=UTC_TIMESTAMP() WHERE id=?",
        [req.params.id],
      );
      if (!result.affectedRows) throw new Error("Contact not found.");
      send(res, { archived: true });
    }),
  );
  app.post(
    "/api/admin/campaigns/groups",
    safe(async (req, res) =>
      send(res, { id: await saveCampaignGroup(pool, req.body) }),
    ),
  );
  app.put(
    "/api/admin/campaigns/groups/:id",
    safe(async (req, res) =>
      send(res, { id: await saveCampaignGroup(pool, req.body, req.params.id) }),
    ),
  );
  app.post(
    "/api/admin/campaigns/groups/:id/members",
    safe(async (req, res) => {
      await setCampaignGroupMembers(pool, req.params.id, req.body.contact_ids);
      send(res, { saved: true });
    }),
  );
  app.post(
    "/api/admin/campaigns/groups/:id/archive",
    safe(async (req, res) => {
      await pool.query(
        "UPDATE campaign_groups SET archived_at=UTC_TIMESTAMP() WHERE id=?",
        [req.params.id],
      );
      send(res, { archived: true });
    }),
  );
  app.post(
    "/api/admin/campaigns/memberships",
    safe(async (req, res) => {
      await saveCampaignMembership(pool, req.body);
      send(res, { saved: true });
    }),
  );
  app.post(
    "/api/admin/campaigns/senders",
    safe(async (req, res) =>
      send(res, { id: await saveCampaignSender(pool, req.body) }),
    ),
  );
  app.post(
    "/api/admin/campaigns/senders/verify",
    safe(async (_req, res) =>
      send(res, { checked: await refreshCampaignSenders(pool) }),
    ),
  );
  app.get(
    "/api/admin/campaigns/suppressions",
    safe(async (_req, res) => send(res, await campaignSuppressions(pool))),
  );
  app.post(
    "/api/admin/campaigns/templates",
    safe(async (req, res) =>
      send(res, { id: await saveDesignTemplate(pool, req.body) }),
    ),
  );
  app.put(
    "/api/admin/campaigns/templates/:id",
    safe(async (req, res) =>
      send(res, {
        id: await saveDesignTemplate(pool, req.body, req.params.id),
      }),
    ),
  );
  app.post(
    "/api/admin/campaigns/templates/:id/archive",
    safe(async (req, res) => {
      await pool.query(
        "UPDATE email_design_templates SET archived_at=UTC_TIMESTAMP() WHERE id=?",
        [req.params.id],
      );
      send(res, { archived: true });
    }),
  );
  app.get(
    "/api/admin/campaigns/:id/review",
    safe(async (req, res) => {
      const campaign = await getCampaignWithRevision(pool, req.params.id);
      if (!campaign) throw new Error("Campaign not found.");
      send(res, {
        campaign,
        provider: await campaignReadiness(pool, campaign, { live: true }),
      });
    }),
  );
  app.get(
    "/api/admin/campaigns/:id/preview",
    safe(async (req, res) =>
      send(res, await previewCampaignEmail(pool, req.params.id)),
    ),
  );
  app.post(
    "/api/admin/campaigns/:id/archive",
    safe(async (req, res) => {
      await archiveCampaign(pool, req.params.id, actorId(req));
      send(res, { archived: true });
    }),
  );
  app.post(
    "/api/admin/campaigns/:id/restore",
    safe(async (req, res) => {
      await pool.query(
        "UPDATE email_campaigns SET archived_at=NULL WHERE id=?",
        [req.params.id],
      );
      send(res, { restored: true });
    }),
  );
  app.post(
    "/api/admin/campaigns/:id/return-to-draft",
    safe(async (req, res) =>
      send(res, await returnCampaignToDraft(pool, req.params.id, actorId(req))),
    ),
  );
  app.get(
    "/api/admin/campaigns/:id/jobs",
    safe(async (req, res) => {
      const [jobs] = await pool.query(
        "SELECT id,recipient_id,status,tries,last_error,provider_message_id,claimed_at,created_at FROM email_outbox_jobs WHERE campaign_id=? ORDER BY created_at",
        [req.params.id],
      );
      send(res, jobs);
    }),
  );
  app.get(
    "/api/admin/campaigns/:id/report/export",
    safe(async (req, res) => {
      const report = await getCampaignReport(pool, req.params.id);
      const rows = report.recipients.filter(
        (row) => !req.query.outcome || row.outcome === req.query.outcome,
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="campaign-${req.params.id.replace(/[^a-z0-9-]/gi, "")}.csv"`,
      );
      res.send(
        csvDocument(
          [
            "Email",
            "Name",
            "Included",
            "Status",
            "Exclude Reason",
            "Sent Date",
            "Delivered Date",
            "Open Date",
            "Click Date",
            "Clicks",
            "Error",
          ],
          rows.map((row) => [
            row.email_normalized,
            row.display_name,
            row.included,
            row.outcome,
            row.exclude_reason,
            row.sent_at,
            row.delivered_at,
            row.opened_at,
            row.clicked_at,
            row.clicks,
            row.error_reason,
          ]),
        ),
      );
    }),
  );
  app.post(
    "/api/admin/campaigns/:id/reconcile",
    safe(async (req, res) =>
      send(
        res,
        await reconcileCampaignJob(pool, {
          campaignId: req.params.id,
          jobId: req.body.job_id,
          providerMessageId: req.body.provider_message_id,
          actorId: actorId(req),
        }),
      ),
    ),
  );
  app.get(
    "/api/admin/campaigns/dashboard",
    safe(async (req, res) => {
      const periods = { week: 7, month: 30, quarter: 90, year: 365 };
      const days =
        periods[req.query.period] || (req.query.period === "all" ? 0 : 30);
      const where = days
        ? ` WHERE r.sent_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${days} DAY)`
        : " WHERE r.sent_at IS NOT NULL";
      const [[raw]] = await pool.query(
        `SELECT COUNT(DISTINCT r.campaign_id) AS campaigns,COUNT(*) AS sent,SUM(r.delivered_at IS NOT NULL) AS delivered,SUM(r.bounced_at IS NOT NULL) AS bounced,SUM(r.opened_at IS NOT NULL) AS opened,SUM(r.clicked_at IS NOT NULL) AS clicked FROM email_campaign_recipients r${where}`,
      );
      const totals = Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [key, Number(value || 0)]),
      );
      const [[suppressed]] = await pool.query(
        "SELECT COUNT(*) AS total FROM email_suppressions WHERE reason='hard_bounce'",
      );
      const [[unsubscribed]] = await pool.query(
        "SELECT COUNT(*) AS total FROM email_preferences WHERE unsubscribed_at IS NOT NULL",
      );
      send(res, {
        totals,
        hard_bounced: Number(suppressed.total),
        unsubscribed: Number(unsubscribed.total),
        recent: (await listCampaigns(pool))
          .filter((row) => row.state !== "draft")
          .slice(0, 10),
      });
    }),
  );
  app.get(
    "/api/admin/campaigns/surveys",
    safe(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT s.*,(SELECT COUNT(*) FROM campaign_survey_responses r WHERE r.survey_id=s.id) AS responses FROM campaign_surveys s ORDER BY s.created_at DESC",
      );
      send(
        res,
        rows.map((row) => ({
          ...row,
          questions: jsonValue(row.questions_json, []),
        })),
      );
    }),
  );
  app.post(
    "/api/admin/campaigns/surveys",
    safe(async (req, res) =>
      send(res, { id: await saveCampaignSurvey(pool, req.body) }),
    ),
  );
  app.put(
    "/api/admin/campaigns/surveys/:id",
    safe(async (req, res) =>
      send(res, {
        id: await saveCampaignSurvey(pool, req.body, req.params.id),
      }),
    ),
  );
  app.get(
    "/api/admin/campaigns/surveys/:id/results",
    safe(async (req, res) => {
      const survey = await getCampaignSurvey(pool, req.params.id);
      const [rows] = await pool.query(
        "SELECT id,answers_json,created_at FROM campaign_survey_responses WHERE survey_id=? ORDER BY created_at DESC",
        [req.params.id],
      );
      send(res, {
        survey,
        responses: rows.map((row) => ({
          ...row,
          answers: jsonValue(row.answers_json),
        })),
      });
    }),
  );
  app.get(
    "/api/admin/campaigns/events/:eventId/content",
    safe(async (req, res) => {
      const [[event]] = await pool.query(
        "SELECT id,title,featured_speakers,campaign_content_json FROM events WHERE id=?",
        [req.params.eventId],
      );
      if (!event) throw new Error("Event not found.");
      send(res, {
        event,
        content: jsonValue(event.campaign_content_json, {
          sponsors: [],
          exhibitors: [],
        }),
      });
    }),
  );
  app.put(
    "/api/admin/campaigns/events/:eventId/content",
    safe(async (req, res) => {
      const content = {};
      for (const key of ["sponsors", "exhibitors"])
        content[key] = (Array.isArray(req.body[key]) ? req.body[key] : [])
          .slice(0, 100)
          .map((row) => ({
            id: String(row.id || crypto.randomUUID()),
            name: String(row.name || "").slice(0, 255),
            image: /^https?:\/\//.test(row.image || "") ? row.image : "",
            position: String(row.position || "").slice(0, 255),
          }));
      await pool.query("UPDATE events SET campaign_content_json=? WHERE id=?", [
        JSON.stringify(content),
        req.params.eventId,
      ]);
      send(res, content);
    }),
  );
  app.get(
    "/api/admin/campaigns/events/:eventId/invitees",
    safe(async (req, res) => {
      const [rows] = await pool.query(
        "SELECT id,email_normalized,display_name,state,first_sent_at,last_sent_at,responded_at FROM event_invitees WHERE event_id=?",
        [req.params.eventId],
      );
      send(res, rows);
    }),
  );
  app.post(
    "/api/admin/campaigns/events/:eventId/invitees",
    safe(async (req, res) => {
      const [[event]] = await pool.query("SELECT id FROM events WHERE id=?", [
        req.params.eventId,
      ]);
      if (!event) throw new Error("Event not found.");
      if (
        !Array.isArray(req.body.contact_ids) ||
        req.body.contact_ids.length > 10000
      )
        throw new Error("Select contacts to invite.");
      for (const id of req.body.contact_ids) {
        const [[contact]] = await pool.query(
          "SELECT * FROM campaign_contacts WHERE id=? AND archived_at IS NULL",
          [id],
        );
        if (!contact) throw new Error("Contact not found.");
        await ensureEventInvitee(pool, {
          eventId: req.params.eventId,
          email: contact.email_normalized,
          name: contact.full_name,
          contactId: id,
        });
      }
      send(res, { added: true });
    }),
  );
  const publicBuckets = new Map();
  const publicLimit = (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    let bucket = publicBuckets.get(key);
    if (!bucket || now - bucket.start > 3600000)
      bucket = { start: now, count: 0 };
    bucket.count++;
    publicBuckets.set(key, bucket);
    if (publicBuckets.size > 10000)
      for (const [id, value] of publicBuckets)
        if (now - value.start > 3600000) publicBuckets.delete(id);
    if (bucket.count > 60)
      return res.status(429).json({
        ok: false,
        message: "Too many requests. Please try again later.",
      });
    next();
  };
  app.get(
    "/api/email/invitation",
    safe(async (req, res) =>
      send(res, (await invitationContext(pool, req.query.token)).data),
    ),
  );
  app.post(
    "/api/email/invitation",
    publicLimit,
    safe(async (req, res) =>
      send(
        res,
        await respondToInvitation(pool, req.body.token, req.body.response),
      ),
    ),
  );
  app.head(
    "/api/email/click",
    safe(async (req, res) =>
      res.redirect(
        await recordCampaignClick(pool, req.query.token, { head: true }),
      ),
    ),
  );
  app.get(
    "/api/email/click",
    safe(async (req, res) =>
      res.redirect(await recordCampaignClick(pool, req.query.token)),
    ),
  );
  app.get(
    "/api/email/subscriptions",
    safe(async (req, res) => {
      const parsed = readPreferenceToken(req.query.token);
      const [[contact]] = await pool.query(
        "SELECT id FROM campaign_contacts WHERE email_normalized=?",
        [parsed.email],
      );
      const [groups] = await pool.query(
        "SELECT g.id,g.name,g.description,g.active_only,gm.state FROM campaign_groups g LEFT JOIN campaign_group_members gm ON gm.group_id=g.id AND gm.contact_id=? WHERE g.kind='subscription' AND g.archived_at IS NULL AND (g.is_private=0 OR gm.contact_id IS NOT NULL)",
        [contact?.id || ""],
      );
      send(res, groups);
    }),
  );
  app.post(
    "/api/email/subscriptions",
    safe(async (req, res) => {
      const parsed = readPreferenceToken(req.body.token);
      await updateSubscription(pool, {
        email: parsed.email,
        groupId: req.body.group_id,
        subscribed: req.body.subscribed === true,
      });
      send(res, { saved: true });
    }),
  );
  app.get(
    "/api/email/surveys/:id",
    safe(async (req, res) =>
      send(
        res,
        await getCampaignSurvey(pool, req.params.id, { publicView: true }),
      ),
    ),
  );
  app.post(
    "/api/email/surveys/:id",
    publicLimit,
    safe(async (req, res) =>
      send(res, await submitCampaignSurvey(pool, req.params.id, req.body)),
    ),
  );
  app.delete(
    "/api/account/campaign-push-token",
    safe(async (req, res) => {
      const auth = getJwtAuth?.(req);
      if (!auth?.ok)
        return res
          .status(401)
          .json({ ok: false, message: "Sign in to unregister a push token." });
      await pool.query(
        "UPDATE campaign_push_tokens SET active=0 WHERE user_id=? AND token=?",
        [auth.claims.sub, req.body.token],
      );
      send(res, { removed: true });
    }),
  );
  app.post(
    "/api/account/campaign-push-token",
    safe(async (req, res) => {
      const auth = getJwtAuth?.(req);
      if (!auth?.ok)
        return res
          .status(401)
          .json({ ok: false, message: "Sign in to register a push token." });
      if (
        !/^(Expo(nent)?PushToken)\[[A-Za-z0-9_-]+\]$/.test(req.body.token || "")
      )
        throw new Error("Enter a valid Expo push token.");
      await pool.query(
        "INSERT INTO campaign_push_tokens (id,user_id,token) VALUES (?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),active=1",
        [`push-${crypto.randomUUID()}`, auth.claims.sub, req.body.token],
      );
      send(res, { registered: true });
    }),
  );
}
