import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MoreVertical,
  MailOpen,
  Megaphone,
  Plus,
  Search,
  SearchX,
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
  ArrowLeft,
  RefreshCw,
  X,
} from "lucide-react";
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  StatusBadge,
} from "../../components/ui";
import EmptyState from "../../components/EmptyState";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  CAMPAIGN_LIST_TABS,
  CAMPAIGN_TYPES,
  campaignDate,
  campaignDay,
  campaignListTab,
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
  LINK_MUTED,
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
// Engagement only exists once a campaign starts sending, so these columns
// are shown on the Sent tab only.
const METRICS = new Set([
  "opened",
  "clicked",
  "bounced",
  "ignored",
  "open_rate",
  "click_rate",
  "click_open_rate",
]);
const COLUMNS_KEY = "mm_campaign_columns_v2";
const SEARCH_DELAY_MS = 250;
const typeIcons = {
  regular: Send,
  event_notification: CalendarClock,
  event_invitation: MailOpen,
};
const typeName = (row) =>
  CAMPAIGN_TYPES.find((item) => item.id === row.campaign_type)?.name ||
  "Event Notification";
const percent = (part, whole) =>
  whole ? Math.round((Number(part || 0) / Number(whole)) * 100) : 0;
const hasValue = (value) => value !== null && value !== undefined;
const muted = (text = "—", title) => (
  <span className="text-navy-400" title={title}>
    {text}
  </span>
);

function RateCell({ count, rate }) {
  return (
    <div className="inline-flex flex-col items-end gap-1 min-w-[4.5rem]">
      <span className="tabular-nums text-navy-900">
        {Number(count || 0).toLocaleString()}
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
    if (!Array.isArray(value)) return defaultColumns;
    const known = value.filter((id) => columns.some(([key]) => key === id));
    return known.includes("name") ? known : ["name", ...known];
  } catch {
    return defaultColumns;
  }
}

const menuItem =
  "flex items-center gap-2 px-3 py-2 w-full text-left rounded-lg text-navy-700 hover:bg-navy-50 focus:bg-navy-50 focus:outline-none";

// Row action menu, fixed to the viewport so the table's horizontal scroll
// cannot clip it. It opens below its trigger, or above when there is no room,
// and closes on outside click, Escape, scroll or resize.
function RowMenu({ anchor, onClose, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const below = anchor.bottom + 4;
    const fits = below + menu.offsetHeight <= window.innerHeight - 8;
    menu.style.top = `${fits ? below : Math.max(8, anchor.top - menu.offsetHeight - 4)}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - anchor.right)}px`;
    menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [anchor]);
  useEffect(() => {
    const items = () => [
      ...(ref.current?.querySelectorAll('[role="menuitem"]') || []),
    ];
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose(true);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const index = list.indexOf(document.activeElement);
      list[(index + step + list.length) % list.length].focus();
    };
    const onPointer = (e) => {
      if (!e.target.closest?.("[data-campaign-menu]")) onClose(false);
    };
    const dismiss = () => onClose(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      data-campaign-menu
      className="app-card fixed z-50 min-w-52 rounded-xl border border-navy-100 bg-white p-1 text-sm shadow-lg"
      style={{ top: anchor.bottom + 4, right: 8 }}
    >
      {children}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-navy-100">
      <span role="status" className="sr-only">
        Loading campaigns
      </span>
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex items-center gap-6 px-4 py-4 animate-pulse"
        >
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-52 max-w-full rounded bg-navy-100" />
            <div className="h-3 w-36 max-w-full rounded bg-navy-100" />
          </div>
          <div className="h-5 w-16 rounded-full bg-navy-100" />
          <div className="hidden md:block h-3.5 w-32 rounded bg-navy-100" />
          <div className="hidden md:block h-3.5 w-24 rounded bg-navy-100" />
        </div>
      ))}
    </div>
  );
}

export default function CampaignsListPage() {
  const { events } = useData();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canManage = hasPermission("campaigns.manage");
  const [params, setParams] = useSearchParams();
  const tab = Object.hasOwn(CAMPAIGN_LIST_TABS, params.get("tab") || "")
    ? params.get("tab")
    : "draft";
  const deletedView = canManage && params.get("view") === "deleted";
  const search = params.get("q") || "";
  const type = params.get("type") || "";
  const event = params.get("event") || "";
  const [searchInput, setSearchInput] = useState(search);
  const [lists, setLists] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [perPage, setPerPage] = useState(20);
  const [menu, setMenu] = useState(null);
  const menuTrigger = useRef(null);
  const [displayed, setDisplayed] = useState(storedColumns);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [remove, setRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const requestId = useRef(0);

  // Filters live in the URL so a refresh or a return from the editor keeps them.
  const updateParams = useCallback(
    (changes) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  useEffect(() => {
    const value = searchInput.trim();
    if (value === search) return undefined;
    const timer = setTimeout(
      () => updateParams({ q: value }),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  // One request covers every status tab, so the tabs can show counts and
  // switching tabs needs no reload. Only the latest response is applied.
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setRefreshing(true);
    setError("");
    try {
      const filters = { eventId: event, type, search };
      const [active, deleted] = await Promise.all([
        fetchCampaigns(filters),
        canManage ? fetchCampaigns({ ...filters, archived: true }) : null,
      ]);
      if (id !== requestId.current) return;
      setLists({ active: active.data || [], deleted: deleted?.data || [] });
    } catch (err) {
      if (id === requestId.current) setError(err.message);
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [event, type, search, canManage]);
  useEffect(() => {
    void load();
  }, [load]);

  const closeMenu = useCallback((restoreFocus) => {
    setMenu(null);
    if (restoreFocus) menuTrigger.current?.focus();
  }, []);

  const counts = useMemo(() => {
    const totals = { draft: 0, scheduled: 0, sent: 0 };
    for (const row of lists?.active || []) {
      const key = campaignListTab(row.state);
      if (key) totals[key] += 1;
    }
    return totals;
  }, [lists]);
  const rows = useMemo(() => {
    if (!lists) return [];
    if (deletedView) return lists.deleted;
    return lists.active.filter((row) =>
      CAMPAIGN_LIST_TABS[tab].includes(row.state),
    );
  }, [lists, deletedView, tab]);

  // Any change of tab, view or filter starts again from the first page.
  const filterKey = [tab, deletedView, search, type, event].join("|");
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  const filtered = Boolean(search || type || event);
  const clearFilters = () => {
    setSearchInput("");
    updateParams({ q: "", type: "", event: "" });
  };
  const showTab = (key) => {
    closeMenu(false);
    updateParams({ tab: key === "draft" ? "" : key, view: "" });
  };

  const openPreview = async (row, isMobile = false) => {
    closeMenu(false);
    try {
      const result = await campaignPreview(row.id);
      setMobile(isMobile);
      setPreview({ ...result, name: row.name });
    } catch (err) {
      toast.error(err.message);
    }
  };
  const duplicate = async (row) => {
    closeMenu(false);
    try {
      const result = await duplicateCampaign(row.id);
      navigate(`/admin/campaigns/${result.data.id}`);
    } catch (err) {
      toast.error(err.message);
    }
  };
  const restore = async (row) => {
    closeMenu(false);
    try {
      await campaignAction(row.id, "restore");
      await load();
      toast.success("Campaign restored to Drafts.");
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

  const metricsShown = tab === "sent" && !deletedView;
  const shownColumns = columns.filter(
    ([id]) => displayed.includes(id) && (metricsShown || !METRICS.has(id)),
  );
  const editable = (row) => EDITABLE_STATES.includes(row.state);
  const destination = (row) =>
    `/admin/campaigns/${row.id}${editable(row) ? "" : "/report"}`;
  const sentCount = (row) => Number(row.sent || 0);
  const cell = (row, key) => {
    if (key === "name")
      return (
        <div className="min-w-[10rem]">
          {deletedView ? (
            <span
              className="block truncate font-medium text-navy-900"
              title={row.name}
            >
              {row.name}
            </span>
          ) : (
            <Link
              className="block truncate font-medium text-navy-900 hover:text-cyan-700"
              to={destination(row)}
              title={row.name}
            >
              {row.name}
            </Link>
          )}
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
        <div className="max-w-[11rem]">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-navy-700">
            <Icon size={14} className="text-cyan-600 shrink-0" />
            {typeName(row)}
          </span>
          {row.event_title && (
            <p
              className="truncate text-xs text-navy-400 mt-0.5 pl-5"
              title={row.event_title}
            >
              {row.event_title}
            </p>
          )}
        </div>
      );
    }
    if (key === "scheduled_at_utc") {
      const value =
        tab === "sent" && !deletedView
          ? row.send_started_at
          : row.scheduled_at_utc;
      if (!value) return muted();
      const [day, time] = campaignDate(value).split(", ");
      return (
        <div>
          <span>{day}</span>
          {time && <p className="text-xs text-navy-400 mt-0.5">{time}</p>}
        </div>
      );
    }
    if (key === "scheduled_by")
      return (
        (tab === "sent" && !deletedView
          ? row.sent_by_name
          : row.scheduler_name) || muted()
      );
    if (key === "created_at")
      return (
        <div>
          <span>{campaignDay(row.created_at) || "—"}</span>
          {row.creator_name && !shownColumns.some(([id]) => id === "creator_name") && (
            <p
              className="max-w-[7.5rem] truncate text-xs text-navy-400 mt-0.5"
              title={row.creator_name}
            >
              by {row.creator_name}
            </p>
          )}
        </div>
      );
    if (key === "recipients")
      return hasValue(row.recipients)
        ? Number(row.recipients).toLocaleString()
        : muted("—", "Audience not counted yet");
    if (METRICS.has(key) && !sentCount(row)) return muted();
    if (key === "opened")
      return (
        <RateCell count={row.opened} rate={percent(row.opened, row.sent)} />
      );
    if (key === "clicked")
      return (
        <RateCell count={row.clicked} rate={percent(row.clicked, row.sent)} />
      );
    if (key === "open_rate") return `${percent(row.opened, row.sent)}%`;
    if (key === "click_rate") return `${percent(row.clicked, row.sent)}%`;
    if (key === "click_open_rate")
      return `${percent(row.clicked, row.opened)}%`;
    if (NUMERIC.has(key)) return Number(row[key] || 0).toLocaleString();
    return row[key] || muted();
  };
  const headerLabel = (id, label) => {
    if (id === "scheduled_at_utc" && metricsShown) return "Sent";
    if (id === "scheduled_at_utc" && tab === "scheduled" && !deletedView)
      return "Sends";
    if (id === "scheduled_by" && metricsShown) return "Sent By";
    return label;
  };
  // A one-line timeline for the mobile cards, where there are no columns.
  const timeline = (row) => {
    if (metricsShown && row.send_started_at)
      return `Sent ${campaignDate(row.send_started_at)}`;
    if (row.scheduled_at_utc && !deletedView)
      return `Scheduled for ${campaignDate(row.scheduled_at_utc)}`;
    const created = campaignDay(row.created_at);
    const audience = hasValue(row.recipients)
      ? ` · ${Number(row.recipients).toLocaleString()} recipients`
      : "";
    return `${created ? `Created ${created}` : "Not scheduled"}${audience}`;
  };

  const menuButton = (row) => (
    <button
      type="button"
      data-campaign-menu
      aria-label={`Actions for ${row.name}`}
      aria-haspopup="menu"
      aria-expanded={menu?.row.id === row.id}
      onClick={(e) => {
        if (menu?.row.id === row.id) {
          closeMenu(false);
          return;
        }
        menuTrigger.current = e.currentTarget;
        setMenu({ row, anchor: e.currentTarget.getBoundingClientRect() });
      }}
      className={BTN_ICON}
    >
      <MoreVertical size={18} />
    </button>
  );
  const menuContent = (row) => (
    <>
      {deletedView ? (
        canManage && (
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={() => restore(row)}
          >
            <Undo2 size={15} />
            Restore to drafts
          </button>
        )
      ) : (
        <Link role="menuitem" to={destination(row)} className={menuItem}>
          {editable(row) ? <Pencil size={15} /> : <BarChart3 size={15} />}
          {editable(row) ? "Edit" : "View report"}
        </Link>
      )}
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
          onClick={() => duplicate(row)}
        >
          <Copy size={15} />
          Duplicate
        </button>
      )}
      {canManage &&
        !deletedView &&
        ["draft", "cancelled"].includes(row.state) && (
          <>
            <div role="separator" className="my-1 border-t border-navy-100" />
            <button
              type="button"
              role="menuitem"
              className="flex items-center gap-2 px-3 py-2 w-full text-left rounded-lg text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none"
              onClick={() => {
                closeMenu(false);
                setRemove(row);
              }}
            >
              <Trash2 size={15} />
              Delete campaign
            </button>
          </>
        )}
    </>
  );

  const otherMatches = STATUS_TABS.filter(
    ({ key }) => key !== tab && counts[key],
  ).map(({ label }) => label);
  const empty = (() => {
    if (filtered)
      return {
        icon: SearchX,
        title: "No campaigns match these filters",
        description:
          !deletedView && otherMatches.length
            ? `There are matches under ${otherMatches.join(" and ")}.`
            : "Try a different search, or clear the filters.",
        action: (
          <button type="button" className={BTN_SECONDARY} onClick={clearFilters}>
            <X size={15} />
            Clear filters
          </button>
        ),
      };
    if (deletedView)
      return {
        icon: Archive,
        title: "No deleted campaigns",
        description:
          "Drafts and cancelled campaigns you delete appear here so they can be restored.",
      };
    if (tab === "scheduled")
      return {
        icon: CalendarClock,
        title: "Nothing scheduled",
        description:
          "Schedule a draft from its Review & Send step and it will wait here until it goes out.",
      };
    if (tab === "sent")
      return {
        icon: Send,
        title: "No sent campaigns yet",
        description:
          "Campaigns appear here once they start sending, with their open and click rates.",
      };
    return {
      icon: Megaphone,
      title: "No drafts",
      description: "Create a campaign to start building your next email.",
      action: canManage ? (
        <button
          type="button"
          className={BTN_PRIMARY}
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={15} />
          Create campaign
        </button>
      ) : null,
    };
  })();

  const deletedCount = lists?.deleted.length || 0;

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
                disabled={refreshing}
                className={BTN_SECONDARY}
              >
                <RefreshCw
                  size={15}
                  className={refreshing ? "animate-spin" : ""}
                />
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

      <section
        aria-label="Campaign list"
        className="app-card bg-white rounded-2xl border border-navy-100 shadow-sm"
      >
        <div className="space-y-4 border-b border-navy-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {deletedView ? (
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className={BTN_ICON}
                  aria-label="Back to active campaigns"
                  title="Back to active campaigns"
                  onClick={() => updateParams({ view: "" })}
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-navy-900">
                    Deleted campaigns
                  </h2>
                  <p className="text-xs text-navy-500">
                    Restore a campaign to move it back to Drafts.
                  </p>
                </div>
              </div>
            ) : (
              <CampaignTabs
                label="Campaign status"
                tabs={STATUS_TABS.map((item) => ({
                  ...item,
                  count: lists ? counts[item.key] : undefined,
                }))}
                value={tab}
                onChange={showTab}
              />
            )}
            {canManage && !deletedView && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-navy-600 hover:bg-navy-50 hover:text-navy-800 transition-colors"
                onClick={() => {
                  closeMenu(false);
                  updateParams({ view: "deleted" });
                }}
              >
                <Archive size={15} />
                Deleted
                {deletedCount > 0 && (
                  <span className="rounded-full bg-navy-100 px-1.5 text-xs tabular-nums text-navy-600">
                    {deletedCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:items-center">
            <div className="relative col-span-2 md:w-72">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none"
              />
              <input
                aria-label="Search campaigns"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name or subject"
                className={`${INPUT_SM} pl-9 pr-9`}
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              aria-label="Campaign type filter"
              className={`${INPUT_SM} md:w-52`}
              value={type}
              onChange={(e) => updateParams({ type: e.target.value })}
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
              className={`${INPUT_SM} md:w-60`}
              value={event}
              onChange={(e) => updateParams({ event: e.target.value })}
            >
              <option value="">All events</option>
              {events.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            {(filtered || searchInput) && (
              <button
                type="button"
                className={`${LINK_MUTED} col-span-2 justify-self-start px-1 py-2 text-sm`}
                onClick={clearFilters}
              >
                <X size={14} />
                Clear filters
              </button>
            )}
            <div className="hidden md:block md:ml-auto">
              <button
                type="button"
                title="Manage displayed columns"
                onClick={() => setColumnsOpen(true)}
                className={BTN_SECONDARY}
              >
                <Settings2 size={15} />
                Columns
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <span>{error}</span>
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}

        {!lists ? (
          !error && <ListSkeleton />
        ) : !rows.length ? (
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            action={empty.action}
          />
        ) : (
          <div
            aria-busy={refreshing}
            className={`transition-opacity ${refreshing ? "opacity-60" : ""}`}
          >
            <div className="hidden md:block overflow-x-auto rounded-b-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-100 bg-navy-50">
                    {shownColumns.map(([id, label]) => (
                      <th
                        key={id}
                        scope="col"
                        className={`px-3 py-3 first:pl-4 text-xs font-semibold uppercase tracking-wide text-navy-500 whitespace-nowrap ${
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
                      className="group hover:bg-navy-50 transition-colors"
                    >
                      {shownColumns.map(([id]) => (
                        <td
                          key={id}
                          className={`px-3 py-3.5 align-middle text-navy-700 first:pl-4 ${
                            id === "name"
                              ? "w-full max-w-0"
                              : id === "campaign_type"
                                ? ""
                                : "whitespace-nowrap"
                          } ${NUMERIC.has(id) ? "text-right tabular-nums" : ""}`}
                        >
                          {cell(row, id)}
                        </td>
                      ))}
                      <td className="sticky right-0 bg-white group-hover:bg-navy-50 px-2 py-3.5 transition-colors">
                        <div className="flex justify-end">
                          {menuButton(row)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-navy-100">
              {visible.map((row) => {
                const Icon = typeIcons[row.campaign_type] || Megaphone;
                const base = sentCount(row);
                return (
                  <li key={row.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">{cell(row, "name")}</div>
                      {menuButton(row)}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-navy-600">
                      <StatusBadge status={row.state} />
                      <span className="inline-flex items-center gap-1.5">
                        <Icon size={13} className="text-cyan-600 shrink-0" />
                        {typeName(row)}
                      </span>
                    </div>
                    {row.event_title && (
                      <p className="mt-1.5 truncate text-xs text-navy-500">
                        {row.event_title}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-navy-500">
                      {timeline(row)}
                    </p>
                    {metricsShown && (
                      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-navy-50 p-3 text-center">
                        {[
                          ["Recipients", row.recipients, null],
                          ["Opened", row.opened, percent(row.opened, base)],
                          ["Clicked", row.clicked, percent(row.clicked, base)],
                        ].map(([label, value, rate]) => (
                          <div key={label}>
                            <dt className="text-[11px] uppercase tracking-wide text-navy-400">
                              {label}
                            </dt>
                            <dd className="text-sm font-semibold text-navy-900 tabular-nums">
                              {Number(value || 0).toLocaleString()}
                              {rate !== null && base > 0 && (
                                <span className="ml-1 text-xs font-normal text-navy-400">
                                  {rate}%
                                </span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
      {lists && (
        <CampaignPagination
          page={currentPage}
          perPage={perPage}
          total={rows.length}
          onPageChange={(value) => setPaging({ key: filterKey, page: value })}
          noun="campaigns"
          perPageOptions={[20, 50, 100]}
          onPerPageChange={(value) => {
            setPerPage(value);
            setPaging({ key: filterKey, page: 1 });
          }}
        />
      )}

      {menu && (
        <RowMenu anchor={menu.anchor} onClose={closeMenu}>
          {menuContent(menu.row)}
        </RowMenu>
      )}
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
        subtitle="Choose which columns appear in the campaign list. Opens, clicks, bounces and rates appear on the Sent tab."
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
              {METRICS.has(id) && (
                <span className="ml-auto text-xs text-navy-400">Sent tab</span>
              )}
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
