import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../ui";
import {
  campaignDate,
  UNSUBSCRIBE_REASONS,
  BOUNCE_REASONS,
} from "../../../../shared/campaignWorkspace";
import { downloadCsv } from "../../../utils/campaignWorkspaceApi";
export default function CampaignSuppressionView({ data }) {
  const [tab, setTab] = useState("bounced"),
    [search, setSearch] = useState(""),
    [reason, setReason] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(0);
  const date = (row) =>
    tab === "bounced"
      ? row.last_bounced_at || row.created_at
      : row.unsubscribed_at;
  const rows = (data[tab] || []).filter(
    (row) =>
      `${row.first_name || ""} ${row.last_name || ""} ${row.email_normalized}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!reason ||
        (tab === "bounced"
          ? row.bounce_reason || "Other"
          : row.unsubscribe_reason) === reason) &&
      (!from || String(date(row)).slice(0, 10) >= from) &&
      (!to || String(date(row)).slice(0, 10) <= to),
  );
  const columns =
    tab === "bounced"
      ? [
          ["profile", "Actions"],
          ["first_name", "First Name"],
          ["last_name", "Last Name"],
          ["email_normalized", "Email"],
          ["bounce_reason", "Bounce Reason"],
          ["date", "Date Created"],
          ["active_member", "Active Member"],
        ]
      : [
          ["profile", "View Contact Profile"],
          ["first_name", "First Name"],
          ["last_name", "Last Name"],
          ["email_normalized", "Email"],
          ["phone", "Phone"],
          ["company", "Company"],
          ["unsubscribe_reason", "Unsubscribed Reason"],
          ["unsubscribe_details", "Unsubscribed Details"],
          ["date", "Unsubscribed Date"],
        ];
  const value = (row, key) =>
    key === "date"
      ? campaignDate(date(row))
      : key === "profile"
        ? row.contact_id
          ? `/admin/campaigns/manage/contacts?contact=${row.contact_id}`
          : ""
        : key === "active_member"
          ? row.active_member
            ? "Yes"
            : "No"
          : key === "bounce_reason"
            ? row.bounce_reason || "Other"
            : row[key] || "—";
  return (
    <Card>
      <div className="flex gap-5 border-b mb-5">
        {[
          ["bounced", "Suppressed by Bounce"],
          ["unsubscribed", "Unsubscribed"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`pb-3 text-sm ${tab === id ? "text-blue-600 border-b-2 border-blue-600" : ""}`}
            onClick={() => {
              setTab(id);
              setReason("");
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          aria-label="Search suppressed contacts"
          className="border rounded-lg p-2 text-sm flex-1 min-w-36"
          value={search}
          placeholder="Search name or email"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Suppression reason"
          className="border rounded-lg p-2 text-sm"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setPage(0);
          }}
        >
          <option value="">
            {tab === "bounced"
              ? "All Bounce Reasons"
              : "All Unsubscribe Reasons"}
          </option>
          {(tab === "bounced" ? BOUNCE_REASONS : UNSUBSCRIBE_REASONS).map(
            (item) => (
              <option key={item}>{item}</option>
            ),
          )}
        </select>
        <label className="text-xs">
          From Date
          <input
            className="block border rounded p-1"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="text-xs">
          To Date
          <input
            className="block border rounded p-1"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <button
          className="border rounded-lg px-4 text-sm"
          onClick={() =>
            downloadCsv(
              `suppression-${tab}.csv`,
              columns.map(([, name]) => name),
              rows.map((row) => columns.map(([key]) => value(row, key))),
            )
          }
        >
          Export
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th
                  className="p-3 text-left border-b whitespace-nowrap"
                  key={key}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 25, page * 25 + 25).map((row) => (
              <tr
                key={`${row.email_normalized}-${row.reason || "unsubscribe"}`}
              >
                {columns.map(([key]) => (
                  <td key={key} className="p-3 border-b whitespace-nowrap">
                    {key === "profile" && row.contact_id ? (
                      <Link className="text-blue-600" to={value(row, key)}>
                        View Contact Profile
                      </Link>
                    ) : (
                      value(row, key)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-8 text-sm text-navy-500">
            No contacts match these filters.
          </p>
        )}
      </div>
      <div className="flex justify-between text-sm mt-4">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          {rows.length} contacts · Page {page + 1} of{" "}
          {Math.max(1, Math.ceil(rows.length / 25))}
        </span>
        <button
          disabled={(page + 1) * 25 >= rows.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </Card>
  );
}
