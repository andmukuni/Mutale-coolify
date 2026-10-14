import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Ban,
  Download,
  ExternalLink,
  Link2,
  MailCheck,
  MailOpen,
  MousePointerClick,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Settings2,
  UserMinus,
  UserRound,
  Users,
  XCircle,
  Info,
} from "lucide-react";
import {
  PageHeader,
  Card,
  StatusBadge,
  AdminStatCard,
  DataTable,
  Modal,
} from "../../components/ui";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav";
import CampaignTabBar from "../../components/admin/campaigns/CampaignTabBar";
import CampaignPagination from "../../components/admin/campaigns/CampaignPagination";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CHECKBOX,
  INPUT_SM,
} from "../../components/admin/campaigns/campaignStyles";
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
const PAGE_SIZE = 25;
const REPORT_COLUMNS = [
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
];
const columnLabel = (key) =>
  key === "profile"
    ? "Contact"
    : key.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
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
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [columnsOpen, setColumnsOpen] = useState(false),
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
    try {
      localStorage.setItem(
        "mm_campaign_report_columns",
        JSON.stringify(columns),
      );
    } catch {
      // Column preference is a convenience; ignore storage errors.
    }
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
  if (!campaign || !report)
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-navy-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <AdminStatCard key={i} label="" loading />
          ))}
        </div>
      </div>
    );
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
  const reconcile = async (job) => {
    setBusy(true);
    try {
      await campaignRequest(`/${id}/reconcile`, {
        method: "POST",
        body: {
          job_id: job.id,
          provider_message_id: reconcileIds[job.id] || job.provider_message_id,
        },
      });
      await load();
      toast.success("Delivery reconciled.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  const openRate = totals.accepted ? (totals.opened / totals.accepted) * 100 : 0;
  const stats = [
    { label: "Sent", value: totals.accepted, icon: Send, color: "cyan" },
    {
      label: "Delivered",
      value: totals.delivered,
      icon: MailCheck,
      color: "green",
      subtitle: `${percent(totals.delivered)} of sent`,
    },
    {
      label: "Opened",
      value: totals.opened,
      icon: MailOpen,
      color: "blue",
      subtitle: `${percent(totals.opened)} of sent`,
    },
    {
      label: "Clicked",
      value: totals.clicked,
      icon: MousePointerClick,
      color: "purple",
      subtitle: `${percent(totals.clicked)} of sent`,
    },
    {
      label: "Bounced",
      value: totals.bounced,
      icon: AlertTriangle,
      color: "amber",
      subtitle: `${percent(totals.bounced)} of sent`,
    },
    {
      label: "Ignored",
      value: totals.skipped + totals.suppressed,
      icon: Ban,
      color: "navy",
      subtitle: "Skipped or suppressed",
    },
    { label: "Failed", value: totals.failed, icon: XCircle, color: "red" },
    {
      label: "Unsubscribed",
      value: totals.unsubscribed,
      icon: UserMinus,
      color: "navy",
    },
  ];
  const recipientColumns = columns.map((key) => ({
    key,
    label: columnLabel(key),
    render: (_v, row) => {
      if (key === "profile")
        return row.contact_id ? (
          <Link
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600"
            to={values(row).profile}
          >
            <UserRound size={14} />
            View profile
          </Link>
        ) : (
          <span className="text-navy-400">—</span>
        );
      if (key === "status")
        return row.outcome ? <StatusBadge status={row.outcome} /> : "—";
      return (
        <span className="whitespace-nowrap">{values(row)[key] || "—"}</span>
      );
    },
  }));
  const linkColumns = [
    {
      key: "label",
      label: "Link",
      render: (v) => <span className="font-medium text-navy-900">{v}</span>,
    },
    {
      key: "destination",
      label: "URL",
      render: (v) => (
        <a
          href={v}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-start gap-1 text-cyan-700 hover:text-cyan-600 break-all max-w-md"
        >
          {v}
          <ExternalLink size={12} className="shrink-0 mt-1" />
        </a>
      ),
    },
    {
      key: "clicks",
      label: "Clicks",
      align: "right",
      render: (v) => <span className="tabular-nums">{v}</span>,
    },
    {
      key: "unique_clicks",
      label: "Unique clicks",
      align: "right",
      render: (v) => <span className="tabular-nums">{v}</span>,
    },
  ];
  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title={campaign.name}
          subtitle={campaign.subject}
          breadcrumbs={[
            { label: "Admin", to: "/admin" },
            { label: "Campaigns", to: "/admin/campaigns?tab=sent" },
            { label: "Report" },
          ]}
          actions={
            <>
              <StatusBadge status={campaign.state} size="md" />
              <Link to={`/admin/campaigns/${id}`} className={BTN_SECONDARY}>
                <Pencil size={15} />
                View campaign
              </Link>
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() =>
                  void downloadCampaignReport(id).catch((error) =>
                    toast.error(error.message),
                  )
                }
              >
                <Download size={15} />
                Download report
              </button>
            </>
          }
        />
        <CampaignWorkspaceNav />
      </div>
      <Card>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 text-sm">
          {[
            ["Sender", `${campaign.from_name} <${campaign.from_email}>`],
            [
              "Sent date",
              campaign.send_started_at
                ? campaignDate(campaign.send_started_at)
                : "Not yet sent",
            ],
            [
              "List sent to",
              (campaign.audience?.include || [])
                .map(
                  (rule) =>
                    groups.find((group) => group.id === rule.id)?.name ||
                    `${rule.source.replaceAll("_", " ")}${rule.filter && rule.filter !== "all" ? ` (${rule.filter.replaceAll("_", " ")})` : ""}`,
                )
                .join(", ") || "Event registrants",
            ],
            [
              "List excluded",
              (campaign.audience?.exclude || [])
                .map(
                  (rule) =>
                    groups.find((group) => group.id === rule.id)?.name ||
                    rule.source.replaceAll("_", " "),
                )
                .join(", ") || "None",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-navy-400">
                {label}
              </dt>
              <dd className="mt-1 text-navy-800 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {!!unknown.length && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-xl bg-white/70 text-amber-700 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-amber-900">
                Delivery needs reconciliation
              </h2>
              <p className="text-sm text-amber-900/80 mt-1">
                The provider response was interrupted for {unknown.length}{" "}
                messages. These messages will not be sent again automatically.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {unknown.map((job) => (
              <div
                key={job.id}
                className="app-card rounded-xl border border-amber-100 bg-white p-4 text-sm"
              >
                <p className="text-navy-800">{job.last_error}</p>
                <p className="text-xs text-navy-500 mt-1">
                  {job.provider_message_id ||
                    "Provider message ID unavailable; check the provider log."}
                </p>
                {hasPermission("campaigns.send") && (
                  <div className="flex flex-col sm:flex-row gap-2 mt-3">
                    <input
                      aria-label={`Provider message ID for ${job.id}`}
                      placeholder="Message ID from the provider log"
                      className={INPUT_SM}
                      value={
                        reconcileIds[job.id] || job.provider_message_id || ""
                      }
                      onChange={(e) =>
                        setReconcileIds((old) => ({
                          ...old,
                          [job.id]: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      disabled={busy}
                      className={`${BTN_SECONDARY} shrink-0`}
                      onClick={() => reconcile(job)}
                    >
                      <RefreshCw size={15} />
                      Check provider and reconcile
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <CampaignTabBar
        className="app-card bg-white rounded-2xl border border-navy-100 shadow-sm px-1"
        label="Report sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "summary", label: "Summary", icon: BarChart3 },
          {
            key: "recipients",
            label: "Recipients",
            icon: Users,
            count: report.recipients.length,
          },
          {
            key: "links",
            label: "Link activity",
            icon: Link2,
            count: report.links.length,
          },
        ]}
      />
      {tab === "summary" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <AdminStatCard
                key={stat.label}
                {...stat}
                value={stat.value ?? 0}
                animationDelay={index * 60}
              />
            ))}
          </div>
          <Card title="Campaign summary">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <div
                role="img"
                aria-label={`${totals.opened} opened, ${totals.accepted - totals.opened} not opened`}
                className="w-40 h-40 rounded-full shrink-0 grid place-items-center"
                style={{
                  background: `conic-gradient(var(--color-cyan-600) 0 ${openRate}%, var(--app-border) 0 100%)`,
                }}
              >
                <div className="w-28 h-28 rounded-full bg-white grid place-items-center">
                  <div className="text-center">
                    <strong className="text-2xl text-navy-900 tabular-nums">
                      {percent(totals.opened)}
                    </strong>
                    <p className="text-xs text-navy-500">Open rate</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <p className="text-navy-700">
                  <span className="font-semibold text-navy-900 tabular-nums">
                    {totals.included}
                  </span>{" "}
                  selected recipients ·{" "}
                  <span className="font-semibold text-navy-900 tabular-nums">
                    {totals.excluded}
                  </span>{" "}
                  excluded
                </p>
                <p className="text-navy-700">
                  Click-to-open rate:{" "}
                  <span className="font-semibold text-navy-900 tabular-nums">
                    {totals.opened
                      ? `${((totals.clicked / totals.opened) * 100).toFixed(1)}%`
                      : "0%"}
                  </span>
                </p>
                <p className="flex items-start gap-2 text-xs text-navy-500 max-w-md">
                  <Info size={14} className="shrink-0 mt-0.5" />
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
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <select
              aria-label="Recipient status"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              className={`${INPUT_SM} lg:w-64`}
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
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none"
              />
              <input
                aria-label="Search recipients"
                className={`${INPUT_SM} pl-9`}
                placeholder="Search name or email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => setColumnsOpen(true)}
              >
                <Settings2 size={15} />
                Columns
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={!rows.length}
                onClick={() =>
                  downloadCsv(
                    `campaign-${id}-${filter}.csv`,
                    columns,
                    rows.map((row) => columns.map((key) => values(row)[key])),
                  )
                }
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>
          </div>
          <DataTable
            columns={recipientColumns}
            data={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
            emptyTitle="No recipients"
            emptyDescription="No recipients match this filter."
          />
          <CampaignPagination
            page={page}
            perPage={PAGE_SIZE}
            total={rows.length}
            onPageChange={setPage}
            noun="recipients"
          />
        </Card>
      )}
      {tab === "links" && (
        <Card
          title="Link activity"
          subtitle="Clicks on tracked links in this campaign."
          actions={
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={!report.links.length}
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
              <Download size={15} />
              Export CSV
            </button>
          }
        >
          <DataTable
            columns={linkColumns}
            data={report.links}
            emptyTitle="No link activity yet"
            emptyDescription="Links appear after the campaign begins sending."
          />
        </Card>
      )}
      <Modal
        isOpen={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        title="Recipient columns"
        subtitle="Choose which columns appear in the table and CSV export."
        size="lg"
        footer={
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => setColumnsOpen(false)}
          >
            Done
          </button>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {REPORT_COLUMNS.map((key) => (
            <label
              className="flex items-center gap-3 text-sm text-navy-700 rounded-xl border border-navy-100 px-3 py-2.5 hover:bg-navy-50"
              key={key}
            >
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={columns.includes(key)}
                onChange={(e) =>
                  setColumns(
                    e.target.checked
                      ? [...columns, key]
                      : columns.filter((c) => c !== key),
                  )
                }
              />
              {columnLabel(key)}
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
