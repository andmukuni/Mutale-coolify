import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MoreVertical,
  MailOpen,
  Megaphone,
  Plus,
  Search,
  Settings2,
  Eye,
  Smartphone,
  Copy,
  Trash2,
  Undo2,
  Pencil,
  BarChart3,
  FileEdit,
  CalendarClock,
  Send,
  Archive,
  RefreshCw,
} from "lucide-react";
import {
  PageHeader,
  Modal,
  DataTable,
  ConfirmDialog,
  StatusBadge,
} from "../../components/ui";
import EmptyState from "../../components/EmptyState";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  CAMPAIGN_TYPES,
  campaignDate,
} from "../../../shared/campaignWorkspace.js";
import {
  fetchCampaigns,
  createCampaign,
  duplicateCampaign,
} from "../../utils/emailCampaignsApi";
import {
  campaignAction,
  campaignPreview,
} from "../../utils/campaignWorkspaceApi";
import CampaignCreateModal from "../../components/admin/campaigns/CampaignCreateModal";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav";
import CampaignTabs from "../../components/admin/campaigns/CampaignTabs";
import CampaignPagination from "../../components/admin/campaigns/CampaignPagination";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_ICON,
  CHECKBOX,
  INPUT_SM,
} from "../../components/admin/campaigns/campaignStyles";

const columns = [
  ["name", "Campaign"],
  ["state", "Status"],
  ["campaign_type", "Type"],
  ["scheduled_at_utc", "Scheduled"],
  ["scheduled_by", "Scheduled By"],
  ["template_name", "Template"],
  ["recipients", "Recipients"],
  ["opened", "Opened"],
  ["clicked", "Clicked"],
  ["bounced", "Bounced"],
  ["ignored", "Ignored"],
  ["open_rate", "Open Rate"],
  ["click_rate", "Click Rate"],
  ["click_open_rate", "Click to Open"],
  ["created_at", "Created"],
  ["creator_name", "Created By"],
  ["subject", "Subject"],
];
const defaultColumns = [
  "name",
  "state",
  "campaign_type",
  "scheduled_at_utc",
  "recipients",
  "opened",
  "clicked",
  "created_at",
];
const NUMERIC = new Set([
  "recipients",
  "opened",
  "clicked",
  "bounced",
  "ignored",
  "open_rate",
  "click_rate",
  "click_open_rate",
]);
const COLUMNS_KEY = "mm_campaign_columns_v2";
const typeIcons = {
  regular: Send,
  event_notification: CalendarClock,
  event_invitation: MailOpen,
};
const percent = (part, whole) =>
  whole ? Math.round((Number(part || 0) / Number(whole)) * 100) : 0;
const shortDate = (value) => {
  if (!value) return null;
  const formatted = campaignDate(value);
  return formatted === "—" ? null : formatted;
};

function RateCell({ count, rate }) {
  return (
    <div className="inline-flex flex-col items-end gap-1 min-w-[4.5rem]">
      <span className="tabular-nums text-navy-900">
        {count ?? 0}
        <span className="ml-1 text-xs text-navy-400">{rate}%</span>
      </span>
      <span className="h-1 w-16 rounded-full bg-navy-100 overflow-hidden">
        <span
          className="block h-full rounded-full bg-cyan-500"
          style={{ width: `${Math.min(100, rate)}%` }}
        />
      </span>
    </div>
  );
}
const STATUS_TABS = [
  { key: "draft", label: "Drafts", icon: FileEdit },
  { key: "scheduled", label: "Scheduled", icon: CalendarClock },
  { key: "sent", label: "Sent", icon: Send },
];
const EDITABLE_STATES = ["draft", "scheduled", "paused", "cancelled"];

function storedColumns() {
  try {
    const value = JSON.parse(localStorage.getItem(COLUMNS_KEY));
    return Array.isArray(value)
      ? value.filter((id) => columns.some(([key]) => key === id))
      : defaultColumns;
  } catch {
    return defaultColumns;
  }
}

const menuItem =
  "flex items-center gap-2 px-3 py-2 w-full text-left rounded-lg text-navy-700 hover:bg-navy-50";

export default function CampaignsListPage() {
  const { events } = useData();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "draft";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [event, setEvent] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [menu, setMenu] = useState("");
  const [menuPosition, setMenuPosition] = useState(120);
  const [displayed, setDisplayed] = useState(storedColumns);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [remove, setRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [archived, setArchived] = useState(false);
  const canManage = hasPermission("campaigns.manage");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchCampaigns({
        tab,
        eventId: event,
        type,
        search,
        archived,
      });
      setRows(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, event, type, search, archived]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [tab, event, type, search, archived]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => {
      if (!e.target.closest?.("[data-campaign-menu]")) setMenu("");
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const openPreview = async (row, isMobile = false) => {
    setMenu("");
    try {
      const result = await campaignPreview(row.id);
      setMobile(isMobile);
      setPreview({ ...result, name: row.name });
    } catch (err) {
      toast.error(err.message);
    }
  };
  const handleRemove = async () => {
    setRemoving(true);
    try {
      await campaignAction(remove.id, "archive");
      setRemove(null);
      await load();
      toast.success(
        "Campaign deleted. You can restore it from Deleted campaigns.",
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoving(false);
    }
  };

  const showColumns = displayed.length ? displayed : ["name"];
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );
  const editable = (row) => EDITABLE_STATES.includes(row.state);
  const destination = (row) =>
    `/admin/campaigns/${row.id}${editable(row) ? "" : "/report"}`;
  const cell = (row, key) => {
    const base = Number(row.sent || row.recipients || 0);
    if (key === "name")
      return (
        <div className="min-w-[14rem] max-w-[22rem]">
          <Link
            className="block truncate font-medium text-navy-900 hover:text-cyan-700"
            to={destination(row)}
            title={row.name}
          >
            {row.name}
          </Link>
          <p
            className="truncate text-xs text-navy-500 mt-0.5"
            title={row.subject || ""}
          >
            {row.subject || "No subject yet"}
          </p>
        </div>
      );
    if (key === "state") return <StatusBadge status={row.state} />;
    if (key === "campaign_type") {
      const Icon = typeIcons[row.campaign_type] || Megaphone;
      return (
        <span className="inline-flex items-center gap-1.5 text-navy-700">
          <Icon size={14} className="text-cyan-600 shrink-0" />
          {CAMPAIGN_TYPES.find((item) => item.id === row.campaign_type)
            ?.name || "Event Notification"}
        </span>
      );
    }
    if (key === "scheduled_at_utc") {
      const value = shortDate(
        tab === "sent" ? row.send_started_at : row.scheduled_at_utc,
      );
      return value || <span className="text-navy-400">Not scheduled</span>;
    }
    if (key === "scheduled_by")
      return (
        (tab === "sent" ? row.sent_by_name : row.scheduler_name) || (
          <span className="text-navy-400">—</span>
        )
      );
    if (key === "created_at")
      return (
        <div>
          <span>{String(row.created_at || "").slice(0, 10) || "—"}</span>
          {row.creator_name && !showColumns.includes("creator_name") && (
            <p className="text-xs text-navy-400 mt-0.5">
              by {row.creator_name}
            </p>
          )}
        </div>
      );
    if (key === "opened")
      return <RateCell count={row.opened} rate={percent(row.opened, base)} />;
    if (key === "clicked")
      return (
        <RateCell count={row.clicked} rate={percent(row.clicked, base)} />
      );
    if (key === "open_rate") return `${percent(row.opened, row.sent)}%`;
    if (key === "click_rate") return `${percent(row.clicked, row.sent)}%`;
    if (key === "click_open_rate")
      return `${percent(row.clicked, row.opened)}%`;
    if (NUMERIC.has(key)) return Number(row[key] || 0).toLocaleString();
    return row[key] || <span className="text-navy-400">—</span>;
  };
  const rowActions = (row) => (
    <div className="relative flex justify-end" data-campaign-menu>
      <button
        type="button"
        aria-label={`Actions for ${row.name}`}
        aria-expanded={menu === row.id}
        onClick={(e) => {
          setMenuPosition(e.currentTarget.getBoundingClientRect().bottom + 4);
          setMenu(menu === row.id ? "" : row.id);
        }}
        className={BTN_ICON}
      >
        <MoreVertical size={18} />
      </button>
      {menu === row.id && (
        <div
          role="menu"
          className="app-card fixed bg-white border border-navy-100 shadow-lg rounded-xl min-w-52 z-50 p-1 text-sm"
          style={{
            right: 24,
            top: Math.min(window.innerHeight - 280, menuPosition),
          }}
        >
          <Link role="menuitem" to={destination(row)} className={menuItem}>
            {editable(row) ? <Pencil size={15} /> : <BarChart3 size={15} />}
            {editable(row) ? "Edit" : "View report"}
          </Link>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={() => openPreview(row)}
          >
            <Eye size={15} />
            Preview
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={() => openPreview(row, true)}
          >
            <Smartphone size={15} />
            Preview on mobile
          </button>
          {canManage && (
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              onClick={async () => {
                setMenu("");
                try {
                  const result = await duplicateCampaign(row.id);
                  navigate(`/admin/campaigns/${result.data.id}`);
                } catch (err) {
                  toast.error(err.message);
                }
              }}
            >
              <Copy size={15} />
              Duplicate
            </button>
          )}
          {canManage && row.archived_at && (
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              onClick={async () => {
                setMenu("");
                try {
                  await campaignAction(row.id, "restore");
                  await load();
                  toast.success("Campaign restored.");
                } catch (err) {
                  toast.error(err.message);
                }
              }}
            >
              <Undo2 size={15} />
              Restore
            </button>
          )}
          {canManage && ["draft", "cancelled"].includes(row.state) && (
            <>
              <div className="my-1 border-t border-navy-100" />
              <button
                type="button"
                role="menuitem"
                className="flex items-center gap-2 px-3 py-2 w-full text-left rounded-lg text-red-600 hover:bg-red-50"
                onClick={() => {
                  setRemove(row);
                  setMenu("");
                }}
              >
                <Trash2 size={15} />
                Delete campaign
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  const shownColumns = columns.filter(([id]) => showColumns.includes(id));
  const headerLabel = (id, label) =>
    tab === "sent" && id === "scheduled_at_utc"
      ? "Sent"
      : tab === "sent" && id === "scheduled_by"
        ? "Sent By"
        : label;

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title="Campaigns"
          subtitle="Plan, send and track email campaigns to contacts and event audiences."
          breadcrumbs={[
            { label: "Admin", to: "/admin" },
            { label: "Campaigns" },
          ]}
          actions={
            <>
              <button
                type="button"
                onClick={() => void load()}
                className={BTN_SECONDARY}
              >
                <RefreshCw size={15} />
                Refresh
              </button>
              {canManage && (
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={15} />
                  Create campaign
                </button>
              )}
            </>
          }
        />
        <CampaignWorkspaceNav />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <CampaignTabs
          label="Campaign status"
          tabs={STATUS_TABS}
          value={archived ? "" : tab}
          onChange={(key) => {
            setArchived(false);
            setParams({ tab: key });
            setMenu("");
          }}
        />
        {canManage && (
          <button
            type="button"
            className={
              archived
                ? BTN_SECONDARY.replace("bg-white", "bg-navy-100")
                : BTN_SECONDARY
            }
            aria-pressed={archived}
            onClick={() => setArchived(!archived)}
          >
            <Archive size={15} />
            {archived ? "Back to active campaigns" : "Deleted campaigns"}
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative md:w-72">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none"
          />
          <input
            aria-label="Search campaigns"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns"
            className={`${INPUT_SM} pl-9`}
          />
        </div>
        <select
          aria-label="Campaign type filter"
          className={`${INPUT_SM} md:w-56`}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All campaign types</option>
          {CAMPAIGN_TYPES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Event filter"
          className={`${INPUT_SM} md:w-64`}
          value={event}
          onChange={(e) => setEvent(e.target.value)}
        >
          <option value="">All events</option>
          {events.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="Manage displayed columns"
          onClick={() => setColumnsOpen(true)}
          className={`${BTN_SECONDARY} md:ml-auto`}
        >
          <Settings2 size={15} />
          Columns
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}

      <div>
        {loading ? (
          <DataTable
            columns={shownColumns.map(([key, label]) => ({ key, label }))}
            loading
          />
        ) : !rows.length ? (
          <div className="app-card bg-white rounded-2xl border border-navy-100 p-8">
            <EmptyState
              icon={Megaphone}
              title={archived ? "No deleted campaigns" : `No ${tab} campaigns`}
              description={
            archived
              ? "Campaigns you delete will appear here so they can be restored."
              : tab === "draft"
                ? "Create a campaign to start building your next email."
                : `Campaigns appear here once they are ${tab}.`
              }
              action={
            canManage && tab === "draft" && !archived ? (
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={15} />
                Create campaign
              </button>
            ) : null
              }
            />
          </div>
        ) : (
          <div className="app-card bg-white rounded-2xl border border-navy-100 shadow-sm overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-100 bg-navy-50">
                    {shownColumns.map(([id, label]) => (
                      <th
                        key={id}
                        scope="col"
                        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-navy-500 whitespace-nowrap ${
                          NUMERIC.has(id) ? "text-right" : "text-left"
                        }`}
                      >
                        {headerLabel(id, label)}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="sticky right-0 bg-navy-50 px-2 py-3 w-12"
                    >
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className="group hover:bg-navy-50/60 transition-colors"
                    >
                      {shownColumns.map(([id]) => (
                        <td
                          key={id}
                          className={`px-4 py-3.5 align-middle text-navy-700 ${
                            id === "name" ? "" : "whitespace-nowrap"
                          } ${NUMERIC.has(id) ? "text-right tabular-nums" : ""}`}
                        >
                          {cell(row, id)}
                        </td>
                      ))}
                      <td className="sticky right-0 bg-white group-hover:bg-navy-50 px-2 py-3.5 transition-colors">
                        {rowActions(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-navy-100">
              {visible.map((row) => (
                <li key={row.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">{cell(row, "name")}</div>
                    {rowActions(row)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-navy-500">
                    <StatusBadge status={row.state} />
                    {cell(row, "campaign_type")}
                    <span>{cell(row, "scheduled_at_utc")}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-navy-50 p-3 text-center">
                    {[
                      ["Recipients", row.recipients],
                      ["Opened", row.opened],
                      ["Clicked", row.clicked],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[11px] uppercase tracking-wide text-navy-400">
                          {label}
                        </dt>
                        <dd className="text-sm font-semibold text-navy-900 tabular-nums">
                          {Number(value || 0).toLocaleString()}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!loading && (
          <CampaignPagination
            page={currentPage}
            perPage={perPage}
            total={rows.length}
            onPageChange={setPage}
            noun="campaigns"
            perPageOptions={[20, 50, 100]}
            onPerPageChange={(value) => {
              setPerPage(value);
              setPage(1);
            }}
          />
        )}
      </div>

      <CampaignCreateModal
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        events={events}
        onCreate={async (payload) => {
          const result = await createCampaign(payload);
          navigate(`/admin/campaigns/${result.data.id}`);
        }}
      />
      <Modal
        isOpen={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        title="Displayed columns"
        subtitle="Choose which columns appear in the campaign list."
        size="lg"
        footer={
          <>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => {
                setDisplayed(defaultColumns);
                try {
                  localStorage.removeItem(COLUMNS_KEY);
                } catch {
                  // Ignore storage errors.
                }
              }}
            >
              Reset to default
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => setColumnsOpen(false)}
            >
              Done
            </button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {columns.map(([id, label]) => (
            <label
              key={id}
              className="flex items-center gap-3 text-sm text-navy-700 rounded-xl border border-navy-100 px-3 py-2.5 hover:bg-navy-50"
            >
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={displayed.includes(id)}
                disabled={id === "name"}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...displayed, id]
                    : displayed.filter((key) => key !== id);
                  setDisplayed(next);
                  try {
                    localStorage.setItem(
                      COLUMNS_KEY,
                      JSON.stringify(next),
                    );
                  } catch {
                    // Column preference is a convenience; ignore storage errors.
                  }
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </Modal>
      <Modal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name}
        subtitle={mobile ? "Mobile preview (375px)" : "Desktop preview"}
        size="xl"
      >
        <div className={mobile ? "max-w-[375px] mx-auto" : ""}>
          <iframe
            title="Campaign preview"
            sandbox=""
            className="w-full h-[65vh] bg-white rounded-xl border border-navy-100"
            srcDoc={preview?.html || ""}
          />
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(remove)}
        onClose={() => !removing && setRemove(null)}
        onConfirm={handleRemove}
        loading={removing}
        title="Delete campaign"
        message={`Remove “${remove?.name || ""}” from the active campaign list? You can restore it from Deleted campaigns.`}
        confirmLabel="Delete campaign"
      />
    </div>
  );
}
