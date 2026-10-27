import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Ban, Download, Search, UserMinus, UserRound } from "lucide-react";
import { Card, DataTable } from "../../ui";
import {
  campaignDate,
  UNSUBSCRIBE_REASONS,
  BOUNCE_REASONS,
} from "../../../../shared/campaignWorkspace";
import { downloadCsv } from "../../../utils/campaignWorkspaceApi";
import CampaignTabs from "./CampaignTabs";
import CampaignPagination from "./CampaignPagination";
import { BTN_SECONDARY, INPUT_SM } from "./campaignStyles";

const PAGE_SIZE = 25;

export default function CampaignSuppressionView({ data }) {
  const [params] = useSearchParams();
  // `?view=unsubscribed` (from the campaign dashboard) opens the unsubscribe tab.
  const [tab, setTab] = useState(() =>
      params.get("view") === "unsubscribed" ? "unsubscribed" : "bounced",
    ),
    [search, setSearch] = useState(""),
    [reason, setReason] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1);
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
          ["profile", "Contact"],
          ["first_name", "First Name"],
          ["last_name", "Last Name"],
          ["email_normalized", "Email"],
          ["bounce_reason", "Bounce Reason"],
          ["date", "Date Created"],
          ["active_member", "Active Member"],
        ]
      : [
          ["profile", "Contact"],
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
  const tableColumns = columns.map(([key, label]) => ({
    key,
    label,
    render: (_v, row) =>
      key === "profile" ? (
        row.contact_id ? (
          <Link
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600"
            to={value(row, key)}
          >
            <UserRound size={14} />
            View profile
          </Link>
        ) : (
          <span className="text-navy-400">—</span>
        )
      ) : (
        <span className="whitespace-nowrap">{value(row, key)}</span>
      ),
  }));
  const resetPage = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };
  return (
    <Card>
      <CampaignTabs
        className="mb-5"
        label="Suppression list"
        value={tab}
        onChange={(id) => {
          setTab(id);
          setReason("");
          setPage(1);
        }}
        tabs={[
          {
            key: "bounced",
            label: "Suppressed by bounce",
            icon: Ban,
            count: (data.bounced || []).length,
          },
          {
            key: "unsubscribed",
            label: "Unsubscribed",
            icon: UserMinus,
            count: (data.unsubscribed || []).length,
          },
        ]}
      />
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none"
          />
          <input
            aria-label="Search suppressed contacts"
            className={`${INPUT_SM} pl-9`}
            value={search}
            placeholder="Search name or email"
            onChange={resetPage(setSearch)}
          />
        </div>
        <select
          aria-label="Suppression reason"
          className={`${INPUT_SM} lg:w-56`}
          value={reason}
          onChange={resetPage(setReason)}
        >
          <option value="">
            {tab === "bounced"
              ? "All bounce reasons"
              : "All unsubscribe reasons"}
          </option>
          {(tab === "bounced" ? BOUNCE_REASONS : UNSUBSCRIBE_REASONS).map(
            (item) => (
              <option key={item}>{item}</option>
            ),
          )}
        </select>
        <label className="text-xs font-medium text-navy-600 lg:w-40">
          From date
          <input
            className={`${INPUT_SM} mt-1`}
            type="date"
            value={from}
            onChange={resetPage(setFrom)}
          />
        </label>
        <label className="text-xs font-medium text-navy-600 lg:w-40">
          To date
          <input
            className={`${INPUT_SM} mt-1`}
            type="date"
            value={to}
            onChange={resetPage(setTo)}
          />
        </label>
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              `suppression-${tab}.csv`,
              columns.map(([, name]) => name),
              rows.map((row) => columns.map(([key]) => value(row, key))),
            )
          }
        >
          <Download size={15} />
          Export
        </button>
      </div>
      <DataTable
        columns={tableColumns}
        data={rows
          .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
          .map((row) => ({
            ...row,
            id: `${row.email_normalized}-${row.reason || "unsubscribe"}`,
          }))}
        emptyTitle="No suppressed contacts"
        emptyDescription="No contacts match these filters."
      />
      <CampaignPagination
        page={page}
        perPage={PAGE_SIZE}
        total={rows.length}
        onPageChange={setPage}
        noun="contacts"
      />
    </Card>
  );
}
