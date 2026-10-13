import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { PageHeader, Card, FormField } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import CampaignSuppressionView from "../../components/admin/campaigns/CampaignSuppressionView";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav";
import CampaignEmailEditor from "../../components/admin/campaigns/CampaignEmailEditor";
import {
  campaignDirectory,
  campaignRequest,
  downloadCsv,
  parseContactCsv,
} from "../../utils/campaignWorkspaceApi";
import { fetchCampaignTemplates } from "../../utils/emailCampaignsApi";
import { normalizeDesignDocument } from "../../../shared/emailDesignCompile";
import {
  CAMPAIGN_TYPES,
  CAMPAIGN_LAYOUTS,
  campaignDate,
} from "../../../shared/campaignWorkspace";

const input =
  "w-full border border-navy-200 rounded-lg px-3 py-2 text-sm bg-white";
const titles = {
  contacts: "Contacts",
  subscriptions: "Subscription Lists",
  groups: "Contact Lists & Committees",
  memberships: "Memberships",
  senders: "Email Settings",
  templates: "Templates",
  suppressions: "Suppression Lists",
  surveys: "Surveys",
  events: "Event Invitations & Content",
};
const kinds = {
  contact_list: "Contact List",
  committee: "Committee",
  subscription: "Subscription List",
  membership_type: "Membership Type",
  smart_list: "Smart List",
};
const emptyContact = {
  email_normalized: "",
  full_name: "",
  first_name: "",
  last_name: "",
  phone: "",
  company: "",
  title: "",
  address: "",
  country: "",
  region: "",
  city: "",
  postal_code: "",
  assistant_email: "",
  marketing_opt_in: false,
};
function ContactPicker({ contacts, selected, onChange }) {
  const [search, setSearch] = useState("");
  const visible = contacts.filter((c) =>
    `${c.full_name} ${c.email_normalized}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div>
      <input
        className={input}
        placeholder="Search contacts"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p className="text-xs text-navy-500 my-2">{selected.length} selected</p>
      <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
        {visible.map((c) => (
          <label key={c.id} className="flex gap-3 text-sm p-3">
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, c.id]
                    : selected.filter((id) => id !== c.id),
                )
              }
            />
            <span>
              {c.full_name || c.email_normalized}
              <span className="block text-xs text-navy-500">
                {c.email_normalized}
                {c.unsubscribed_at
                  ? " · Unsubscribed"
                  : c.marketing_opt_in
                    ? " · Marketing consent recorded"
                    : " · No marketing consent"}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
function SurveyQuestions({ questions, onChange }) {
  const change = (index, key, value) =>
    onChange(
      questions.map((q, i) => (i === index ? { ...q, [key]: value } : q)),
    );
  return (
    <div className="space-y-4">
      {questions.map((q, index) => (
        <div key={q.id} className="border rounded-lg p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <strong>Question {index + 1}</strong>
            <button
              type="button"
              className="text-red-600"
              onClick={() => onChange(questions.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
          <input
            aria-label={`Question ${index + 1}`}
            className={input}
            placeholder="Question"
            value={q.label}
            onChange={(e) => change(index, "label", e.target.value)}
          />
          <select
            aria-label={`Question ${index + 1} type`}
            className={input}
            value={q.type}
            onChange={(e) => change(index, "type", e.target.value)}
          >
            {[
              ["text", "Text"],
              ["rating", "Rating (1–5)"],
              ["choice", "Single choice"],
              ["multiple_choice", "Multiple choice"],
            ].map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
          {["choice", "multiple_choice"].includes(q.type) && (
            <textarea
              className={input}
              aria-label={`Question ${index + 1} options`}
              placeholder="One answer option per line"
              value={(q.options || []).join("\n")}
              onChange={(e) =>
                change(index, "options", e.target.value.split("\n"))
              }
            />
          )}
          <label className="text-sm flex gap-2">
            <input
              type="checkbox"
              checked={q.required}
              onChange={(e) => change(index, "required", e.target.checked)}
            />
            Required
          </label>
        </div>
      ))}
      <button
        type="button"
        className="text-blue-600 text-sm"
        onClick={() =>
          onChange([
            ...questions,
            {
              id: crypto.randomUUID(),
              label: "",
              type: "text",
              required: false,
              options: [],
            },
          ])
        }
      >
        + Add Question
      </button>
    </div>
  );
}
export default function CampaignManagePage() {
  const { section = "contacts" } = useParams();
  const [params] = useSearchParams();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(
    section === "senders" ? "settings.manage" : "campaigns.manage",
  );
  const [directory, setDirectory] = useState(null),
    [rows, setRows] = useState([]),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [members, setMembers] = useState(null),
    [selected, setSelected] = useState([]),
    [results, setResults] = useState(null),
    [events, setEvents] = useState([]),
    [eventId, setEventId] = useState(""),
    [eventData, setEventData] = useState(null),
    [importing, setImporting] = useState(null),
    [confirmConsent, setConfirmConsent] = useState(false),
    [importResult, setImportResult] = useState(null),
    [archivedItems, setArchivedItems] = useState([]);
  const load = useCallback(async () => {
    const d = await campaignDirectory();
    setDirectory({
      ...d,
      surveys: await campaignRequest("/surveys"),
      events: await campaignRequest("/events"),
    });
    const archived = await campaignRequest("/archived");
    setArchivedItems(
      section === "templates"
        ? archived.templates
        : section === "contacts"
          ? archived.contacts
          : archived.groups.filter((group) =>
              section === "subscriptions"
                ? group.kind === "subscription"
                : group.kind !== "subscription",
            ),
    );
    if (section === "suppressions")
      setRows(await campaignRequest("/suppressions"));
    else if (section === "templates")
      setRows((await fetchCampaignTemplates()).data);
    else if (section === "surveys") setRows(await campaignRequest("/surveys"));
    else if (section === "events") setEvents(await campaignRequest("/events"));
    else setRows([]);
  }, [section]);
  useEffect(() => {
    setForm(null);
    setMembers(null);
    setResults(null);
    setImporting(null);
    setSearch("");
    void load().catch((e) => toast.error(e.message));
  }, [load, toast]);
  const run = async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const requestSave = async (path, body, method = "POST") => {
    await campaignRequest(path, { method, body });
    await load();
    setForm(null);
    toast.success("Saved.");
  };
  const save = () =>
    run(async () => {
      if (section === "contacts")
        await requestSave(
          `/contacts${form.id ? `/${form.id}` : ""}`,
          form,
          form.id ? "PUT" : "POST",
        );
      else if (section === "senders") await requestSave("/senders", form);
      else if (section === "surveys")
        await requestSave(
          `/surveys${form.id ? `/${form.id}` : ""}`,
          form,
          form.id ? "PUT" : "POST",
        );
      else if (section === "templates")
        await requestSave(
          `/templates${form.id ? `/${form.id}` : ""}`,
          form,
          form.id ? "PUT" : "POST",
        );
      else if (section === "memberships")
        await requestSave("/memberships", form);
      else
        await requestSave(
          `/groups${form.id ? `/${form.id}` : ""}`,
          form,
          form.id ? "PUT" : "POST",
        );
    });
  const create = () => {
    setResults(null);
    if (section === "contacts") setForm({ ...emptyContact });
    else if (section === "senders")
      setForm({ name: "", email: "", reply_to: "" });
    else if (section === "surveys")
      setForm({ name: "", description: "", state: "draft", questions: [] });
    else if (section === "templates")
      setForm({
        name: "",
        description: "",
        campaign_type: "regular",
        layout: "empty",
        subject: "",
        design: normalizeDesignDocument({ blocks: [] }),
      });
    else if (section === "memberships")
      setForm({
        contact_id: "",
        type_id: "",
        status: "active",
        starts_at: "",
        expires_at: "",
      });
    else
      setForm({
        kind: section === "subscriptions" ? "subscription" : "contact_list",
        name: "",
        description: "",
        is_private: false,
        active_only: false,
        auto_attendees: false,
        auto_members: false,
        auto_users: false,
        filters: {},
      });
  };
  const field = (key, label, type = "text") => (
    <FormField key={key} label={label}>
      <input
        className={input}
        type={type}
        value={form[key] || ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </FormField>
  );
  const checkbox = (key, label) => (
    <label key={key} className="flex gap-2 text-sm">
      <input
        type="checkbox"
        checked={!!form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
      />
      {label}
    </label>
  );
  if (!directory) return <p>Loading…</p>;
  const filtered = (items) =>
    (items || []).filter((row) =>
      `${row.name || row.full_name || ""} ${row.email_normalized || row.email || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const profile = directory.contacts.find(
    (contact) => contact.id === params.get("contact"),
  );
  const groups = directory.groups.filter((g) =>
    section === "subscriptions"
      ? g.kind === "subscription"
      : g.kind !== "subscription",
  );
  const archive = (path) => {
    if (window.confirm("Remove this item from the active list?"))
      void run(async () => {
        await campaignRequest(path, { method: "POST", body: {} });
        await load();
      });
  };
  const loadEvent = async (id) => {
    setEventId(id);
    if (!id) {
      setEventData(null);
      return;
    }
    const [content, invitees] = await Promise.all([
      campaignRequest(`/events/${id}/content`),
      campaignRequest(`/events/${id}/invitees`),
    ]);
    setEventData({ ...content, invitees });
  };
  return (
    <div>
      <CampaignWorkspaceNav />
      <PageHeader
        title={titles[section] || "Campaign Settings"}
        actions={
          canManage && section !== "suppressions" && section !== "events" ? (
            <button
              onClick={create}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm"
            >
              {section === "memberships"
                ? "Add Membership"
                : section === "senders"
                  ? "Add Sender"
                  : section === "templates"
                    ? "Create Template"
                    : section === "surveys"
                      ? "Create Survey"
                      : section === "contacts"
                        ? "Add Contact"
                        : "Create List"}
            </button>
          ) : null
        }
      />
      <div className="flex gap-4 text-sm text-blue-600 mb-5">
        <Link to="/admin/campaigns/manage/contacts">Contacts</Link>
        <Link to="/admin/campaigns/manage/groups">
          Contact Lists & Committees
        </Link>
        <Link to="/admin/campaigns/manage/memberships">Memberships</Link>
        <Link to="/admin/campaigns/manage/events">
          Event Invitees & Content
        </Link>
      </div>
      {section === "contacts" && profile && (
        <Card className="mb-6">
          <h2 className="font-semibold text-lg mb-4">
            {profile.full_name || profile.email_normalized}
          </h2>
          <dl className="grid sm:grid-cols-2 gap-4">
            {Object.entries(emptyContact)
              .filter(([key]) => key !== "marketing_opt_in")
              .map(([key]) => (
                <div key={key}>
                  <dt className="text-xs text-navy-500 capitalize">
                    {key.replaceAll("_", " ")}
                  </dt>
                  <dd className="text-sm mt-1">{profile[key] || "—"}</dd>
                </div>
              ))}
          </dl>
        </Card>
      )}
      {form && (
        <Card className="mb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-5"
          >
            <h2 className="font-semibold text-lg">
              {form.id ? "Edit" : "Create"}{" "}
              {section === "contacts"
                ? "Contact"
                : section === "senders"
                  ? "Sender"
                  : section === "templates"
                    ? "Template"
                    : section === "surveys"
                      ? "Survey"
                      : section === "memberships"
                        ? "Membership"
                        : "List"}
            </h2>
            {section === "contacts" && (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries({
                    email_normalized: "Email *",
                    full_name: "Full Name",
                    first_name: "First Name",
                    last_name: "Last Name",
                    phone: "Phone",
                    company: "Company",
                    title: "Job Title",
                    address: "Address",
                    country: "Country",
                    region: "State / Region",
                    city: "City",
                    postal_code: "Postal Code",
                    assistant_email: "Assistant Email",
                  }).map(([key, label]) =>
                    key === "email_normalized" && form.id ? (
                      <FormField key={key} label={label}>
                        <input className={input} value={form[key]} disabled />
                      </FormField>
                    ) : (
                      field(
                        key,
                        label,
                        key.includes("email") ? "email" : "text",
                      )
                    ),
                  )}
                </div>
                {checkbox(
                  "marketing_opt_in",
                  "I confirm this contact explicitly agreed to receive marketing emails.",
                )}
                <p className="text-xs text-navy-500">
                  Editing details does not withdraw consent. Unsubscribes are
                  managed through the recipient’s preference link.
                </p>
              </>
            )}
            {["groups", "subscriptions"].includes(section) && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  {field("name", "List Name *")}
                  <FormField label="List Type">
                    <select
                      disabled={!!form.id || section === "subscriptions"}
                      className={input}
                      value={form.kind}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, kind: e.target.value }))
                      }
                    >
                      {Object.entries(kinds).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                {field("description", "Description")}
                {form.kind === "subscription" && (
                  <div className="space-y-3">
                    {checkbox(
                      "is_private",
                      "Private List (only existing subscribers can see it)",
                    )}
                    {checkbox(
                      "active_only",
                      "Only allow active members to subscribe",
                    )}
                    <h3 className="font-semibold text-sm pt-2">
                      Automatic Subscriptions
                    </h3>
                    {checkbox("auto_attendees", "Event attendees")}
                    {checkbox("auto_members", "New members")}
                    {checkbox("auto_users", "New platform users")}
                    <p className="text-xs text-navy-500">
                      Automatic enrollment requires recorded marketing consent
                      and respects unsubscribes.
                    </p>
                  </div>
                )}
                {form.kind === "smart_list" && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      "company",
                      "country",
                      "active_member",
                      "marketing_opt_in",
                    ].map((key) => (
                      <FormField key={key} label={key.replaceAll("_", " ")}>
                        {["active_member", "marketing_opt_in"].includes(key) ? (
                          <select
                            className={input}
                            value={form.filters[key] ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                filters: {
                                  ...f.filters,
                                  [key]: e.target.value,
                                },
                              }))
                            }
                          >
                            <option value="">Any</option>
                            <option value="1">Yes</option>
                            <option value="0">No</option>
                          </select>
                        ) : (
                          <input
                            className={input}
                            value={form.filters[key] || ""}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                filters: {
                                  ...f.filters,
                                  [key]: e.target.value,
                                },
                              }))
                            }
                          />
                        )}
                      </FormField>
                    ))}
                  </div>
                )}
              </>
            )}
            {section === "memberships" && (
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Contact">
                  <select
                    className={input}
                    value={form.contact_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, contact_id: e.target.value }))
                    }
                  >
                    <option value="">Select contact</option>
                    {directory.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || c.email_normalized}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Membership Type">
                  <select
                    className={input}
                    value={form.type_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, type_id: e.target.value }))
                    }
                  >
                    <option value="">Select membership type</option>
                    {directory.groups
                      .filter((g) => g.kind === "membership_type")
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField label="Status">
                  <select
                    className={input}
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    {["active", "pending", "expired", "cancelled"].map((s) => (
                      <option value={s} key={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </FormField>
                {field("starts_at", "Start Date", "date")}
                {field("expires_at", "Expiry Date", "date")}
              </div>
            )}
            {section === "senders" && (
              <>
                <div className="grid sm:grid-cols-3 gap-4">
                  {field("name", "Sender Name *")}
                  {field("email", "Sender Email *", "email")}
                  {field("reply_to", "Reply-to Email", "email")}
                </div>
                <p className="text-sm text-navy-500">
                  The sender domain must be verified with your email provider.
                  Verification is checked by the server.
                </p>
              </>
            )}
            {section === "surveys" && (
              <>
                {field("name", "Survey Name *")}
                {field("description", "Description")}
                <FormField label="Status">
                  <select
                    className={input}
                    value={form.state}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, state: e.target.value }))
                    }
                  >
                    {["draft", "published", "closed"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </FormField>
                <SurveyQuestions
                  questions={form.questions || []}
                  onChange={(questions) =>
                    setForm((f) => ({ ...f, questions }))
                  }
                />
              </>
            )}
            {section === "templates" && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  {field("name", "Template Name *")}
                  <FormField label="Campaign Type">
                    <select
                      className={input}
                      value={form.campaign_type}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          campaign_type: e.target.value,
                        }))
                      }
                    >
                      {CAMPAIGN_TYPES.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {field("description", "Description")}
                  {field("subject", "Default Subject Line")}
                </div>
                <FormField label="Layout">
                  <select
                    className={input}
                    value={form.design.layout || "empty"}
                    onChange={(e) => {
                      if (
                        window.confirm("Start a new template with this layout?")
                      )
                        setForm((old) => ({
                          ...old,
                          layout_key: e.target.value,
                          design: normalizeDesignDocument({
                            layout: e.target.value,
                            blocks:
                              e.target.value === "left_sidebar" ||
                              e.target.value === "right_sidebar"
                                ? [
                                    {
                                      type: "columns",
                                      column_widths:
                                        e.target.value === "left_sidebar"
                                          ? [30, 70]
                                          : [70, 30],
                                      column_blocks: [[], []],
                                    },
                                  ]
                                : [],
                            html: "",
                          }),
                        }));
                    }}
                  >
                    {CAMPAIGN_LAYOUTS.map((layout) => (
                      <option key={layout.id} value={layout.id}>
                        {layout.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <CampaignEmailEditor
                  design={form.design}
                  campaignType={form.campaign_type}
                  onChange={(design) => setForm((f) => ({ ...f, design }))}
                  surveys={directory.surveys || []}
                  events={directory.events || []}
                />
              </>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="border rounded-lg px-4 py-2"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button
                className="bg-blue-600 text-white rounded-lg px-5 py-2"
                disabled={busy}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Card>
      )}
      {members && (
        <Card className="mb-6">
          <h2 className="font-semibold mb-4">{members.name} — Contacts</h2>
          <ContactPicker
            contacts={directory.contacts}
            selected={selected}
            onChange={setSelected}
          />
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setMembers(null)}>Cancel</button>
            <button
              disabled={busy}
              className="bg-blue-600 text-white rounded-lg px-4 py-2"
              onClick={() =>
                run(async () => {
                  await campaignRequest(`/groups/${members.id}/members`, {
                    method: "POST",
                    body: { contact_ids: selected },
                  });
                  setMembers(null);
                  await load();
                })
              }
            >
              Save Contacts
            </button>
          </div>
        </Card>
      )}
      {section === "contacts" && (
        <>
          <div className="flex gap-3 mb-4">
            <input
              className={input}
              placeholder="Search contacts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {canManage && (
              <label className="border rounded-lg px-4 py-2 shrink-0 text-sm cursor-pointer">
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) =>
                    run(async () => {
                      const file = e.target.files[0];
                      if (file.size > 5000000)
                        throw new Error("Use a CSV smaller than 5 MB.");
                      setImporting(parseContactCsv(await file.text()));
                      setConfirmConsent(false);
                      setImportResult(null);
                      e.target.value = "";
                    })
                  }
                />
              </label>
            )}
            <button
              className="border rounded-lg px-4 shrink-0 text-sm"
              onClick={() =>
                downloadCsv(
                  "contacts.csv",
                  Object.keys(emptyContact),
                  filtered(directory.contacts).map((c) =>
                    Object.keys(emptyContact).map((key) => c[key]),
                  ),
                )
              }
            >
              Export
            </button>
          </div>
          {importing && (
            <Card className="mb-4">
              <h2 className="font-semibold mb-3">
                Import {importing.length} Contacts
              </h2>
              <p className="text-sm mb-3">
                Columns: email, full_name, first_name, last_name, phone,
                company, title, assistant_email, address, country, region, city,
                postal_code, marketing_opt_in.
              </p>
              <label className="text-sm flex gap-2">
                <input
                  type="checkbox"
                  checked={confirmConsent}
                  onChange={(e) => setConfirmConsent(e.target.checked)}
                />
                I confirm the contacts marked marketing_opt_in agreed to
                marketing emails.
              </label>
              <div className="flex gap-3 mt-4">
                <button
                  disabled={busy}
                  className="bg-blue-600 text-white rounded px-4 py-2"
                  onClick={() =>
                    run(async () => {
                      const result = await campaignRequest("/contacts/import", {
                        method: "POST",
                        body: {
                          contacts: importing,
                          confirmed_consent: confirmConsent,
                        },
                      });
                      setImportResult(result);
                      setImporting(null);
                      await load();
                    })
                  }
                >
                  Import
                </button>
                <button onClick={() => setImporting(null)}>Cancel</button>
              </div>
            </Card>
          )}
          {importResult && (
            <Card className="mb-4">
              <p>{importResult.imported} contacts imported.</p>
              {importResult.errors.map((row) => (
                <p className="text-sm text-red-600 mt-2" key={row.row}>
                  Row {row.row}: {row.message}
                </p>
              ))}
            </Card>
          )}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {["Name", "Email", "Company", "Consent", "Actions"].map(
                      (h) => (
                        <th key={h} className="text-left p-3 border-b">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered(directory.contacts).map((c) => (
                    <tr key={c.id}>
                      <td className="p-3 border-b">{c.full_name || "—"}</td>
                      <td className="p-3 border-b">{c.email_normalized}</td>
                      <td className="p-3 border-b">{c.company || "—"}</td>
                      <td className="p-3 border-b">
                        {c.unsubscribed_at
                          ? "Unsubscribed"
                          : c.marketing_opt_in
                            ? "Opted in"
                            : "Not recorded"}
                      </td>
                      <td className="p-3 border-b">
                        {canManage && (
                          <div className="flex gap-3">
                            <button
                              className="text-blue-600"
                              onClick={() =>
                                setForm({ ...c, marketing_opt_in: false })
                              }
                            >
                              Edit
                            </button>
                            <button
                              className="text-red-600"
                              onClick={() =>
                                archive(`/contacts/${c.id}/archive`)
                              }
                            >
                              Archive
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-navy-500 mt-4">
              {directory.contacts.length} contacts. Account and attendee details
              are synchronized without assuming marketing consent.
            </p>
          </Card>
        </>
      )}
      {["groups", "subscriptions"].includes(section) && (
        <Card>
          {!groups.length && (
            <p className="text-sm text-navy-500">
              Create your first list to organize campaign recipients.
            </p>
          )}
          {groups.map((g) => (
            <div
              key={g.id}
              className="border-b py-4 flex justify-between gap-4"
            >
              <div>
                <strong>{g.name}</strong>
                <p className="text-xs text-navy-500 mt-2">
                  {kinds[g.kind]} · {g.members} contacts
                  {g.is_private ? " · Private" : " · Public"}
                  {g.active_only ? " · Active Members Only" : ""}
                </p>
                <p className="text-sm text-navy-500 mt-1">{g.description}</p>
              </div>
              {canManage && (
                <div className="flex gap-3 text-sm">
                  <button
                    className="text-blue-600"
                    onClick={() => setForm({ ...g })}
                  >
                    Edit
                  </button>
                  {!["smart_list", "membership_type"].includes(g.kind) && (
                    <button
                      className="text-blue-600"
                      onClick={() => {
                        setMembers(g);
                        setSelected(
                          directory.group_members
                            .filter(
                              (m) =>
                                m.group_id === g.id && m.state === "active",
                            )
                            .map((m) => m.contact_id),
                        );
                      }}
                    >
                      Contacts
                    </button>
                  )}
                  <button
                    className="text-red-600"
                    onClick={() => archive(`/groups/${g.id}/archive`)}
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      {section === "memberships" && (
        <Card>
          {directory.memberships.map((m) => (
            <div
              key={m.id}
              className="flex justify-between gap-4 py-4 border-b"
            >
              <div>
                <strong>{m.full_name || m.email_normalized}</strong>
                <p className="text-sm text-navy-500 mt-1">
                  {m.type_name} · {m.status} ·{" "}
                  {String(m.starts_at || "").slice(0, 10) || "No start date"} —{" "}
                  {String(m.expires_at || "").slice(0, 10) || "No expiry"}
                </p>
              </div>
              {canManage && (
                <button
                  className="text-sm text-blue-600"
                  onClick={() =>
                    setForm({
                      ...m,
                      starts_at: String(m.starts_at || "").slice(0, 10),
                      expires_at: String(m.expires_at || "").slice(0, 10),
                    })
                  }
                >
                  Edit
                </button>
              )}
            </div>
          ))}
          {!directory.memberships.length && (
            <p className="text-sm text-navy-500">
              Create membership types under Contact Lists & Committees, then
              assign memberships here.
            </p>
          )}
        </Card>
      )}
      {section === "senders" && (
        <Card>
          <div className="flex justify-between mb-4">
            <h2 className="font-semibold">Sender Emails</h2>
            {hasPermission("settings.manage") && (
              <button
                className="text-blue-600 text-sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await campaignRequest("/senders/verify", {
                      method: "POST",
                      body: {},
                    });
                    await load();
                    toast.success(
                      `${result.checked} sender identities checked.`,
                    );
                  })
                }
              >
                Check Verification
              </button>
            )}
          </div>
          {directory.senders.map((s) => (
            <div className="border-t py-4 flex justify-between" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <p className="text-sm mt-1">{s.email}</p>
                <p className="text-xs text-navy-500 mt-1">
                  Reply-to: {s.reply_to} · {s.status}
                </p>
              </div>
              {hasPermission("settings.manage") && (
                <button
                  className="text-sm text-blue-600"
                  onClick={() => setForm({ ...s })}
                >
                  Edit
                </button>
              )}
            </div>
          ))}
          <p className="text-sm text-navy-500 mt-5">
            Campaign delivery uses Resend. Existing account and ticket emails
            keep their SMTP configuration.
          </p>
        </Card>
      )}
      {section === "templates" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((t) => (
            <Card key={t.id}>
              <h2 className="font-semibold">{t.name}</h2>
              <p className="text-xs text-navy-500 mt-2">
                {CAMPAIGN_TYPES.find((type) => type.id === t.campaign_type)
                  ?.name || "Event Notification"}
              </p>
              <p className="text-sm text-navy-500 mt-2">{t.description}</p>
              {canManage && (
                <div className="flex gap-3 mt-4 text-sm">
                  <button
                    className="text-blue-600"
                    onClick={() => setForm({ ...t })}
                  >
                    Edit Design
                  </button>
                  <button
                    className="text-red-600"
                    onClick={() => archive(`/templates/${t.id}/archive`)}
                  >
                    Archive
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {section === "suppressions" && <CampaignSuppressionView data={rows} />}
      {section === "surveys" && (
        <>
          <Card>
            {rows.map((s) => (
              <div
                key={s.id}
                className="flex justify-between gap-4 py-4 border-b"
              >
                <div>
                  <strong>{s.name}</strong>
                  <p className="text-sm text-navy-500 mt-1">
                    {s.state} · {s.responses} responses
                  </p>
                  {s.state === "published" && (
                    <Link
                      to={`/email/surveys/${s.id}`}
                      target="_blank"
                      className="text-xs text-blue-600 mt-2 inline-block"
                    >
                      Open Survey
                    </Link>
                  )}
                </div>
                <div className="flex gap-3 text-sm">
                  {canManage && (
                    <button
                      className="text-blue-600"
                      onClick={() => setForm({ ...s })}
                    >
                      Edit
                    </button>
                  )}
                  {canManage && (
                    <button
                      className="text-blue-600"
                      onClick={() =>
                        setForm({
                          ...s,
                          id: undefined,
                          name: `${s.name} (copy)`,
                          state: "draft",
                        })
                      }
                    >
                      Duplicate
                    </button>
                  )}
                  <button
                    onClick={() =>
                      run(async () =>
                        setResults(
                          await campaignRequest(`/surveys/${s.id}/results`),
                        ),
                      )
                    }
                  >
                    Results
                  </button>
                </div>
              </div>
            ))}
            {!rows.length && (
              <p className="text-sm text-navy-500">
                Create a survey and add it to a campaign using the Survey
                element.
              </p>
            )}
          </Card>
          {results && (
            <Card className="mt-5">
              <div className="flex justify-between mb-4">
                <h2 className="font-semibold">
                  {results.survey.name} — Results
                </h2>
                <button
                  className="text-blue-600 text-sm"
                  onClick={() =>
                    downloadCsv(
                      "survey-results.csv",
                      ["Date", ...results.survey.questions.map((q) => q.label)],
                      results.responses.map((r) => [
                        campaignDate(r.created_at),
                        ...results.survey.questions.map((q) =>
                          Array.isArray(r.answers[q.id])
                            ? r.answers[q.id].join("; ")
                            : r.answers[q.id],
                        ),
                      ]),
                    )
                  }
                >
                  Export
                </button>
              </div>
              <p className="text-sm mb-4">
                {results.responses.length} responses
              </p>
              {results.survey.questions.map((q) => {
                const answers = results.responses
                  .map((r) => r.answers[q.id])
                  .filter((v) => v !== undefined && v !== null && v !== "");
                return (
                  <section key={q.id} className="border-t py-4">
                    <h3 className="font-semibold text-sm mb-2">{q.label}</h3>
                    {q.type === "rating" ? (
                      <p className="text-sm">
                        Average:{" "}
                        {answers.length
                          ? (
                              answers.reduce((sum, v) => sum + Number(v), 0) /
                              answers.length
                            ).toFixed(2)
                          : "—"}{" "}
                        / 5
                      </p>
                    ) : q.options?.length ? (
                      <div>
                        {q.options.map((option) => {
                          const count = answers.filter((v) =>
                            Array.isArray(v)
                              ? v.includes(option)
                              : v === option,
                          ).length;
                          return (
                            <div key={option} className="text-sm my-2">
                              <div className="flex justify-between">
                                <span>{option}</span>
                                <span>{count}</span>
                              </div>
                              <div className="h-2 bg-navy-100 mt-1 rounded">
                                <div
                                  className="h-2 bg-blue-600 rounded"
                                  style={{
                                    width: `${answers.length ? (count / answers.length) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-auto text-sm space-y-2">
                        {answers.map((value, i) => (
                          <p key={i}>{value}</p>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </Card>
          )}
        </>
      )}
      {section === "events" && (
        <Card>
          <FormField label="Event">
            <select
              className={input}
              value={eventId}
              onChange={(e) => run(() => loadEvent(e.target.value))}
            >
              <option value="">Select Event</option>
              {Array.isArray(events) &&
                events.map((event) => (
                  <option value={event.id} key={event.id}>
                    {event.title}
                  </option>
                ))}
            </select>
          </FormField>
          {eventData && (
            <div className="mt-6 space-y-6">
              <h2 className="font-semibold">Event Invitees</h2>
              {eventData.invitees.map((i) => (
                <p className="text-sm border-b py-2" key={i.id}>
                  {i.display_name} · {i.email_normalized} · {i.state}
                </p>
              ))}
              {canManage && (
                <details>
                  <summary className="text-blue-600 text-sm cursor-pointer">
                    Add Contacts to Invitees
                  </summary>
                  <div className="mt-3">
                    <ContactPicker
                      contacts={directory.contacts}
                      selected={selected}
                      onChange={setSelected}
                    />
                    <button
                      disabled={busy || !selected.length}
                      className="bg-blue-600 text-white rounded px-4 py-2 mt-3"
                      onClick={() =>
                        run(async () => {
                          await campaignRequest(`/events/${eventId}/invitees`, {
                            method: "POST",
                            body: { contact_ids: selected },
                          });
                          setSelected([]);
                          await loadEvent(eventId);
                        })
                      }
                    >
                      Add Invitees
                    </button>
                  </div>
                </details>
              )}
              {["sponsors", "exhibitors"].map((key) => (
                <section key={key}>
                  <h2 className="font-semibold capitalize mb-3">{key}</h2>
                  {(eventData.content[key] || []).map((person, index) => (
                    <div className="flex gap-2 mb-3" key={person.id}>
                      <input
                        className={input}
                        placeholder="Name"
                        value={person.name}
                        disabled={!canManage}
                        onChange={(e) =>
                          setEventData((d) => ({
                            ...d,
                            content: {
                              ...d.content,
                              [key]: d.content[key].map((p, i) =>
                                i === index
                                  ? { ...p, name: e.target.value }
                                  : p,
                              ),
                            },
                          }))
                        }
                      />
                      <input
                        className={input}
                        placeholder="Image URL"
                        disabled={!canManage}
                        value={person.image}
                        onChange={(e) =>
                          setEventData((d) => ({
                            ...d,
                            content: {
                              ...d.content,
                              [key]: d.content[key].map((p, i) =>
                                i === index
                                  ? { ...p, image: e.target.value }
                                  : p,
                              ),
                            },
                          }))
                        }
                      />
                      {canManage && (
                        <button
                          aria-label="Remove"
                          onClick={() =>
                            setEventData((d) => ({
                              ...d,
                              content: {
                                ...d.content,
                                [key]: d.content[key].filter(
                                  (_, i) => i !== index,
                                ),
                              },
                            }))
                          }
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {canManage && (
                    <button
                      className="text-blue-600 text-sm"
                      onClick={() =>
                        setEventData((d) => ({
                          ...d,
                          content: {
                            ...d.content,
                            [key]: [
                              ...(d.content[key] || []),
                              {
                                id: crypto.randomUUID(),
                                name: "",
                                image: "",
                                position: "",
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Add {key === "sponsors" ? "Sponsor" : "Exhibitor"}
                    </button>
                  )}
                </section>
              ))}
              {canManage && (
                <button
                  disabled={busy}
                  className="bg-blue-600 text-white rounded-lg px-4 py-2"
                  onClick={() =>
                    run(async () => {
                      await campaignRequest(`/events/${eventId}/content`, {
                        method: "PUT",
                        body: eventData.content,
                      });
                      toast.success("Event campaign content saved.");
                    })
                  }
                >
                  Save Event Content
                </button>
              )}
              <p className="text-xs text-navy-500">
                Speakers are managed in the event editor. Invitation responses
                do not replace booking, payment, or registration.
              </p>
            </div>
          )}
        </Card>
      )}
      {canManage && archivedItems.length > 0 && (
        <details className="mt-6 border rounded-lg p-4">
          <summary className="text-sm cursor-pointer">
            Archived Items ({archivedItems.length})
          </summary>
          {archivedItems.map((item) => (
            <div
              className="flex justify-between border-t mt-3 pt-3 text-sm"
              key={item.id}
            >
              <span>
                {item.name || item.full_name || item.email_normalized}
              </span>
              <button
                className="text-blue-600"
                onClick={() =>
                  run(async () => {
                    await campaignRequest(
                      `/${section === "templates" ? "templates" : section === "contacts" ? "contacts" : "groups"}/${item.id}/restore`,
                      { method: "POST", body: {} },
                    );
                    await load();
                  })
                }
              >
                Restore
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
