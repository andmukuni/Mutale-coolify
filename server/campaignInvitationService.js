import crypto from "node:crypto";
import { jsonValue } from "./campaignDirectoryService.js";
import { normalizeCampaignEmail } from "../shared/emailCampaign.js";

function secret() {
  const value = process.env.AUTH_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!value && process.env.NODE_ENV === "production")
    throw new Error("Configure AUTH_TOKEN_SECRET.");
  return value || "local-campaign-links-only";
}

export function signCampaignLink(data, days = 90) {
  const payload = Buffer.from(
    JSON.stringify({ ...data, expires: Date.now() + days * 86400000 }),
  ).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function readCampaignLink(token, kind) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) throw new Error("Invalid link.");
  const expected = crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new Error("Invalid link.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (
    data.kind !== kind ||
    !Number.isFinite(data.expires) ||
    data.expires < Date.now()
  )
    throw new Error("This link has expired or is invalid.");
  return data;
}

export async function ensureEventInvitee(
  pool,
  { eventId, email, name, contactId },
) {
  const id = `invitee-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO event_invitees (id,event_id,email_normalized,display_name,contact_id) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE display_name=IF(display_name='',VALUES(display_name),display_name),contact_id=COALESCE(contact_id,VALUES(contact_id))`,
    [id, eventId, normalizeCampaignEmail(email), name || "", contactId || null],
  );
  const [[invitee]] = await pool.query(
    "SELECT * FROM event_invitees WHERE event_id=? AND email_normalized=?",
    [eventId, normalizeCampaignEmail(email)],
  );
  return invitee;
}

export async function invitationContext(pool, token) {
  const parsed = readCampaignLink(token, "invitation");
  const [[invitee]] = await pool.query(
    "SELECT * FROM event_invitees WHERE id=? AND event_id=?",
    [parsed.id, parsed.eventId],
  );
  if (!invitee || invitee.revoked_at)
    throw new Error("This invitation is no longer available.");
  const [[event]] = await pool.query(
    "SELECT id,title,slug,start_date,start_time,end_date,end_time,venue,location,event_mode FROM events WHERE id=?",
    [invitee.event_id],
  );
  if (!event) throw new Error("Event no longer available.");
  return {
    invitee,
    event,
    data: {
      event,
      name: invitee.display_name,
      state: invitee.state,
      registration_url: `/events/${encodeURIComponent(event.slug || event.id)}`,
    },
  };
}

export async function respondToInvitation(pool, token, response) {
  if (!["accepted", "declined"].includes(response))
    throw new Error("Choose I Will Attend or No.");
  const { invitee, data } = await invitationContext(pool, token);
  const [result] = await pool.query(
    `UPDATE event_invitees SET state=?,responded_at=UTC_TIMESTAMP()
    WHERE id=? AND state IN ('not_sent','no_response') AND revoked_at IS NULL`,
    [response, invitee.id],
  );
  if (result.affectedRows)
    await pool.query(
      "INSERT INTO event_invitation_responses (id,invitee_id,response) VALUES (?,?,?)",
      [`response-${crypto.randomUUID()}`, invitee.id, response],
    );
  else if (invitee.state !== response)
    throw new Error("A different response has already been recorded.");
  return { ...data, state: response };
}

export async function recordCampaignLinks(pool, campaign, recipient, html) {
  const matches = [
    ...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
  ];
  const replacements = new Map();
  for (const match of matches) {
    const destination = match[1].replace(/&amp;/g, "&");
    if (
      !/^https?:\/\//i.test(destination) ||
      /\/email\/unsubscribe|\/api\/email\/unsubscribe|\/email\/invitation/.test(
        destination,
      )
    )
      continue;
    const safeDestination = new URL(destination);
    for (const key of ["token", "key", "signature", "auth"])
      safeDestination.searchParams.delete(key);
    const reportDestination = safeDestination.href;
    const category = destination.includes("/email/preferences")
      ? "subscription"
      : "content";
    const hash = crypto
      .createHash("sha256")
      .update(reportDestination)
      .digest("hex");
    const id = `link-${crypto.createHash("sha256").update(`${campaign.id}/${campaign.current_revision_id}/${hash}`).digest("hex").slice(0, 40)}`;
    const label = match[2]
      .replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, 255);
    await pool.query(
      `INSERT IGNORE INTO email_campaign_links (id,campaign_id,revision_id,url_hash,label,destination,category) VALUES (?,?,?,?,?,?,?)`,
      [
        id,
        campaign.id,
        campaign.current_revision_id,
        hash,
        label,
        reportDestination,
        category,
      ],
    );
    await pool.query(
      "INSERT IGNORE INTO email_campaign_link_targets (link_id,recipient_id,destination) VALUES (?,?,?)",
      [id, recipient.id, destination],
    );
    const token = signCampaignLink({
      kind: "click",
      linkId: id,
      recipientId: recipient.id,
      campaignId: campaign.id,
    });
    replacements.set(
      match[1],
      `${String(process.env.APP_URL || "https://mutalemubanga.org").replace(/\/$/, "")}/api/email/click?token=${encodeURIComponent(token)}`,
    );
  }
  return html.replace(/href="([^"]+)"/g, (all, url) =>
    replacements.has(url) ? `href="${replacements.get(url)}"` : all,
  );
}

/** Adds a 1×1 image that records the first open. Opens are estimates: mail apps may block or prefetch images. */
export function appendOpenPixel(html, campaign, recipient) {
  const token = signCampaignLink({
    kind: "open",
    recipientId: recipient.id,
    campaignId: campaign.id,
  });
  const pixel = `<img src="${String(process.env.APP_URL || "https://mutalemubanga.org").replace(/\/$/, "")}/api/email/open?token=${encodeURIComponent(token)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;overflow:hidden" />`;
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${pixel}</body>`)
    : `${html}${pixel}`;
}

export async function recordCampaignOpen(pool, token) {
  const data = readCampaignLink(token, "open");
  await pool.query(
    "UPDATE email_campaign_recipients SET opened_at=COALESCE(opened_at,UTC_TIMESTAMP()) WHERE id=? AND campaign_id=?",
    [data.recipientId, data.campaignId],
  );
}

export async function recordCampaignClick(pool, token, { head = false } = {}) {
  const data = readCampaignLink(token, "click");
  const [[link]] = await pool.query(
    "SELECT * FROM email_campaign_links WHERE id=? AND campaign_id=?",
    [data.linkId, data.campaignId],
  );
  const [[recipient]] = await pool.query(
    "SELECT id FROM email_campaign_recipients WHERE id=? AND campaign_id=?",
    [data.recipientId, data.campaignId],
  );
  if (!link || !recipient) throw new Error("Link no longer available.");
  if (!head) {
    await pool.query(
      "INSERT INTO email_campaign_link_events (id,campaign_id,recipient_id,link_id,event_key) VALUES (?,?,?,?,?)",
      [
        `click-${crypto.randomUUID()}`,
        data.campaignId,
        data.recipientId,
        data.linkId,
        `redirect-${crypto.randomUUID()}`,
      ],
    );
    await pool.query(
      "UPDATE email_campaign_recipients SET clicked_at=COALESCE(clicked_at,UTC_TIMESTAMP()) WHERE id=?",
      [data.recipientId],
    );
  }
  const [[target]] = await pool.query(
    "SELECT destination FROM email_campaign_link_targets WHERE link_id=? AND recipient_id=?",
    [data.linkId, data.recipientId],
  );
  return target?.destination || link.destination;
}

export async function saveCampaignSurvey(pool, input, id) {
  const questions = Array.isArray(input.questions) ? input.questions : [];
  if (!String(input.name || "").trim() || !questions.length)
    throw new Error("Name the survey and add at least one question.");
  if (questions.length > 50) throw new Error("Maximum 50 questions.");
  const normalized = questions.map((question, index) => {
    if (
      !String(question.label || "").trim() ||
      !["text", "rating", "choice", "multiple_choice"].includes(question.type)
    )
      throw new Error("Enter a valid question.");
    const options = (
      Array.isArray(question.options)
        ? question.options
        : String(question.options || "").split("\n")
    )
      .map(String)
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      ["choice", "multiple_choice"].includes(question.type) &&
      options.length < 2
    )
      throw new Error("Choice questions need at least two options.");
    return {
      id: question.id || `q-${index}`,
      label: String(question.label).slice(0, 500),
      type: question.type,
      required: Boolean(question.required),
      options: options.slice(0, 30),
    };
  });
  if (
    new Set(normalized.map((question) => question.id)).size !==
    normalized.length
  )
    throw new Error("Question identifiers must be unique.");
  if (id) {
    const [[old]] = await pool.query(
      "SELECT questions_json FROM campaign_surveys WHERE id=?",
      [id],
    );
    if (!old) throw new Error("Survey not found.");
    const [[count]] = await pool.query(
      "SELECT COUNT(*) AS total FROM campaign_survey_responses WHERE survey_id=?",
      [id],
    );
    if (
      Number(count.total) > 0 &&
      JSON.stringify(jsonValue(old.questions_json, [])) !==
        JSON.stringify(normalized)
    )
      throw new Error(
        "Duplicate this survey to change questions after collecting responses.",
      );
  }
  const surveyId = id || `survey-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO campaign_surveys (id,name,description,questions_json,state) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),questions_json=VALUES(questions_json),state=VALUES(state)`,
    [
      surveyId,
      String(input.name).trim(),
      String(input.description || ""),
      JSON.stringify(normalized),
      ["draft", "published", "closed"].includes(input.state)
        ? input.state
        : "draft",
    ],
  );
  return surveyId;
}

export async function getCampaignSurvey(pool, id, { publicView = false } = {}) {
  const [[survey]] = await pool.query(
    "SELECT * FROM campaign_surveys WHERE id=?",
    [id],
  );
  if (!survey || (publicView && survey.state !== "published"))
    throw new Error("Survey not available.");
  return { ...survey, questions: jsonValue(survey.questions_json, []) };
}

export async function submitCampaignSurvey(pool, id, input) {
  const survey = await getCampaignSurvey(pool, id, { publicView: true });
  const answers = {};
  for (const question of survey.questions) {
    const answer = input.answers?.[question.id];
    if (
      question.required &&
      (answer == null ||
        answer === "" ||
        (Array.isArray(answer) && !answer.length))
    )
      throw new Error(`Answer ${question.label}.`);
    if (answer == null || answer === "") continue;
    if (
      question.type === "rating" &&
      (!Number.isInteger(Number(answer)) ||
        Number(answer) < 1 ||
        Number(answer) > 5)
    )
      throw new Error("Choose a rating from 1 to 5.");
    if (question.type === "choice" && !question.options.includes(answer))
      throw new Error("Choose a valid answer.");
    if (
      question.type === "multiple_choice" &&
      (!Array.isArray(answer) ||
        answer.some((value) => !question.options.includes(value)))
    )
      throw new Error("Choose valid answers.");
    answers[question.id] =
      question.type === "text" ? String(answer).slice(0, 4000) : answer;
  }
  await pool.query(
    "INSERT INTO campaign_survey_responses (id,survey_id,email_normalized,answers_json) VALUES (?,?,?,?)",
    [
      `survey-response-${crypto.randomUUID()}`,
      id,
      null,
      JSON.stringify(answers),
    ],
  );
  return { ok: true };
}
