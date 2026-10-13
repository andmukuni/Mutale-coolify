import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MoreVertical,
  Plus,
  Search,
  Settings2,
  Eye,
  Copy,
  Trash2,
  Undo2,
} from "lucide-react";
import { PageHeader, Modal } from "../../components/ui";
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

const columns = [
  ["name", "Internal Campaign Name"],
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
const defaultColumns = columns.slice(0, 12).map(([id]) => id);
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
const inputClass =
  "border border-navy-200 bg-white rounded-lg px-3 py-2 text-sm";

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
  const showColumns = displayed.length ? displayed : ["name"];
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );
  const destination = (row) =>
    `/admin/campaigns/${row.id}${["draft", "scheduled", "paused", "cancelled"].includes(row.state) ? "" : "/report"}`;
  const cell = (row, key) => {
    if (key === "name")
      return (
        <Link
          className="font-medium text-blue-600 hover:underline"
          to={destination(row)}
        >
          {row.name}
        </Link>
      );
    if (key === "campaign_type")
      return (
        CAMPAIGN_TYPES.find((type) => type.id === row.campaign_type)?.name ||
        "Event Notification"
      );
    if (key === "scheduled_at_utc")
      return campaignDate(
        tab === "sent" ? row.send_started_at : row.scheduled_at_utc,
      );
    if (key === "scheduled_by")
      return tab === "sent"
        ? row.sent_by_name || "--"
        : row.scheduler_name || "--";
    if (key === "created_at")
      return String(row.created_at || "").slice(0, 10) || "--";
    if (key === "open_rate" || key === "click_rate")
      return `${row.sent ? Math.round((Number(row[key === "open_rate" ? "opened" : "clicked"] || 0) / Number(row.sent)) * 100) : 0}%`;
    if (key === "click_open_rate")
      return `${row.opened ? Math.round((Number(row.clicked || 0) / Number(row.opened)) * 100) : 0}%`;
    return row[key] ?? "--";
  };
  const rowActions = (row) => (
    <div className="relative">
      <button
        aria-label={`Actions for ${row.name}`}
        onClick={(e) => {
          setMenuPosition(e.currentTarget.getBoundingClientRect().bottom);
          setMenu(menu === row.id ? "" : row.id);
        }}
        className="p-2 rounded hover:bg-navy-50"
      >
        <MoreVertical size={18} />
      </button>
      {menu === row.id && (
        <div
          className="fixed bg-white border border-navy-100 shadow-lg rounded-lg min-w-48 z-50 p-1 text-sm"
          style={{
            right: 24,
            top: Math.min(window.innerHeight - 260, menuPosition),
          }}
        >
          <Link
            to={destination(row)}
            className="block px-3 py-2 hover:bg-navy-50"
          >
            {["draft", "scheduled", "paused", "cancelled"].includes(row.state)
              ? "Edit"
              : "View Report"}
          </Link>
          <button
            className="flex items-center gap-2 px-3 py-2 w-full hover:bg-navy-50"
            onClick={() => openPreview(row)}
          >
            <Eye size={15} />
            Preview
          </button>
          <button
            className="block px-3 py-2 w-full text-left hover:bg-navy-50"
            onClick={() => openPreview(row, true)}
          >
            Preview on Mobile
          </button>
          {canManage && (
            <button
              className="flex items-center gap-2 px-3 py-2 w-full hover:bg-navy-50"
              onClick={async () => {
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
          {canManage && ["draft", "cancelled"].includes(row.state) && (
            <button
              className="flex items-center gap-2 px-3 py-2 w-full text-red-600 hover:bg-red-50"
              onClick={() => {
                setRemove(row);
                setMenu("");
              }}
            >
              <Trash2 size={15} />
              Delete Campaign
            </button>
          )}
          {canManage && row.archived_at && (
            <button
              className="flex items-center gap-2 px-3 py-2 w-full hover:bg-navy-50"
              onClick={async () => {
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
        </div>
      )}
    </div>
  );
  return (
    <div>
      <PageHeader
        title="Campaigns"
        breadcrumbs={[{ label: "Admin", to: "/admin" }, { label: "Campaigns" }]}
      />
      <CampaignWorkspaceNav />
      <div
        className="grid grid-cols-3 border border-navy-200 bg-white mb-6"
        role="tablist"
        aria-label="Campaign status"
      >
        {[
          ["draft", "Draft Campaigns"],
          ["scheduled", "Scheduled Campaigns"],
          ["sent", "Sent Campaigns"],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            key={key}
            className={`py-3 text-sm border-r last:border-0 ${tab === key ? "bg-blue-50 text-blue-600 font-semibold" : "text-navy-500"}`}
            onClick={() => {
              setParams({ tab: key });
              setMenu("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-navy-900">
          {archived
            ? "Deleted Campaigns"
            : tab === "draft"
              ? "Draft Campaigns"
              : tab === "scheduled"
                ? "Scheduled Campaigns"
                : "Sent Campaigns"}
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-2.5 text-navy-400"
            />
            <input
              aria-label="Search campaigns"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns"
              className={`${inputClass} pl-9 w-48`}
            />
          </div>
          <button
            title="Manage displayed columns"
            aria-label="Manage displayed columns"
            onClick={() => setColumnsOpen(true)}
            className="p-2 border border-navy-200 rounded-lg"
          >
            <Settings2 size={18} />
          </button>
          {canManage && (
            <button
              className="bg-blue-600 text-white rounded px-4 py-2 text-sm flex gap-1 items-center"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={17} />
              Create Campaign
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          aria-label="Campaign type filter"
          className={inputClass}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All Campaign Types</option>
          {CAMPAIGN_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Event filter"
          className={inputClass}
          value={event}
          onChange={(e) => setEvent(e.target.value)}
        >
          <option value="">All Events</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
        {canManage && (
          <button
            className="text-sm text-navy-500 underline"
            onClick={() => setArchived(!archived)}
          >
            {archived ? "Back to active campaigns" : "Deleted campaigns"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red-600 mb-3">
          {error}
        </p>
      )}
      <div className="border border-navy-100 bg-white rounded-lg overflow-visible">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="border-b border-navy-100 bg-navy-50">
              <tr>
                {columns
                  .filter(([id]) => showColumns.includes(id))
                  .map(([id, label]) => (
                    <th
                      key={id}
                      className="text-left px-4 py-3 text-xs uppercase whitespace-nowrap text-navy-500"
                    >
                      {tab === "sent" && id === "scheduled_at_utc"
                        ? "Sent Date"
                        : tab === "sent" && id === "scheduled_by"
                          ? "Sent By"
                          : label}
                    </th>
                  ))}
                <th className="px-3 py-3 sticky right-0 bg-navy-50 text-xs uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-navy-100 hover:bg-navy-50/50"
                >
                  {columns
                    .filter(([id]) => showColumns.includes(id))
                    .map(([id]) => (
                      <td key={id} className="px-4 py-3 whitespace-nowrap">
                        {cell(row, id)}
                      </td>
                    ))}
                  <td className="sticky right-0 bg-white px-3">
                    {rowActions(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-navy-100">
          {visible.map((row) => (
            <article key={row.id} className="p-4">
              <div className="flex items-center justify-between">
                {cell(row, "name")}
                {rowActions(row)}
              </div>
              <p className="text-xs text-navy-500 mt-2">
                {cell(row, "campaign_type")} · {row.state}
              </p>
              <p className="text-sm mt-2">
                Recipients {row.recipients || 0} · Opened {row.opened || 0} ·
                Clicked {row.clicked || 0}
              </p>
            </article>
          ))}
        </div>
        {loading && (
          <p role="status" className="p-8 text-center text-navy-400">
            Loading campaigns…
          </p>
        )}
        {!loading && !rows.length && (
          <p className="p-10 text-center text-navy-500">
            No {archived ? "deleted" : tab} campaigns.
          </p>
        )}
      </div>
      <footer className="flex flex-wrap gap-3 justify-between items-center mt-4 text-sm text-navy-500">
        <label>
          Rows per page{" "}
          <select
            aria-label="Rows per page"
            value={perPage}
            className="ml-2 border rounded p-1"
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            {[20, 50, 100].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <button
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            className="disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            {currentPage} / {pages}
          </span>
          <button
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
            className="disabled:opacity-40"
          >
            Next
          </button>
        </div>
        <span>{rows.length} campaigns</span>
      </footer>
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
        title="Select the columns you want to display in this list"
        size="lg"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {columns.map(([id, label]) => (
            <label key={id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={displayed.includes(id)}
                disabled={id === "name"}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...displayed, id]
                    : displayed.filter((key) => key !== id);
                  setDisplayed(next);
                  localStorage.setItem(
                    "mm_campaign_columns",
                    JSON.stringify(next),
                  );
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
        size="xl"
      >
        <div className={mobile ? "max-w-[375px] mx-auto" : ""}>
          <iframe
            title="Campaign preview"
            sandbox=""
            className="w-full h-[65vh] bg-white border"
            srcDoc={preview?.html || ""}
          />
        </div>
      </Modal>
      <Modal
        isOpen={Boolean(remove)}
        onClose={() => setRemove(null)}
        title="Delete Campaign"
        footer={
          <>
            <button
              onClick={() => setRemove(null)}
              className="border rounded px-4 py-2"
            >
              Cancel
            </button>
            <button
              className="bg-red-600 text-white rounded px-4 py-2"
              onClick={async () => {
                try {
                  await campaignAction(remove.id, "archive");
                  setRemove(null);
                  await load();
                  toast.success(
                    "Campaign deleted. You can restore it from Deleted campaigns.",
                  );
                } catch (err) {
                  toast.error(err.message);
                }
              }}
            >
              Delete Campaign
            </button>
          </>
        }
      >
        <p className="text-sm">
          Remove “{remove?.name}” from the active campaign list? You can restore
          it from Deleted campaigns.
        </p>
      </Modal>
    </div>
  );
}
