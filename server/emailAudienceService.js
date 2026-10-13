import {
  normalizeCampaignEmail,
  sanitizeSegment,
} from "../shared/emailCampaign.js";
import { evaluateRecipientEligibility } from "./emailConsentService.js";
import { sanitizeAudience, validEmail } from "../shared/campaignWorkspace.js";
import { getCampaignDirectory } from "./campaignDirectoryService.js";

function registrationEmail(row) {
  return normalizeCampaignEmail(row.booked_for_email || row.user_email || "");
}

function registrationName(row) {
  return String(row.booked_for_name || row.user_name || "").trim();
}

export async function loadEventRegistrations(pool, eventId) {
  const [rows] = await pool.query(
    `SELECT id, event_id, user_id, user_name, user_email, booked_for_name, booked_for_email,
            status, payment_status, registration_type, attendee_type, attended_at, created_at, reference_code
     FROM event_registrations WHERE event_id = ?`,
    [eventId],
  );
  return rows || [];
}

export function registrationMatchesSegment(row, segment) {
  const spec = sanitizeSegment(segment);
  if (spec.mode === "selected") {
    return spec.registration_ids.includes(String(row.id));
  }
  const filters = spec.filters || {};
  if (!filters.include_cancelled && String(row.status || "") === "cancelled")
    return false;
  if (
    Array.isArray(filters.status) &&
    filters.status.length &&
    !filters.status.includes(String(row.status || ""))
  ) {
    return false;
  }
  if (
    Array.isArray(filters.payment_status) &&
    filters.payment_status.length &&
    !filters.payment_status.includes(String(row.payment_status || ""))
  ) {
    return false;
  }
  if (
    Array.isArray(filters.registration_type) &&
    filters.registration_type.length &&
    !filters.registration_type.includes(String(row.registration_type || ""))
  ) {
    return false;
  }
  if (
    Array.isArray(filters.attendee_type) &&
    filters.attendee_type.length &&
    !filters.attendee_type.includes(String(row.attendee_type || "adult"))
  ) {
    return false;
  }
  if (filters.attended === "yes" && !row.attended_at) return false;
  if (filters.attended === "no" && row.attended_at) return false;
  if (
    filters.registered_from &&
    String(row.created_at || "") < String(filters.registered_from)
  )
    return false;
  if (
    filters.registered_to &&
    String(row.created_at || "").slice(0, 10) > String(filters.registered_to)
  )
    return false;
  return true;
}

export async function previewCampaignAudience(
  pool,
  {
    eventId,
    segment,
    purpose = "event_service",
    audience,
    type = "event_notification",
    onlyEmail = "",
  },
) {
  const spec = sanitizeAudience(audience);
  if (spec)
    return previewWorkspaceAudience(pool, {
      eventId,
      segment,
      purpose,
      audience: spec,
      type,
      onlyEmail,
    });
  const rows = await loadEventRegistrations(pool, eventId);
  const seen = new Map();
  const included = [];
  const excluded = [];

  for (const row of rows) {
    const email = registrationEmail(row);
    if (!email) {
      excluded.push({
        registration_id: row.id,
        email: "",
        reason: "missing_email",
      });
      continue;
    }
    if (!registrationMatchesSegment(row, segment)) {
      excluded.push({
        registration_id: row.id,
        email,
        reason: "outside_segment",
      });
      continue;
    }
    if (seen.has(email)) {
      excluded.push({
        registration_id: row.id,
        email,
        reason: "duplicate_email",
      });
      continue;
    }
    const gate = await evaluateRecipientEligibility(pool, { email, purpose });
    if (gate.blocked) {
      excluded.push({ registration_id: row.id, email, reason: gate.reason });
      continue;
    }
    seen.set(email, row);
    included.push({
      registration_id: row.id,
      email,
      name: registrationName(row),
      reference_code: row.reference_code || "",
    });
  }

  return {
    included_count: included.length,
    excluded_count: excluded.length,
    included,
    excluded,
    count_may_change: true,
  };
}

function activeMembership(row) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    row.status === "active" &&
    (!row.starts_at || String(row.starts_at) <= today) &&
    (!row.expires_at || String(row.expires_at) >= today)
  );
}

export function contactMatchesSmartList(contact, filters = {}) {
  if (
    filters.company &&
    !String(contact.company || "")
      .toLowerCase()
      .includes(String(filters.company).toLowerCase())
  )
    return false;
  if (
    filters.country &&
    String(contact.country || "").toLowerCase() !==
      String(filters.country).toLowerCase()
  )
    return false;
  if (
    filters.active_member != null &&
    filters.active_member !== "" &&
    Boolean(Number(contact.active_member)) !==
      ["true", "1"].includes(String(filters.active_member))
  )
    return false;
  if (
    filters.marketing_opt_in != null &&
    filters.marketing_opt_in !== "" &&
    Boolean(Number(contact.marketing_opt_in)) !==
      ["true", "1"].includes(String(filters.marketing_opt_in))
  )
    return false;
  return true;
}

export async function previewWorkspaceAudience(
  pool,
  { eventId, segment, purpose, audience, type, onlyEmail = "" },
) {
  const directory = await getCampaignDirectory(pool, {
    sync: !onlyEmail,
    onlyEmail,
  });
  let registrations = eventId
    ? await loadEventRegistrations(pool, eventId)
    : [];
  if (onlyEmail)
    registrations = registrations.filter(
      (row) => registrationEmail(row) === onlyEmail,
    );
  const [invitees] = eventId
    ? await pool.query("SELECT * FROM event_invitees WHERE event_id=?", [
        eventId,
      ])
    : [[]];
  const [team] = await pool.query("SELECT email FROM users WHERE role='admin'");
  const teamEmails = new Set(
    team.map((user) => normalizeCampaignEmail(user.email)),
  );
  const byEmail = new Map(
    directory.contacts.map((contact) => [contact.email_normalized, contact]),
  );
  const active = directory.memberships.filter(activeMembership);
  const memberIds = new Set(active.map((member) => member.contact_id));
  const groupMembers = (id) =>
    new Set(
      directory.group_members
        .filter(
          (member) =>
            member.group_id === id &&
            member.state === "active" &&
            !member.unsubscribed_at,
        )
        .map((member) => member.contact_id),
    );
  const subscriberIds = new Set(
    directory.group_members
      .filter(
        (member) =>
          member.state === "active" &&
          !member.unsubscribed_at &&
          directory.groups.some(
            (group) =>
              group.id === member.group_id &&
              group.kind === "subscription" &&
              (!group.active_only || memberIds.has(member.contact_id)),
          ),
      )
      .map((member) => member.contact_id),
  );
  const committeeIds = new Set(
    directory.group_members
      .filter(
        (member) =>
          member.state === "active" &&
          directory.groups.some(
            (group) =>
              group.id === member.group_id && group.kind === "committee",
          ),
      )
      .map((member) => member.contact_id),
  );
  const attendee = (row) => ({
    ...byEmail.get(registrationEmail(row)),
    email: registrationEmail(row),
    name: registrationName(row),
    registration_id: row.id,
    reference_code: row.reference_code,
    service_relationship: true,
    allow_cancelled: row.status === "cancelled",
  });
  const contact = (row) => ({
    ...row,
    email: row.email_normalized,
    name: row.full_name,
  });
  const resolve = (rule) => {
    const group = directory.groups.find((item) => item.id === rule.id);
    let rows = directory.contacts;
    switch (rule.source) {
      case "all_contacts":
        break;
      case "all_subscribers":
        rows = rows.filter((row) => subscriberIds.has(row.id));
        break;
      case "team":
        rows = rows.filter((row) => teamEmails.has(row.email_normalized));
        break;
      case "all_committee_contacts":
        rows = rows.filter((row) => committeeIds.has(row.id));
        break;
      case "all_members":
        rows = rows.filter((row) => memberIds.has(row.id));
        break;
      case "membership_type":
        rows = rows.filter((row) =>
          active.some(
            (member) =>
              member.contact_id === row.id && member.type_id === rule.id,
          ),
        );
        break;
      case "smart_list":
        if (group?.kind !== "smart_list")
          throw new Error("Smart list not found.");
        rows = rows.filter((row) =>
          contactMatchesSmartList(row, group.filters),
        );
        break;
      case "contact_list":
      case "committee":
      case "subscription":
      case "members_committee": {
        const expectedKind =
          rule.source === "members_committee" ? "committee" : rule.source;
        if (!group || group.kind !== expectedKind)
          throw new Error("Audience list not found.");
        const ids = groupMembers(rule.id);
        rows = rows.filter(
          (row) =>
            ids.has(row.id) &&
            (rule.source !== "members_committee" || memberIds.has(row.id)) &&
            (!group.active_only || memberIds.has(row.id)),
        );
        break;
      }
      case "event_invitees":
        return invitees
          .filter((row) => rule.filter === "all" || row.state === rule.filter)
          .map((row) => ({
            ...byEmail.get(row.email_normalized),
            email: row.email_normalized,
            name: row.display_name,
            invitation_id: row.id,
          }));
      case "event_registrants":
        return registrations
          .filter((row) => {
            if (rule.filter === "all") return row.status !== "cancelled";
            if (rule.filter === "unpaid")
              return (
                !["paid", "free"].includes(row.payment_status) &&
                row.status !== "cancelled"
              );
            if (rule.filter === "advanced")
              return registrationMatchesSegment(row, segment);
            return row.status === rule.filter;
          })
          .map(attendee);
      case "ticket_type":
        return registrations
          .filter(
            (row) =>
              row.registration_type === rule.id && row.status !== "cancelled",
          )
          .map(attendee);
      default:
        throw new Error("Unsupported audience source.");
    }
    return rows.map(contact);
  };
  const sourceCounts = Object.fromEntries(
    [...audience.include, ...audience.exclude].map((rule) => [
      `${rule.source}:${rule.id || ""}:${rule.filter || "all"}`,
      new Set(
        resolve(rule).map((person) => normalizeCampaignEmail(person.email)),
      ).size,
    ]),
  );
  const removed = new Set(
    audience.exclude
      .flatMap(resolve)
      .map((person) => normalizeCampaignEmail(person.email)),
  );
  const selected = new Map();
  for (const person of audience.include
    .flatMap(resolve)
    .filter(
      (person) =>
        !onlyEmail || normalizeCampaignEmail(person.email) === onlyEmail,
    )) {
    const email = normalizeCampaignEmail(person.email);
    const existing = selected.get(email);
    if (!existing || person.service_relationship)
      selected.set(email, { ...person, email });
  }
  const included = [],
    excluded = [];
  for (const person of selected.values()) {
    const registration = person.registration_id
      ? registrations.find((row) => row.id === person.registration_id)
      : registrations.find(
          (row) =>
            registrationEmail(row) === person.email &&
            row.status !== "cancelled",
        );
    const personWithRelationship = registration
      ? {
          ...person,
          service_relationship: true,
          registration_id: registration.id,
          reference_code: registration.reference_code,
        }
      : person;
    let reason = !validEmail(person.email)
      ? "invalid_email"
      : removed.has(person.email)
        ? "excluded_list"
        : null;
    if (
      !reason &&
      type === "event_invitation" &&
      invitees.some(
        (row) =>
          row.email_normalized === person.email &&
          ["accepted", "declined"].includes(row.state),
      )
    )
      reason = "invitation_responded";
    const effectivePurpose =
      type === "event_notification" &&
      purpose === "event_service" &&
      personWithRelationship.service_relationship
        ? "event_service"
        : "promotional";
    if (!reason) {
      const gate = await evaluateRecipientEligibility(pool, {
        email: person.email,
        purpose: effectivePurpose,
      });
      if (gate.blocked) reason = gate.reason;
    }
    if (reason) excluded.push({ ...personWithRelationship, reason });
    else
      included.push({
        ...personWithRelationship,
        effective_purpose: effectivePurpose,
      });
  }
  return {
    included_count: included.length,
    excluded_count: excluded.length,
    selected_count: selected.size,
    source_counts: sourceCounts,
    included,
    excluded,
    count_may_change: true,
  };
}

export function previouslyIncludedEmails(existingRows = []) {
  return new Set(
    existingRows
      .filter((row) => Number(row.included) === 1)
      .map((row) => normalizeCampaignEmail(row.email_normalized)),
  );
}
