import { reconcileCampaignJob } from "../campaignReconciliationService.js";
// Runs real MySQL integration checks in a disposable database. Never uses live mail.
import "dotenv/config";
import mysql from "mysql2/promise";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import {
  enqueueCampaignPush,
  runCampaignPushTick,
} from "../campaignPushService.js";
import { ensureEmailCommunicationsSchema } from "../emailCampaignSchema.js";
import {
  createCampaign,
  updateCampaignDetails,
  getCampaignWithRevision,
  saveRevision,
  duplicateCampaign,
  listCampaigns,
  archiveCampaign,
} from "../emailCampaignService.js";
import {
  upsertCampaignContact,
  saveCampaignGroup,
  setCampaignGroupMembers,
  saveCampaignMembership,
  getCampaignDirectory,
  updateSubscription,
  refreshCampaignSenders,
} from "../campaignDirectoryService.js";
import { previewCampaignAudience } from "../emailAudienceService.js";
import {
  recordMarketingOptIn,
  recordUnsubscribe,
  recordSuppression,
} from "../emailConsentService.js";
import {
  startCampaignSend,
  claimNextOutboxJob,
  processClaimedJob,
  previewCampaignEmail,
  pauseCampaignJobs,
  resumeCampaignJobs,
  cancelCampaignJobs,
  returnCampaignToDraft,
  runEmailOutboxTick,
} from "../emailOutboxService.js";
import {
  signCampaignLink,
  invitationContext,
  respondToInvitation,
  ensureEventInvitee,
  saveCampaignSurvey,
  submitCampaignSurvey,
  getCampaignSurvey,
  recordCampaignClick,
} from "../campaignInvitationService.js";
import {
  getCampaignReport,
  ingestResendWebhook,
} from "../emailWebhookService.js";
const connectionOptions = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  dateStrings: true,
};
const source = process.env.DB_NAME || "mutale";
const database = `mutale_campaign_test_${Date.now()}`;
const root = await mysql.createConnection(connectionOptions);
let pool;
let success = false;
let checks = 0;
const check = (name) => {
  checks++;
  console.log(`PASS ${name}`);
};
const keep = process.env.CAMPAIGN_TEST_KEEP === "1";
process.env.RESEND_LIVE_SENDS = "1";
process.env.APP_URL = "http://localhost:5176";
process.env.AUTH_TOKEN_SECRET = "test-only-campaign-link-key";
const sendReady = { assertReady: async () => ({ ready: true, errors: [] }) };
const deps = {
  config: { apiKey: "test-only-no-network", live: true },
  sendFn: async () => ({
    status: "accepted",
    providerMessageId: `test-msg-${crypto.randomUUID()}`,
  }),
};
try {
  await root.query(`CREATE DATABASE \`${database}\``);
  pool = mysql.createPool({ ...connectionOptions, database });
  // Copy table structures only, never customer records.
  const [tables] = await root.query(`SHOW TABLES FROM \`${source}\``);
  for (const row of tables) {
    const table = Object.values(row)[0];
    await pool.query(
      `CREATE TABLE \`${table}\` LIKE \`${source}\`.\`${table}\``,
    );
  }
  await ensureEmailCommunicationsSchema(pool);
  await ensureEmailCommunicationsSchema(pool);
  check("schema migration is repeatable");
  await pool.query(
    "INSERT INTO events (id,title,slug,status,start_date,start_time,event_mode,venue,location,booking_type) VALUES ('test-event','Campaign Test Event','campaign-test-event','published','2027-06-01','09:00:00','in_person','Lusaka','Lusaka','both')",
  );
  const salt = crypto.randomBytes(16).toString("hex");
  const password = crypto.randomBytes(18).toString("base64url");
  const hash = `pbkdf2$120000$${salt}$${crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex")}`;
  await pool.query(
    "INSERT INTO users (id,name,email,password_hash,role,email_verified) VALUES ('campaign-test-admin','Campaign Test Admin','campaign-review@example.test',?,'admin',1)",
    [hash],
  );
  const alice = await upsertCampaignContact(
    pool,
    {
      email: "alice@example.test",
      name: "Alice Recipient",
      company: "Acme",
      assistant_email: "assistant@example.test",
    },
    { consent: true },
  );
  const bob = await upsertCampaignContact(
    pool,
    { email: "bob@example.test", name: "Bob Recipient" },
    { consent: true },
  );
  await upsertCampaignContact(pool, {
    email: "no-consent@example.test",
    name: "No Consent",
  });
  await pool.query(
    "INSERT INTO event_registrations (id,event_id,user_id,user_name,user_email,booked_for_name,booked_for_email,status,payment_status,registration_type,reference_code) VALUES ('test-reg','test-event','campaign-test-admin','Purchaser','purchaser@example.test','Attendee','attendee@example.test','confirmed','paid','subscription','TEST-REF')",
  );
  const group = await saveCampaignGroup(pool, {
    name: "Acme Contacts",
    kind: "contact_list",
  });
  await setCampaignGroupMembers(pool, group, [alice.id, bob.id]);
  const excluded = await saveCampaignGroup(pool, {
    name: "Exclude Bob",
    kind: "committee",
  });
  await setCampaignGroupMembers(pool, excluded, [bob.id]);
  const audience = {
    version: 2,
    include: [
      { source: "contact_list", id: group },
      { source: "all_contacts" },
    ],
    exclude: [{ source: "committee", id: excluded }],
  };
  const selected = await previewCampaignAudience(pool, {
    audience,
    type: "regular",
    purpose: "promotional",
  });
  assert.equal(selected.included_count, 1);
  assert.equal(selected.included[0].email, "alice@example.test");
  check("include/exclude union, deduplication and explicit consent");
  const notification = await createCampaign(pool, {
    eventId: "test-event",
    type: "event_notification",
    name: "Notification",
  });
  const service = await previewCampaignAudience(pool, {
    eventId: "test-event",
    audience: notification.audience,
    type: "event_notification",
    purpose: "event_service",
  });
  assert.equal(service.included_count, 1);
  assert.equal(service.included[0].email, "attendee@example.test");
  assert.equal(service.included[0].name, "Attendee");
  check(
    "attendee identity matches booked-for address and service relationship",
  );
  const membership = await saveCampaignGroup(pool, {
    name: "Active Members",
    kind: "membership_type",
  });
  await saveCampaignMembership(pool, {
    contact_id: alice.id,
    type_id: membership,
    status: "active",
    starts_at: "2026-01-01",
    expires_at: "2030-01-01",
  });
  const smart = await saveCampaignGroup(pool, {
    name: "Active Acme",
    kind: "smart_list",
    filters: { company: "Acme", active_member: "1" },
  });
  const smartResult = await previewCampaignAudience(pool, {
    audience: {
      version: 2,
      include: [{ source: "smart_list", id: smart }],
      exclude: [],
    },
    type: "regular",
    purpose: "promotional",
  });
  assert.equal(smartResult.included_count, 1);
  check("membership dates and smart lists resolve actual contacts");
  const subscription = await saveCampaignGroup(pool, {
    name: "Public Updates",
    kind: "subscription",
    active_only: true,
  });
  await updateSubscription(pool, {
    email: alice.email_normalized,
    groupId: subscription,
    subscribed: true,
  });
  await assert.rejects(
    updateSubscription(pool, {
      email: bob.email_normalized,
      groupId: subscription,
      subscribed: true,
    }),
    /active members/,
  );
  const privateList = await saveCampaignGroup(pool, {
    name: "Private Updates",
    kind: "subscription",
    is_private: true,
  });
  await assert.rejects(
    updateSubscription(pool, {
      email: bob.email_normalized,
      groupId: privateList,
      subscribed: true,
    }),
    /private/,
  );
  check("public/private subscription and active membership restrictions");
  await updateSubscription(pool, {
    email: alice.email_normalized,
    groupId: subscription,
    subscribed: false,
  });
  await setCampaignGroupMembers(pool, subscription, [alice.id]);
  const [[unsub]] = await pool.query(
    "SELECT state FROM campaign_group_members WHERE group_id=?",
    [subscription],
  );
  assert.equal(unsub.state, "unsubscribed");
  await updateSubscription(pool, {
    email: alice.email_normalized,
    groupId: subscription,
    subscribed: true,
  });
  check(
    "list selection cannot clear an unsubscribe; explicit re-subscription works",
  );
  await refreshCampaignSenders(pool, {
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "test-domain",
              name: "mutalemubanga.org",
              status: "verified",
              capabilities: { sending: "enabled" },
            },
          ],
        }),
        { status: 200 },
      ),
  }).catch(async (error) => {
    if (/RESEND_API_KEY/.test(error.message)) {
      process.env.RESEND_API_KEY = "test-only-no-network";
      await refreshCampaignSenders(pool, {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  id: "test-domain",
                  name: "mutalemubanga.org",
                  status: "verified",
                  capabilities: { sending: "enabled" },
                },
              ],
            }),
            { status: 200 },
          ),
      });
    } else throw error;
  });
  check("verified sender state comes from provider domain API");
  const regular = await createCampaign(pool, {
    type: "regular",
    name: "Regular",
  });
  assert.equal(regular.event_id, null);
  assert.equal(regular.purpose, "promotional");
  await assert.rejects(
    createCampaign(pool, { type: "event_invitation", name: "Missing Event" }),
    /Select an event/,
  );
  check("three types enforce independent regular and event-bound campaigns");
  const design = {
    version: 2,
    blocks: [
      {
        type: "text",
        html: "<p>Hello {{first_name}}</p><script>alert(1)</script>",
      },
      {
        type: "button",
        label: "Visit Acme",
        url: "https://example.com/article",
      },
      { type: "footer" },
    ],
  };
  const saved = await updateCampaignDetails(
    pool,
    regular.id,
    {
      subject: "Hello {{first_name}}",
      audience,
      design,
      cc: "copy@example.test",
      cc_assistant: true,
      language: "English",
      sender_identity_id: "sender-mutale",
    },
    "campaign-test-admin",
  );
  const p = await previewCampaignEmail(pool, regular.id);
  assert.ok(p.html.includes("Hello Preview"));
  assert.ok(!p.html.includes("<script"));
  assert.ok(p.html.includes("Manage my subscriptions"));
  check("HTML sanitization and contact merge preview");
  await assert.rejects(
    updateCampaignDetails(pool, regular.id, { version: 1, name: "Stale" }),
    /another window/,
  );
  check("stale draft versions are rejected");
  const sent = await startCampaignSend(
    pool,
    regular.id,
    { confirmed: true, requestKey: "test-request", version: saved.version },
    sendReady,
  );
  assert.equal(sent.state, "sending");
  await assert.rejects(
    saveRevision(pool, { campaignId: regular.id, subject: "Changed", design }),
    /locked/,
  );
  const retry = await startCampaignSend(
    pool,
    regular.id,
    { confirmed: true, requestKey: "test-request" },
    sendReady,
  );
  assert.equal(retry.id, regular.id);
  await assert.rejects(
    startCampaignSend(
      pool,
      regular.id,
      { confirmed: true, requestKey: "different-key" },
      sendReady,
    ),
    /Cannot send/,
  );
  const [[before]] = await pool.query(
    "SELECT COUNT(*) n FROM email_campaign_recipients WHERE campaign_id=?",
    [regular.id],
  );
  assert.ok(before.n > 1);
  check("idempotent send, immutable content and intact recipient history");
  const [first, second] = await Promise.all([
    claimNextOutboxJob(pool),
    claimNextOutboxJob(pool),
  ]);
  assert.equal([first, second].filter(Boolean).length, 1);
  const job = first || second;
  let captured;
  await processClaimedJob(pool, job, {
    ...deps,
    sendFn: async (payload) => {
      captured = payload;
      return { status: "accepted", providerMessageId: "regular-message" };
    },
  });
  assert.equal(captured.to, "alice@example.test");
  assert.deepEqual(captured.cc, [
    "copy@example.test",
    "assistant@example.test",
  ]);
  assert.ok(captured.html.includes("/api/email/click"));
  check("atomic claim and personalized CC copies");
  let report = await getCampaignReport(pool, regular.id);
  assert.equal(report.totals.accepted, 1);
  assert.equal(
    (await getCampaignWithRevision(pool, regular.id)).state,
    "completed",
  );
  await assert.rejects(
    startCampaignSend(pool, regular.id, { confirmed: true }, sendReady),
    /Cannot send/,
  );
  const [[after]] = await pool.query(
    "SELECT COUNT(*) n FROM email_campaign_recipients WHERE campaign_id=?",
    [regular.id],
  );
  assert.equal(after.n, before.n);
  check("completed send cannot erase snapshots or enqueue again");
  const link = report.links.find(
    (l) => l.destination === "https://example.com/article",
  );
  const clickToken = signCampaignLink({
    kind: "click",
    linkId: link.id,
    campaignId: regular.id,
    recipientId: job.recipient_id,
  });
  await recordCampaignClick(pool, clickToken, { head: true });
  report = await getCampaignReport(pool, regular.id);
  assert.equal(report.totals.clicked, 0);
  await recordCampaignClick(pool, clickToken);
  await recordCampaignClick(pool, clickToken);
  report = await getCampaignReport(pool, regular.id);
  assert.equal(report.totals.clicked, 1);
  assert.equal(report.links.find((l) => l.id === link.id).clicks, 2);
  assert.equal(report.links.find((l) => l.id === link.id).unique_clicks, 1);
  check("HEAD-safe click redirects and unique per-link reporting");
  const secret = Buffer.from("test-webhook-key").toString("base64");
  const body = JSON.stringify({
    type: "email.bounced",
    data: {
      email_id: "regular-message",
      bounce: { type: "Permanent", message: "Test rejection" },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`test-webhook.${timestamp}.${body}`)
    .digest("base64");
  const headers = {
    "svix-id": "test-webhook",
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
  await ingestResendWebhook(pool, { rawBody: body, headers, secret });
  assert.equal(
    (await ingestResendWebhook(pool, { rawBody: body, headers, secret }))
      .duplicate,
    true,
  );
  await pool.query(
    "DELETE FROM email_suppressions WHERE email_normalized='alice@example.test'",
  );
  check("signed webhook ingestion and duplicate event handling");
  const copy = await duplicateCampaign(pool, regular.id, "campaign-test-admin");
  assert.equal(copy.campaign_type, "regular");
  assert.equal(copy.state, "draft");
  assert.deepEqual(copy.audience, saved.audience);
  await archiveCampaign(pool, copy.id);
  assert.ok(!(await listCampaigns(pool)).some((c) => c.id === copy.id));
  await pool.query("UPDATE email_campaigns SET archived_at=NULL WHERE id=?", [
    copy.id,
  ]);
  check("duplication and recoverable deletion");
  const scheduled = await duplicateCampaign(pool, regular.id);
  await startCampaignSend(
    pool,
    scheduled.id,
    {
      confirmed: true,
      scheduleAt: "2030-01-01T10:30",
      timezone: "Africa/Lusaka",
    },
    sendReady,
  );
  let c = await getCampaignWithRevision(pool, scheduled.id);
  assert.equal(c.scheduled_at_utc, "2030-01-01 08:30:00");
  assert.equal(c.audience_frozen_at, null);
  await pauseCampaignJobs(pool, c.id);
  await resumeCampaignJobs(pool, c.id);
  assert.equal((await getCampaignWithRevision(pool, c.id)).state, "scheduled");
  await cancelCampaignJobs(pool, c.id);
  await returnCampaignToDraft(pool, c.id);
  assert.equal((await getCampaignWithRevision(pool, c.id)).state, "draft");
  check(
    "timezone schedule, deferred snapshot, pause/resume and return to draft",
  );
  await startCampaignSend(
    pool,
    scheduled.id,
    {
      confirmed: true,
      scheduleAt: "2030-01-01T10:30",
      timezone: "Africa/Lusaka",
    },
    sendReady,
  );
  await pool.query(
    "UPDATE email_campaigns SET scheduled_at_utc=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE id=?",
    [scheduled.id],
  );
  await recordUnsubscribe(pool, "alice@example.test", {
    reason: "Other",
    details: "Test",
  });
  await runEmailOutboxTick(pool, {
    ...deps,
    config: { ...deps.config, live: false },
  });
  assert.equal(
    (await getCampaignWithRevision(pool, scheduled.id)).state,
    "scheduled",
  );
  assert.equal(
    (await getCampaignWithRevision(pool, scheduled.id)).audience_frozen_at,
    null,
  );
  check(
    "disabled delivery preserves due schedules without freezing or consuming them",
  );
  await runEmailOutboxTick(pool, deps);
  assert.equal(
    (await getCampaignReport(pool, scheduled.id)).totals.accepted,
    0,
  );
  assert.equal(
    (await getCampaignWithRevision(pool, scheduled.id)).state,
    "completed",
  );
  await recordMarketingOptIn(pool, "alice@example.test");
  check("due-time audience freeze respects later unsubscribes");
  const invitation = await createCampaign(pool, {
    eventId: "test-event",
    type: "event_invitation",
    name: "Invitation",
  });
  await updateCampaignDetails(pool, invitation.id, {
    subject: "Invitation",
    audience: {
      version: 2,
      include: [{ source: "contact_list", id: group }],
      exclude: [],
    },
  });
  const invitee = await ensureEventInvitee(pool, {
    eventId: "test-event",
    email: bob.email_normalized,
    name: "Bob",
  });
  const token = signCampaignLink({
    kind: "invitation",
    id: invitee.id,
    eventId: "test-event",
  });
  assert.equal((await invitationContext(pool, token)).data.state, "not_sent");
  await respondToInvitation(pool, token, "declined");
  await respondToInvitation(pool, token, "declined");
  await assert.rejects(
    respondToInvitation(pool, token, "accepted"),
    /different response/,
  );
  const iPreview = await previewCampaignAudience(pool, {
    eventId: "test-event",
    audience: {
      version: 2,
      include: [{ source: "contact_list", id: group }],
      exclude: [],
    },
    type: "event_invitation",
    purpose: "promotional",
  });
  assert.equal(iPreview.included_count, 1);
  assert.equal(iPreview.excluded[0].reason, "invitation_responded");
  check("scanner-safe invitation views and idempotent response suppression");
  const invitationSaved = await getCampaignWithRevision(pool, invitation.id);
  await startCampaignSend(
    pool,
    invitation.id,
    { confirmed: true, version: invitationSaved.version },
    sendReady,
  );
  let inviteJob = await claimNextOutboxJob(pool);
  const aliceInvite = await ensureEventInvitee(pool, {
    eventId: "test-event",
    email: alice.email_normalized,
    name: "Alice",
  });
  await respondToInvitation(
    pool,
    signCampaignLink({
      kind: "invitation",
      id: aliceInvite.id,
      eventId: "test-event",
    }),
    "accepted",
  );
  const skipped = await processClaimedJob(pool, inviteJob, deps);
  assert.equal(skipped.reason, "invitation_responded");
  check("invitation response is checked again immediately before sending");
  const ambiguous = await duplicateCampaign(pool, regular.id);
  await startCampaignSend(pool, ambiguous.id, { confirmed: true }, sendReady);
  const ambiguousJob = await claimNextOutboxJob(pool);
  await processClaimedJob(pool, ambiguousJob, {
    ...deps,
    sendFn: async () => ({
      status: "acceptance_unknown",
      reason: "Test disconnect",
    }),
  });
  assert.equal(await claimNextOutboxJob(pool), null);
  assert.equal(
    (await getCampaignReport(pool, ambiguous.id)).totals.acceptance_unknown,
    1,
  );
  check("ambiguous provider response is retained without automatic resend");
  const surveyId = await saveCampaignSurvey(pool, {
    name: "Campaign Feedback",
    state: "published",
    questions: [
      {
        id: "rating",
        label: "Rate your experience",
        type: "rating",
        required: true,
      },
      {
        id: "choice",
        label: "Topic",
        type: "choice",
        options: ["Events", "News"],
      },
    ],
  });
  await assert.rejects(
    submitCampaignSurvey(pool, surveyId, { answers: { rating: 9 } }),
    /rating/,
  );
  await submitCampaignSurvey(pool, surveyId, {
    answers: { rating: 5, choice: "Events" },
  });
  assert.equal((await getCampaignSurvey(pool, surveyId)).state, "published");
  check("published survey validation and response storage");
  const d = await getCampaignDirectory(pool);
  assert.ok(
    d.contacts.some((c) => c.email_normalized === "attendee@example.test"),
  );
  assert.equal(
    d.contacts.find((c) => c.email_normalized === "attendee@example.test")
      .marketing_opt_in,
    null,
  );
  check("directory sync does not infer marketing consent");
  const subscriptionOnly = await duplicateCampaign(pool, regular.id);
  await updateCampaignDetails(pool, subscriptionOnly.id, {
    audience: {
      version: 2,
      include: [{ source: "subscription", id: subscription }],
      exclude: [],
    },
  });
  await startCampaignSend(
    pool,
    subscriptionOnly.id,
    { confirmed: true },
    sendReady,
  );
  await updateSubscription(pool, {
    email: alice.email_normalized,
    groupId: subscription,
    subscribed: false,
  });
  const subJob = await claimNextOutboxJob(pool);
  const subResult = await processClaimedJob(pool, subJob, deps);
  assert.equal(subResult.reason, "audience_membership_changed");
  await updateSubscription(pool, {
    email: alice.email_normalized,
    groupId: subscription,
    subscribed: true,
  });
  check("per-list opt-out after snapshot is honored at dispatch");
  const retryCampaign = await duplicateCampaign(pool, regular.id);
  await startCampaignSend(
    pool,
    retryCampaign.id,
    { confirmed: true },
    sendReady,
  );
  const retryJob = await claimNextOutboxJob(pool);
  let firstPayload;
  await processClaimedJob(pool, retryJob, {
    ...deps,
    sendFn: async (payload) => {
      firstPayload = payload;
      return { status: "failed", reason: "Temporary error", retryable: true };
    },
  });
  await pool.query(
    "UPDATE email_outbox_jobs SET scheduled_at_utc=UTC_TIMESTAMP() WHERE id=?",
    [retryJob.id],
  );
  const sameJob = await claimNextOutboxJob(pool);
  let retryPayload;
  await processClaimedJob(pool, sameJob, {
    ...deps,
    sendFn: async (payload) => {
      retryPayload = payload;
      return { status: "failed", reason: "Temporary error", retryable: true };
    },
  });
  assert.deepEqual(retryPayload, firstPayload);
  await pool.query(
    "UPDATE email_outbox_jobs SET scheduled_at_utc=UTC_TIMESTAMP(),first_attempt_at_utc=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 25 HOUR) WHERE id=?",
    [retryJob.id],
  );
  const expiredJob = await claimNextOutboxJob(pool);
  assert.equal(
    (await processClaimedJob(pool, expiredJob, deps)).status,
    "acceptance_unknown",
  );
  check(
    "retry payloads stay identical and expired idempotency windows require reconciliation",
  );
  const [[regularRecipient]] = await pool.query(
    "SELECT * FROM email_campaign_recipients WHERE id=?",
    [job.recipient_id],
  );
  await pool.query(
    "UPDATE campaign_contacts SET user_id='campaign-test-admin' WHERE id=?",
    [alice.id],
  );
  await pool.query(
    "INSERT INTO campaign_push_tokens (id,user_id,token) VALUES ('test-push-token','campaign-test-admin','ExpoPushToken[testonly]')",
  );
  await enqueueCampaignPush(
    pool,
    { ...regular, push_enabled: 1 },
    regularRecipient,
  );
  await enqueueCampaignPush(
    pool,
    { ...regular, push_enabled: 1 },
    regularRecipient,
  );
  let pushRequests = 0;
  await runCampaignPushTick(pool, {
    accessToken: "test-only",
    fetchImpl: async () => {
      pushRequests++;
      return new Response(
        JSON.stringify({ data: { status: "ok", id: "push-ticket-1" } }),
        { status: 200 },
      );
    },
  });
  assert.equal(pushRequests, 1);
  await pool.query(
    "UPDATE campaign_push_jobs SET accepted_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 MINUTE)",
  );
  await runCampaignPushTick(pool, {
    accessToken: "test-only",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          data: {
            "push-ticket-1": {
              status: "error",
              message: "Device gone",
              details: { error: "DeviceNotRegistered" },
            },
          },
        }),
        { status: 200 },
      ),
  });
  const [[pushToken]] = await pool.query(
    "SELECT active FROM campaign_push_tokens WHERE id=?",
    ["test-push-token"],
  );
  assert.equal(pushToken.active, 0);
  check(
    "mobile push jobs deduplicate, poll receipts, and deactivate unavailable devices",
  );
  await assert.rejects(
    saveCampaignSurvey(
      pool,
      {
        name: "Changed Survey",
        state: "published",
        questions: [
          {
            id: "rating",
            label: "Changed meaning",
            type: "rating",
            required: true,
          },
        ],
      },
      surveyId,
    ),
    /Duplicate/,
  );
  check("survey questions cannot be silently redefined after responses exist");
  const [[unknownJob]] = await pool.query(
    "SELECT * FROM email_outbox_jobs WHERE id=?",
    [ambiguousJob.id],
  );
  const unknownPayload = JSON.parse(unknownJob.payload_json);
  const providerRecord = {
    id: "verified-provider-message",
    to: [unknownPayload.to],
    subject: unknownPayload.subject,
    html: unknownPayload.html,
    tags: [{ name: "campaign_id", value: ambiguous.id }],
  };
  const reconcileConfig = { apiKey: "test-only" };
  await assert.rejects(
    reconcileCampaignJob(
      pool,
      {
        campaignId: ambiguous.id,
        jobId: unknownJob.id,
        providerMessageId: providerRecord.id,
      },
      {
        config: reconcileConfig,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ ...providerRecord, to: ["wrong@example.test"] }),
            { status: 200 },
          ),
      },
    ),
    /does not match/,
  );
  await reconcileCampaignJob(
    pool,
    {
      campaignId: ambiguous.id,
      jobId: unknownJob.id,
      providerMessageId: providerRecord.id,
    },
    {
      config: reconcileConfig,
      fetchImpl: async () =>
        new Response(JSON.stringify(providerRecord), { status: 200 }),
    },
  );
  assert.equal(
    (await getCampaignReport(pool, ambiguous.id)).totals.accepted,
    1,
  );
  check(
    "manual provider-ID reconciliation verifies exact campaign content and recipient",
  );
  const raceCampaign = await duplicateCampaign(pool, regular.id);
  await startCampaignSend(
    pool,
    raceCampaign.id,
    { confirmed: true },
    sendReady,
  );
  const raceJob = await claimNextOutboxJob(pool);
  await processClaimedJob(pool, raceJob, {
    ...deps,
    sendFn: async () => {
      const raceBody = JSON.stringify({
        type: "email.delivered",
        data: { email_id: "early-webhook-message" },
      });
      const raceId = "early-webhook";
      const raceSignature = crypto
        .createHmac("sha256", Buffer.from(secret, "base64"))
        .update(`${raceId}.${timestamp}.${raceBody}`)
        .digest("base64");
      await ingestResendWebhook(pool, {
        rawBody: raceBody,
        secret,
        headers: {
          "svix-id": raceId,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,${raceSignature}`,
        },
      });
      return { status: "accepted", providerMessageId: "early-webhook-message" };
    },
  });
  assert.equal(
    (await getCampaignReport(pool, raceCampaign.id)).totals.delivered,
    1,
  );
  check(
    "webhooks arriving before provider acceptance are replayed after association",
  );
  await pool.query(
    "UPDATE events SET event_mode='virtual',zoom_join_url='https://example.com/private-joining-link' WHERE id='test-event'",
  );
  const virtual = await createCampaign(pool, {
    eventId: "test-event",
    type: "event_notification",
    name: "Virtual joining",
  });
  await updateCampaignDetails(pool, virtual.id, {
    subject: "Joining information",
    audience: {
      version: 2,
      include: [{ source: "all_contacts" }],
      exclude: [],
    },
  });
  await startCampaignSend(pool, virtual.id, { confirmed: true }, sendReady);
  let virtualChecks = 0;
  for (let count = 0; count < 3; count++) {
    const virtualJob = await claimNextOutboxJob(pool);
    assert.equal(virtualJob.campaign_id, virtual.id);
    await processClaimedJob(pool, virtualJob, {
      ...deps,
      sendFn: async (payload) => {
        assert.equal(
          payload.html.includes("https://example.com/private-joining-link"),
          payload.to === "attendee@example.test",
        );
        virtualChecks++;
        return {
          status: "accepted",
          providerMessageId: `virtual-message-${count}`,
        };
      },
    });
  }
  assert.equal(virtualChecks, 3);
  check(
    "private virtual joining details stay limited to confirmed paid or free registrants",
  );
  await pool.query(
    "INSERT INTO event_registrations (id,event_id,user_id,user_name,user_email,booked_for_name,booked_for_email,status,payment_status,registration_type,reference_code) VALUES ('selected-unpaid','test-event','campaign-test-admin','Purchaser','purchaser@example.test','Attendee','attendee@example.test','pending','unpaid','booking','UNPAID-REF')",
  );
  const unpaid = await previewCampaignAudience(pool, {
    eventId: "test-event",
    type: "event_notification",
    purpose: "event_service",
    audience: {
      version: 2,
      include: [{ source: "event_registrants", filter: "unpaid" }],
      exclude: [],
    },
  });
  assert.equal(unpaid.included[0].registration_id, "selected-unpaid");
  assert.equal(unpaid.included[0].reference_code, "UNPAID-REF");
  await pool.query(
    "DELETE FROM event_registrations WHERE id='selected-unpaid'",
  );
  check(
    "selected registration metadata stays attached when an address has multiple bookings",
  );
  const trackerCampaign = await createCampaign(pool, {
    type: "regular",
    name: "Newsletter event tracker",
  });
  await updateCampaignDetails(pool, trackerCampaign.id, {
    subject: "Upcoming event",
    design: {
      blocks: [
        { id: "tracker", type: "event_tracker", event_id: "test-event" },
      ],
    },
  });
  const trackerPreview = await previewCampaignEmail(pool, trackerCampaign.id);
  assert.ok(trackerPreview.html.includes("Campaign Test Event"));
  assert.ok(trackerPreview.html.includes("/events/campaign-test-event"));
  assert.ok(!trackerPreview.html.includes("private-joining-link"));
  assert.equal(
    trackerPreview.vars.event_tracker_contexts.tracker.event,
    undefined,
  );
  check(
    "independent newsletter Event Trackers resolve public event data without exposing private configuration",
  );
  const automaticList = await saveCampaignGroup(pool, {
    kind: "subscription",
    name: "Automatic attendees",
    auto_attendees: true,
  });
  await recordMarketingOptIn(pool, "campaign-review@example.test", {
    source: "explicit_test_consent",
  });
  await pool.query(
    "INSERT INTO event_registrations (id,event_id,user_id,user_name,user_email,booked_for_name,booked_for_email,status,payment_status,registration_type,reference_code) VALUES ('account-attendee','test-event','campaign-test-admin','Campaign Test Admin','campaign-review@example.test','Campaign Test Admin','campaign-review@example.test','confirmed','paid','booking','ACCOUNT-ATTENDEE')",
  );
  const automaticDirectory = await getCampaignDirectory(pool);
  const accountAttendee = automaticDirectory.contacts.find(
    (contact) => contact.email_normalized === "campaign-review@example.test",
  );
  assert.equal(accountAttendee.source, "account");
  assert.ok(
    automaticDirectory.group_members.some(
      (member) =>
        member.group_id === automaticList &&
        member.contact_id === accountAttendee.id &&
        member.state === "active",
    ),
  );
  assert.ok(
    !automaticDirectory.group_members.some(
      (member) =>
        member.group_id === automaticList &&
        member.contact_id ===
          automaticDirectory.contacts.find(
            (contact) => contact.email_normalized === "no-consent@example.test",
          ).id,
    ),
  );
  check(
    "automatic attendee lists recognize account-backed attendees while requiring recorded consent",
  );
  if (keep) {
    await pool.query(
      "UPDATE campaign_sender_identities SET status='unverified'",
    );
    const review = await duplicateCampaign(pool, regular.id);
    await updateCampaignDetails(pool, review.id, {
      name: "Browser Review Campaign",
      subject: "Welcome to our newsletter",
    });
    await fs.writeFile(
      "/private/tmp/mutale-campaign-browser-fixture.json",
      JSON.stringify({
        database,
        email: "campaign-review@example.test",
        password,
        campaignId: review.id,
        invitationToken: token,
        surveyId,
      }),
      { mode: 0o600 },
    );
    console.log(`Browser fixture ready: ${database}`);
  }
  success = true;
  console.log(
    `${checks} campaign MySQL integration checks passed. No real email or push was sent.`,
  );
} finally {
  if (pool) await pool.end();
  if (!keep || !success)
    await root.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await root.end();
}
