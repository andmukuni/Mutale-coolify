import { previewCampaignAudience } from "./emailAudienceService.js";
import {
  CAMPAIGN_PURPOSES,
  DEFAULT_CAMPAIGN_SENDER,
  canTransitionCampaign,
  newCampaignId,
  sanitizeSegment,
  stripHeaderInjection,
} from "../shared/emailCampaign.js";
import {
  compileDesignToHtml,
  compileDesignToText,
  normalizeDesignDocument,
} from "../shared/emailDesignCompile.js";
import { blankCampaignDesign } from "../shared/emailDesignTemplates.js";
import {
  validEmail,
  campaignType,
  defaultAudience,
  parseEmailList,
  CAMPAIGN_TYPES,
  sanitizeAudience,
} from "../shared/campaignWorkspace.js";
import { transaction } from "./campaignDirectoryService.js";
import { sanitizeDesignHtml } from "./emailHtmlSanitizer.js";

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    ...row,
    segment: parseJson(row.segment_json, sanitizeSegment()),
    campaign_type: row.campaign_type || "event_notification",
    audience: parseJson(row.audience_spec_json, null),
    cc: parseJson(row.cc_json, []),
  };
}

export async function writeAudit(
  pool,
  { actorId, action, campaignId = null, resourceId = null, detail = "" },
) {
  await pool.query(
    `INSERT INTO email_audit_log (id, actor_id, action, campaign_id, resource_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      newCampaignId("eaud"),
      actorId || null,
      action,
      campaignId,
      resourceId,
      String(detail || "").slice(0, 400),
    ],
  );
}

export async function listCampaigns(
  pool,
  {
    eventId = "",
    state = "",
    type = "",
    search = "",
    tab = "",
    archived = false,
  } = {},
) {
  const clauses = [];
  const params = [];
  clauses.push(
    archived ? "c.archived_at IS NOT NULL" : "c.archived_at IS NULL",
  );
  if (eventId) {
    clauses.push("c.event_id = ?");
    params.push(eventId);
  }
  if (state) {
    clauses.push("c.state = ?");
    params.push(state);
  }
  if (type) {
    clauses.push("c.campaign_type = ?");
    params.push(type);
  }
  if (search) {
    clauses.push("(c.name LIKE ? OR c.subject LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (tab === "draft")
    clauses.push("c.state IN ('draft','paused','cancelled')");
  if (tab === "scheduled") clauses.push("c.state='scheduled'");
  if (tab === "sent")
    clauses.push(
      "c.state IN ('sending','completed','partially_failed','failed')",
    );
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  // Imported event/user identifiers can use a different collation from campaign tables.
  // Collate the campaign references explicitly without changing stored records or indexes.
  const [rows] = await pool.query(
    `SELECT c.*,e.title AS event_title,t.name AS template_name,
      IF(c.audience_frozen_at IS NULL,c.audience_preview_count,(SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.included=1)) AS recipients,
      (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.sent_at IS NOT NULL) AS sent,
      (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.opened_at IS NOT NULL) AS opened,
      (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.clicked_at IS NOT NULL) AS clicked,
      (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.bounced_at IS NOT NULL) AS bounced,
      (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND (r.outcome='skipped' OR (r.included=0 AND r.exclude_reason IN ('hard_bounce','complaint','unsubscribed','no_marketing_consent')))) AS ignored,
      COALESCE(u.name,c.created_by) AS creator_name,COALESCE(scheduler.name,c.scheduled_by) AS scheduler_name,COALESCE(sender.name,c.sent_by) AS sent_by_name
     FROM email_campaigns c LEFT JOIN events e ON e.id=c.event_id COLLATE utf8mb4_general_ci LEFT JOIN email_design_templates t ON t.id=c.template_id
     LEFT JOIN users u ON u.id=c.created_by COLLATE utf8mb4_general_ci LEFT JOIN users scheduler ON scheduler.id=c.scheduled_by COLLATE utf8mb4_general_ci LEFT JOIN users sender ON sender.id=c.sent_by COLLATE utf8mb4_general_ci ${where} ORDER BY c.updated_at DESC`,
    params,
  );
  return (rows || []).map(mapCampaign);
}

export async function getCampaign(pool, id) {
  const [[row]] = await pool.query(
    "SELECT * FROM email_campaigns WHERE id = ? LIMIT 1",
    [id],
  );
  return mapCampaign(row);
}

export async function getRevision(pool, id) {
  if (!id) return null;
  const [[row]] = await pool.query(
    "SELECT * FROM email_campaign_revisions WHERE id = ? LIMIT 1",
    [id],
  );
  if (!row) return null;
  return {
    ...row,
    design: parseJson(row.design_json, blankCampaignDesign()),
    immutable: Boolean(Number(row.immutable)),
  };
}

export async function createCampaign(
  pool,
  {
    eventId,
    name,
    purpose = CAMPAIGN_PURPOSES.event_service,
    actorId,
    timezone = "Africa/Lusaka",
    type,
  },
) {
  const selectedType = campaignType(type, eventId);
  if (!String(name || "").trim() || String(name).trim().length > 180)
    throw new Error("Name your campaign.");
  if (eventId) {
    const [[event]] = await pool.query("SELECT id FROM events WHERE id=?", [
      eventId,
    ]);
    if (!event) throw new Error("Event not found.");
  }
  const id = newCampaignId("ecmp");
  const safePurpose =
    selectedType !== "event_notification" ||
    purpose === CAMPAIGN_PURPOSES.promotional
      ? CAMPAIGN_PURPOSES.promotional
      : CAMPAIGN_PURPOSES.event_service;
  await pool.query(
    `INSERT INTO email_campaigns
      (id, event_id, name, purpose, state, from_name, from_email, reply_to, segment_json, timezone, created_by,campaign_type,audience_spec_json,sender_identity_id)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?,?,?, 'sender-mutale')`,
    [
      id,
      selectedType === "regular" ? eventId || null : eventId,
      String(name || "Untitled campaign").trim(),
      safePurpose,
      DEFAULT_CAMPAIGN_SENDER.fromName,
      DEFAULT_CAMPAIGN_SENDER.fromEmail,
      DEFAULT_CAMPAIGN_SENDER.replyTo,
      JSON.stringify(sanitizeSegment()),
      timezone || "Africa/Lusaka",
      actorId || null,
      selectedType,
      JSON.stringify(defaultAudience(selectedType)),
    ],
  );
  await saveRevision(pool, {
    campaignId: id,
    design: blankCampaignDesign(selectedType),
    subject: "",
    preheader: "",
    actorId,
  });
  await writeAudit(pool, {
    actorId,
    action: "campaign.created",
    campaignId: id,
  });
  return getCampaignWithRevision(pool, id);
}

export async function saveRevision(
  pool,
  { campaignId, design, subject, preheader, actorId },
) {
  return transaction(pool, (connection) =>
    persistRevision(connection, {
      campaignId,
      design,
      subject,
      preheader,
      actorId,
    }),
  );
}

async function persistRevision(
  pool,
  { campaignId, design, subject, preheader, actorId },
) {
  await pool.query("SELECT id FROM email_campaigns WHERE id=? FOR UPDATE", [
    campaignId,
  ]);
  const campaign = await getCampaign(pool, campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.state !== "draft") {
    throw new Error(
      "Sent content is locked. Duplicate the campaign to send a revision.",
    );
  }
  const current = await getRevision(pool, campaign.current_revision_id);
  if (current?.immutable) throw new Error("This revision is locked.");
  const normalized = normalizeDesignDocument(design);
  sanitizeDesignHtml(normalized);
  const html = compileDesignToHtml(
    normalized,
    {},
    { title: subject, previewText: preheader },
  );
  const text = compileDesignToText(normalized, {});
  const id = newCampaignId("erev");
  await pool.query(
    `INSERT INTO email_campaign_revisions
      (id, campaign_id, design_json, html_body, text_body, subject, preheader, immutable)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      campaignId,
      JSON.stringify(normalized),
      html,
      text,
      stripHeaderInjection(subject),
      stripHeaderInjection(preheader),
    ],
  );
  await pool.query(
    `UPDATE email_campaigns
     SET current_revision_id = ?, subject = ?, preheader = ?, version=version+1
     WHERE id = ?`,
    [
      id,
      stripHeaderInjection(subject),
      stripHeaderInjection(preheader),
      campaignId,
    ],
  );
  await writeAudit(pool, {
    actorId,
    action: "campaign.saved",
    campaignId,
    detail: id,
  });
  return getCampaignWithRevision(pool, campaignId);
}

export async function updateCampaignDetails(pool, id, payload = {}, actorId) {
  return transaction(pool, async (connection) =>
    updateDetails(connection, id, payload, actorId),
  );
}

async function updateDetails(pool, id, payload, actorId) {
  await pool.query("SELECT id FROM email_campaigns WHERE id=? FOR UPDATE", [
    id,
  ]);
  const campaign = await getCampaign(pool, id);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.state !== "draft") {
    throw new Error(
      "Only drafts can be edited. Cancel the schedule and return to draft first.",
    );
  }
  if (
    payload.version != null &&
    Number(payload.version) !== Number(campaign.version)
  )
    throw new Error(
      "This campaign was changed in another window. Reload before saving.",
    );
  if (
    payload.name != null &&
    (!String(payload.name).trim() || String(payload.name).trim().length > 180)
  )
    throw new Error("Enter a campaign name up to 180 characters.");
  if (payload.reply_to != null && !validEmail(payload.reply_to))
    throw new Error("Enter a valid reply-to email.");
  if (payload.subject != null && String(payload.subject).length > 250)
    throw new Error("Subject line must be 250 characters or fewer.");
  if (payload.preheader != null && String(payload.preheader).length > 250)
    throw new Error("Preview text must be 250 characters or fewer.");
  if (payload.template_id) {
    const [[template]] = await pool.query(
      "SELECT campaign_type FROM email_design_templates WHERE id=? AND archived_at IS NULL",
      [payload.template_id],
    );
    if (!template || template.campaign_type !== campaign.campaign_type)
      throw new Error("Choose a template for this campaign type.");
  }
  const purpose =
    payload.purpose === CAMPAIGN_PURPOSES.promotional
      ? CAMPAIGN_PURPOSES.promotional
      : payload.purpose || campaign.purpose;
  if (!Object.values(CAMPAIGN_PURPOSES).includes(purpose))
    throw new Error("Invalid campaign purpose.");
  const segment = sanitizeSegment(payload.segment || campaign.segment);
  const audience = sanitizeAudience(payload.audience || campaign.audience);
  const cc = parseEmailList(payload.cc ?? campaign.cc);
  if (
    campaign.campaign_type !== "event_notification" &&
    purpose !== "promotional"
  )
    throw new Error(
      "Regular campaigns and invitations require promotional eligibility.",
    );
  let sender = null;
  if (payload.sender_identity_id || campaign.sender_identity_id) {
    const [[identity]] = await pool.query(
      "SELECT * FROM campaign_sender_identities WHERE id=? AND archived_at IS NULL",
      [payload.sender_identity_id || campaign.sender_identity_id],
    );
    if (!identity) throw new Error("Sender identity not found.");
    sender = identity;
  }
  if (payload.language && payload.language !== "English")
    throw new Error("Only English is currently available.");
  if (
    payload.layout_key &&
    !["empty", "left_sidebar", "right_sidebar", "custom_html"].includes(
      payload.layout_key,
    )
  )
    throw new Error("Invalid email layout.");
  await pool.query(
    `UPDATE email_campaigns
     SET name = ?, purpose = ?, from_name = ?, from_email = ?, reply_to = ?, segment_json = ?, timezone = ?, scheduled_at = ?, audience_spec_json=?,cc_json=?,cc_assistant=?,language=?,sender_identity_id=?,template_id=?,layout_key=?,version=version+1
     WHERE id = ?`,
    [
      String(payload.name || campaign.name).trim(),
      purpose,
      stripHeaderInjection(sender?.name || campaign.from_name),
      stripHeaderInjection(sender?.email || campaign.from_email),
      stripHeaderInjection(
        payload.reply_to ?? sender?.reply_to ?? campaign.reply_to,
      ),
      JSON.stringify(segment),
      payload.timezone || campaign.timezone || "Africa/Lusaka",
      payload.scheduled_at || null,
      JSON.stringify(audience),
      JSON.stringify(cc),
      Number(Boolean(payload.cc_assistant ?? campaign.cc_assistant)),
      payload.language || campaign.language || "English",
      sender?.id || null,
      payload.template_id ?? campaign.template_id ?? null,
      payload.layout_key || campaign.layout_key || "empty",
      id,
    ],
  );
  if (payload.design || payload.subject != null || payload.preheader != null) {
    const revision = await getRevision(pool, campaign.current_revision_id);
    await saveRevision(pool, {
      campaignId: id,
      design: payload.design || revision?.design,
      subject: payload.subject != null ? payload.subject : campaign.subject,
      preheader:
        payload.preheader != null ? payload.preheader : campaign.preheader,
      actorId,
    });
  }
  if (audience) {
    const count = await previewCampaignAudience(pool, {
      eventId: campaign.event_id,
      segment,
      purpose,
      audience,
      type: campaign.campaign_type,
    });
    await pool.query(
      "UPDATE email_campaigns SET audience_preview_count=? WHERE id=?",
      [count.included_count, id],
    );
  }
  await writeAudit(pool, {
    actorId,
    action: "campaign.updated",
    campaignId: id,
  });
  return getCampaignWithRevision(pool, id);
}

export async function transitionCampaign(
  pool,
  id,
  nextState,
  actorId,
  detail = "",
) {
  const campaign = await getCampaign(pool, id);
  if (!campaign) throw new Error("Campaign not found.");
  if (!canTransitionCampaign(campaign.state, nextState)) {
    throw new Error(
      `Cannot move a ${campaign.state} campaign to ${nextState}.`,
    );
  }
  await pool.query("UPDATE email_campaigns SET state = ? WHERE id = ?", [
    nextState,
    id,
  ]);
  if (
    ["sending", "scheduled"].includes(nextState) &&
    campaign.current_revision_id
  ) {
    await pool.query(
      "UPDATE email_campaign_revisions SET immutable = 1 WHERE id = ?",
      [campaign.current_revision_id],
    );
  }
  await writeAudit(pool, {
    actorId,
    action: `campaign.${nextState}`,
    campaignId: id,
    detail,
  });
  return getCampaignWithRevision(pool, id);
}

export async function duplicateCampaign(pool, id, actorId) {
  const current = await getCampaignWithRevision(pool, id);
  if (!current) throw new Error("Campaign not found.");
  const copy = await createCampaign(pool, {
    eventId: current.event_id,
    name: `${current.name.slice(0, 173)} (copy)`,
    purpose: current.purpose,
    actorId,
    timezone: current.timezone,
    type: current.campaign_type,
  });
  await pool.query(
    "UPDATE email_campaigns SET parent_campaign_id = ? WHERE id = ?",
    [id, copy.id],
  );
  await pool.query(
    "UPDATE email_campaigns SET audience_spec_json=?,segment_json=?,sender_identity_id=?,cc_json=?,cc_assistant=?,template_id=?,layout_key=?,from_name=?,from_email=?,reply_to=?,language=? WHERE id=?",
    [
      JSON.stringify(current.audience),
      JSON.stringify(current.segment),
      current.sender_identity_id || null,
      JSON.stringify(current.cc),
      Number(Boolean(current.cc_assistant)),
      current.template_id || null,
      current.layout_key || "empty",
      current.from_name,
      current.from_email,
      current.reply_to,
      current.language,
      copy.id,
    ],
  );
  await saveRevision(pool, {
    campaignId: copy.id,
    design: current.revision?.design || blankCampaignDesign(),
    subject: current.subject,
    preheader: current.preheader,
    actorId,
  });
  await writeAudit(pool, {
    actorId,
    action: "campaign.duplicated",
    campaignId: copy.id,
    detail: id,
  });
  return getCampaignWithRevision(pool, copy.id);
}

export async function getCampaignWithRevision(pool, id) {
  const campaign = await getCampaign(pool, id);
  if (!campaign) return null;
  const revision = await getRevision(pool, campaign.current_revision_id);
  const [audit] = await pool.query(
    "SELECT * FROM email_audit_log WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 20",
    [id],
  );
  const [[event]] = campaign.event_id
    ? await pool.query("SELECT id,title,booking_type FROM events WHERE id=?", [
        campaign.event_id,
      ])
    : [[]];
  return {
    ...campaign,
    revision,
    event: event || null,
    event_title: event?.title || "",
    activity: audit || [],
  };
}

export async function listDesignTemplates(pool) {
  const [rows] = await pool.query(
    "SELECT * FROM email_design_templates WHERE archived_at IS NULL ORDER BY name ASC",
  );
  return (rows || []).map((row) => ({
    ...row,
    design: parseJson(row.design_json, blankCampaignDesign()),
  }));
}

export async function saveDesignTemplate(pool, payload, id) {
  if (!String(payload.name || "").trim()) throw new Error("Name the template.");
  if (String(payload.name).trim().length > 180)
    throw new Error("Template names must be 180 characters or fewer.");
  if (
    !CAMPAIGN_TYPES.some(
      (type) => type.id === (payload.campaign_type || "regular"),
    )
  )
    throw new Error("Choose a valid template campaign type.");
  const doc = normalizeDesignDocument(payload.design);
  sanitizeDesignHtml(doc);
  const templateId = id || newCampaignId("template");
  await pool.query(
    `INSERT INTO email_design_templates (id,slug,name,purpose,subject,preheader,design_json,campaign_type,description,layout_key)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),subject=VALUES(subject),preheader=VALUES(preheader),design_json=VALUES(design_json),description=VALUES(description),layout_key=VALUES(layout_key),campaign_type=VALUES(campaign_type),purpose=VALUES(purpose)`,
    [
      templateId,
      templateId,
      String(payload.name).trim(),
      payload.campaign_type === "event_notification"
        ? "event_service"
        : "promotional",
      stripHeaderInjection(payload.subject || ""),
      stripHeaderInjection(payload.preheader || ""),
      JSON.stringify(doc),
      payload.campaign_type || "regular",
      String(payload.description || ""),
      payload.layout_key || "empty",
    ],
  );
  return templateId;
}

export async function archiveCampaign(pool, id, actorId) {
  return transaction(pool, async (connection) => {
    await connection.query(
      "SELECT id FROM email_campaigns WHERE id=? FOR UPDATE",
      [id],
    );
    const campaign = await getCampaign(connection, id);
    if (!campaign || !["draft", "cancelled"].includes(campaign.state))
      throw new Error(
        "Only unscheduled drafts or cancelled campaigns can be removed.",
      );
    await connection.query(
      "UPDATE email_campaigns SET archived_at=UTC_TIMESTAMP() WHERE id=?",
      [id],
    );
    await writeAudit(connection, {
      actorId,
      action: "campaign.archived",
      campaignId: id,
    });
  });
}
