import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MoreVertical,
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
  ["name", "Internal Campaign Name"],
  ["state", "Status"],
  ["scheduled_at_utc", "Scheduled Date"],
  ["scheduled_by", "Scheduled By"],
  ["campaign_type", "Campaign Type"],
  ["template_name", "Campaign Template"],
  ["recipients", "Recipients"],
  ["opened", "Opened"],
  ["clicked", "Clicked"],
  ["bounced", "Bounced"],
  ["ignored", "Ignored"],
  ["created_at", "Date Created"],
  ["creator_name", "Created By"],
  ["click_rate", "Click Rate"],
  ["click_open_rate", "Click to Open Rate"],
  ["open_rate", "Open Rate"],
  ["subject", "Subject"],
];
const defaultColumns = columns.slice(0, 13).map(([id]) => id);
const STATUS_TABS = [
  { key: "draft", label: "Drafts", icon: FileEdit },
  { key: "scheduled", label: "Scheduled", icon: CalendarClock },
  { key: "sent", label: "Sent", icon: Send },
];
const EDITABLE_STATES = ["draft", "scheduled", "paused", "cancelled"];

function storedColumns() {
  try {
    const value = JSON.parse(localStorage.getItem("mm_campaign_columns"));
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
    if (key === "name")
      return (
        <Link
          className="font-medium text-navy-900 hover:text-cyan-700"
          to={destination(row)}
        >
          {row.name}
        </Link>
      );
    if (key === "state") return <StatusBadge status={row.state} />;
    if (key === "campaign_type")
      return (
        CAMPAIGN_TYPES.find((item) => item.id === row.campaign_type)?.name ||
        "Event Notification"
      );
    if (key === "scheduled_at_utc")
      return campaignDate(
        tab === "sent" ? row.send_started_at : row.scheduled_at_utc,
      );
    if (key === "scheduled_by")
      return tab === "sent"
        ? row.sent_by_name || "—"
        : row.scheduler_name || "—";
    if (key === "created_at")
      return String(row.created_at || "").slice(0, 10) || "—";
    if (key === "open_rate" || key === "click_rate")
      return `${row.sent ? Math.round((Number(row[key === "open_rate" ? "opened" : "clicked"] || 0) / Number(row.sent)) * 100) : 0}%`;
    if (key === "click_open_rate")
      return `${row.opened ? Math.round((Number(row.clicked || 0) / Number(row.opened)) * 100) : 0}%`;
    return row[key] ?? "—";
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

  const tableColumns = [
    ...columns
      .filter(([id]) => showColumns.includes(id))
      .map(([id, label]) => ({
        key: id,
        label:
          tab === "sent" && id === "scheduled_at_utc"
            ? "Sent Date"
            : tab === "sent" && id === "scheduled_by"
              ? "Sent By"
              : label,
        render: (_value, row) => cell(row, id),
      })),
    {
      key: "actions",
      label: "",
      align: "right",
      render: (_value, row) => rowActions(row),
    },
  ];

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
        <DataTable
          columns={tableColumns}
          data={visible}
          loading={loading}
          emptyTitle={
            archived ? "No deleted campaigns" : `No ${tab} campaigns`
          }
          emptyDescription={
            archived
              ? "Campaigns you delete will appear here so they can be restored."
              : tab === "draft"
                ? "Create a campaign to start building your next email."
                : `Campaigns appear here once they are ${tab}.`
          }
          emptyAction={
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
                localStorage.removeItem("mm_campaign_columns");
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
                      "mm_campaign_columns",
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
