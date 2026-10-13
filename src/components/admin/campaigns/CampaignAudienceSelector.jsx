import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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
    <div className="divide-y divide-navy-100 border border-navy-100 bg-white">
      {groups.map((group) => (
        <section key={group.name}>
          <button
            type="button"
            onClick={() => setOpen(open === group.name ? "" : group.name)}
            className={`flex items-center justify-between w-full p-4 text-left text-sm font-semibold ${open === group.name ? "bg-blue-50 border-l-2 border-blue-600" : ""}`}
          >
            <span>
              {group.name}
              {value.filter((rule) =>
                group.options.some(
                  (option) => ruleKey(option.rule) === ruleKey(rule),
                ),
              ).length > 0 && (
                <span className="ml-2 bg-blue-600 text-white text-xs rounded-full px-1.5">
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
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </button>
          {open === group.name && (
            <div className="px-6 py-4 space-y-3">
              {group.options.map((option) => (
                <label
                  key={ruleKey(option.rule)}
                  className="flex gap-3 items-start text-sm text-navy-600"
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
                    className="mt-0.5 accent-blue-600"
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
      <div className="flex justify-between items-start gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold">Include Recipients</h2>
          <p className="text-sm text-navy-500 mt-2">
            Please choose from the following lists of contacts. Duplicate
            contacts will be removed.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-navy-500">
            This campaign will be
            <br />
            sent to
          </p>
          <strong className="text-3xl text-navy-900">
            {preview?.included_count ?? "—"}
          </strong>
          <p className="text-xs text-navy-500">Unique Recipients</p>
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
        className="font-semibold text-sm my-6 flex items-center gap-2"
      >
        {excludeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
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
        <details className="mt-6 border rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Advanced Event Filters
          </summary>
          <p className="text-xs text-navy-500 my-3">
            Apply these filters to event registrants. Other included contact
            lists remain independent.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              Selection
              <select
                className="w-full border rounded p-2 mt-1"
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
              <div className="sm:col-span-2 max-h-60 overflow-auto border rounded p-3">
                {(directory.registrants || []).map((row) => (
                  <label className="flex gap-2 text-sm py-2" key={row.id}>
                    <input
                      type="checkbox"
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
                  <label className="text-sm" key={key}>
                    {label}
                    <input
                      className="w-full border rounded p-2 mt-1"
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
                <label className="text-sm">
                  Attended
                  <select
                    className="w-full border rounded p-2 mt-1"
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
                  <label key={key} className="text-sm">
                    {label}
                    <input
                      type="date"
                      disabled={disabled}
                      className="w-full border rounded p-2 mt-1"
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
                <label className="flex gap-2 text-sm items-center">
                  <input
                    type="checkbox"
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
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          className="border rounded-lg px-4 py-2 text-sm hover:bg-navy-50"
          disabled={busy}
          onClick={onPreview}
        >
          {busy ? "Calculating…" : "Preview audience"}
        </button>
        {preview && (
          <p className="text-sm text-navy-500">
            {preview.excluded_count} excluded · Eligibility is checked again
            before sending.
          </p>
        )}
      </div>
      {preview?.excluded?.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="text-navy-500 cursor-pointer">
            View exclusion reasons
          </summary>
          <div className="max-h-48 overflow-y-auto mt-2">
            {preview.excluded.slice(0, 100).map((row, index) => (
              <p
                key={`${row.email}-${index}`}
                className="py-1 text-xs text-navy-500"
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
