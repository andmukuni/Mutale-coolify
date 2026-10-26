import crypto from "node:crypto";
import {
  DEFAULT_CAMPAIGN_SENDER,
  normalizeCampaignEmail,
  stripHeaderInjection,
} from "../shared/emailCampaign.js";
import { validEmail } from "../shared/campaignWorkspace.js";
import {
  recordMarketingOptIn,
  recordUnsubscribe,
} from "./emailConsentService.js";
import {
  allowedSenderDomains,
  getCampaignDeliveryConfig,
  verifySmtpConnection,
} from "./campaignMailer.js";

export function jsonValue(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export async function upsertCampaignContact(
  pool,
  incoming = {},
  { consent = false } = {},
) {
  const email = normalizeCampaignEmail(
    incoming.email_normalized || incoming.email,
  );
  if (!validEmail(email)) throw new Error("Enter a valid email address.");
  const fullName = String(
    incoming.full_name ||
      incoming.name ||
      [incoming.first_name, incoming.last_name].filter(Boolean).join(" ") ||
      "",
  ).trim();
  const first = String(incoming.first_name || fullName.split(/\s+/)[0] || "");
  const last = String(
    incoming.last_name || fullName.split(/\s+/).slice(1).join(" "),
  );
  const assistant = normalizeCampaignEmail(incoming.assistant_email);
  if (assistant && !validEmail(assistant))
    throw new Error("Enter a valid assistant email.");
  const id = `contact-${crypto.createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
  const source = String(incoming.source || "manual");
  const fields = [
    "phone",
    "company",
    "title",
    "address",
    "country",
    "region",
    "city",
    "postal_code",
  ];
  const values = fields.map((field) =>
    String(incoming[field] || "").slice(
      0,
      {
        address: 500,
        phone: 80,
        country: 100,
        region: 100,
        city: 100,
        postal_code: 60,
      }[field] || 255,
    ),
  );
  await pool.query(
    `INSERT INTO campaign_contacts
    (id,email_normalized,full_name,first_name,last_name,assistant_email,phone,company,title,address,country,region,city,postal_code,user_id,source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE full_name=IF(VALUES(source)='manual',VALUES(full_name),IF(full_name='',VALUES(full_name),full_name)),
    first_name=IF(VALUES(source)='manual',VALUES(first_name),IF(first_name='',VALUES(first_name),first_name)),
    last_name=IF(VALUES(source)='manual',VALUES(last_name),IF(last_name='',VALUES(last_name),last_name)),
    assistant_email=IF(VALUES(source)='manual',VALUES(assistant_email),assistant_email),
    phone=IF(VALUES(source)='manual',VALUES(phone),IF(phone='',VALUES(phone),phone)),
    company=IF(VALUES(source)='manual',VALUES(company),IF(company='',VALUES(company),company)),
    title=IF(VALUES(source)='manual',VALUES(title),IF(title='',VALUES(title),title)),
    address=IF(VALUES(source)='manual',VALUES(address),address), country=IF(VALUES(source)='manual',VALUES(country),country),
    region=IF(VALUES(source)='manual',VALUES(region),region), city=IF(VALUES(source)='manual',VALUES(city),city),
    postal_code=IF(VALUES(source)='manual',VALUES(postal_code),postal_code),user_id=COALESCE(user_id,VALUES(user_id))`,
    [
      id,
      email,
      fullName.slice(0, 255),
      first.slice(0, 120),
      last.slice(0, 120),
      assistant,
      ...values,
      incoming.user_id || null,
      source,
    ],
  );
  if (consent === true)
    await recordMarketingOptIn(pool, email, {
      source: "campaign_contact_confirmed",
    });
  const [[contact]] = await pool.query(
    "SELECT * FROM campaign_contacts WHERE email_normalized=?",
    [email],
  );
  return contact;
}

export async function syncCampaignContacts(pool) {
  const [users] = await pool.query(
    "SELECT id,name,email,phone,organization,occupation,address FROM users",
  );
  const [attendees] = await pool.query(
    `SELECT COALESCE(NULLIF(booked_for_email,''),user_email) AS email,COALESCE(NULLIF(booked_for_name,''),user_name) AS name,COALESCE(NULLIF(booked_for_phone,''),NULLIF(guardian_phone,''),buyer_phone) AS phone FROM event_registrations`,
  );
  const incoming = [
    ...users.map((user) => ({
      ...user,
      user_id: user.id,
      company: user.organization,
      title: user.occupation,
      source: "account",
    })),
    ...attendees.map((attendee) => ({ ...attendee, source: "attendee" })),
  ];
  const unique = new Map();
  for (const person of incoming) {
    const email = normalizeCampaignEmail(person.email);
    if (!validEmail(email)) continue;
    const old = unique.get(email);
    unique.set(
      email,
      old ? { ...person, ...old, name: old.name || person.name } : person,
    );
  }
  const fields = [
    "phone",
    "company",
    "title",
    "address",
    "country",
    "region",
    "city",
    "postal_code",
  ];
  const values = [...unique.entries()].map(([email, person]) => {
    const name = String(person.name || "").trim();
    return [
      `contact-${crypto.createHash("sha256").update(email).digest("hex").slice(0, 40)}`,
      email,
      name.slice(0, 255),
      name.split(/\s+/)[0].slice(0, 120),
      name.split(/\s+/).slice(1).join(" ").slice(0, 120),
      "",
      ...fields.map((field) =>
        String(person[field] || "").slice(
          0,
          {
            phone: 80,
            address: 500,
            country: 100,
            region: 100,
            city: 100,
            postal_code: 60,
          }[field] || 255,
        ),
      ),
      person.user_id || null,
      person.source,
    ];
  });
  for (let offset = 0; offset < values.length; offset += 250) {
    const batch = values.slice(offset, offset + 250);
    await pool.query(
      `INSERT INTO campaign_contacts (id,email_normalized,full_name,first_name,last_name,assistant_email,phone,company,title,address,country,region,city,postal_code,user_id,source) VALUES ${batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")} ON DUPLICATE KEY UPDATE full_name=IF(full_name='',VALUES(full_name),full_name),first_name=IF(first_name='',VALUES(first_name),first_name),last_name=IF(last_name='',VALUES(last_name),last_name),phone=IF(phone='',VALUES(phone),phone),company=IF(company='',VALUES(company),company),title=IF(title='',VALUES(title),title),user_id=COALESCE(user_id,VALUES(user_id))`,
      batch.flat(),
    );
  }
  // Imported registrations use general_ci; normalize the campaign operand at this boundary.
  // Automatic subscription enrolment requires prior, explicit marketing consent.
  await pool.query(`INSERT IGNORE INTO campaign_group_members (group_id,contact_id,state,consent_source,consent_at)
    SELECT g.id,c.id,'active','automatic_with_recorded_consent',p.marketing_opt_in_at
    FROM campaign_groups g JOIN campaign_contacts c JOIN email_preferences p ON p.email_normalized=c.email_normalized
    WHERE g.kind='subscription' AND g.archived_at IS NULL AND c.archived_at IS NULL
    AND p.marketing_opt_in=1 AND p.unsubscribed_at IS NULL AND p.marketing_opt_in_at>=g.created_at
    AND ((g.auto_users=1 AND c.user_id IS NOT NULL) OR (g.auto_attendees=1 AND EXISTS(
      SELECT 1 FROM event_registrations r WHERE LOWER(TRIM(COALESCE(NULLIF(r.booked_for_email,''),r.user_email)))=c.email_normalized COLLATE utf8mb4_general_ci))
    OR (g.auto_members=1 AND EXISTS(SELECT 1 FROM campaign_memberships m WHERE m.contact_id=c.id AND m.status='active' AND (m.starts_at IS NULL OR m.starts_at<=UTC_DATE()) AND (m.expires_at IS NULL OR m.expires_at>=UTC_DATE()))))
    AND (g.active_only=0 OR EXISTS(SELECT 1 FROM campaign_memberships m WHERE m.contact_id=c.id AND m.status='active' AND (m.starts_at IS NULL OR m.starts_at<=UTC_DATE()) AND (m.expires_at IS NULL OR m.expires_at>=UTC_DATE())))`);
}

export async function getCampaignDirectory(
  pool,
  { sync = true, onlyEmail = "" } = {},
) {
  if (sync) await syncCampaignContacts(pool);
  const [contacts] = await pool.query(
    `SELECT c.*,p.marketing_opt_in,p.unsubscribed_at,
    EXISTS(SELECT 1 FROM campaign_memberships m WHERE m.contact_id=c.id AND m.status='active' AND (m.starts_at IS NULL OR m.starts_at<=UTC_DATE()) AND (m.expires_at IS NULL OR m.expires_at>=UTC_DATE())) AS active_member
    FROM campaign_contacts c LEFT JOIN email_preferences p ON p.email_normalized=c.email_normalized WHERE c.archived_at IS NULL ${onlyEmail ? "AND c.email_normalized=?" : ""} ORDER BY c.full_name,c.email_normalized`,
    onlyEmail ? [onlyEmail] : [],
  );
  const [groups] =
    await pool.query(`SELECT g.*,COUNT(gm.contact_id) AS members FROM campaign_groups g
    LEFT JOIN campaign_group_members gm ON gm.group_id=g.id AND gm.state='active'
    WHERE g.archived_at IS NULL GROUP BY g.id ORDER BY g.name`);
  const [members] = await pool.query(
    `SELECT * FROM campaign_group_members ${onlyEmail ? "WHERE contact_id=?" : ""}`,
    onlyEmail ? [contacts[0]?.id || ""] : [],
  );
  const [memberships] = await pool.query(
    `SELECT m.*,c.full_name,c.email_normalized,g.name AS type_name FROM campaign_memberships m
    JOIN campaign_contacts c ON c.id=m.contact_id JOIN campaign_groups g ON g.id=m.type_id ${onlyEmail ? "WHERE c.email_normalized=?" : ""} ORDER BY c.full_name`,
    onlyEmail ? [onlyEmail] : [],
  );
  const [senders] = await pool.query(
    "SELECT * FROM campaign_sender_identities WHERE archived_at IS NULL ORDER BY name",
  );
  return {
    contacts,
    groups: groups.map((group) => ({
      ...group,
      filters: jsonValue(group.filters_json),
    })),
    group_members: members,
    memberships,
    senders,
    push_configured: Boolean(process.env.EXPO_ACCESS_TOKEN),
  };
}

export async function saveCampaignGroup(pool, input, id = null) {
  const kinds = [
    "contact_list",
    "committee",
    "subscription",
    "membership_type",
    "smart_list",
  ];
  if (!kinds.includes(input.kind)) throw new Error("Choose a valid list type.");
  const name = String(input.name || "").trim();
  if (!name || name.length > 180)
    throw new Error("Enter a list name (maximum 180 characters).");
  if (id) {
    const [[old]] = await pool.query(
      "SELECT * FROM campaign_groups WHERE id=? AND archived_at IS NULL",
      [id],
    );
    if (!old || old.kind !== input.kind)
      throw new Error("List not found or list type changed.");
  }
  const filters = input.filters || {};
  const safeFilters = Object.fromEntries(
    ["company", "country", "active_member", "marketing_opt_in"]
      .filter((key) => filters[key] != null && filters[key] !== "")
      .map((key) => [key, String(filters[key]).slice(0, 255)]),
  );
  const groupId = id || `group-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO campaign_groups (id,kind,name,description,filters_json,is_private,active_only,auto_attendees,auto_members,auto_users,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),filters_json=VALUES(filters_json),is_private=VALUES(is_private),active_only=VALUES(active_only),auto_attendees=VALUES(auto_attendees),auto_members=VALUES(auto_members),auto_users=VALUES(auto_users)`,
    [
      groupId,
      input.kind,
      name,
      String(input.description || ""),
      JSON.stringify(safeFilters),
      Number(Boolean(input.is_private)),
      Number(Boolean(input.active_only)),
      Number(Boolean(input.auto_attendees)),
      Number(Boolean(input.auto_members)),
      Number(Boolean(input.auto_users)),
    ],
  );
  return groupId;
}

export async function setCampaignGroupMembers(pool, groupId, contactIds) {
  const [[group]] = await pool.query(
    "SELECT * FROM campaign_groups WHERE id=? AND archived_at IS NULL",
    [groupId],
  );
  if (!group || ["membership_type", "smart_list"].includes(group.kind))
    throw new Error("This group does not support manual contacts.");
  const ids = [...new Set((contactIds || []).map(String))];
  if (ids.length > 10000) throw new Error("Too many contacts.");
  const run = async (connection) => {
    await connection.query(
      "UPDATE campaign_group_members SET state='removed' WHERE group_id=? AND state='active'",
      [groupId],
    );
    for (const contactId of ids) {
      const [[contact]] = await connection.query(
        "SELECT id FROM campaign_contacts WHERE id=? AND archived_at IS NULL",
        [contactId],
      );
      if (!contact) throw new Error("Contact not found.");
      // Re-selection never clears an unsubscribe. Re-subscription is a separate consent action.
      await connection.query(
        `INSERT INTO campaign_group_members (group_id,contact_id,state) VALUES (?,?,'active')
        ON DUPLICATE KEY UPDATE state=IF(unsubscribed_at IS NULL,'active','unsubscribed')`,
        [groupId, contactId],
      );
    }
  };
  return transaction(pool, run);
}

export async function saveCampaignMembership(pool, input) {
  const [[contact]] = await pool.query(
    "SELECT id FROM campaign_contacts WHERE id=? AND archived_at IS NULL",
    [input.contact_id],
  );
  const [[type]] = await pool.query(
    "SELECT id FROM campaign_groups WHERE id=? AND kind='membership_type' AND archived_at IS NULL",
    [input.type_id],
  );
  if (!contact || !type)
    throw new Error("Select an existing contact and membership type.");
  if (
    !["active", "pending", "expired", "cancelled"].includes(
      input.status || "active",
    )
  )
    throw new Error("Invalid membership status.");
  for (const field of ["starts_at", "expires_at"])
    if (input[field] && !/^\d{4}-\d{2}-\d{2}$/.test(input[field]))
      throw new Error("Enter a valid membership date.");
  if (input.starts_at && input.expires_at && input.expires_at < input.starts_at)
    throw new Error("Expiry must follow the membership start.");
  await pool.query(
    `INSERT INTO campaign_memberships (id,contact_id,type_id,status,starts_at,expires_at) VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE status=VALUES(status),starts_at=VALUES(starts_at),expires_at=VALUES(expires_at)`,
    [
      `membership-${crypto.randomUUID()}`,
      input.contact_id,
      input.type_id,
      input.status || "active",
      input.starts_at || null,
      input.expires_at || null,
    ],
  );
}

export async function saveCampaignSender(pool, input) {
  const email = normalizeCampaignEmail(input.email);
  const reply = normalizeCampaignEmail(input.reply_to || email);
  if (
    !validEmail(email) ||
    !validEmail(reply) ||
    !String(input.name || "").trim()
  )
    throw new Error("Enter a sender name and valid email addresses.");
  const id = input.id || `sender-${crypto.randomUUID()}`;
  if (input.id) {
    await pool.query(
      `UPDATE campaign_sender_identities SET name=?,reply_to=?,status=IF(email=? ,status,'unverified'),email=?,checked_at=NULL WHERE id=?`,
      [stripHeaderInjection(input.name), reply, email, email, id],
    );
  } else
    await pool.query(
      "INSERT INTO campaign_sender_identities (id,name,email,reply_to) VALUES (?,?,?,?)",
      [id, stripHeaderInjection(input.name), email, reply],
    );
  return id;
}

/**
 * A sender is verified when the SMTP login works and its domain matches the
 * SMTP account (its login or the From address in Admin → Settings → Email).
 */
export async function refreshCampaignSenders(
  pool,
  { verifyFn = verifySmtpConnection, config: suppliedConfig } = {},
) {
  const config = suppliedConfig || (await getCampaignDeliveryConfig(pool));
  if (!config.configured)
    throw new Error(
      "Set up SMTP in Admin → Settings → Email before checking senders.",
    );
  await verifyFn(config);
  const domains = allowedSenderDomains(config.smtp);
  const [senders] = await pool.query(
    "SELECT * FROM campaign_sender_identities WHERE archived_at IS NULL",
  );
  let verified = 0;
  for (const sender of senders) {
    const domain = String(sender.email || "").split("@")[1]?.toLowerCase();
    const status = domains.has(domain) ? "verified" : "unverified";
    if (status === "verified") verified += 1;
    await pool.query(
      "UPDATE campaign_sender_identities SET status=?,provider_domain_id=NULL,checked_at=UTC_TIMESTAMP() WHERE id=?",
      [status, sender.id],
    );
  }
  return { checked: senders.length, verified, domains: [...domains] };
}

export async function campaignSuppressions(pool) {
  const [bounced] = await pool.query(
    `SELECT s.*,c.id AS contact_id,c.first_name,c.last_name,c.full_name,EXISTS(SELECT 1 FROM campaign_memberships m WHERE m.contact_id=c.id AND m.status='active' AND (m.starts_at IS NULL OR m.starts_at<=UTC_DATE()) AND (m.expires_at IS NULL OR m.expires_at>=UTC_DATE())) AS active_member FROM email_suppressions s LEFT JOIN campaign_contacts c ON c.email_normalized=s.email_normalized WHERE s.reason<>'unsubscribe' ORDER BY s.created_at DESC`,
  );
  const [unsubscribed] = await pool.query(
    `SELECT c.id AS contact_id,p.email_normalized,p.unsubscribed_at,p.unsubscribe_reason,p.unsubscribe_details,c.first_name,c.last_name,c.full_name,c.phone,c.company FROM email_preferences p LEFT JOIN campaign_contacts c ON c.email_normalized=p.email_normalized WHERE p.unsubscribed_at IS NOT NULL ORDER BY p.unsubscribed_at DESC`,
  );
  return { bounced, unsubscribed };
}

export async function updateSubscription(
  pool,
  { email, groupId, subscribed, source = "preferences" },
) {
  const [[group]] = await pool.query(
    "SELECT * FROM campaign_groups WHERE id=? AND kind='subscription' AND archived_at IS NULL",
    [groupId],
  );
  if (!group) throw new Error("Subscription list not found.");
  const contact = await upsertCampaignContact(pool, {
    email,
    source: "subscriber",
  });
  if (group.is_private) {
    const [[membership]] = await pool.query(
      "SELECT state FROM campaign_group_members WHERE group_id=? AND contact_id=?",
      [groupId, contact.id],
    );
    if (!membership) throw new Error("This subscription list is private.");
  }
  if (subscribed && group.active_only) {
    const [[member]] = await pool.query(
      "SELECT id FROM campaign_memberships WHERE contact_id=? AND status='active' AND (starts_at IS NULL OR starts_at<=UTC_DATE()) AND (expires_at IS NULL OR expires_at>=UTC_DATE())",
      [contact.id],
    );
    if (!member)
      throw new Error("This subscription is restricted to active members.");
  }
  if (subscribed) await recordMarketingOptIn(pool, email, { source });
  await pool.query(
    `INSERT INTO campaign_group_members (group_id,contact_id,state,consent_source,consent_at,unsubscribed_at)
    VALUES (?,?,?,?,IF(?=1,UTC_TIMESTAMP(),NULL),IF(?=0,UTC_TIMESTAMP(),NULL))
    ON DUPLICATE KEY UPDATE state=VALUES(state),consent_source=VALUES(consent_source),consent_at=VALUES(consent_at),unsubscribed_at=VALUES(unsubscribed_at)`,
    [
      groupId,
      contact.id,
      subscribed ? "active" : "unsubscribed",
      source,
      Number(subscribed),
      Number(subscribed),
    ],
  );
}

export async function transaction(pool, run) {
  if (!pool.getConnection) return run(pool);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export { recordUnsubscribe, DEFAULT_CAMPAIGN_SENDER };
