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
  campaignSuppressions,
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
  recordCampaignOpen,
} from "../campaignInvitationService.js";
import { getCampaignReport } from "../campaignReportService.js";
import {
  saveCampaignDeliverySettings,
  setCampaignSmtpSettingsLoader,
} from "../campaignMailer.js";
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
// Campaigns send through SMTP; no network calls are made in this script.
setCampaignSmtpSettingsLoader(async () => ({
  smtpHost: "smtp.test",
  smtpPort: 587,
  smtpUser: "grow@mutalemubanga.org",
  fromEmail: "grow@mutalemubanga.org",
}));
process.env.APP_URL = "http://localhost:5176";
process.env.AUTH_TOKEN_SECRET = "test-only-campaign-link-key";
const sendReady = { assertReady: async () => ({ ready: true, errors: [] }) };
const deps = {
  config: {
    configured: true,
    live: true,
    hourlyLimit: 200,
    smtp: { host: "smtp.test", port: 587 },
  },
  sendFn: async () => ({
    status: "accepted",
    providerMessageId: `test-msg-${crypto.randomUUID()}`,
  }),
};
try {
  await root.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  pool = mysql.createPool({ ...connectionOptions, database });
  // Copy table structures only, never customer records.
  const [tables] = await root.query(`SHOW TABLES FROM \`${source}\``);
  for (const row of tables) {
    const table = Object.values(row)[0];
    await pool.query(
      `CREATE TABLE \`${table}\` LIKE \`${source}\`.\`${table}\``,
    );
  }
  // Production imports use general_ci, while campaign tables inherit MySQL 8's default.
  for (const table of ["events", "users", "event_registrations"])
    await pool.query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  for (const row of tables) {
    const table = Object.values(row)[0];
    if (/^(campaign_|email_|event_invite|event_resource)/.test(table))
      await pool.query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  }
  await ensureEmailCommunicationsSchema(pool);
  await ensureEmailCommunicationsSchema(pool);
  await saveCampaignDeliverySettings(
    pool,
    { live: true, hourlyLimit: 200 },
    "campaign-test-admin",
  );
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
  await assert.rejects(
    refreshCampaignSenders(pool, {
      verifyFn: async () => {
        throw new Error("Couldn't sign in to the SMTP server smtp.test: Invalid login");
      },
    }),
    /Couldn't sign in/,
  );
  const senderCheck = await refreshCampaignSenders(pool, {
    verifyFn: async () => {},
  });
  assert.deepEqual(senderCheck.domains, ["mutalemubanga.org"]);
  const [[defaultSender]] = await pool.query(
    "SELECT status FROM campaign_sender_identities WHERE id='sender-mutale'",
  );
  assert.equal(defaultSender.status, "verified");
  check("senders are verified by SMTP sign-in and matching domain");
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
  assert.ok(captured.html.includes("/api/email/open?token="));
  const openToken = signCampaignLink({
    kind: "open",
    campaignId: regular.id,
    recipientId: job.recipient_id,
  });
  await recordCampaignOpen(pool, openToken);
  await recordCampaignOpen(pool, openToken);
  report = await getCampaignReport(pool, regular.id);
  assert.equal(report.totals.opened, 1);
  await assert.rejects(recordCampaignOpen(pool, clickToken), /invalid/);
  check("open-tracking image records one open per recipient");
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
  // SMTP only retries failures the server definitely refused, so an old retry is still safe.
  const laterJob = await claimNextOutboxJob(pool);
  assert.equal(
    (await processClaimedJob(pool, laterJob, deps)).status,
    "accepted",
  );
  check("retry payloads stay identical and definite failures retry later");
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
  await assert.rejects(
    reconcileCampaignJob(pool, {
      campaignId: ambiguous.id,
      jobId: unknownJob.id,
      resolution: "maybe",
    }),
    /Choose whether/,
  );
  await reconcileCampaignJob(pool, {
    campaignId: ambiguous.id,
    jobId: unknownJob.id,
    resolution: "resend",
    actorId: "campaign-test-admin",
  });
  const [[requeued]] = await pool.query(
    "SELECT * FROM email_outbox_jobs WHERE id=?",
    [unknownJob.id],
  );
  assert.equal(requeued.status, "queued");
  let resent;
  await processClaimedJob(pool, requeued, {
    ...deps,
    sendFn: async (payload) => {
      resent = payload;
      return { status: "acceptance_unknown", reason: "Test disconnect again" };
    },
  });
  assert.equal(resent.to, JSON.parse(unknownJob.payload_json).to);
  await reconcileCampaignJob(pool, {
    campaignId: ambiguous.id,
    jobId: unknownJob.id,
    resolution: "sent",
    actorId: "campaign-test-admin",
  });
  assert.equal(
    (await getCampaignReport(pool, ambiguous.id)).totals.accepted,
    1,
  );
  await assert.rejects(
    reconcileCampaignJob(pool, {
      campaignId: ambiguous.id,
      jobId: unknownJob.id,
      resolution: "sent",
    }),
    /unconfirmed send/,
  );
  check("unconfirmed SMTP sends are resent or marked sent by an admin, once");
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
  const mixedListing = await listCampaigns(pool);
  assert.ok(mixedListing.some(campaign=>campaign.event_title==='Campaign Test Event'));
  assert.ok((await getCampaignDirectory(pool)).contacts.length>0);
  await campaignSuppressions(pool);
  const [collations] = await pool.query("SELECT TABLE_NAME,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('events','users','event_registrations','email_campaigns','campaign_contacts')");
  for (const table of collations)
    assert.equal(table.TABLE_COLLATION, ['events','users','event_registrations'].includes(table.TABLE_NAME)?'utf8mb4_general_ci':'utf8mb4_0900_ai_ci');
  check('campaign listing, directory and suppression views work with unchanged mixed production collations');
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
