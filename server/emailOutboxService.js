import {
  enqueueCampaignPush,
  runCampaignPushTick,
} from "./campaignPushService.js";
import crypto from "node:crypto";
import {
  DEFAULT_CAMPAIGN_SENDER,
  formatEventWhen,
  missingRequiredMergeValues,
  newCampaignId,
  normalizeCampaignEmail,
  renderMergeTemplate,
  sanitizeHttpUrl,
} from "../shared/emailCampaign.js";
import {
  parseEmailList,
  utcSql,
  validEmail,
  zonedDateTimeToUtc,
} from "../shared/campaignWorkspace.js";
import {
  collectRequiredDestinations,
  collectResourceIds,
  compileDesignToHtml,
  compileDesignToText,
  flattenBlocks,
} from "../shared/emailDesignCompile.js";
import {
  getEventResource,
  issueRegistrantGrant,
} from "./eventResourceService.js";
import { previewCampaignAudience } from "./emailAudienceService.js";
import { evaluateRecipientEligibility } from "./emailConsentService.js";
import {
  getCampaign,
  getCampaignWithRevision,
  getRevision,
  transitionCampaign,
  writeAudit,
} from "./emailCampaignService.js";
import {
  campaignSendAllowance,
  getCampaignDeliveryConfig,
  sendSmtpEmail,
} from "./campaignMailer.js";
import { jsonValue, transaction } from "./campaignDirectoryService.js";
import {
  appendOpenPixel,
  ensureEventInvitee,
  recordCampaignLinks,
  signCampaignLink,
} from "./campaignInvitationService.js";
import { sanitizeCampaignHtml } from "./emailHtmlSanitizer.js";

const appOrigin = () =>
  String(process.env.APP_URL || "https://mutalemubanga.org").replace(/\/$/, "");

export function buildRecipientVars({
  campaign,
  registration,
  contact = {},
  grantUrl,
  preferenceToken,
}) {
  const name = String(
    contact.name ||
      contact.full_name ||
      registration?.booked_for_name ||
      registration?.user_name ||
      "Guest",
  ).trim();
  return {
    first_name: contact.first_name || name.split(/\s+/)[0] || "there",
    full_name: name,
    last_name: contact.last_name || name.split(/\s+/).slice(1).join(" "),
    email:
      contact.email ||
      contact.email_normalized ||
      registration?.booked_for_email ||
      registration?.user_email ||
      "",
    phone: contact.phone || "",
    company: contact.company || "",
    position: contact.title || "",
    assistant_email: contact.assistant_email || "",
    address: contact.address || "",
    country: contact.country || "",
    region: contact.region || "",
    city: contact.city || "",
    postal_code: contact.postal_code || "",
    event_title: campaign.event_title || "",
    event_when: campaign.event_when || "",
    venue_or_join: campaign.venue_or_join || "",
    event_url: campaign.event_url || "",
    event_image: campaign.event_image || "",
    event_summary_html: campaign.event_summary_html || "",
    event_summary: campaign.event_summary || "",
    event_start_date: campaign.event_start_date || "",
    event_end_date: campaign.event_end_date || "",
    event_start_time: campaign.event_start_time || "",
    event_end_time: campaign.event_end_time || "",
    event_venue: campaign.event_venue || "",
    speakers: campaign.speakers || [],
    sponsors: campaign.sponsors || [],
    exhibitors: campaign.exhibitors || [],
    registration_ref:
      registration?.reference_code || contact.reference_code || "",
    resource_page_url:
      grantUrl ||
      (campaign.event_id
        ? `${appOrigin()}/resources/${campaign.event_id}`
        : appOrigin()),
    preferences_url: `${appOrigin()}/email/preferences?token=${encodeURIComponent(preferenceToken || "")}`,
    unsubscribe_url: `${appOrigin()}/email/unsubscribe?token=${encodeURIComponent(preferenceToken || "")}`,
    app_url: appOrigin(),
    survey_url: campaign.event_id
      ? `${appOrigin()}/events/${campaign.event_slug || campaign.event_id}/survey`
      : "",
  };
}

export function signPreferenceToken(email) {
  return signCampaignLink({
    kind: "preferences",
    email: normalizeCampaignEmail(email),
  });
}
export function readPreferenceToken(token) {
  // Keep previously issued 90-day preference links valid while supporting the unified token format.
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra)
    throw new Error("Invalid preferences token.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  const secret = String(
    process.env.AUTH_TOKEN_SECRET ||
      process.env.JWT_SECRET ||
      "local-campaign-links-only",
  );
  const expected = crypto
    .createHmac(
      "sha256",
      data.kind
        ? secret
        : String(process.env.AUTH_TOKEN_SECRET || "dev-email-pref").slice(
            0,
            64,
          ),
    )
    .update(payload)
    .digest("base64url");
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new Error("Invalid preferences token.");
  if (
    (data.kind && data.kind !== "preferences") ||
    !validEmail(data.email) ||
    !Number.isFinite(data.expires || data.exp) ||
    (data.expires || data.exp) < Date.now()
  )
    throw new Error("This preferences link has expired or is invalid.");
  return data;
}

export async function loadCampaignEventContext(pool, eventId) {
  if (!eventId) return {};
  const [[event]] = await pool.query(
    "SELECT * FROM events WHERE id = ? LIMIT 1",
    [eventId],
  );
  if (!event) throw new Error("Event not found.");
  const content = jsonValue(event.campaign_content_json, {});
  const speakers = jsonValue(event.featured_speakers, []).map(
    (person, index) => ({
      ...person,
      id: person.id || `speaker-${index}`,
      image:
        person.photo || person.image
          ? new URL(person.photo || person.image, appOrigin()).href
          : "",
      position: person.title || person.position,
    }),
  );
  const venue =
    event.event_mode === "virtual"
      ? event.meeting_link || event.zoom_join_url || event.daily_room_url || ""
      : event.venue || event.location || "";
  return {
    event,
    event_title: event.title,
    event_when: formatEventWhen(event),
    venue_or_join: venue,
    event_url: `${appOrigin()}/events/${encodeURIComponent(event.slug || event.id)}`,
    event_slug: event.slug,
    event_image: event.cover_image
      ? new URL(event.cover_image, appOrigin()).href
      : "",
    event_summary_html: sanitizeCampaignHtml(
      event.description || event.summary || "",
    ),
    event_summary: String(event.description || event.summary || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    event_start_date: event.start_date,
    event_end_date: event.end_date,
    event_start_time: event.start_time,
    event_end_time: event.end_time,
    event_venue: event.venue || event.location,
    speakers,
    sponsors:
      content.sponsors ||
      jsonValue(event.partners, []).map((person, index) => ({
        ...person,
        id: person.id || `partner-${index}`,
        image: person.logo || person.image,
      })),
    exhibitors: content.exhibitors || [],
  };
}

async function personalize(
  pool,
  campaign,
  recipient,
  { preview = false, track = false } = {},
) {
  const context = await loadCampaignEventContext(pool, campaign.event_id);
  let registration = null;
  if (recipient.registration_id) {
    const [[row]] = await pool.query(
      "SELECT * FROM event_registrations WHERE id = ? LIMIT 1",
      [recipient.registration_id],
    );
    registration = row;
  }
  const contact = {
    ...jsonValue(recipient.contact_json),
    name: recipient.display_name || "",
    email: recipient.email_normalized,
  };
  const revision = await getRevision(
    pool,
    recipient.revision_id || campaign.current_revision_id,
  );
  let grantUrl = campaign.event_id
    ? `${appOrigin()}/resources/${campaign.event_id}`
    : appOrigin();
  const resourceUrls = {};
  for (const id of collectResourceIds(revision?.design)) {
    const resource = await getEventResource(pool, id);
    if (
      !resource ||
      resource.event_id !== campaign.event_id ||
      !resource.is_published
    )
      throw new Error("Publish each selected event resource before sending.");
    let url = `${appOrigin()}/resources/${campaign.event_id}/${resource.id}`;
    if (resource.access_mode === "registrant_link" && !preview) {
      const grant = await issueRegistrantGrant(pool, {
        resource,
        registrationId: recipient.registration_id,
      });
      url += `?token=${encodeURIComponent(grant.token)}`;
    }
    resourceUrls[id] = url;
    grantUrl = url;
  }
  const vars = buildRecipientVars({
    campaign: { ...campaign, ...context },
    registration,
    contact,
    grantUrl,
    preferenceToken: signPreferenceToken(recipient.email_normalized),
  });
  if (
    context.event?.event_mode === "virtual" &&
    (!registration ||
      registration.status !== "confirmed" ||
      !["paid", "free"].includes(registration.payment_status))
  )
    vars.venue_or_join =
      "Virtual event — visit the event page for joining details.";
  let invitation = null;
  if (campaign.campaign_type === "event_invitation") {
    if (!preview)
      invitation = await ensureEventInvitee(pool, {
        eventId: campaign.event_id,
        email: recipient.email_normalized,
        name: recipient.display_name,
        contactId: recipient.contact_id,
      });
    const token = invitation
      ? signCampaignLink({
          kind: "invitation",
          id: invitation.id,
          eventId: campaign.event_id,
        })
      : "";
    vars.accept_invitation_url = `${appOrigin()}/email/invitation?token=${encodeURIComponent(token)}&response=accepted`;
    vars.decline_invitation_url = `${appOrigin()}/email/invitation?token=${encodeURIComponent(token)}&response=declined`;
  }
  const design = structuredClone(revision?.design || { blocks: [] });
  for (const block of flattenBlocks(design.blocks))
    if (block.resource_id && resourceUrls[block.resource_id])
      block.url = resourceUrls[block.resource_id];
  vars.event_tracker_contexts = {};
  for (const block of flattenBlocks(design.blocks)) {
    if (block.type === "event_tracker" && block.event_id) {
      const tracker = await loadCampaignEventContext(pool, block.event_id);
      vars.event_tracker_contexts[block.id] = {
        event_title: tracker.event_title,
        event_when: tracker.event_when,
        event_url: tracker.event_url,
        venue_or_join:
          tracker.event.event_mode === "virtual"
            ? "Virtual event"
            : tracker.event.venue || tracker.event.location || "",
      };
    }
  }
  const source = `${revision?.subject || campaign.subject || ""} ${JSON.stringify(design)}`;
  const missing = missingRequiredMergeValues(source, vars);
  const subject = renderMergeTemplate(
    revision?.subject || campaign.subject,
    vars,
  );
  let html = sanitizeCampaignHtml(
    compileDesignToHtml(design, vars, {
      title: subject,
      previewText: campaign.preheader,
    }),
    { document: true },
  );
  if (track) {
    html = await recordCampaignLinks(pool, campaign, recipient, html);
    html = appendOpenPixel(html, campaign, recipient);
  }
  return {
    subject,
    html,
    text: compileDesignToText(design, vars),
    vars,
    missing,
    registration,
    contact,
    invitation,
  };
}

export async function previewCampaignEmail(
  pool,
  id,
  { email = "preview@example.test" } = {},
) {
  const campaign = await getCampaignWithRevision(pool, id);
  if (!campaign?.revision) throw new Error("Campaign not found.");
  const rendered = await personalize(
    pool,
    campaign,
    {
      email_normalized: email,
      display_name: "Preview Recipient",
      contact_json: "{}",
    },
    { preview: true },
  );
  return { ...rendered, event: rendered.vars };
}

export async function campaignReadiness(pool, campaign, { live = false } = {}) {
  const config = await getCampaignDeliveryConfig(pool);
  const errors = [];
  if (!campaign.subject?.trim()) errors.push("Enter a subject line.");
  if (!campaign.revision) errors.push("Save a design before sending.");
  if (campaign.revision) {
    errors.push(
      ...collectRequiredDestinations(campaign.revision.design).map(
        (value) => `Complete ${value.replaceAll("_", " ")}.`,
      ),
    );
    const preview = await previewCampaignEmail(pool, campaign.id);
    for (const block of flattenBlocks(campaign.revision.design.blocks)) {
      if (
        ["button", "article"].includes(block.type) &&
        !sanitizeHttpUrl(renderMergeTemplate(block.url || "", preview.vars))
      )
        errors.push("Add a valid destination for every button and article.");
      if (
        block.type === "image" &&
        !sanitizeHttpUrl(renderMergeTemplate(block.src || "", preview.vars))
      )
        errors.push("Add a valid image URL.");
      if (
        block.type === "event_tracker" &&
        !block.event_id &&
        !campaign.event_id
      )
        errors.push("Select an event for each Event Tracker.");
      if (block.type === "survey") {
        if (!block.survey_id) errors.push("Select a published survey.");
        else {
          const [[survey]] = await pool.query(
            "SELECT state FROM campaign_surveys WHERE id=?",
            [block.survey_id],
          );
          if (survey?.state !== "published")
            errors.push("Select a published survey.");
        }
      }
      if (
        ["social_share", "social_follow"].includes(block.type) &&
        block.links.some((link) => !sanitizeHttpUrl(link.url) || !link.label)
      )
        errors.push("Complete the social links.");
      if (
        ["speakers", "sponsors", "exhibitors"].includes(block.type) &&
        !block.selection_set &&
        !preview.vars[block.type]?.length
      )
        errors.push(
          `Add ${block.type} to the event or remove the empty element.`,
        );
    }
    for (const resourceId of collectResourceIds(campaign.revision.design)) {
      const resource = await getEventResource(pool, resourceId);
      if (resource?.access_mode === "registrant_link") {
        const audience = await previewCampaignAudience(pool, {
          eventId: campaign.event_id,
          segment: campaign.segment,
          purpose: campaign.purpose,
          audience: campaign.audience,
          type: campaign.campaign_type,
        });
        if (audience.included.some((person) => !person.registration_id))
          errors.push("Select event registrants to send protected resources.");
      }
    }
    if (preview.missing.length)
      errors.push(`Missing merge values: ${preview.missing.join(", ")}.`);
    if (!String(preview.text || "").trim()) errors.push("Add email content.");
  }
  const [[sender]] = await pool.query(
    "SELECT * FROM campaign_sender_identities WHERE id=? AND archived_at IS NULL",
    [campaign.sender_identity_id || "sender-mutale"],
  );
  if (!config.configured)
    errors.push("Set up SMTP in Admin → Settings → Email before sending.");
  if (!sender || sender.status !== "verified")
    errors.push(
      "Select a verified sender email. Check senders in Campaigns → Sender Settings.",
    );
  if (live && !config.live)
    errors.push(
      "Sending to real recipients is turned off. Turn it on in Campaigns → Sender Settings.",
    );
  return {
    ready: errors.length === 0,
    errors,
    sender: sender
      ? {
          id: sender.id,
          name: sender.name,
          email: sender.email,
          status: sender.status,
        }
      : null,
    configured: config.configured,
    live: config.live,
  };
}

export async function freezeRecipientSnapshot(
  pool,
  campaign,
  { onlyNew = false } = {},
) {
  const preview = await previewCampaignAudience(pool, {
    eventId: campaign.event_id,
    segment: campaign.segment,
    purpose: campaign.purpose,
    audience: campaign.audience,
    type: campaign.campaign_type,
  });
  const [existing] = await pool.query(
    "SELECT email_normalized FROM email_campaign_recipients WHERE campaign_id = ? AND included = 1",
    [campaign.id],
  );
  const skip = new Set(
    onlyNew ? existing.map((row) => row.email_normalized) : [],
  );
  if (!onlyNew && existing.length)
    throw new Error("The recipient snapshot is already frozen.");
  const inserted = [];
  const includedEmails = new Set(
    preview.included.map((person) => person.email),
  );
  for (const person of preview.included) {
    if (skip.has(person.email)) continue;
    const id = newCampaignId("ercp");
    await pool.query(
      `INSERT IGNORE INTO email_campaign_recipients (id,campaign_id,registration_id,event_id,email_normalized,display_name,included,exclude_reason,outcome,contact_id,contact_json)
      VALUES (?,?,?,?,?,?,1,NULL,'pending',?,?)`,
      [
        id,
        campaign.id,
        person.registration_id || null,
        campaign.event_id || null,
        person.email,
        person.name,
        person.id || null,
        JSON.stringify(person),
      ],
    );
    inserted.push({ ...person, id });
  }
  for (const person of preview.excluded) {
    if (
      !person.email ||
      includedEmails.has(person.email) ||
      person.reason === "duplicate_email"
    )
      continue;
    await pool.query(
      `INSERT IGNORE INTO email_campaign_recipients (id,campaign_id,registration_id,event_id,email_normalized,included,exclude_reason,outcome)
      VALUES (?,?,?,?,?,0,?,'excluded')`,
      [
        newCampaignId("ercx"),
        campaign.id,
        person.registration_id || null,
        campaign.event_id || null,
        person.email,
        person.reason,
      ],
    );
  }
  await pool.query(
    "UPDATE email_campaigns SET audience_frozen_at=UTC_TIMESTAMP() WHERE id=?",
    [campaign.id],
  );
  return { preview, inserted };
}

export async function enqueueCampaign(
  pool,
  campaign,
  { scheduledAt = new Date(), actorId } = {},
) {
  const { inserted } = await freezeRecipientSnapshot(pool, campaign);
  for (const person of inserted) {
    const [[row]] = await pool.query(
      "SELECT id FROM email_campaign_recipients WHERE campaign_id = ? AND email_normalized = ? LIMIT 1",
      [campaign.id, person.email],
    );
    if (!row) continue;
    await pool.query(
      `INSERT IGNORE INTO email_outbox_jobs (id,campaign_id,recipient_id,registration_id,attempt_key,status,scheduled_at,scheduled_at_utc,revision_id)
      VALUES (?,?,?,?,'send-1','queued',?,?,?)`,
      [
        newCampaignId("ejob"),
        campaign.id,
        row.id,
        person.registration_id || null,
        utcSql(scheduledAt),
        utcSql(scheduledAt),
        campaign.current_revision_id,
      ],
    );
  }
  await writeAudit(pool, {
    actorId,
    action: "campaign.enqueued",
    campaignId: campaign.id,
    detail: `${inserted.length} recipients`,
  });
  return inserted.length;
}

export async function startCampaignSend(
  pool,
  campaignId,
  {
    actorId,
    scheduleAt = null,
    timezone = "Africa/Lusaka",
    confirmed = false,
    requestKey,
    version,
    push = false,
  } = {},
  { assertReady } = {},
) {
  if (!confirmed) throw new Error("Live sends require explicit confirmation.");
  const delivery = await getCampaignDeliveryConfig(pool);
  if (!delivery.configured || !delivery.live)
    throw new Error(
      "Sending to real recipients is turned off. Turn it on in Campaigns → Sender Settings.",
    );
  return transaction(pool, async (connection) => {
    await connection.query(
      "SELECT id FROM email_campaigns WHERE id=? FOR UPDATE",
      [campaignId],
    );
    const campaign = await getCampaignWithRevision(connection, campaignId);
    if (!campaign || campaign.archived_at)
      throw new Error("Campaign not found.");
    const [[previous]] = await connection.query(
      "SELECT * FROM campaign_send_requests WHERE campaign_id=?",
      [campaignId],
    );
    if (previous && requestKey && previous.request_key === requestKey)
      return campaign;
    if (campaign.state !== "draft" || previous)
      throw new Error(
        `Cannot send a ${campaign.state} campaign. Duplicate it to send another message.`,
      );
    if (version != null && Number(version) !== Number(campaign.version))
      throw new Error("The campaign changed. Review the latest saved version.");
    const ready = assertReady
      ? await assertReady(connection, campaign)
      : await campaignReadiness(connection, campaign, { live: true });
    if (!ready.ready) throw new Error(ready.errors.join(" "));
    const audience = await previewCampaignAudience(connection, {
      eventId: campaign.event_id,
      segment: campaign.segment,
      purpose: campaign.purpose,
      audience: campaign.audience,
      type: campaign.campaign_type,
    });
    if (!audience.included_count)
      throw new Error("Please add eligible recipients to this campaign.");
    const when = scheduleAt
      ? zonedDateTimeToUtc(scheduleAt, timezone)
      : new Date();
    if (scheduleAt && when.getTime() <= Date.now())
      throw new Error("Choose a future date and time.");
    if (push && !process.env.EXPO_ACCESS_TOKEN)
      throw new Error(
        "Configure the mobile push integration before enabling push notifications.",
      );
    const key =
      requestKey || `send-${campaignId}-${campaign.current_revision_id}`;
    await connection.query(
      "INSERT INTO campaign_send_requests (request_key,campaign_id,revision_id,actor_id) VALUES (?,?,?,?)",
      [key, campaignId, campaign.current_revision_id, actorId || null],
    );
    await connection.query(
      `UPDATE email_campaigns SET scheduled_at=?,scheduled_at_utc=?,schedule_wall_time=?,timezone=?,scheduled_by=?,sent_by=?,live_confirmed_at=UTC_TIMESTAMP(),push_enabled=? WHERE id=?`,
      [
        scheduleAt ? utcSql(when) : null,
        scheduleAt ? utcSql(when) : null,
        scheduleAt,
        timezone,
        actorId || null,
        actorId || null,
        Number(push),
        campaignId,
      ],
    );
    if (!scheduleAt)
      await enqueueCampaign(connection, campaign, {
        scheduledAt: when,
        actorId,
      });
    return transitionCampaign(
      connection,
      campaignId,
      scheduleAt ? "scheduled" : "sending",
      actorId,
      scheduleAt || "immediate",
    );
  });
}

async function activateScheduled(pool) {
  const [due] = await pool.query(
    "SELECT id FROM email_campaigns WHERE state='scheduled' AND audience_frozen_at IS NULL AND scheduled_at_utc<=UTC_TIMESTAMP() LIMIT 5",
  );
  for (const row of due)
    await transaction(pool, async (connection) => {
      await connection.query(
        "SELECT id FROM email_campaigns WHERE id=? FOR UPDATE",
        [row.id],
      );
      const campaign = await getCampaign(connection, row.id);
      if (campaign.state !== "scheduled" || campaign.audience_frozen_at) return;
      const count = await enqueueCampaign(connection, campaign, {
        actorId: campaign.scheduled_by,
      });
      await connection.query(
        "UPDATE email_campaigns SET state=?,send_started_at=UTC_TIMESTAMP(),completed_at=IF(?=0,UTC_TIMESTAMP(),NULL) WHERE id=?",
        [count ? "sending" : "completed", count, row.id],
      );
    });
}

export async function dispatchOutboxJob(
  pool,
  job,
  { sendFn = sendSmtpEmail, config: suppliedConfig } = {},
) {
  if (!job) throw new Error("Outbox job is required.");
  const config = suppliedConfig || (await getCampaignDeliveryConfig(pool));
  const campaign = await getCampaign(pool, job.campaign_id);
  if (
    !campaign ||
    campaign.archived_at ||
    !["sending", "scheduled"].includes(campaign.state)
  )
    return {
      status: campaign?.state === "paused" ? "paused" : "skipped",
      reason: `campaign_${campaign?.state || "missing"}`,
    };
  const [[recipient]] = await pool.query(
    "SELECT * FROM email_campaign_recipients WHERE id = ? LIMIT 1",
    [job.recipient_id],
  );
  if (!recipient || !Number(recipient.included))
    return { status: "skipped", reason: "recipient_excluded" };
  if (
    recipient.sent_at ||
    ["accepted", "delivered", "bounced", "complained"].includes(
      recipient.outcome,
    )
  )
    return {
      status: "accepted",
      providerMessageId: recipient.provider_message_id,
    };
  const snapshot = jsonValue(recipient.contact_json, {});
  const gate = await evaluateRecipientEligibility(pool, {
    email: recipient.email_normalized,
    purpose: snapshot.effective_purpose || campaign.purpose,
  });
  if (gate.blocked) return { status: "skipped", reason: gate.reason };
  if (campaign.audience) {
    const current = await previewCampaignAudience(pool, {
      eventId: campaign.event_id,
      segment: campaign.segment,
      purpose: campaign.purpose,
      audience: campaign.audience,
      type: campaign.campaign_type,
      onlyEmail: recipient.email_normalized,
    });
    if (!current.included_count)
      return {
        status: "skipped",
        reason: current.excluded[0]?.reason || "audience_membership_changed",
      };
  }
  if (recipient.registration_id) {
    const [[registration]] = await pool.query(
      "SELECT status FROM event_registrations WHERE id = ? LIMIT 1",
      [recipient.registration_id],
    );
    if (
      !registration ||
      (registration.status === "cancelled" && !snapshot.allow_cancelled)
    )
      return { status: "skipped", reason: "registration_cancelled" };
  }
  if (campaign.campaign_type === "event_invitation") {
    const [[invitee]] = await pool.query(
      "SELECT state FROM event_invitees WHERE event_id=? AND email_normalized=?",
      [campaign.event_id, recipient.email_normalized],
    );
    if (invitee && ["accepted", "declined"].includes(invitee.state))
      return { status: "skipped", reason: "invitation_responded" };
  }
  if (!config.configured || !config.live)
    return {
      status: "failed",
      reason: "SMTP is not set up or sending to real recipients is turned off.",
      retryable: false,
    };
  const [[sender]] = await pool.query(
    "SELECT status FROM campaign_sender_identities WHERE id=? AND archived_at IS NULL",
    [campaign.sender_identity_id || "sender-mutale"],
  );
  if (!sender || sender.status !== "verified")
    return {
      status: "failed",
      reason: "Sender is not verified.",
      retryable: false,
    };
  const personalized = await personalize(
    pool,
    {
      ...campaign,
      current_revision_id: job.revision_id || campaign.current_revision_id,
    },
    { ...recipient, revision_id: job.revision_id },
    { preview: Boolean(job.payload_json), track: !job.payload_json },
  );
  if (personalized.missing.length)
    return {
      status: "failed",
      reason: `Missing merge values: ${personalized.missing.join(", ")}`,
      retryable: false,
    };
  const latest = await getCampaign(pool, campaign.id);
  if (latest.state !== "sending" && latest.state !== "scheduled")
    return {
      status: latest.state === "paused" ? "paused" : "skipped",
      reason: `campaign_${latest.state}`,
    };
  const headers = {};
  if ((snapshot.effective_purpose || campaign.purpose) === "promotional") {
    headers["List-Unsubscribe"] =
      `<${appOrigin()}/api/email/unsubscribe?token=${encodeURIComponent(signPreferenceToken(recipient.email_normalized))}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const cc = parseEmailList(campaign.cc || []).filter(
    (email) => email !== recipient.email_normalized,
  );
  if (
    campaign.cc_assistant &&
    validEmail(personalized.contact.assistant_email) &&
    !cc.includes(personalized.contact.assistant_email) &&
    personalized.contact.assistant_email !== recipient.email_normalized
  )
    cc.push(personalized.contact.assistant_email);
  const payload = job.payload_json
    ? jsonValue(job.payload_json)
    : {
        to: recipient.email_normalized,
        subject: personalized.subject,
        html: personalized.html,
        text: personalized.text,
        fromName: campaign.from_name || DEFAULT_CAMPAIGN_SENDER.fromName,
        fromEmail: campaign.from_email || DEFAULT_CAMPAIGN_SENDER.fromEmail,
        replyTo: campaign.reply_to || DEFAULT_CAMPAIGN_SENDER.replyTo,
        headers,
        cc,
      };
  if (!job.payload_json)
    await pool.query(
      "UPDATE email_outbox_jobs SET payload_json=?,first_attempt_at_utc=UTC_TIMESTAMP() WHERE id=?",
      [JSON.stringify(payload), job.id],
    );
  const result = await sendFn({ ...payload, config });
  if (result.status === "accepted") {
    try {
      await pool.query(
        "UPDATE email_campaign_recipients SET outcome='accepted',provider_message_id=?,sent_at=UTC_TIMESTAMP(),error_reason=NULL WHERE id=?",
        [result.providerMessageId || null, recipient.id],
      );
      await pool.query(
        "UPDATE email_campaigns SET send_started_at=COALESCE(send_started_at,UTC_TIMESTAMP()) WHERE id=?",
        [campaign.id],
      );
    } catch {
      return {
        status: "acceptance_unknown",
        providerMessageId: result.providerMessageId,
        reason:
          "Provider accepted this message but the local confirmation was interrupted.",
      };
    }
    try {
      await enqueueCampaignPush(pool, campaign, recipient);
    } catch (error) {
      console.error("[campaign-push] Queue failed:", error.message);
    }
    if (campaign.campaign_type === "event_invitation")
      try {
        await pool.query(
          "UPDATE event_invitees SET state=IF(state='not_sent','no_response',state),first_sent_at=COALESCE(first_sent_at,UTC_TIMESTAMP()),last_sent_at=UTC_TIMESTAMP() WHERE event_id=? AND email_normalized=?",
          [campaign.event_id, recipient.email_normalized],
        );
      } catch (error) {
        console.error(
          "[campaign-invitation] Confirmation update failed:",
          error.message,
        );
      }
  }
  return result;
}

export async function claimNextOutboxJob(pool) {
  const token = newCampaignId("clm");
  const [queued] =
    await pool.query(`SELECT j.id FROM email_outbox_jobs j JOIN email_campaigns c ON c.id=j.campaign_id
    WHERE j.status='queued' AND c.state IN ('sending','scheduled') AND c.archived_at IS NULL
    AND ((j.scheduled_at_utc IS NOT NULL AND j.scheduled_at_utc<=UTC_TIMESTAMP()) OR (j.scheduled_at_utc IS NULL AND j.scheduled_at<=NOW())) ORDER BY j.scheduled_at ASC LIMIT 1`);
  const id = queued?.[0]?.id;
  if (!id) return null;
  const [result] = await pool.query(
    "UPDATE email_outbox_jobs SET status='claimed',claimed_at=UTC_TIMESTAMP(),claim_token=?,tries=tries+1 WHERE id=? AND status='queued'",
    [token, id],
  );
  if (!result.affectedRows) return null;
  const [[job]] = await pool.query(
    "SELECT * FROM email_outbox_jobs WHERE id = ? LIMIT 1",
    [id],
  );
  return job;
}

export async function processClaimedJob(pool, job, deps) {
  let result;
  try {
    result = await dispatchOutboxJob(pool, job, deps);
  } catch (error) {
    result = {
      status: "failed",
      reason: String(error.message || "Job failed").slice(0, 400),
      retryable: false,
    };
  }
  let status;
  if (result.status === "accepted") status = "sent";
  else if (result.status === "paused") status = "paused";
  else if (result.status === "skipped") status = "skipped";
  else if (result.status === "acceptance_unknown")
    status = "acceptance_unknown";
  else
    status =
      result.retryable !== false && Number(job.tries) < 5 ? "queued" : "dead";
  if (status === "queued") {
    await pool.query(
      "UPDATE email_outbox_jobs SET status='queued',scheduled_at_utc=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),last_error=?,claimed_at=NULL WHERE id=?",
      [Math.min(30, 2 ** Number(job.tries)), result.reason || "retry", job.id],
    );
  } else
    await pool.query(
      "UPDATE email_outbox_jobs SET status=?,provider_message_id=?,last_error=? WHERE id=?",
      [status, result.providerMessageId || null, result.reason || null, job.id],
    );
  if (result.status !== "accepted")
    await pool.query(
      "UPDATE email_campaign_recipients SET outcome=?,error_reason=?,exclude_reason=IF(?=1,?,exclude_reason) WHERE id=?",
      [
        result.status === "skipped"
          ? "skipped"
          : result.status === "paused"
            ? "pending"
            : result.status === "acceptance_unknown"
              ? "acceptance_unknown"
              : status === "queued"
                ? "pending"
                : "failed",
        result.reason || null,
        Number(result.status === "skipped"),
        result.reason || null,
        job.recipient_id,
      ],
    );
  await refreshCampaignProgress(pool, job.campaign_id);
  return result;
}

export async function refreshCampaignProgress(pool, id) {
  const [[totals]] = await pool.query(
    "SELECT SUM(status IN ('queued','claimed','paused')) AS pending,SUM(status='sent') AS sent,SUM(status='dead') AS dead,SUM(status='acceptance_unknown') AS unknown,COUNT(*) AS total FROM email_outbox_jobs WHERE campaign_id=?",
    [id],
  );
  const campaign = await getCampaign(pool, id);
  if (
    !campaign ||
    !["sending", "scheduled"].includes(campaign.state) ||
    Number(totals.pending) > 0 ||
    Number(totals.unknown) > 0
  )
    return campaign;
  const next =
    Number(totals.dead) > 0
      ? Number(totals.sent) > 0
        ? "partially_failed"
        : "failed"
      : "completed";
  await pool.query(
    "UPDATE email_campaigns SET state=?,completed_at=UTC_TIMESTAMP() WHERE id=?",
    [next, id],
  );
  return getCampaign(pool, id);
}

let tickRunning = false;
export async function runEmailOutboxTick(pool, deps) {
  if (tickRunning) return [];
  tickRunning = true;
  try {
    // An expired claim may have reached the provider. Preserve ambiguity instead of resending.
    await pool.query(
      "UPDATE email_campaign_recipients r JOIN email_outbox_jobs j ON j.recipient_id=r.id SET r.outcome='acceptance_unknown',r.error_reason='Worker interrupted; provider acceptance requires review' WHERE j.status='claimed' AND j.claimed_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) AND r.sent_at IS NULL",
    );
    await pool.query(
      "UPDATE email_outbox_jobs SET status='acceptance_unknown',last_error='Worker interrupted; provider acceptance requires review' WHERE status='claimed' AND claimed_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)",
    );
    const config = deps?.config || (await getCampaignDeliveryConfig(pool));
    // Disabling delivery must preserve queued work, rather than consume it as failures.
    if (!config.live || !config.configured) return [];
    await activateScheduled(pool);
    await runCampaignPushTick(pool);
    const results = [];
    // Pace sends so the SMTP account stays under its hourly limit.
    const allowance = await campaignSendAllowance(pool, config);
    for (let index = 0; index < allowance; index++) {
      const job = await claimNextOutboxJob(pool);
      if (!job) break;
      results.push(await processClaimedJob(pool, job, deps));
    }
    return results;
  } finally {
    tickRunning = false;
  }
}

export async function pauseCampaignJobs(pool, id, actorId) {
  return transaction(pool, async (connection) => {
    await connection.query(
      "SELECT id FROM email_campaigns WHERE id=? FOR UPDATE",
      [id],
    );
    const campaign = await getCampaign(connection, id);
    if (!campaign || !["sending", "scheduled"].includes(campaign.state))
      throw new Error("Only sending or scheduled campaigns can be paused.");
    await connection.query(
      "UPDATE email_outbox_jobs SET status='paused' WHERE campaign_id=? AND status='queued'",
      [id],
    );
    return transitionCampaign(connection, id, "paused", actorId);
  });
}
export async function resumeCampaignJobs(pool, id, actorId) {
  return transaction(pool, async (connection) => {
    await connection.query(
      "SELECT id FROM email_campaigns WHERE id=? FOR UPDATE",
      [id],
    );
    const campaign = await getCampaign(connection, id);
    if (campaign?.state !== "paused")
      throw new Error("Only paused campaigns can be resumed.");
    await connection.query(
      "UPDATE email_outbox_jobs SET status='queued' WHERE campaign_id=? AND status='paused'",
      [id],
    );
    const next =
      campaign.scheduled_at_utc && !campaign.audience_frozen_at
        ? "scheduled"
        : "sending";
    await connection.query("UPDATE email_campaigns SET state=? WHERE id=?", [
      next,
      id,
    ]);
    await writeAudit(connection, {
      actorId,
      action: "campaign.resumed",
      campaignId: id,
    });
    return getCampaignWithRevision(connection, id);
  });
}
export async function cancelCampaignJobs(pool, id, actorId) {
  return transaction(pool, async (connection) => {
    await connection.query(
      "SELECT id FROM email_campaigns WHERE id=? FOR UPDATE",
      [id],
    );
    const campaign = await getCampaign(connection, id);
    if (
      !campaign ||
      !["draft", "scheduled", "sending", "paused"].includes(campaign.state)
    )
      throw new Error("Campaign cannot be cancelled in its current state.");
    await connection.query(
      "UPDATE email_outbox_jobs SET status='cancelled' WHERE campaign_id=? AND status IN ('queued','paused')",
      [id],
    );
    return transitionCampaign(connection, id, "cancelled", actorId);
  });
}
export async function returnCampaignToDraft(pool, id, actorId) {
  return transaction(pool, async (connection) => {
    await connection.query(
      "SELECT id FROM email_campaigns WHERE id=? FOR UPDATE",
      [id],
    );
    const campaign = await getCampaign(connection, id);
    if (campaign?.state !== "cancelled")
      throw new Error("Cancel the campaign first.");
    const [[unsafe]] = await connection.query(
      "SELECT COUNT(*) AS count FROM email_outbox_jobs WHERE campaign_id=? AND status IN ('sent','claimed','acceptance_unknown')",
      [id],
    );
    if (Number(unsafe.count))
      throw new Error(
        "This campaign reached the provider. Duplicate it instead.",
      );
    await connection.query(
      "DELETE FROM email_outbox_jobs WHERE campaign_id=?",
      [id],
    );
    await connection.query(
      "DELETE FROM email_campaign_recipients WHERE campaign_id=?",
      [id],
    );
    await connection.query(
      "DELETE FROM campaign_send_requests WHERE campaign_id=?",
      [id],
    );
    await connection.query(
      "UPDATE email_campaign_revisions SET immutable=0 WHERE id=?",
      [campaign.current_revision_id],
    );
    await connection.query(
      "UPDATE email_campaigns SET state='draft',scheduled_at=NULL,scheduled_at_utc=NULL,schedule_wall_time=NULL,audience_frozen_at=NULL,live_confirmed_at=NULL,version=version+1 WHERE id=?",
      [id],
    );
    await writeAudit(connection, {
      actorId,
      action: "campaign.returned_to_draft",
      campaignId: id,
    });
    return getCampaignWithRevision(connection, id);
  });
}
export async function sendCampaignTest(
  pool,
  id,
  recipient,
  { sendFn = sendSmtpEmail, config: suppliedConfig } = {},
) {
  if (!validEmail(recipient)) throw new Error("Enter a valid test email.");
  const config = suppliedConfig || (await getCampaignDeliveryConfig(pool));
  const campaign = await getCampaignWithRevision(pool, id);
  const ready = await campaignReadiness(pool, campaign);
  if (!ready.ready) throw new Error(ready.errors.join(" "));
  const preview = await previewCampaignEmail(pool, id, { email: recipient });
  const result = await sendFn({
    config,
    to: recipient,
    subject: `[TEST] ${preview.subject}`,
    html: preview.html,
    text: preview.text,
    fromName: campaign.from_name,
    fromEmail: campaign.from_email,
    replyTo: campaign.reply_to,
  });
  if (result.status !== "accepted")
    throw new Error(
      result.reason || "The SMTP server did not confirm the test email.",
    );
  return result;
}
export { issueRegistrantGrant };
