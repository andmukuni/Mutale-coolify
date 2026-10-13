import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader, Card, StatusBadge } from "../../components/ui";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav";
import {
  fetchCampaign,
  fetchCampaignReport,
} from "../../utils/emailCampaignsApi";
import {
  campaignRequest,
  campaignDirectory,
  downloadCampaignReport,
  downloadCsv,
} from "../../utils/campaignWorkspaceApi";
import { campaignDate } from "../../../shared/campaignWorkspace";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
const filters = [
  ["all", "All Recipients"],
  ["delivered", "Delivered"],
  ["opened", "Opened"],
  ["not_opened", "Not Opened"],
  ["clicked", "Clicked"],
  ["not_clicked", "Opened but Not Clicked"],
  ["bounced", "Bounced"],
  ["ignored", "Ignored"],
  ["failed", "Failed"],
  ["acceptance_unknown", "Acceptance Unknown"],
  ["excluded", "Excluded"],
];
const matches = (row, filter) =>
  filter === "all" ||
  (filter === "delivered"
    ? row.delivered_at
    : filter === "opened"
      ? row.opened_at
      : filter === "not_opened"
        ? row.delivered_at && !row.opened_at
        : filter === "clicked"
          ? row.clicked_at
          : filter === "not_clicked"
            ? row.opened_at && !row.clicked_at
            : filter === "bounced"
              ? row.bounced_at
              : filter === "ignored"
                ? row.outcome === "skipped" ||
                  (!row.included &&
                    [
                      "hard_bounce",
                      "complaint",
                      "unsubscribed",
                      "no_marketing_consent",
                    ].includes(row.exclude_reason))
                : filter === "excluded"
                  ? !row.included
                  : row.outcome === filter);
export default function CampaignReportPage() {
  const { id } = useParams();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const [campaign, setCampaign] = useState(null),
    [report, setReport] = useState(null),
    [jobs, setJobs] = useState([]),
    [groups, setGroups] = useState([]),
    [reconcileIds, setReconcileIds] = useState({}),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("summary"),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [columns, setColumns] = useState(() => {
      try {
        return (
          JSON.parse(localStorage.getItem("mm_campaign_report_columns")) || [
            "profile",
            "first_name",
            "last_name",
            "email",
            "active_member",
            "status",
            "status_date",
            "opened",
            "clicked",
            "clicks",
          ]
        );
      } catch {
        return [
          "profile",
          "first_name",
          "last_name",
          "email",
          "active_member",
          "status",
          "status_date",
          "opened",
          "clicked",
          "clicks",
        ];
      }
    });
  useEffect(() => {
    localStorage.setItem("mm_campaign_report_columns", JSON.stringify(columns));
  }, [columns]);
  const load = useCallback(async () => {
    const [c, r, j, directory] = await Promise.all([
      fetchCampaign(id),
      fetchCampaignReport(id),
      campaignRequest(`/${id}/jobs`),
      campaignDirectory(),
    ]);
    setCampaign(c.data);
    setReport(r.data);
    setJobs(j);
    setGroups(directory.groups);
  }, [id]);
  useEffect(() => {
    void load().catch((error) => toast.error(error.message));
    const timer = setInterval(() => void load().catch(() => {}), 20000);
    return () => clearInterval(timer);
  }, [load, toast]);
  if (!campaign || !report) return <p>Loading report…</p>;
  const totals = report.totals;
  const percent = (value) =>
    totals.accepted ? `${((value / totals.accepted) * 100).toFixed(1)}%` : "0%";
  const rows = report.recipients.filter(
    (row) =>
      matches(row, filter) &&
      `${row.email_normalized} ${row.display_name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const unknown = jobs.filter((job) => job.status === "acceptance_unknown");
  const values = (row) => ({
    profile: row.contact_id
      ? `/admin/campaigns/manage/contacts?contact=${row.contact_id}`
      : "",
    first_name: row.first_name,
    last_name: row.last_name,
    active_member: row.active_member ? "Yes" : "No",
    status_date: row.status_date ? campaignDate(row.status_date) : "—",
    email: row.email_normalized,
    name: row.display_name,
    status: row.outcome,
    sent: row.sent_at ? campaignDate(row.sent_at) : "—",
    opened: row.opened_at ? campaignDate(row.opened_at) : "—",
    clicked: row.clicked_at ? campaignDate(row.clicked_at) : "—",
    delivered: row.delivered_at ? campaignDate(row.delivered_at) : "—",
    clicks: row.clicks,
    reason: row.exclude_reason || row.error_reason || "",
  });
  return (
    <div>
      <CampaignWorkspaceNav />
      <PageHeader
        title={campaign.name}
        subtitle={campaign.subject}
        breadcrumbs={[
          { label: "Campaigns", to: "/admin/campaigns" },
          { label: "Report" },
        ]}
        actions={<StatusBadge status={campaign.state} />}
      />
      <Card className="mb-6">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <p>
            <span className="text-navy-500">Sender: </span>
            {campaign.from_name} &lt;{campaign.from_email}&gt;
          </p>
          <p>
            <span className="text-navy-500">Sent Date: </span>
            {campaign.send_started_at
              ? campaignDate(campaign.send_started_at)
              : "Not yet sent"}
          </p>
          <p>
            <span className="text-navy-500">List sent to: </span>
            {(campaign.audience?.include || [])
              .map(
                (rule) =>
                  groups.find((group) => group.id === rule.id)?.name ||
                  `${rule.source.replaceAll("_", " ")}${rule.filter && rule.filter !== "all" ? ` (${rule.filter.replaceAll("_", " ")})` : ""}`,
              )
              .join(", ") || "Event registrants"}
          </p>
          <p>
            <span className="text-navy-500">List Excluded: </span>
            {(campaign.audience?.exclude || [])
              .map(
                (rule) =>
                  groups.find((group) => group.id === rule.id)?.name ||
                  rule.source.replaceAll("_", " "),
              )
              .join(", ") || "None"}
          </p>
        </div>
      </Card>
      <div className="flex gap-5 border-b mb-6">
        {["summary", "recipients", "links"].map((value) => (
          <button
            className={`pb-3 text-sm capitalize ${tab === value ? "border-b-2 border-blue-600 text-blue-600" : ""}`}
            key={value}
            onClick={() => setTab(value)}
          >
            {value === "links" ? "Link Activity" : value}
          </button>
        ))}
        <Link
          className="ml-auto text-blue-600 text-sm"
          to={`/admin/campaigns/${id}`}
        >
          View campaign
        </Link>
      </div>
      {tab === "summary" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              ["Sent", totals.accepted],
              ["Delivered", totals.delivered],
              ["Opened", totals.opened],
              ["Clicked", totals.clicked],
              ["Bounced", totals.bounced],
              ["Ignored", totals.skipped + totals.suppressed],
              ["Failed", totals.failed],
              ["Unsubscribed", totals.unsubscribed],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-sm text-navy-500">{label}</p>
                <p className="text-3xl font-semibold mt-2">{value}</p>
                {["Opened", "Clicked", "Bounced"].includes(label) && (
                  <p className="text-xs text-navy-500 mt-1">
                    {percent(value)} of sent
                  </p>
                )}
              </Card>
            ))}
          </div>
          <Card>
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <div
                role="img"
                aria-label={`${totals.opened} opened, ${totals.accepted - totals.opened} not opened`}
                className="w-40 h-40 rounded-full shrink-0 grid place-items-center"
                style={{
                  background: `conic-gradient(#2563eb 0 ${totals.accepted ? (totals.opened / totals.accepted) * 100 : 0}%, #e2e8f0 0 100%)`,
                }}
              >
                <div className="w-28 h-28 rounded-full bg-white grid place-items-center">
                  <div className="text-center">
                    <strong className="text-2xl">
                      {percent(totals.opened)}
                    </strong>
                    <p className="text-xs text-navy-500">Open Rate</p>
                  </div>
                </div>
              </div>
              <div>
                <h2 className="font-semibold mb-3">Campaign Summary</h2>
                <p className="text-sm mb-2">
                  {totals.included} selected recipients · {totals.excluded}{" "}
                  excluded
                </p>
                <p className="text-sm mb-2">
                  Click-to-open rate:{" "}
                  {totals.opened
                    ? `${((totals.clicked / totals.opened) * 100).toFixed(1)}%`
                    : "0%"}
                </p>
                <p className="text-xs text-navy-500">
                  Open and click statistics are estimates. Email privacy
                  protection and automated scanners can affect these figures.
                </p>
              </div>
            </div>
          </Card>
        </>
      )}
      {tab === "recipients" && (
        <Card>
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              aria-label="Recipient status"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
              className="border rounded-lg p-2 text-sm"
            >
              {filters.map(([value, label]) => (
                <option value={value} key={value}>
                  {label} (
                  {
                    report.recipients.filter((row) => matches(row, value))
                      .length
                  }
                  )
                </option>
              ))}
            </select>
            <input
              className="border rounded-lg p-2 text-sm flex-1"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            <button
              className="text-sm border rounded-lg px-3"
              onClick={() =>
                downloadCsv(
                  `campaign-${id}-${filter}.csv`,
                  columns,
                  rows.map((row) => columns.map((key) => values(row)[key])),
                )
              }
            >
              Export CSV
            </button>
            <details className="relative">
              <summary className="text-sm border rounded-lg p-2 cursor-pointer">
                Columns
              </summary>
              <div className="absolute right-0 z-10 bg-white shadow-lg border p-3 w-44">
                {[
                  "profile",
                  "first_name",
                  "last_name",
                  "active_member",
                  "status_date",
                  "email",
                  "name",
                  "status",
                  "sent",
                  "delivered",
                  "opened",
                  "clicked",
                  "clicks",
                  "reason",
                ].map((key) => (
                  <label
                    className="flex gap-2 py-1 text-sm capitalize"
                    key={key.replaceAll("_", " ")}
                  >
                    <input
                      type="checkbox"
                      checked={columns.includes(key)}
                      onChange={(e) =>
                        setColumns(
                          e.target.checked
                            ? [...columns, key]
                            : columns.filter((c) => c !== key),
                        )
                      }
                    />
                    {key.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <p className="text-sm text-navy-500 mb-3">{rows.length} recipients</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {columns.map((key) => (
                    <th key={key} className="text-left capitalize border-b p-3">
                      {key.replaceAll("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 25, page * 25 + 25).map((row) => (
                  <tr key={row.id}>
                    {columns.map((key) => (
                      <td key={key} className="border-b p-3 whitespace-nowrap">
                        {key === "profile" && row.contact_id ? (
                          <Link
                            className="text-blue-600"
                            to={values(row).profile}
                          >
                            View Contact Profile
                          </Link>
                        ) : (
                          values(row)[key] || "—"
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="p-8 text-center text-sm text-navy-500">
                No recipients match this filter.
              </p>
            )}
          </div>
          <div className="flex justify-between mt-4 text-sm">
            <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 25))}
            </span>
            <button
              disabled={(page + 1) * 25 >= rows.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </Card>
      )}
      {tab === "links" && (
        <Card>
          <div className="flex justify-between mb-5">
            <h2 className="font-semibold">Link Activity</h2>
            <button
              className="text-sm text-blue-600"
              onClick={() =>
                downloadCsv(
                  `campaign-${id}-links.csv`,
                  ["Link", "URL", "Clicks", "Unique Clicks"],
                  report.links.map((row) => [
                    row.label,
                    row.destination,
                    row.clicks,
                    row.unique_clicks,
                  ]),
                )
              }
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr>
                  {["Link", "URL", "Clicks", "Unique Clicks"].map((label) => (
                    <th className="text-left p-3 border-b" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.links.map((row) => (
                  <tr key={row.id}>
                    <td className="p-3 border-b">{row.label}</td>
                    <td className="p-3 border-b break-all max-w-sm">
                      <a
                        href={row.destination}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600"
                      >
                        {row.destination}
                      </a>
                    </td>
                    <td className="p-3 border-b">{row.clicks}</td>
                    <td className="p-3 border-b">{row.unique_clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.links.length && (
              <p className="text-sm text-navy-500 p-6">
                Links appear after the campaign begins sending.
              </p>
            )}
          </div>
        </Card>
      )}
      {!!unknown.length && (
        <Card className="mt-6">
          <h2 className="font-semibold text-amber-800 mb-3">
            Delivery needs reconciliation
          </h2>
          <p className="text-sm mb-4">
            The provider response was interrupted for {unknown.length} messages.
            These messages will not be sent again automatically.
          </p>
          {unknown.map((job) => (
            <div key={job.id} className="py-3 border-t text-sm">
              <p>{job.last_error}</p>
              <p className="text-xs text-navy-500 mt-1">
                {job.provider_message_id ||
                  "Provider message ID unavailable; check the provider log."}
              </p>
              {hasPermission("campaigns.send") && (
                <input
                  aria-label={`Provider message ID for ${job.id}`}
                  placeholder="Message ID from the provider log"
                  className="border rounded p-2 mt-3 mr-3 text-sm"
                  value={reconcileIds[job.id] || job.provider_message_id || ""}
                  onChange={(e) =>
                    setReconcileIds((old) => ({
                      ...old,
                      [job.id]: e.target.value,
                    }))
                  }
                />
              )}
              {hasPermission("campaigns.send") && (
                <button
                  disabled={busy}
                  className="text-blue-600 mt-2"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await campaignRequest(`/${id}/reconcile`, {
                        method: "POST",
                        body: {
                          job_id: job.id,
                          provider_message_id:
                            reconcileIds[job.id] || job.provider_message_id,
                        },
                      });
                      await load();
                    } catch (error) {
                      toast.error(error.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Check provider and reconcile
                </button>
              )}
            </div>
          ))}
        </Card>
      )}
      <button
        className="text-sm text-blue-600 mt-5"
        onClick={() =>
          void downloadCampaignReport(id).catch((error) =>
            toast.error(error.message),
          )
        }
      >
        Download complete recipient report
      </button>
    </div>
  );
}
