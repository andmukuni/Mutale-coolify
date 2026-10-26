import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarCheck,
  CalendarDays,
  Download,
  ExternalLink,
  Info,
  MapPin,
  Plus,
  Search,
  SearchX,
  Store,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { LoadingButton, Modal, StatusBadge } from "../../ui";
import EmptyState from "../../EmptyState";
import CampaignTabBar from "./CampaignTabBar";
import CampaignPagination from "./CampaignPagination";
import CampaignImagePicker from "./CampaignImagePicker";
import useCampaignConfirm from "./useCampaignConfirm";
import {
  BTN_ICON,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CHECKBOX,
  INPUT,
  INPUT_SM,
} from "./campaignStyles";
import {
  campaignRequest,
  downloadCsv,
} from "../../../utils/campaignWorkspaceApi";
import { campaignDay } from "../../../../shared/campaignWorkspace";

// Invitee states written by the invitation service and the outbox worker.
const INVITEE_STATES = {
  accepted: {
    label: "Attending",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  declined: {
    label: "Not attending",
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 ring-red-600/20",
  },
  no_response: {
    label: "Awaiting reply",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  not_sent: {
    label: "Not sent yet",
    dot: "bg-navy-300",
    badge: "bg-navy-50 text-navy-600 ring-navy-500/20",
  },
};
const FILTERS = ["", "accepted", "declined", "no_response", "not_sent"];
const PER_PAGE = 25;
const PICKER_LIMIT = 100;
const stateOf = (row) => (INVITEE_STATES[row.state] ? row.state : "not_sent");
const inviteeName = (row) => row.display_name || row.email_normalized;
const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(value || "");
// Event dates are calendar dates, so format them without a timezone shift.
const eventDay = (value) => {
  const date = value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date)
    : "";
};
const sameContent = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function InviteeBadge({ state }) {
  const meta = INVITEE_STATES[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function SearchField({ value, onChange, label, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none"
      />
      <input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_SM} pl-9 pr-9`}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function InviteModal({ open, onClose, contacts, invited, onInvite }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Contacts that can still be invited come first.
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts
      .filter(
        (contact) =>
          !query ||
          `${contact.full_name || ""} ${contact.email_normalized}`
            .toLowerCase()
            .includes(query),
      )
      .sort(
        (a, b) =>
          invited.has(a.email_normalized) - invited.has(b.email_normalized),
      );
  }, [contacts, search, invited]);
  const eligible = matches.filter(
    (contact) => !invited.has(contact.email_normalized),
  );
  const allSelected =
    eligible.length > 0 && eligible.every((c) => selected.has(c.id));
  const chosen = contacts.filter((contact) => selected.has(contact.id));
  const skipped = chosen.filter(
    (contact) => contact.unsubscribed_at || !contact.marketing_opt_in,
  ).length;
  const toggle = (id, on) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const contact of eligible) {
        if (on) next.add(contact.id);
        else next.delete(contact.id);
      }
      return next;
    });
  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onInvite([...selected]);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !saving && onClose()}
      title="Add invitees"
      subtitle="Choose contacts for this event's invitation list. Nobody is emailed until you send an Event Invitation campaign."
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-navy-600">
            <span className="font-medium text-navy-900">{selected.size}</span>{" "}
            selected
            {skipped > 0 && (
              <span className="mt-0.5 flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {skipped} {skipped === 1 ? "has" : "have"} no marketing consent
                or unsubscribed, and will be skipped when invitations are sent.
              </span>
            )}
          </div>
          <div className="flex shrink-0 justify-end gap-2 whitespace-nowrap">
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>
            <LoadingButton
              className={BTN_PRIMARY}
              disabled={!selected.size}
              loading={saving}
              loadingLabel="Adding…"
              icon={UserPlus}
              iconSize={15}
              onClick={submit}
            >
              {selected.size
                ? `Add ${selected.size} ${selected.size === 1 ? "invitee" : "invitees"}`
                : "Add invitees"}
            </LoadingButton>
          </div>
        </div>
      }
    >
      {!contacts.length ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Invitees come from your campaign contacts. Add or import contacts first."
          action={
            <Link
              to="/admin/campaigns/manage/contacts"
              className={BTN_SECONDARY}
            >
              Go to contacts
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          <SearchField
            value={search}
            onChange={setSearch}
            label="Search name or email"
          />
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-navy-100">
            <label className="flex items-center gap-3 border-b border-navy-100 bg-navy-50 px-3 py-2.5 text-sm font-medium text-navy-700">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={allSelected}
                disabled={!eligible.length}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              Select all {search.trim() ? "matching" : ""} contacts not yet
              invited
              <span className="ml-auto text-xs font-normal text-navy-500 tabular-nums">
                {eligible.length}
              </span>
            </label>
            <ul className="max-h-[45vh] divide-y divide-navy-100 overflow-y-auto">
              {matches.slice(0, PICKER_LIMIT).map((contact) => {
                const already = invited.has(contact.email_normalized);
                const tag = already
                  ? ["Already invited", "bg-navy-100 text-navy-600"]
                  : contact.unsubscribed_at
                    ? ["Unsubscribed", "bg-red-50 text-red-700"]
                    : !contact.marketing_opt_in
                      ? ["No consent", "bg-amber-50 text-amber-700"]
                      : null;
                return (
                  <li key={contact.id}>
                    <label
                      className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                        already
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer hover:bg-navy-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className={CHECKBOX}
                        disabled={already}
                        checked={already || selected.has(contact.id)}
                        onChange={(e) => toggle(contact.id, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-navy-900">
                          {contact.full_name || contact.email_normalized}
                        </span>
                        <span className="block truncate text-xs text-navy-500">
                          {contact.email_normalized}
                        </span>
                      </span>
                      {tag && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tag[1]}`}
                        >
                          {tag[0]}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
              {!matches.length && (
                <li className="px-3 py-8 text-center text-sm text-navy-500">
                  No contacts match “{search.trim()}”.
                </li>
              )}
            </ul>
          </div>
          {matches.length > PICKER_LIMIT && (
            <p className="text-xs text-navy-500">
              Showing the first {PICKER_LIMIT} of {matches.length} contacts.
              Search to narrow the list; “Select all” still covers every match.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function PersonLogo({ person, Icon }) {
  return isHttpUrl(person.image) ? (
    <img
      src={person.image}
      alt=""
      className="h-16 w-16 shrink-0 rounded-xl border border-navy-100 bg-white object-contain p-1"
    />
  ) : (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-navy-200 bg-navy-50 text-navy-400">
      <Icon size={22} />
    </div>
  );
}

function PeopleEditor({ kind, items, onChange, canManage }) {
  const noun = kind === "sponsors" ? "sponsor" : "exhibitor";
  const Noun = `${noun[0].toUpperCase()}${noun.slice(1)}`;
  const Icon = kind === "sponsors" ? Building2 : Store;
  const update = (index, patch) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const move = (index, step) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    onChange(next);
  };
  const add = () =>
    onChange([
      ...items,
      { id: crypto.randomUUID(), name: "", image: "", position: "" },
    ]);

  if (!items.length)
    return (
      <EmptyState
        icon={Icon}
        title={`No ${kind} yet`}
        description={`${Noun}s appear in the ${kind} block of this event's emails, with their logo and an optional subtitle.`}
        action={
          canManage ? (
            <button type="button" className={BTN_PRIMARY} onClick={add}>
              <Plus size={15} />
              Add {noun}
            </button>
          ) : null
        }
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          Shown in the {kind} block of this event's emails, in this order.
        </p>
        {canManage && (
          <button type="button" className={BTN_SECONDARY} onClick={add}>
            <Plus size={15} />
            Add {noun}
          </button>
        )}
      </div>
      <ol className="space-y-3">
        {items.map((item, index) => {
          const badLink = Boolean(item.image) && !isHttpUrl(item.image);
          const label = item.name || `${Noun} ${index + 1}`;
          return (
            <li
              key={item.id}
              className="rounded-xl border border-navy-100 p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <PersonLogo person={item} Icon={Icon} />
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-navy-600">
                      Name
                    </span>
                    <input
                      className={INPUT_SM}
                      aria-label={`${Noun} ${index + 1} name`}
                      value={item.name}
                      disabled={!canManage}
                      placeholder={kind === "sponsors" ? "e.g. Sample Diagnostics Ltd" : "e.g. Lab Supplies Co."}
                      aria-invalid={!item.name.trim()}
                      onChange={(e) => update(index, { name: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-navy-600">
                      Subtitle <span className="font-normal text-navy-400">(optional)</span>
                    </span>
                    <input
                      className={INPUT_SM}
                      aria-label={`${Noun} ${index + 1} subtitle`}
                      value={item.position || ""}
                      disabled={!canManage}
                      placeholder={kind === "sponsors" ? "e.g. Gold sponsor" : "e.g. Booth 12"}
                      onChange={(e) =>
                        update(index, { position: e.target.value })
                      }
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <span className="mb-1 block text-xs font-medium text-navy-600">
                      Logo
                    </span>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className={
                          badLink
                            ? INPUT_SM.replace("border-navy-200", "border-red-400")
                            : INPUT_SM
                        }
                        value={item.image}
                        disabled={!canManage}
                        placeholder="Paste an https:// image link"
                        aria-label={`${Noun} ${index + 1} logo link`}
                        aria-invalid={badLink}
                        onChange={(e) => update(index, { image: e.target.value.trim() })}
                      />
                      {canManage && (
                        <div className="sm:w-64 shrink-0">
                          <CampaignImagePicker
                            onSelect={(url) => update(index, { image: url })}
                          />
                        </div>
                      )}
                    </div>
                    {badLink && (
                      <p className="mt-1 text-xs text-red-600">
                        Use a full link starting with https://, or choose an
                        image from the library.
                      </p>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1 self-end sm:flex-col sm:self-start">
                    <button
                      type="button"
                      className={BTN_ICON}
                      aria-label={`Move ${label} up`}
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      className={BTN_ICON}
                      aria-label={`Move ${label} down`}
                      title="Move down"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className={`${BTN_ICON} hover:bg-red-50 hover:text-red-600`}
                      aria-label={`Remove ${label}`}
                      title="Remove"
                      onClick={() =>
                        onChange(items.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-4 p-6 animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-navy-100" />
        ))}
      </div>
      <div className="h-9 w-72 max-w-full rounded-xl bg-navy-100" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-xl bg-navy-100" />
      ))}
    </div>
  );
}

export default function CampaignEventInvitees({
  events,
  contacts,
  canManage,
  toast,
}) {
  const [params, setParams] = useSearchParams();
  const eventId = params.get("event") || "";
  const [confirm, confirmDialog] = useCampaignConfirm();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("invitees");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  // Only the response for the most recently chosen event is applied.
  const load = useCallback(async (id) => {
    const request = ++requestId.current;
    setError("");
    if (!id) {
      setData(null);
      return;
    }
    try {
      const path = `/events/${encodeURIComponent(id)}`;
      const [content, invitees] = await Promise.all([
        campaignRequest(`${path}/content`),
        campaignRequest(`${path}/invitees`),
      ]);
      if (request !== requestId.current) return;
      const people = {
        sponsors: content.content?.sponsors || [],
        exhibitors: content.content?.exhibitors || [],
      };
      setData({ eventId: id, invitees, content: people, saved: people });
    } catch (err) {
      if (request === requestId.current) setError(err.message);
    }
  }, []);
  useEffect(() => {
    void load(eventId);
  }, [eventId, load]);

  const ready = data?.eventId === eventId;
  const dirty = ready && !sameContent(data.content, data.saved);
  const people = ready ? [...data.content.sponsors, ...data.content.exhibitors] : [];
  const problem = people.some((p) => !String(p.name || "").trim())
    ? "Give every sponsor and exhibitor a name."
    : people.some((p) => p.image && !isHttpUrl(p.image))
      ? "Fix the logo links marked in red."
      : "";

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const chooseEvent = async (id) => {
    if (
      dirty &&
      !(await confirm({
        title: "Discard unsaved changes?",
        message:
          "Your sponsor and exhibitor changes for this event haven't been saved.",
        confirmLabel: "Discard changes",
        variant: "danger",
      }))
    )
      return;
    setSearch("");
    setStatus("");
    setTab("invitees");
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set("event", id);
        else next.delete("event");
        return next;
      },
      { replace: true },
    );
  };

  const invitees = useMemo(() => (ready ? data.invitees : []), [ready, data]);
  const counts = useMemo(() => {
    const totals = { "": 0, accepted: 0, declined: 0, no_response: 0, not_sent: 0 };
    for (const row of invitees) {
      totals[""] += 1;
      totals[stateOf(row)] += 1;
    }
    return totals;
  }, [invitees]);
  const invitedEmails = useMemo(
    () => new Set(invitees.map((row) => row.email_normalized)),
    [invitees],
  );
  const visibleInvitees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invitees
      .filter((row) => !status || stateOf(row) === status)
      .filter(
        (row) =>
          !query ||
          `${row.display_name || ""} ${row.email_normalized}`
            .toLowerCase()
            .includes(query),
      )
      .sort((a, b) => inviteeName(a).localeCompare(inviteeName(b)));
  }, [invitees, search, status]);

  const filterKey = [eventId, search, status].join("|");
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const pageRows = visibleInvitees.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE,
  );

  const sent = counts[""] - counts.not_sent;
  const replied = counts.accepted + counts.declined;
  const event = events.find((item) => item.id === eventId);
  const upcoming = events.filter(
    (item) => String(item.end_date || item.start_date || "") >= new Date().toISOString().slice(0, 10),
  );
  const past = events.filter((item) => !upcoming.includes(item));

  const invite = async (ids) => {
    const path = `/events/${encodeURIComponent(eventId)}/invitees`;
    await campaignRequest(path, {
      method: "POST",
      body: { contact_ids: ids },
    });
    const fresh = await campaignRequest(path);
    setData((current) =>
      current?.eventId === eventId ? { ...current, invitees: fresh } : current,
    );
    toast.success(
      `${ids.length} ${ids.length === 1 ? "contact" : "contacts"} added to the invitation list.`,
    );
  };
  const setPeople = (key, items) =>
    setData((current) => ({
      ...current,
      content: { ...current.content, [key]: items },
    }));
  const save = async () => {
    setSaving(true);
    try {
      const saved = await campaignRequest(
        `/events/${encodeURIComponent(eventId)}/content`,
        { method: "PUT", body: data.content },
      );
      const stored = {
        sponsors: saved.sponsors || [],
        exhibitors: saved.exhibitors || [],
      };
      setData((current) => ({ ...current, content: stored, saved: stored }));
      toast.success("Sponsors and exhibitors saved.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const exportCsv = () =>
    downloadCsv(
      `${event?.slug || eventId}-invitees.csv`,
      ["Name", "Email", "Status", "Invited", "Responded"],
      visibleInvitees.map((row) => [
        row.display_name || "",
        row.email_normalized,
        INVITEE_STATES[stateOf(row)].label,
        campaignDay(row.first_sent_at),
        campaignDay(row.responded_at),
      ]),
    );

  const place =
    event &&
    (event.event_mode === "virtual"
      ? "Online"
      : [event.venue, event.location].filter(Boolean).join(", "));

  return (
    <div className="space-y-6">
      <section className="app-card rounded-2xl border border-navy-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block w-full lg:max-w-md">
            <span className="mb-1.5 block text-sm font-medium text-navy-700">
              Event
            </span>
            <select
              className={INPUT}
              value={eventId}
              onChange={(e) => void chooseEvent(e.target.value)}
            >
              <option value="">Choose an event…</option>
              {[
                ["Upcoming", upcoming],
                ["Past", past],
              ].map(
                ([group, list]) =>
                  list.length > 0 && (
                    <optgroup key={group} label={group}>
                      {list.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                          {item.start_date ? ` · ${eventDay(item.start_date)}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ),
              )}
            </select>
          </label>
          {event && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-navy-600">
              {event.start_date && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={15} className="text-navy-400" />
                  {eventDay(event.start_date)}
                  {event.start_time ? `, ${String(event.start_time).slice(0, 5)}` : ""}
                </span>
              )}
              {place && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={15} className="text-navy-400" />
                  {place}
                </span>
              )}
              {event.status && <StatusBadge status={event.status} />}
              <Link
                to={`/admin/events/${encodeURIComponent(event.id)}`}
                className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:text-cyan-600"
              >
                Open event
                <ExternalLink size={13} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {!eventId ? (
        <section className="app-card rounded-2xl border border-navy-100 bg-white shadow-sm">
          <EmptyState
            icon={CalendarCheck}
            title={events.length ? "Choose an event" : "No events yet"}
            description={
              events.length
                ? "Pick an event above to manage who is invited, track their replies, and set the sponsors and exhibitors shown in its emails."
                : "Create an event first. Its invitation list, sponsors and exhibitors are managed here."
            }
            action={
              events.length ? null : (
                <Link to="/admin/events/new" className={BTN_PRIMARY}>
                  <Plus size={15} />
                  Create event
                </Link>
              )
            }
          />
        </section>
      ) : (
        <section className="app-card overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-sm">
          <CampaignTabBar
            label="Event campaign content"
            value={tab}
            onChange={setTab}
            className="border-b border-navy-100 px-2"
            tabs={[
              {
                key: "invitees",
                label: "Invitees",
                icon: Users,
                count: ready ? counts[""] : undefined,
              },
              {
                key: "sponsors",
                label: "Sponsors",
                icon: Building2,
                count: ready ? data.content.sponsors.length : undefined,
              },
              {
                key: "exhibitors",
                label: "Exhibitors",
                icon: Store,
                count: ready ? data.content.exhibitors.length : undefined,
              },
            ]}
          />
          {error ? (
            <div
              role="alert"
              className="m-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <span>{error}</span>
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => void load(eventId)}
              >
                Try again
              </button>
            </div>
          ) : !ready ? (
            <>
              <span role="status" className="sr-only">
                Loading event
              </span>
              <LoadingPanel />
            </>
          ) : tab === "invitees" ? (
            <div className="space-y-5 p-4 sm:p-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {FILTERS.map((key) => {
                  const active = status === key;
                  return (
                    <button
                      key={key || "all"}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatus(active ? "" : key)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? "border-cyan-500 ring-2 ring-cyan-500/20"
                          : "border-navy-100 hover:bg-navy-50"
                      } ${key === "" ? "col-span-2 lg:col-span-1" : ""}`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-medium text-navy-500">
                        {key && (
                          <span
                            className={`h-2 w-2 rounded-full ${INVITEE_STATES[key].dot}`}
                          />
                        )}
                        {key ? INVITEE_STATES[key].label : "All invitees"}
                      </span>
                      <span className="mt-1 block text-2xl font-semibold tabular-nums text-navy-900">
                        {counts[key]}
                      </span>
                    </button>
                  );
                })}
              </div>
              {counts[""] > 0 && (
                <div>
                  <div
                    className="flex h-2 overflow-hidden rounded-full bg-navy-100"
                    role="img"
                    aria-label={`${counts.accepted} attending, ${counts.declined} not attending, ${counts.no_response} awaiting reply, ${counts.not_sent} not sent yet`}
                  >
                    {["accepted", "declined", "no_response", "not_sent"].map(
                      (key) =>
                        counts[key] > 0 && (
                          <span
                            key={key}
                            className={INVITEE_STATES[key].dot}
                            style={{
                              width: `${(counts[key] / counts[""]) * 100}%`,
                            }}
                          />
                        ),
                    )}
                  </div>
                  <p className="mt-2 text-xs text-navy-500">
                    {sent
                      ? `${replied} of ${sent} sent ${sent === 1 ? "invitation has" : "invitations have"} a reply (${Math.round((replied / sent) * 100)}%).`
                      : "No invitations have been sent yet."}
                  </p>
                </div>
              )}

              <div className="flex items-start gap-2.5 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-600">
                <Info size={16} className="mt-0.5 shrink-0 text-cyan-600" />
                <p>
                  Adding people here doesn't email them. Send invitations from
                  an Event Invitation campaign; replies to its “I Will Attend”
                  and “No” buttons appear here. Replies don't register anyone
                  for the event.{" "}
                  <Link
                    to="/admin/campaigns"
                    className="font-medium text-cyan-700 hover:text-cyan-600"
                  >
                    Go to campaigns
                  </Link>
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  label="Search invitees"
                  className="sm:w-72"
                />
                <div className="flex gap-2 sm:ml-auto">
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    disabled={!visibleInvitees.length}
                    onClick={exportCsv}
                  >
                    <Download size={15} />
                    Export CSV
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      onClick={() => setInviteOpen(true)}
                    >
                      <UserPlus size={15} />
                      Add invitees
                    </button>
                  )}
                </div>
              </div>

              {!counts[""] ? (
                <div className="rounded-xl border border-dashed border-navy-200">
                  <EmptyState
                    icon={UserPlus}
                    title="No invitees yet"
                    description="Add contacts to build this event's invitation list, then send it from an Event Invitation campaign."
                    action={
                      canManage ? (
                        <button
                          type="button"
                          className={BTN_PRIMARY}
                          onClick={() => setInviteOpen(true)}
                        >
                          <UserPlus size={15} />
                          Add invitees
                        </button>
                      ) : null
                    }
                  />
                </div>
              ) : !visibleInvitees.length ? (
                <div className="rounded-xl border border-dashed border-navy-200">
                  <EmptyState
                    icon={SearchX}
                    title="No invitees match"
                    description="Try another search or status."
                    action={
                      <button
                        type="button"
                        className={BTN_SECONDARY}
                        onClick={() => {
                          setSearch("");
                          setStatus("");
                        }}
                      >
                        <X size={15} />
                        Clear filters
                      </button>
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border border-navy-100 md:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-navy-100 bg-navy-50 text-left text-xs font-semibold uppercase tracking-wide text-navy-500">
                          <th scope="col" className="px-4 py-3">Invitee</th>
                          <th scope="col" className="px-4 py-3">Status</th>
                          <th scope="col" className="px-4 py-3">Invited</th>
                          <th scope="col" className="px-4 py-3">Replied</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-navy-100">
                        {pageRows.map((row) => (
                          <tr key={row.id} className="hover:bg-navy-50">
                            <td className="max-w-0 w-full px-4 py-3">
                              <p className="truncate font-medium text-navy-900">
                                {row.display_name || "—"}
                              </p>
                              <p className="truncate text-xs text-navy-500">
                                {row.email_normalized}
                              </p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <InviteeBadge state={stateOf(row)} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-navy-700">
                              {campaignDay(row.first_sent_at) || (
                                <span className="text-navy-400">—</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-navy-700">
                              {campaignDay(row.responded_at) || (
                                <span className="text-navy-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-100 md:hidden">
                    {pageRows.map((row) => (
                      <li key={row.id} className="space-y-1.5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-navy-900">
                              {row.display_name || row.email_normalized}
                            </p>
                            <p className="truncate text-xs text-navy-500">
                              {row.email_normalized}
                            </p>
                          </div>
                          <InviteeBadge state={stateOf(row)} />
                        </div>
                        {(row.first_sent_at || row.responded_at) && (
                          <p className="text-xs text-navy-500">
                            {row.first_sent_at &&
                              `Invited ${campaignDay(row.first_sent_at)}`}
                            {row.first_sent_at && row.responded_at && " · "}
                            {row.responded_at &&
                              `Replied ${campaignDay(row.responded_at)}`}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <CampaignPagination
                    page={page}
                    perPage={PER_PAGE}
                    total={visibleInvitees.length}
                    onPageChange={(value) =>
                      setPaging({ key: filterKey, page: value })
                    }
                    noun="invitees"
                  />
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-6">
              <PeopleEditor
                kind={tab}
                items={data.content[tab]}
                onChange={(items) => setPeople(tab, items)}
                canManage={canManage}
              />
              <p className="border-t border-navy-100 pt-4 text-xs text-navy-500">
                Speakers come from the event itself.{" "}
                <Link
                  to={`/admin/events/${encodeURIComponent(eventId)}/edit`}
                  className="font-medium text-cyan-700 hover:text-cyan-600"
                >
                  Edit speakers in the event editor
                </Link>
              </p>
            </div>
          )}
        </section>
      )}

      {canManage && dirty && (
        <div className="sticky bottom-4 z-20">
          <div
            role="region"
            aria-label="Unsaved changes"
            className="app-card mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-navy-100 bg-white px-4 py-3 shadow-lg sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="text-sm text-navy-700">
              <p className="font-medium">Unsaved sponsor and exhibitor changes</p>
              {problem && (
                <p className="mt-0.5 text-xs text-red-600">{problem}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={saving}
                onClick={() =>
                  setData((current) => ({ ...current, content: current.saved }))
                }
              >
                Discard
              </button>
              <LoadingButton
                className={BTN_PRIMARY}
                loading={saving}
                loadingLabel="Saving…"
                disabled={Boolean(problem)}
                onClick={save}
              >
                Save changes
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      <InviteModal
        key={inviteOpen ? "open" : "closed"}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        contacts={contacts}
        invited={invitedEmails}
        onInvite={invite}
      />
      {confirmDialog}
    </div>
  );
}
