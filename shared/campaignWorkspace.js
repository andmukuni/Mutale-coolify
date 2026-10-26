export const CAMPAIGN_TYPES = [
  {
    id: "regular",
    name: "Regular Campaign",
    title: "Send Regular Campaign",
    description: "Share news, promotions, or updates with your subscribers.",
  },
  {
    id: "event_notification",
    name: "Event Notification",
    title: "Send Event Notification",
    description: "Deliver updates and reminders specific to your event.",
  },
  {
    id: "event_invitation",
    name: "Event Invitation",
    title: "Send Event Invitation",
    description: "Invite prospective attendees to RSVP.",
    notice:
      "Those who’ve responded to previous event invitations won’t receive further emails.",
  },
];

export const CAMPAIGN_TIMEZONES = [
  "Africa/Lusaka",
  "UTC",
  "Africa/Johannesburg",
  "Africa/Harare",
  "Africa/Nairobi",
  "Africa/Lagos",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];
export const CAMPAIGN_LAYOUTS = [
  { id: "empty", name: "Empty", description: "Blank for easy drag-and-drop" },
  {
    id: "left_sidebar",
    name: "Left Side Bar",
    description: "Includes a sidebar on the left",
  },
  {
    id: "right_sidebar",
    name: "Right Side Bar",
    description: "Includes a sidebar on the right",
  },
  {
    id: "custom_html",
    name: "Custom HTML",
    description: "For your own HTML code",
  },
];
export const SENT_STATES = [
  "completed",
  "partially_failed",
  "failed",
  "sending",
];
// Campaign states shown on each list tab. The list API and the list page share this.
export const CAMPAIGN_LIST_TABS = {
  draft: ["draft", "paused", "cancelled"],
  scheduled: ["scheduled"],
  sent: SENT_STATES,
};
export function campaignListTab(state) {
  return (
    Object.keys(CAMPAIGN_LIST_TABS).find((tab) =>
      CAMPAIGN_LIST_TABS[tab].includes(state),
    ) || ""
  );
}
export const UNSUBSCRIBE_REASONS = [
  "I no longer want to receive these emails",
  "I never signed up for this mailing list",
  "The emails are inappropriate",
  "The emails are spam and should be reported",
  "Other",
];

export function validEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 255 &&
    /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(value)
  );
}

export function campaignType(value, eventId) {
  const type = value || (eventId ? "event_notification" : "regular");
  if (!CAMPAIGN_TYPES.some((item) => item.id === type))
    throw new Error("Choose a valid campaign type.");
  if (type !== "regular" && !eventId)
    throw new Error("Select an event for this campaign.");
  return type;
}

export function sanitizeAudience(value) {
  if (!value || Number(value.version) !== 2) return null;
  const sources = new Set([
    "all_contacts",
    "all_subscribers",
    "contact_list",
    "subscription",
    "committee",
    "all_committee_contacts",
    "all_members",
    "membership_type",
    "members_committee",
    "smart_list",
    "team",
    "event_invitees",
    "event_registrants",
    "ticket_type",
  ]);
  const normalize = (rows) =>
    (Array.isArray(rows) ? rows : []).slice(0, 100).map((row) => {
      if (!row || !sources.has(row.source))
        throw new Error("Unsupported audience source.");
      return {
        source: row.source,
        id: String(row.id || "").slice(0, 90),
        filter: String(row.filter || "all").slice(0, 80),
      };
    });
  return {
    version: 2,
    include: normalize(value.include),
    exclude: normalize(value.exclude),
  };
}

export function defaultAudience(type) {
  return {
    version: 2,
    include:
      type === "event_notification"
        ? [{ source: "event_registrants", filter: "confirmed" }]
        : [],
    exclude: [],
  };
}

export function parseEmailList(value) {
  const rows = [
    ...new Set(
      (Array.isArray(value) ? value : String(value || "").split(","))
        .map((email) => String(email).trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (rows.length > 50 || rows.some((email) => !validEmail(email)))
    throw new Error(
      "Enter valid comma-separated email addresses (maximum 50).",
    );
  return rows;
}

function wallParts(date, timezone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function zonedDateTimeToUtc(wall, timezone = "Africa/Lusaka") {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(wall || ""),
  );
  if (!match) throw new Error("Enter a valid date and time.");
  const values = match.slice(1).map((value) => Number(value || 0));
  const target = Date.UTC(
    values[0],
    values[1] - 1,
    values[2],
    values[3],
    values[4],
    values[5],
  );
  const expected = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || "00"}`;
  const sameWall = (date) => {
    const p = wallParts(date, timezone);
    return (
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` ===
      expected
    );
  };
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const p = wallParts(new Date(instant), timezone);
    instant +=
      target -
      Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute),
        Number(p.second),
      );
  }
  if (!sameWall(new Date(instant)))
    throw new Error("This date/time does not exist in the selected timezone.");
  if (
    sameWall(new Date(instant - 3600000)) ||
    sameWall(new Date(instant + 3600000))
  )
    throw new Error(
      "This time occurs twice because of daylight saving. Choose another time.",
    );
  return new Date(instant);
}

export function utcSql(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid date.");
  return value.toISOString().slice(0, 19).replace("T", " ");
}

// SQL datetimes without an offset are stored in UTC.
function campaignInstant(value) {
  return new Date(
    typeof value === "string" && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value,
  );
}

export function campaignDate(value, timezone = "Africa/Lusaka") {
  if (!value) return "Not Yet Scheduled";
  const date = campaignInstant(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function campaignDay(value, timezone = "Africa/Lusaka") {
  const date = value ? campaignInstant(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
  }).format(date);
}

export const BOUNCE_REASONS = [
  "Bad Mail Box",
  "Bad Connection",
  "Routing Errors",
  "Relaying Issues",
  "Inactive Mail box",
  "Bad Domain",
  "Protocol Errors",
  "Spam Related",
  "Policy Related",
  "No Answer From Host",
  "Content Related",
  "Other",
];
