import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Users,
  UserMinus,
  SlidersHorizontal,
  RefreshCw,
  Info,
} from "lucide-react";
import { Spinner } from "../../ui";
import { BTN_SECONDARY, CHECKBOX, INPUT_SM } from "./campaignStyles";

function ruleKey(rule) {
  return `${rule.source}:${rule.id || ""}:${rule.filter || "all"}`;
}
function AudienceGroups({
  groups,
  value,
  onChange,
  disabled,
  sourceCounts = {},
}) {
  const [open, setOpen] = useState("Contacts");
  return (
    <div className="app-card divide-y divide-navy-100 rounded-2xl border border-navy-100 bg-white overflow-hidden">
      {groups.map((group) => (
        <section key={group.name}>
          <button
            type="button"
            onClick={() => setOpen(open === group.name ? "" : group.name)}
            aria-expanded={open === group.name}
            className={`flex items-center justify-between w-full px-4 py-3.5 text-left text-sm font-semibold text-navy-800 transition-colors border-l-2 ${open === group.name ? "bg-cyan-50/60 border-cyan-600" : "border-transparent hover:bg-navy-50"}`}
          >
            <span>
              {group.name}
              {value.filter((rule) =>
                group.options.some(
                  (option) => ruleKey(option.rule) === ruleKey(rule),
                ),
              ).length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
                  {Object.keys(sourceCounts).length
                    ? value
                        .filter((rule) =>
                          group.options.some(
                            (option) => ruleKey(option.rule) === ruleKey(rule),
                          ),
                        )
                        .reduce(
                          (sum, rule) =>
                            sum + (sourceCounts[ruleKey(rule)] || 0),
                          0,
                        )
                    : "…"}
                </span>
              )}
            </span>
            {open === group.name ? (
              <ChevronDown size={16} className="text-navy-400" />
            ) : (
              <ChevronRight size={16} className="text-navy-400" />
            )}
          </button>
          {open === group.name && (
            <div className="px-5 py-4 space-y-3 bg-white">
              {group.options.map((option) => (
                <label
                  key={ruleKey(option.rule)}
                  className="flex gap-3 items-start text-sm text-navy-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={value.some(
                      (rule) => ruleKey(rule) === ruleKey(option.rule),
                    )}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...value, option.rule]
                          : value.filter(
                              (rule) => ruleKey(rule) !== ruleKey(option.rule),
                            ),
                      )
                    }
                    className={`${CHECKBOX} mt-0.5`}
                  />
                  {option.label}
                </label>
              ))}
              {!group.options.length && (
                <p className="text-sm text-navy-400">
                  No {group.name.toLowerCase()} configured yet.
                </p>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export default function CampaignAudienceSelector({
  directory,
  event,
  type,
  audience,
  onChange,
  preview,
  onPreview,
  disabled,
  busy,
  segment,
  onSegmentChange,
}) {
  const [excludeOpen, setExcludeOpen] = useState(false);
  const groups = directory.groups || [];
  const options = (kind, source = kind) =>
    groups
      .filter((group) => group.kind === kind)
      .map((group) => ({ label: group.name, rule: { source, id: group.id } }));
  const all = [
    {
      name: "Contacts",
      options: [
        { label: "All Contacts", rule: { source: "all_contacts" } },
        {
          label: "All Committee Contacts",
          rule: { source: "all_committee_contacts" },
        },
        { label: "All Subscribers", rule: { source: "all_subscribers" } },
        ...options("contact_list"),
        ...options("subscription"),
      ],
    },
  ];
  if (type !== "regular")
    all.push(
      {
        name: "Event Invitees",
        options: [
          ["all", "All Invitations"],
          ["not_sent", "Not Sent Invitations"],
          ["no_response", "No Response Invitations"],
          ["accepted", "Accepted Invitations"],
          ["declined", "Declined Invitations"],
        ].map(([filter, label]) => ({
          label,
          rule: { source: "event_invitees", filter },
        })),
      },
      {
        name: "Event Registrants",
        options: [
          ["all", "All Attendees"],
          ["pending", "All Approval List Attendees"],
          ["waitlisted", "All Waitlist Attendees"],
          ["unpaid", "All Unpaid Attendees"],
          ["cancelled", "All Canceled Attendees"],
          ["confirmed", "Confirmed Attendees"],
          ["advanced", "Filtered Registrants"],
        ].map(([filter, label]) => ({
          label,
          rule: { source: "event_registrants", filter },
        })),
      },
      {
        name: "Ticket Type",
        options: (event?.booking_type === "both"
          ? ["booking", "subscription"]
          : [event?.booking_type || "subscription"]
        ).map((id) => ({
          label: id === "booking" ? "Booking" : "Subscription",
          rule: { source: "ticket_type", id },
        })),
      },
    );
  all.push(
    { name: "Committees", options: options("committee") },
    {
      name: "Members",
      options: [
        { label: "All Active Members", rule: { source: "all_members" } },
      ],
    },
    { name: "Members by Smart List", options: options("smart_list") },
    { name: "Members by Membership Type", options: options("membership_type") },
    {
      name: "Members within a Committee",
      options: options("committee", "members_committee"),
    },
    {
      name: "Organization Team Members",
      options: [
        { label: "All Organization Team Members", rule: { source: "team" } },
      ],
    },
  );
  const unavailable = [
    ...new Map(
      [...(audience.include || []), ...(audience.exclude || [])].map((rule) => [
        ruleKey(rule),
        rule,
      ]),
    ).values(),
  ].filter(
    (rule) =>
      rule.filter !== "advanced" &&
      !all.some((group) =>
        group.options.some((option) => ruleKey(option.rule) === ruleKey(rule)),
      ),
  );
  if (unavailable.length)
    all.push({
      name: "Unavailable Lists",
      options: unavailable.map((rule) => ({
        label: `${rule.source.replaceAll("_", " ")} (unavailable — uncheck to remove)`,
        rule,
      })),
    });
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-50 text-cyan-600 shrink-0">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-navy-900">
              Include recipients
            </h2>
            <p className="text-sm text-navy-500 mt-1">
              Choose from the following lists of contacts. Duplicate contacts
              are removed automatically.
            </p>
          </div>
        </div>
        <div
          className="shrink-0 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-5 py-3 text-right"
          aria-live="polite"
        >
          <p className="text-xs font-medium text-cyan-800">Will be sent to</p>
          <strong className="block text-3xl font-bold text-navy-900 tabular-nums">
            {preview?.included_count ?? "—"}
          </strong>
          <p className="text-xs text-navy-500">unique recipients</p>
        </div>
      </div>
      <AudienceGroups
        groups={all}
        value={audience.include || []}
        onChange={(include) => onChange({ ...audience, include })}
        disabled={disabled}
        sourceCounts={preview?.source_counts}
      />
      <button
        type="button"
        onClick={() => setExcludeOpen(!excludeOpen)}
        aria-expanded={excludeOpen}
        className="my-6 inline-flex items-center gap-2 text-sm font-semibold text-navy-800 hover:text-cyan-700"
      >
        {excludeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <UserMinus size={16} className="text-navy-400" />
        Exclude recipients
      </button>
      {excludeOpen && (
        <>
          <p className="text-sm text-navy-500 mb-4">
            Contacts in lists you select will be excluded and will not receive
            this campaign.
          </p>
          <AudienceGroups
            groups={all}
            value={audience.exclude || []}
            onChange={(exclude) => onChange({ ...audience, exclude })}
            disabled={disabled}
            sourceCounts={preview?.source_counts}
          />
        </>
      )}
      {type !== "regular" && segment && (
        <details className="mt-6 rounded-2xl border border-navy-100 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-navy-800 inline-flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-navy-400" />
            Advanced event filters
          </summary>
          <p className="text-xs text-navy-500 my-3">
            Apply these filters to event registrants. Other included contact
            lists remain independent.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm font-medium text-navy-700">
              Selection
              <select
                className={`${INPUT_SM} mt-1 font-normal`}
                disabled={disabled}
                value={segment.mode}
                onChange={(e) => {
                  onSegmentChange({ ...segment, mode: e.target.value });
                  onChange({
                    ...audience,
                    include: [
                      ...(audience.include || []).filter(
                        (rule) => rule.source !== "event_registrants",
                      ),
                      { source: "event_registrants", filter: "advanced" },
                    ],
                  });
                }}
              >
                <option value="all">All matching registrants</option>
                <option value="filter">Filter registrants</option>
                <option value="selected">Select specific registrants</option>
              </select>
            </label>
            {segment.mode === "selected" ? (
              <div className="sm:col-span-2 max-h-60 overflow-auto rounded-xl border border-navy-100 divide-y divide-navy-100">
                {(directory.registrants || []).map((row) => (
                  <label
                    className="flex items-center gap-3 text-sm text-navy-700 px-3 py-2.5 hover:bg-navy-50"
                    key={row.id}
                  >
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      disabled={disabled}
                      checked={(segment.registration_ids || []).includes(
                        row.id,
                      )}
                      onChange={(e) =>
                        onSegmentChange({
                          ...segment,
                          registration_ids: e.target.checked
                            ? [...(segment.registration_ids || []), row.id]
                            : segment.registration_ids.filter(
                                (id) => id !== row.id,
                              ),
                        })
                      }
                    />
                    {row.name} · {row.email} · {row.status}
                  </label>
                ))}
              </div>
            ) : (
              <>
                {[
                  ["status", "Status (comma separated)"],
                  ["payment_status", "Payment Status (comma separated)"],
                  ["registration_type", "Registration Type (comma separated)"],
                  ["attendee_type", "Attendee Type (comma separated)"],
                ].map(([key, label]) => (
                  <label className="text-sm font-medium text-navy-700" key={key}>
                    {label}
                    <input
                      className={`${INPUT_SM} mt-1 font-normal`}
                      disabled={disabled}
                      value={(segment.filters[key] || []).join(", ")}
                      onChange={(e) => {
                        onSegmentChange({
                          ...segment,
                          mode: "filter",
                          filters: {
                            ...segment.filters,
                            [key]: e.target.value
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean),
                          },
                        });
                        onChange({
                          ...audience,
                          include: [
                            ...(audience.include || []).filter(
                              (rule) => rule.source !== "event_registrants",
                            ),
                            { source: "event_registrants", filter: "advanced" },
                          ],
                        });
                      }}
                    />
                  </label>
                ))}
                <label className="text-sm font-medium text-navy-700">
                  Attended
                  <select
                    className={`${INPUT_SM} mt-1 font-normal`}
                    disabled={disabled}
                    value={segment.filters.attended || "any"}
                    onChange={(e) =>
                      onSegmentChange({
                        ...segment,
                        filters: {
                          ...segment.filters,
                          attended: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="any">Any</option>
                    <option value="yes">Attended</option>
                    <option value="no">Not Attended</option>
                  </select>
                </label>
                {[
                  ["registered_from", "Registered From"],
                  ["registered_to", "Registered To"],
                ].map(([key, label]) => (
                  <label key={key} className="text-sm font-medium text-navy-700">
                    {label}
                    <input
                      type="date"
                      disabled={disabled}
                      className={`${INPUT_SM} mt-1 font-normal`}
                      value={segment.filters[key] || ""}
                      onChange={(e) =>
                        onSegmentChange({
                          ...segment,
                          filters: {
                            ...segment.filters,
                            [key]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
                <label className="flex gap-2 text-sm text-navy-700 items-center">
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    disabled={disabled}
                    checked={!!segment.filters.include_cancelled}
                    onChange={(e) =>
                      onSegmentChange({
                        ...segment,
                        filters: {
                          ...segment.filters,
                          include_cancelled: e.target.checked,
                        },
                      })
                    }
                  />
                  Include canceled registrations
                </label>
              </>
            )}
          </div>
        </details>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={busy}
          onClick={onPreview}
        >
          {busy ? <Spinner size={15} /> : <RefreshCw size={15} />}
          {busy ? "Calculating…" : "Preview audience"}
        </button>
        {preview && (
          <p className="inline-flex items-center gap-1.5 text-sm text-navy-500">
            <Info size={14} />
            {preview.excluded_count} excluded · Eligibility is checked again
            before sending.
          </p>
        )}
      </div>
      {preview?.excluded?.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="text-cyan-700 hover:text-cyan-600 font-medium cursor-pointer">
            View exclusion reasons
          </summary>
          <div className="max-h-48 overflow-y-auto mt-2 rounded-xl border border-navy-100 divide-y divide-navy-100">
            {preview.excluded.slice(0, 100).map((row, index) => (
              <p
                key={`${row.email}-${index}`}
                className="px-3 py-2 text-xs text-navy-600"
              >
                {row.email || "Missing email"} —{" "}
                {row.reason.replaceAll("_", " ")}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
