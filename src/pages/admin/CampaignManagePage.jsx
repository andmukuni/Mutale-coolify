import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  Archive,
  BarChart3,
  Copy,
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  Users,
  X,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  PageHeader,
  Card,
  FormField,
  Modal,
  DataTable,
  StatusBadge,
  LoadingButton,
} from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import CampaignSuppressionView from "../../components/admin/campaigns/CampaignSuppressionView";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav";
import CampaignEmailEditor from "../../components/admin/campaigns/CampaignEmailEditor";
import CampaignEventInvitees from "../../components/admin/campaigns/CampaignEventInvitees";
import CampaignDeliveryPanel from "../../components/admin/campaigns/CampaignDeliveryPanel";
import useCampaignConfirm from "../../components/admin/campaigns/useCampaignConfirm";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_ICON,
  CHECKBOX,
  INPUT,
  INPUT_SM,
  LINK_ACTION,
  LINK_DANGER,
  LINK_MUTED,
  SECTION_TITLE,
} from "../../components/admin/campaigns/campaignStyles";
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

const sectionMeta = {
  contacts: {
    title: "Contacts",
    subtitle: "Everyone you can reach with campaigns, with their consent status.",
    noun: "Contact",
    create: "Add contact",
  },
  subscriptions: {
    title: "Subscription lists",
    subtitle: "Lists recipients can opt into from their email preferences.",
    noun: "Subscription list",
    create: "Create list",
  },
  groups: {
    title: "Contact lists & committees",
    subtitle: "Static lists, committees, membership types and smart lists.",
    noun: "List",
    create: "Create list",
  },
  memberships: {
    title: "Memberships",
    subtitle: "Assign membership types and track their status and expiry.",
    noun: "Membership",
    create: "Add membership",
  },
  senders: {
    title: "Sender settings",
    subtitle: "Verified sender identities used as the campaign From address.",
    noun: "Sender",
    create: "Add sender",
  },
  templates: {
    title: "Templates",
    subtitle: "Reusable email designs for regular and event campaigns.",
    noun: "Template",
    create: "Create template",
  },
  suppressions: {
    title: "Suppression lists",
    subtitle: "Contacts that will not receive campaigns due to bounces or unsubscribes.",
  },
  surveys: {
    title: "Surveys",
    subtitle: "Collect feedback by adding a Survey element to your campaigns.",
    noun: "Survey",
    create: "Create survey",
  },
  events: {
    title: "Event invitees & content",
    subtitle: "Manage invitation lists, sponsors and exhibitors per event.",
  },
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
const contactFields = {
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
};
const ARCHIVABLE = ["contacts", "templates", "groups", "subscriptions"];

function consentStatus(contact) {
  if (contact.unsubscribed_at) return "unsubscribed";
  return contact.marketing_opt_in ? "opted_in" : "not_recorded";
}
function ConsentBadge({ contact }) {
  const status = consentStatus(contact);
  const styles = {
    unsubscribed: "bg-red-50 text-red-700 ring-red-600/20",
    opted_in: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    not_recorded: "bg-navy-50 text-navy-500 ring-navy-500/20",
  };
  const labels = {
    unsubscribed: "Unsubscribed",
    opted_in: "Opted in",
    not_recorded: "Not recorded",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function SearchInput({ value, onChange, placeholder, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none"
      />
      <input
        aria-label={placeholder}
        className={`${INPUT_SM} pl-9`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ContactPicker({ contacts, selected, onChange }) {
  const [search, setSearch] = useState("");
  const visible = contacts.filter((c) =>
    `${c.full_name} ${c.email_normalized}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search contacts"
      />
      <p className="text-xs font-medium text-navy-500 my-2">
        {selected.length} selected
      </p>
      <div className="max-h-72 overflow-y-auto rounded-xl border border-navy-100 divide-y divide-navy-100">
        {visible.map((c) => (
          <label
            key={c.id}
            className="flex items-start gap-3 text-sm px-3 py-2.5 hover:bg-navy-50 cursor-pointer"
          >
            <input
              type="checkbox"
              className={`${CHECKBOX} mt-0.5`}
              checked={selected.includes(c.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, c.id]
                    : selected.filter((id) => id !== c.id),
                )
              }
            />
            <span className="min-w-0">
              <span className="font-medium text-navy-900">
                {c.full_name || c.email_normalized}
              </span>
              <span className="block text-xs text-navy-500 truncate">
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
        {!visible.length && (
          <p className="px-3 py-6 text-center text-sm text-navy-500">
            No contacts match your search.
          </p>
        )}
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
      <h3 className={SECTION_TITLE}>Questions</h3>
      {questions.map((q, index) => (
        <div
          key={q.id}
          className="rounded-xl border border-navy-100 bg-navy-50/40 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-navy-500">
              Question {index + 1}
            </span>
            <button
              type="button"
              className={LINK_DANGER}
              onClick={() => onChange(questions.filter((_, i) => i !== index))}
            >
              <Trash2 size={14} />
              Remove
            </button>
          </div>
          <input
            aria-label={`Question ${index + 1}`}
            className={INPUT_SM}
            placeholder="Question"
            value={q.label}
            onChange={(e) => change(index, "label", e.target.value)}
          />
          <select
            aria-label={`Question ${index + 1} type`}
            className={INPUT_SM}
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
              className={`${INPUT_SM} min-h-24`}
              aria-label={`Question ${index + 1} options`}
              placeholder="One answer option per line"
              value={(q.options || []).join("\n")}
              onChange={(e) =>
                change(index, "options", e.target.value.split("\n"))
              }
            />
          )}
          <label className="flex items-center gap-2 text-sm text-navy-700">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={q.required}
              onChange={(e) => change(index, "required", e.target.checked)}
            />
            Required
          </label>
        </div>
      ))}
      <button
        type="button"
        className={BTN_SECONDARY}
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
        <Plus size={15} />
        Add question
      </button>
    </div>
  );
}

export default function CampaignManagePage() {
  const { section = "contacts" } = useParams();
  const [params] = useSearchParams();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const [confirm, confirmDialog] = useCampaignConfirm();
  const canManage = hasPermission(
    section === "senders" ? "settings.manage" : "campaigns.manage",
  );
  const meta = sectionMeta[section] || {
    title: "Campaign settings",
  };
  const [directory, setDirectory] = useState(null),
    [rows, setRows] = useState([]),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [members, setMembers] = useState(null),
    [selected, setSelected] = useState([]),
    [results, setResults] = useState(null),
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
    if (ARCHIVABLE.includes(section)) {
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
    } else setArchivedItems([]);
    if (section === "suppressions")
      setRows(await campaignRequest("/suppressions"));
    else if (section === "templates")
      setRows((await fetchCampaignTemplates()).data);
    else if (section === "surveys") setRows(await campaignRequest("/surveys"));
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
    toast.success(`${meta.noun || "Item"} saved.`);
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
    <FormField
      key={key}
      label={label.replace(/ \*$/, "")}
      required={label.endsWith("*")}
      name={`campaign-${section}-${key}`}
      type={type}
      value={form[key] || ""}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
    />
  );
  const checkbox = (key, label) => (
    <label key={key} className="flex items-start gap-2 text-sm text-navy-700">
      <input
        type="checkbox"
        className={`${CHECKBOX} mt-0.5`}
        checked={!!form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
      />
      {label}
    </label>
  );
  const archive = async (path, name) => {
    if (
      await confirm({
        title: "Archive item",
        message: `Remove “${name}” from the active list? You can restore it from Archived items.`,
        confirmLabel: "Archive",
        variant: "danger",
      })
    )
      void run(async () => {
        await campaignRequest(path, { method: "POST", body: {} });
        await load();
        toast.success("Item archived.");
      });
  };

  const header = (
    <div>
      <PageHeader
        title={meta.title}
        subtitle={meta.subtitle}
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "Campaigns", to: "/admin/campaigns" },
          { label: meta.title },
        ]}
        actions={
          canManage && meta.create ? (
            <button type="button" onClick={create} className={BTN_PRIMARY}>
              <Plus size={15} />
              {meta.create}
            </button>
          ) : null
        }
      />
      <CampaignWorkspaceNav />
    </div>
  );

  if (!directory)
    return (
      <div className="space-y-6">
        {header}
        <DataTable columns={[{}, {}, {}, {}]} loading />
      </div>
    );

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

  const formFields = form && (
    <>
      {section === "contacts" && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(contactFields).map(([key, label]) =>
              key === "email_normalized" && form.id ? (
                <FormField
                  key={key}
                  label="Email"
                  value={form[key]}
                  disabled
                />
              ) : (
                field(key, label, key.includes("email") ? "email" : "text")
              ),
            )}
          </div>
          <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-4 space-y-2">
            {checkbox(
              "marketing_opt_in",
              "I confirm this contact explicitly agreed to receive marketing emails.",
            )}
            <p className="text-xs text-navy-500 pl-6">
              Editing details does not withdraw consent. Unsubscribes are
              managed through the recipient’s preference link.
            </p>
          </div>
        </>
      )}
      {["groups", "subscriptions"].includes(section) && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            {field("name", "List Name *")}
            <FormField label="List type">
              <select
                disabled={!!form.id || section === "subscriptions"}
                className={INPUT}
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
                "Private list (only existing subscribers can see it)",
              )}
              {checkbox("active_only", "Only allow active members to subscribe")}
              <h3 className="text-sm font-semibold text-navy-900 pt-2">
                Automatic subscriptions
              </h3>
              {checkbox("auto_attendees", "Event attendees")}
              {checkbox("auto_members", "New members")}
              {checkbox("auto_users", "New platform users")}
              <p className="text-xs text-navy-500">
                Automatic enrollment requires recorded marketing consent and
                respects unsubscribes.
              </p>
            </div>
          )}
          {form.kind === "smart_list" && (
            <div className="grid sm:grid-cols-2 gap-4">
              {["company", "country", "active_member", "marketing_opt_in"].map(
                (key) => {
                  const label = key
                    .replaceAll("_", " ")
                    .replace(/^\w/, (c) => c.toUpperCase());
                  const setFilter = (e) =>
                    setForm((f) => ({
                      ...f,
                      filters: { ...f.filters, [key]: e.target.value },
                    }));
                  return ["active_member", "marketing_opt_in"].includes(key) ? (
                    <FormField
                      key={key}
                      label={label}
                      type="select"
                      value={form.filters[key] ?? ""}
                      onChange={setFilter}
                      options={[
                        { value: "", label: "Any" },
                        { value: "1", label: "Yes" },
                        { value: "0", label: "No" },
                      ]}
                    />
                  ) : (
                    <FormField
                      key={key}
                      label={label}
                      value={form.filters[key] || ""}
                      onChange={setFilter}
                    />
                  );
                },
              )}
            </div>
          )}
        </>
      )}
      {section === "memberships" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField
            label="Contact"
            type="select"
            required
            value={form.contact_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, contact_id: e.target.value }))
            }
            options={[
              { value: "", label: "Select contact" },
              ...directory.contacts.map((c) => ({
                value: c.id,
                label: c.full_name || c.email_normalized,
              })),
            ]}
          />
          <FormField
            label="Membership type"
            type="select"
            required
            value={form.type_id}
            onChange={(e) => setForm((f) => ({ ...f, type_id: e.target.value }))}
            options={[
              { value: "", label: "Select membership type" },
              ...directory.groups
                .filter((g) => g.kind === "membership_type")
                .map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
          <FormField
            label="Status"
            type="select"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            options={["active", "pending", "expired", "cancelled"].map((s) => ({
              value: s,
              label: s[0].toUpperCase() + s.slice(1),
            }))}
          />
          <div className="hidden sm:block" />
          {field("starts_at", "Start Date", "date")}
          {field("expires_at", "Expiry Date", "date")}
        </div>
      )}
      {section === "senders" && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            {field("name", "Sender Name *")}
            {field("email", "Sender Email *", "email")}
            {field("reply_to", "Reply-to Email", "email")}
          </div>
          <p className="flex items-start gap-2 text-sm text-navy-500">
            <ShieldCheck size={16} className="shrink-0 mt-0.5 text-cyan-600" />
            Use an address on the same domain as your SMTP account, then
            click Check senders to verify it.
          </p>
        </>
      )}
      {section === "surveys" && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            {field("name", "Survey Name *")}
            <FormField
              label="Status"
              type="select"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              options={["draft", "published", "closed"].map((s) => ({
                value: s,
                label: s[0].toUpperCase() + s.slice(1),
              }))}
            />
          </div>
          {field("description", "Description")}
          <SurveyQuestions
            questions={form.questions || []}
            onChange={(questions) => setForm((f) => ({ ...f, questions }))}
          />
        </>
      )}
      {section === "templates" && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {field("name", "Template Name *")}
            <FormField
              label="Campaign type"
              type="select"
              value={form.campaign_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, campaign_type: e.target.value }))
              }
              options={CAMPAIGN_TYPES.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
            {field("description", "Description")}
            {field("subject", "Default Subject Line")}
          </div>
          <div className="max-w-xs">
            <FormField label="Layout">
              <select
                className={INPUT}
                value={form.design.layout || "empty"}
                onChange={async (e) => {
                  const layout = e.target.value;
                  if (
                    !(await confirm({
                      title: "Start a new template",
                      message:
                        "Start a new template with this layout? The current design will be replaced.",
                      confirmLabel: "Replace design",
                    }))
                  )
                    return;
                  setForm((old) => ({
                    ...old,
                    layout_key: layout,
                    design: normalizeDesignDocument({
                      layout,
                      blocks:
                        layout === "left_sidebar" || layout === "right_sidebar"
                          ? [
                              {
                                type: "columns",
                                column_widths:
                                  layout === "left_sidebar"
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
          </div>
          <CampaignEmailEditor
            design={form.design}
            campaignType={form.campaign_type}
            onChange={(design) => setForm((f) => ({ ...f, design }))}
            surveys={directory.surveys || []}
            events={directory.events || []}
          />
        </>
      )}
    </>
  );
  const formTitle = form
    ? `${form.id ? "Edit" : "Create"} ${(meta.noun || "item").toLowerCase()}`
    : "";
  const formActions = (
    <>
      <button
        type="button"
        className={BTN_SECONDARY}
        disabled={busy}
        onClick={() => setForm(null)}
      >
        Cancel
      </button>
      <LoadingButton
        type="submit"
        form="campaign-manage-form"
        className={BTN_PRIMARY}
        loading={busy}
        loadingLabel="Saving…"
      >
        Save
      </LoadingButton>
    </>
  );
  const formElement = (
    <form
      id="campaign-manage-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-5"
    >
      {formFields}
    </form>
  );

  const contactColumns = [
    {
      key: "full_name",
      label: "Name",
      render: (v, c) => (
        <Link
          to={`/admin/campaigns/manage/contacts?contact=${c.id}`}
          className="font-medium text-navy-900 hover:text-cyan-700"
        >
          {v || "—"}
        </Link>
      ),
    },
    { key: "email_normalized", label: "Email" },
    { key: "company", label: "Company", render: (v) => v || "—" },
    {
      key: "consent",
      label: "Consent",
      render: (_v, c) => <ConsentBadge contact={c} />,
    },
    {
      key: "actions",
      label: "",
      render: (_v, c) =>
        canManage ? (
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className={LINK_ACTION}
              onClick={() => setForm({ ...c, marketing_opt_in: false })}
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              type="button"
              className={LINK_DANGER}
              onClick={() =>
                archive(
                  `/contacts/${c.id}/archive`,
                  c.full_name || c.email_normalized,
                )
              }
            >
              <Archive size={14} />
              Archive
            </button>
          </div>
        ) : null,
    },
  ];
  const groupColumns = [
    {
      key: "name",
      label: "List",
      render: (v, g) => (
        <div>
          <p className="font-medium text-navy-900">{v}</p>
          {g.description && (
            <p className="text-xs text-navy-500 mt-0.5">{g.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "kind",
      label: "Type",
      render: (v) => (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-cyan-50 text-cyan-700 ring-cyan-600/20">
          {kinds[v] || v}
        </span>
      ),
    },
    {
      key: "members",
      label: "Contacts",
      align: "right",
      render: (v) => <span className="tabular-nums">{v ?? 0}</span>,
    },
    {
      key: "visibility",
      label: "Visibility",
      render: (_v, g) => (
        <span className="text-sm text-navy-600">
          {g.is_private ? "Private" : "Public"}
          {g.active_only ? " · Active members only" : ""}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (_v, g) =>
        canManage ? (
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className={LINK_ACTION}
              onClick={() => setForm({ ...g })}
            >
              <Pencil size={14} />
              Edit
            </button>
            {!["smart_list", "membership_type"].includes(g.kind) && (
              <button
                type="button"
                className={LINK_ACTION}
                onClick={() => {
                  setMembers(g);
                  setSelected(
                    directory.group_members
                      .filter(
                        (m) => m.group_id === g.id && m.state === "active",
                      )
                      .map((m) => m.contact_id),
                  );
                }}
              >
                <Users size={14} />
                Contacts
              </button>
            )}
            <button
              type="button"
              className={LINK_DANGER}
              onClick={() => archive(`/groups/${g.id}/archive`, g.name)}
            >
              <Archive size={14} />
              Archive
            </button>
          </div>
        ) : null,
    },
  ];
  const membershipColumns = [
    {
      key: "full_name",
      label: "Member",
      render: (v, m) => (
        <div>
          <p className="font-medium text-navy-900">
            {v || m.email_normalized}
          </p>
          {v && (
            <p className="text-xs text-navy-500 mt-0.5">{m.email_normalized}</p>
          )}
        </div>
      ),
    },
    { key: "type_name", label: "Membership type" },
    {
      key: "status",
      label: "Status",
      render: (v) => <StatusBadge status={v} />,
    },
    {
      key: "period",
      label: "Period",
      render: (_v, m) => (
        <span className="text-sm text-navy-600 whitespace-nowrap">
          {String(m.starts_at || "").slice(0, 10) || "No start date"} —{" "}
          {String(m.expires_at || "").slice(0, 10) || "No expiry"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (_v, m) =>
        canManage ? (
          <div className="flex justify-end">
            <button
              type="button"
              className={LINK_ACTION}
              onClick={() =>
                setForm({
                  ...m,
                  starts_at: String(m.starts_at || "").slice(0, 10),
                  expires_at: String(m.expires_at || "").slice(0, 10),
                })
              }
            >
              <Pencil size={14} />
              Edit
            </button>
          </div>
        ) : null,
    },
  ];
  const senderColumns = [
    {
      key: "name",
      label: "Sender",
      render: (v, s) => (
        <div>
          <p className="font-medium text-navy-900">{v}</p>
          <p className="text-xs text-navy-500 mt-0.5">{s.email}</p>
        </div>
      ),
    },
    { key: "reply_to", label: "Reply-to", render: (v) => v || "—" },
    {
      key: "status",
      label: "Verification",
      render: (v) => <StatusBadge status={v} />,
    },
    {
      key: "actions",
      label: "",
      render: (_v, s) =>
        hasPermission("settings.manage") ? (
          <div className="flex justify-end">
            <button
              type="button"
              className={LINK_ACTION}
              onClick={() => setForm({ ...s })}
            >
              <Pencil size={14} />
              Edit
            </button>
          </div>
        ) : null,
    },
  ];
  const surveyColumns = [
    {
      key: "name",
      label: "Survey",
      render: (v, s) => (
        <div>
          <p className="font-medium text-navy-900">{v}</p>
          {s.description && (
            <p className="text-xs text-navy-500 mt-0.5">{s.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "state",
      label: "Status",
      render: (v) => <StatusBadge status={v} />,
    },
    {
      key: "responses",
      label: "Responses",
      align: "right",
      render: (v) => <span className="tabular-nums">{v ?? 0}</span>,
    },
    {
      key: "actions",
      label: "",
      render: (_v, s) => (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {s.state === "published" && (
            <Link
              to={`/email/surveys/${s.id}`}
              target="_blank"
              className={LINK_MUTED}
            >
              <ExternalLink size={14} />
              Open
            </Link>
          )}
          <button
            type="button"
            className={LINK_ACTION}
            onClick={() =>
              run(async () =>
                setResults(await campaignRequest(`/surveys/${s.id}/results`)),
              )
            }
          >
            <BarChart3 size={14} />
            Results
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className={LINK_ACTION}
                onClick={() => setForm({ ...s })}
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                className={LINK_MUTED}
                onClick={() =>
                  setForm({
                    ...s,
                    id: undefined,
                    name: `${s.name} (copy)`,
                    state: "draft",
                  })
                }
              >
                <Copy size={14} />
                Duplicate
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {header}

      {section === "contacts" && profile && (
        <Card
          title={profile.full_name || profile.email_normalized}
          subtitle="Contact profile"
          actions={<ConsentBadge contact={profile} />}
        >
          <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Object.entries(contactFields).map(([key, label]) => (
              <div key={key}>
                <dt className="text-xs font-medium uppercase tracking-wide text-navy-400">
                  {label.replace(" *", "")}
                </dt>
                <dd className="text-sm text-navy-800 mt-1 break-words">
                  {profile[key] || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {form && section === "templates" && (
        <Card
          title={formTitle}
          subtitle="Design a reusable email for future campaigns."
          footer={<div className="flex justify-end gap-3">{formActions}</div>}
        >
          {formElement}
        </Card>
      )}

      {section === "contacts" && (
        <Card>
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <SearchInput
              className="flex-1"
              value={search}
              onChange={setSearch}
              placeholder="Search contacts"
            />
            <div className="flex gap-2">
              {canManage && (
                <label className={`${BTN_SECONDARY} cursor-pointer`}>
                  <Upload size={15} />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const input = e.target;
                      const file = input.files?.[0];
                      if (!file) return;
                      void run(async () => {
                        try {
                          if (file.size > 5000000)
                            throw new Error("Use a CSV smaller than 5 MB.");
                          setImporting(parseContactCsv(await file.text()));
                          setConfirmConsent(false);
                          setImportResult(null);
                        } finally {
                          input.value = "";
                        }
                      });
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                className={BTN_SECONDARY}
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
                <Download size={15} />
                Export
              </button>
            </div>
          </div>
          {importResult && (
            <div
              className={`mb-4 rounded-xl border p-4 text-sm ${
                importResult.errors.length
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 font-medium">
                  {importResult.errors.length ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {importResult.imported} contacts imported
                  {importResult.errors.length
                    ? `, ${importResult.errors.length} rows skipped`
                    : "."}
                </p>
                <button
                  type="button"
                  aria-label="Dismiss import result"
                  className="p-1 rounded-lg hover:bg-white/60"
                  onClick={() => setImportResult(null)}
                >
                  <X size={14} />
                </button>
              </div>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {importResult.errors.map((row) => (
                    <li key={row.row}>
                      Row {row.row}: {row.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DataTable
            columns={contactColumns}
            data={filtered(directory.contacts)}
            emptyTitle="No contacts found"
            emptyDescription={
              search
                ? "No contacts match your search."
                : "Add a contact or import a CSV to get started."
            }
          />
          <p className="text-xs text-navy-500 mt-4">
            {directory.contacts.length} contacts. Account and attendee details
            are synchronized without assuming marketing consent.
          </p>
        </Card>
      )}

      {["groups", "subscriptions"].includes(section) && (
        <Card>
          <DataTable
            columns={groupColumns}
            data={groups}
            emptyTitle="No lists yet"
            emptyDescription="Create your first list to organize campaign recipients."
          />
        </Card>
      )}

      {section === "memberships" && (
        <Card>
          <DataTable
            columns={membershipColumns}
            data={directory.memberships}
            emptyTitle="No memberships yet"
            emptyDescription="Create membership types under Contact Lists & Committees, then assign memberships here."
          />
        </Card>
      )}

      {section === "senders" && (
        <>
          <CampaignDeliveryPanel
            canManage={hasPermission("settings.manage")}
            toast={toast}
          />
          <Card
            title="Sender emails"
            subtitle="A sender is verified when the SMTP login works and its email uses the same domain as your SMTP account."
            actions={
              hasPermission("settings.manage") && (
                <LoadingButton
                  className={BTN_SECONDARY}
                  loading={busy}
                  loadingLabel="Checking…"
                  icon={ShieldCheck}
                  iconSize={15}
                  onClick={() =>
                    run(async () => {
                      const result = await campaignRequest("/senders/verify", {
                        method: "POST",
                        body: {},
                      });
                      await load();
                      const unverified = result.checked - result.verified;
                      if (unverified)
                        toast.error(
                          `${unverified} of ${result.checked} senders aren't verified. Use an address at ${result.domains.join(" or ") || "your SMTP account's domain"}.`,
                        );
                      else
                        toast.success(
                          `SMTP sign-in worked. ${result.verified} ${result.verified === 1 ? "sender" : "senders"} verified.`,
                        );
                    })
                  }
                >
                  Check senders
                </LoadingButton>
              )
            }
          >
            <DataTable
              columns={senderColumns}
              data={directory.senders}
              emptyTitle="No senders yet"
              emptyDescription="Add a sender identity to use as the From address."
            />
          </Card>
        </>
      )}

      {section === "templates" && (
        <>
          {rows.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rows.map((t) => (
                <Card key={t.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-navy-900">{t.name}</h2>
                    <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-cyan-50 text-cyan-700 ring-cyan-600/20">
                      {CAMPAIGN_TYPES.find((type) => type.id === t.campaign_type)
                        ?.name || "Event Notification"}
                    </span>
                  </div>
                  <p className="text-sm text-navy-500 mt-2 min-h-[2.5rem]">
                    {t.description || "Reusable email design"}
                  </p>
                  {canManage && (
                    <div className="flex gap-4 mt-4 pt-4 border-t border-navy-100">
                      <button
                        type="button"
                        className={LINK_ACTION}
                        onClick={() => {
                          setForm({ ...t });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <Pencil size={14} />
                        Edit design
                      </button>
                      <button
                        type="button"
                        className={LINK_DANGER}
                        onClick={() =>
                          archive(`/templates/${t.id}/archive`, t.name)
                        }
                      >
                        <Archive size={14} />
                        Archive
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            !form && (
              <DataTable
                columns={[]}
                data={[]}
                emptyTitle="No templates yet"
                emptyDescription="Create a template to reuse designs across campaigns."
              />
            )
          )}
        </>
      )}

      {section === "suppressions" && <CampaignSuppressionView data={rows} />}

      {section === "surveys" && (
        <>
          <Card>
            <DataTable
              columns={surveyColumns}
              data={rows}
              emptyTitle="No surveys yet"
              emptyDescription="Create a survey and add it to a campaign using the Survey element."
            />
          </Card>
          {results && (
            <Card
              title={`${results.survey.name} — results`}
              subtitle={`${results.responses.length} responses`}
              actions={
                <>
                  <button
                    type="button"
                    className={BTN_SECONDARY}
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
                    <Download size={15} />
                    Export
                  </button>
                  <button
                    type="button"
                    aria-label="Close results"
                    className={BTN_ICON}
                    onClick={() => setResults(null)}
                  >
                    <X size={16} />
                  </button>
                </>
              }
            >
              <div className="divide-y divide-navy-100 -my-4">
                {results.survey.questions.map((q) => {
                  const answers = results.responses
                    .map((r) => r.answers[q.id])
                    .filter((v) => v !== undefined && v !== null && v !== "");
                  return (
                    <section key={q.id} className="py-4">
                      <h3 className="font-semibold text-sm text-navy-900 mb-3">
                        {q.label}
                      </h3>
                      {q.type === "rating" ? (
                        <p className="text-sm text-navy-700">
                          Average{" "}
                          <span className="text-2xl font-bold text-navy-900 tabular-nums">
                            {answers.length
                              ? (
                                  answers.reduce(
                                    (sum, v) => sum + Number(v),
                                    0,
                                  ) / answers.length
                                ).toFixed(2)
                              : "—"}
                          </span>{" "}
                          / 5
                        </p>
                      ) : q.options?.length ? (
                        <div className="space-y-3">
                          {q.options.map((option) => {
                            const count = answers.filter((v) =>
                              Array.isArray(v)
                                ? v.includes(option)
                                : v === option,
                            ).length;
                            return (
                              <div key={option} className="text-sm">
                                <div className="flex justify-between text-navy-700">
                                  <span>{option}</span>
                                  <span className="tabular-nums">{count}</span>
                                </div>
                                <div className="h-2 bg-navy-100 mt-1.5 rounded-full overflow-hidden">
                                  <div
                                    className="h-2 bg-cyan-600 rounded-full"
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
                        <div className="max-h-48 overflow-auto rounded-xl border border-navy-100 divide-y divide-navy-100 text-sm">
                          {answers.map((value, i) => (
                            <p key={i} className="px-3 py-2 text-navy-700">
                              {value}
                            </p>
                          ))}
                          {!answers.length && (
                            <p className="px-3 py-2 text-navy-400">
                              No answers yet.
                            </p>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {section === "events" && (
        <CampaignEventInvitees
          events={directory.events || []}
          contacts={directory.contacts}
          canManage={canManage}
          toast={toast}
        />
      )}

      {canManage && archivedItems.length > 0 && (
        <details className="app-card rounded-2xl border border-navy-100 bg-white p-4">
          <summary className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 cursor-pointer">
            <Archive size={15} className="text-navy-400" />
            Archived items ({archivedItems.length})
          </summary>
          <div className="mt-3 divide-y divide-navy-100">
            {archivedItems.map((item) => (
              <div
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
                key={item.id}
              >
                <span className="text-navy-700">
                  {item.name || item.full_name || item.email_normalized}
                </span>
                <button
                  type="button"
                  className={LINK_ACTION}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await campaignRequest(
                        `/${section === "templates" ? "templates" : section === "contacts" ? "contacts" : "groups"}/${item.id}/restore`,
                        { method: "POST", body: {} },
                      );
                      await load();
                      toast.success("Item restored.");
                    })
                  }
                >
                  <Undo2 size={14} />
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <Modal
        isOpen={Boolean(form) && section !== "templates"}
        onClose={() => !busy && setForm(null)}
        title={formTitle}
        size={section === "contacts" || section === "surveys" ? "xl" : "lg"}
        footer={formActions}
      >
        {section !== "templates" && formElement}
      </Modal>

      <Modal
        isOpen={Boolean(members)}
        onClose={() => !busy && setMembers(null)}
        title={`${members?.name || ""} — contacts`}
        subtitle="Select the contacts that belong to this list."
        size="lg"
        footer={
          <>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy}
              onClick={() => setMembers(null)}
            >
              Cancel
            </button>
            <LoadingButton
              className={BTN_PRIMARY}
              loading={busy}
              loadingLabel="Saving…"
              onClick={() =>
                run(async () => {
                  await campaignRequest(`/groups/${members.id}/members`, {
                    method: "POST",
                    body: { contact_ids: selected },
                  });
                  setMembers(null);
                  await load();
                  toast.success("List contacts saved.");
                })
              }
            >
              Save contacts
            </LoadingButton>
          </>
        }
      >
        {members && (
          <ContactPicker
            contacts={directory.contacts}
            selected={selected}
            onChange={setSelected}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(importing)}
        onClose={() => !busy && setImporting(null)}
        title={`Import ${importing?.length || 0} contacts`}
        subtitle="Review consent before adding these contacts."
        size="md"
        footer={
          <>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy}
              onClick={() => setImporting(null)}
            >
              Cancel
            </button>
            <LoadingButton
              className={BTN_PRIMARY}
              loading={busy}
              loadingLabel="Importing…"
              icon={Upload}
              iconSize={15}
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
            </LoadingButton>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-navy-700 mb-1">Recognized columns</p>
            <p className="text-xs text-navy-500 font-mono leading-relaxed">
              email, full_name, first_name, last_name, phone, company, title,
              assistant_email, address, country, region, city, postal_code,
              marketing_opt_in
            </p>
          </div>
          <label className="flex items-start gap-2 rounded-xl border border-navy-100 bg-navy-50/50 p-3 text-navy-700">
            <input
              type="checkbox"
              className={`${CHECKBOX} mt-0.5`}
              checked={confirmConsent}
              onChange={(e) => setConfirmConsent(e.target.checked)}
            />
            I confirm the contacts marked marketing_opt_in agreed to marketing
            emails.
          </label>
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}
