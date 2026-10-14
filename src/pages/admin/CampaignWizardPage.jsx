import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Code,
  Copy,
  Lock,
  CalendarClock,
  LayoutTemplate,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  RotateCcw,
  Save,
  Send,
  SquareDashed,
  XCircle,
  AlertTriangle,
  Mail,
  CheckCircle2,
  Circle,
  Users,
  Settings2,
  PenSquare,
} from "lucide-react";
import {
  PageHeader,
  Card,
  FormField,
  StatusBadge,
  Modal,
  LoadingButton,
} from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import CampaignEmailEditor from "../../components/admin/campaigns/CampaignEmailEditor.jsx";
import CampaignAudienceSelector from "../../components/admin/campaigns/CampaignAudienceSelector.jsx";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav.jsx";
import useCampaignConfirm from "../../components/admin/campaigns/useCampaignConfirm.jsx";
import { TabIndicator } from "../../components/admin/campaigns/CampaignTabBar.jsx";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CHECKBOX,
  INPUT,
  SECTION_TITLE,
  tabClass,
} from "../../components/admin/campaigns/campaignStyles";
import {
  CAMPAIGN_LAYOUTS,
  CAMPAIGN_TIMEZONES,
} from "../../../shared/campaignWorkspace.js";
import { defaultSegment } from "../../../shared/emailCampaign";
import { normalizeDesignDocument } from "../../../shared/emailDesignCompile.js";
import {
  fetchCampaign,
  fetchCampaignTemplates,
  fetchEventResources,
  updateCampaign,
  previewCampaignAudience,
  sendCampaignTest,
  sendCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  duplicateCampaign,
} from "../../utils/emailCampaignsApi";
import {
  campaignRequest,
  campaignDirectory,
  campaignReview,
  campaignPreview,
  campaignAction,
} from "../../utils/campaignWorkspaceApi";

const stepIcons = {
  Recipients: Users,
  Settings: Settings2,
  Template: LayoutTemplate,
  "Content & Design": PenSquare,
  "Review & Send": Send,
};
const layoutIcons = {
  empty: SquareDashed,
  left_sidebar: PanelLeft,
  right_sidebar: PanelRight,
  custom_html: Code,
};

export default function CampaignWizardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const [confirm, confirmDialog] = useCampaignConfirm();
  const [campaign, setCampaign] = useState(null),
    [form, setForm] = useState(null),
    [directory, setDirectory] = useState({ groups: [], senders: [] }),
    [templates, setTemplates] = useState([]),
    [step, setStep] = useState(0),
    [audience, setAudience] = useState(null),
    [preview, setPreview] = useState(null),
    [review, setReview] = useState(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [testEmail, setTestEmail] = useState(""),
    [dialog, setDialog] = useState(""),
    [templateName, setTemplateName] = useState(null),
    [schedule, setSchedule] = useState({
      date: "",
      time: "09:00",
      timezone: "Africa/Lusaka",
      push_enabled: false,
    });
  const load = useCallback(async () => {
    const [item, lists, tpls] = await Promise.all([
      fetchCampaign(id),
      campaignDirectory(),
      fetchCampaignTemplates(),
    ]);
    const c = item.data;
    setCampaign(c);
    setForm({
      name: c.name,
      language: c.language || "English",
      subject: c.subject || "",
      preheader: c.preheader || "",
      sender_identity_id: c.sender_identity_id || "sender-mutale",
      reply_to: c.reply_to || "",
      cc: c.cc?.join(", ") || "",
      cc_assistant: !!c.cc_assistant,
      purpose: c.purpose,
      audience: c.audience,
      segment: c.segment || defaultSegment(),
      template_id: c.template_id || "",
      layout_key: c.layout_key || "empty",
      design: c.revision?.design || { version: 2, blocks: [] },
    });
    setDirectory({
      ...lists,
      surveys: await campaignRequest("/surveys"),
      events: await campaignRequest("/events"),
      resources: c.event_id ? (await fetchEventResources(c.event_id)).data : [],
      registrants: c.event_id
        ? await campaignRequest(`/events/${c.event_id}/registrants`)
        : [],
    });
    setPreview(await campaignPreview(id));
    setTemplates(tpls.data || []);
    setDirty(false);
  }, [id]);
  useEffect(() => {
    setStep(0);
    void load().catch((error) => toast.error(error.message));
  }, [load, toast]);
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    const navigation = (e) => {
      const anchor = e.target.closest?.("a[href]");
      if (
        !dirty ||
        !anchor ||
        anchor.target === "_blank" ||
        anchor.href === window.location.href ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const target = new URL(anchor.href);
      void confirm({
        title: "Discard unsaved changes?",
        message:
          "You have unsaved changes to this campaign. Leave and discard them?",
        confirmLabel: "Leave page",
        variant: "danger",
      }).then((leave) => {
        if (!leave) return;
        setDirty(false);
        if (target.origin === window.location.origin)
          navigate(`${target.pathname}${target.search}${target.hash}`);
        else window.location.assign(target.href);
      });
    };
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", navigation, true);
    };
  }, [dirty, confirm, navigate]);
  useEffect(() => {
    if (!form?.audience || step !== 0) return;
    let active = true;
    const timer = setTimeout(() => {
      previewCampaignAudience(id, {
        audience: form.audience,
        purpose: form.purpose,
        segment: form.segment,
      })
        .then((result) => {
          if (active) setAudience(result.data);
        })
        .catch((error) => {
          if (active) toast.error(error.message);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form?.audience, form?.purpose, form?.segment, id, step, toast]);
  const locked =
    campaign?.state !== "draft" || !hasPermission("campaigns.manage");
  const set = (key, value) => {
    setForm((old) => ({ ...old, [key]: value }));
    setDirty(true);
    if (key === "audience") setAudience(null);
  };
  const save = async () => {
    if (!dirty) return campaign;
    const result = await updateCampaign(id, {
      ...form,
      version: campaign.version,
    });
    setCampaign(result.data);
    setForm((old) => ({
      ...old,
      design: result.data.revision?.design || old.design,
      subject: result.data.subject,
      preheader: result.data.preheader,
    }));
    setDirty(false);
    return result.data;
  };
  const run = async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } catch (error) {
      toast.error(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const audiencePreview = () =>
    run(async () => {
      const result = await previewCampaignAudience(id, {
        audience: form.audience,
        purpose: form.purpose,
        segment: form.segment,
      });
      setAudience(result.data);
      return result.data;
    });
  const steps =
    campaign?.campaign_type === "regular"
      ? [
          "Recipients",
          "Settings",
          "Template",
          "Content & Design",
          "Review & Send",
        ]
      : ["Recipients", "Settings", "Content & Design", "Review & Send"];
  const next = (target) =>
    run(async () => {
      await save();
      if (target === steps.length - 1) {
        const [r, p, a] = await Promise.all([
          campaignReview(id),
          campaignPreview(id),
          previewCampaignAudience(id, {
            audience: form.audience,
            purpose: form.purpose,
            segment: form.segment,
          }),
        ]);
        setReview(r);
        setPreview(p);
        setAudience(a.data);
      }
      setStep(target);
    });
  const applyTemplate = (tpl) => {
    setForm((old) => ({
      ...old,
      template_id: tpl.id,
      layout_key: tpl.layout_key || "empty",
      subject: old.subject || tpl.subject || "",
      design: normalizeDesignDocument(tpl.design),
    }));
    setDirty(true);
  };
  const chooseLayout = (layout) => {
    let blocks = [];
    if (layout === "left_sidebar" || layout === "right_sidebar")
      blocks = [
        {
          id: crypto.randomUUID(),
          type: "columns",
          column_widths: layout === "left_sidebar" ? [30, 70] : [70, 30],
          column_blocks: [[], []],
        },
      ];
    setForm((old) => ({
      ...old,
      template_id: "",
      layout_key: layout,
      design: normalizeDesignDocument({ version: 2, layout, blocks, html: "" }),
    }));
    setDirty(true);
  };
  const executeSend = () =>
    run(async () => {
      const result = await sendCampaign(id, {
        confirmed: true,
        version: campaign.version,
        request_key: crypto.randomUUID(),
        ...(dialog === "schedule"
          ? {
              scheduled_at: `${schedule.date}T${schedule.time}`,
              timezone: schedule.timezone,
              push: schedule.push_enabled,
            }
          : {}),
      });
      setDialog("");
      setCampaign(result.data);
      await load();
      toast.success(
        dialog === "schedule"
          ? "Campaign scheduled."
          : "Campaign queued for sending.",
      );
    });
  const saveAsTemplate = (e) => {
    e.preventDefault();
    const name = templateName?.trim();
    if (!name) return;
    void run(async () => {
      const saved = await save();
      const result = await campaignRequest("/templates", {
        method: "POST",
        body: {
          name,
          campaign_type: campaign.campaign_type,
          subject: saved.subject,
          preheader: saved.preheader,
          layout_key: form.layout_key,
          design: saved.revision.design,
        },
      });
      setTemplates((await fetchCampaignTemplates()).data);
      set("template_id", result.id);
      setTemplateName(null);
      toast.success("Template saved.");
    });
  };
  if (!campaign || !form)
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-navy-100 rounded-lg animate-pulse" />
        <div className="h-14 bg-navy-100/70 rounded-2xl animate-pulse" />
        <div className="h-80 bg-navy-100/50 rounded-2xl animate-pulse" />
      </div>
    );
  const type = campaign.campaign_type;
  const isReview = step === steps.length - 1;
  const canSend =
    !busy &&
    hasPermission("campaigns.send") &&
    review?.provider?.ready &&
    audience?.included_count > 0 &&
    campaign.state === "draft";
  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title={campaign.name}
          subtitle={`${type === "regular" ? "Regular Campaign" : type === "event_invitation" ? "Event Invitation" : "Event Notification"}${campaign.event_title ? ` · ${campaign.event_title}` : ""}`}
          breadcrumbs={[
            { label: "Admin", to: "/admin" },
            { label: "Campaigns", to: "/admin/campaigns" },
            { label: campaign.name },
          ]}
          actions={
            <>
              <StatusBadge status={campaign.state} size="md" />
              <Link
                to={`/admin/campaigns/${id}/report`}
                className={BTN_SECONDARY}
              >
                <BarChart3 size={15} />
                Report
              </Link>
            </>
          }
        />
        <CampaignWorkspaceNav />
      </div>
      {campaign.state !== "draft" && (
        <div className="flex flex-col md:flex-row md:items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-xl bg-white/70 text-amber-700 shrink-0">
              {campaign.state === "scheduled" ? (
                <CalendarClock size={18} />
              ) : (
                <Lock size={18} />
              )}
            </div>
            <p className="text-sm text-amber-900 pt-1">
              {campaign.state === "scheduled"
                ? `Scheduled for ${campaign.schedule_wall_time || campaign.scheduled_at_utc} (${campaign.timezone || "UTC"}). Recipients will be checked when the campaign is due.`
                : "This campaign is locked for delivery. Duplicate it to create an editable campaign."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPermission("campaigns.send") && (
              <>
                {["sending", "scheduled"].includes(campaign.state) && (
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await pauseCampaign(id);
                        await load();
                        toast.success("Campaign paused.");
                      })
                    }
                  >
                    <Pause size={15} />
                    Pause
                  </button>
                )}
                {campaign.state === "paused" && (
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await resumeCampaign(id);
                        await load();
                        toast.success("Campaign resumed.");
                      })
                    }
                  >
                    <Play size={15} />
                    Resume
                  </button>
                )}
                {["sending", "scheduled", "paused"].includes(
                  campaign.state,
                ) && (
                  <button
                    type="button"
                    className={`${BTN_SECONDARY} text-red-600`}
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Cancel delivery",
                          message:
                            "Cancel all messages that have not been sent yet? Messages already delivered are not affected.",
                          confirmLabel: "Cancel delivery",
                          cancelLabel: "Keep sending",
                          variant: "danger",
                        })
                      )
                        void run(async () => {
                          await cancelCampaign(id);
                          await load();
                          toast.success("Delivery cancelled.");
                        });
                    }}
                  >
                    <XCircle size={15} />
                    Cancel delivery
                  </button>
                )}
                {campaign.state === "cancelled" && (
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await campaignAction(id, "return-to-draft");
                        await load();
                      })
                    }
                  >
                    <RotateCcw size={15} />
                    Return to draft
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const copy = await duplicateCampaign(id);
                  navigate(`/admin/campaigns/${copy.data.id}`);
                })
              }
            >
              <Copy size={15} />
              Duplicate
            </button>
          </div>
        </div>
      )}
      <nav
        aria-label="Campaign steps"
        className="app-card sticky top-16 z-20 bg-white rounded-2xl border border-navy-100 shadow-sm px-1"
      >
        <div className="flex gap-1 overflow-x-auto">
          {steps.map((label, index) => {
            const active = step === index;
            const done = index < step;
            const Icon = done ? CheckCircle2 : stepIcons[label] || Circle;
            return (
              <button
                type="button"
                key={label}
                onClick={() => next(index)}
                disabled={busy}
                aria-current={active ? "step" : undefined}
                className={tabClass(active)}
              >
                <Icon size={16} className={done ? "text-cyan-600" : ""} />
                <span className="text-xs tabular-nums opacity-60">
                  {index + 1}.
                </span>
                {label}
                <TabIndicator active={active} />
              </button>
            );
          })}
        </div>
      </nav>
      {steps[step] === "Recipients" && (
        <Card>
          <CampaignAudienceSelector
            directory={directory}
            event={campaign.event}
            type={type}
            audience={form.audience || { version: 2, include: [], exclude: [] }}
            onChange={(value) => set("audience", value)}
            segment={form.segment}
            onSegmentChange={(value) => {
              set("segment", value);
              set("audience", {
                ...form.audience,
                include: [
                  ...(form.audience?.include || []).filter(
                    (rule) => rule.source !== "event_registrants",
                  ),
                  { source: "event_registrants", filter: "advanced" },
                ],
              });
            }}
            preview={audience}
            onPreview={audiencePreview}
            disabled={locked}
            busy={busy}
          />
        </Card>
      )}
      {steps[step] === "Settings" && (
        <div className="grid gap-6 max-w-4xl">
          <Card
            title="Campaign name & language"
            subtitle="How this campaign is identified internally."
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                label="Internal campaign name"
                required
                helpText="Internal use only. Not visible to your recipients."
              >
                <input
                  className={INPUT}
                  value={form.name}
                  disabled={locked}
                  onChange={(e) => set("name", e.target.value)}
                  maxLength={180}
                />
              </FormField>
              <FormField label="Email language" required>
                <select
                  className={INPUT}
                  value={form.language}
                  disabled={locked}
                  onChange={(e) => set("language", e.target.value)}
                >
                  <option value="English">English</option>
                </select>
              </FormField>
            </div>
          </Card>
          <Card
            title="Subject line"
            subtitle="What recipients see first in their inbox."
          >
            <div className="space-y-4">
              <FormField label="Subject line" required>
                <input
                  className={INPUT}
                  value={form.subject}
                  onChange={(e) => set("subject", e.target.value)}
                  disabled={locked}
                  maxLength={250}
                />
              </FormField>
              <FormField
                label="Preview text"
                helpText="Shown beside the subject in your recipients’ inbox."
              >
                <input
                  className={INPUT}
                  value={form.preheader}
                  onChange={(e) => set("preheader", e.target.value)}
                  disabled={locked}
                  maxLength={250}
                />
              </FormField>
            </div>
          </Card>
          <Card
            title="Sender & reply-to"
            actions={
              <Link
                to="/admin/campaigns/manage/senders"
                className="text-xs font-medium text-cyan-700 hover:text-cyan-600"
              >
                Manage senders
              </Link>
            }
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Sender" required>
                <select
                  className={INPUT}
                  value={form.sender_identity_id}
                  onChange={(e) => set("sender_identity_id", e.target.value)}
                  disabled={locked}
                >
                  {directory.senders.map((sender) => (
                    <option key={sender.id} value={sender.id}>
                      {sender.name} &lt;{sender.email}&gt; · {sender.status}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Reply-to email" required>
                <input
                  type="email"
                  className={INPUT}
                  value={form.reply_to}
                  onChange={(e) => set("reply_to", e.target.value)}
                  disabled={locked}
                />
              </FormField>
            </div>
          </Card>
          <Card
            title="CC emails"
            subtitle="CC addresses receive a copy of each recipient’s personalized email."
          >
            <FormField label="CC email list">
              <textarea
                className={`${INPUT} min-h-[6.5rem] resize-y`}
                value={form.cc}
                onChange={(e) => set("cc", e.target.value)}
                disabled={locked}
                placeholder="Separate email addresses with commas"
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-navy-700 mt-4">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={form.cc_assistant}
                onChange={(e) => set("cc_assistant", e.target.checked)}
                disabled={locked}
              />
              CC to assistant for each recipient
            </label>
          </Card>
        </div>
      )}
      {steps[step] === "Template" && (
        <Card
          title="Select a template"
          subtitle="Start from a saved design, or pick a blank layout below."
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates
              .filter((t) => t.campaign_type === "regular" || !t.campaign_type)
              .map((t) => {
                const selected = form.template_id === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={`text-left rounded-2xl border p-4 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      selected
                        ? "border-cyan-500 ring-2 ring-cyan-500/20"
                        : "border-navy-100 hover:border-navy-200 hover:bg-navy-50/50"
                    }`}
                    disabled={locked}
                    onClick={async () => {
                      if (
                        !dirty ||
                        (await confirm({
                          title: "Replace design",
                          message:
                            "Replace the current design with this template?",
                          confirmLabel: "Replace design",
                        }))
                      )
                        applyTemplate(t);
                    }}
                  >
                    <div className="h-24 rounded-xl bg-navy-50 flex items-center justify-center mb-3 text-navy-300">
                      <LayoutTemplate size={32} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-navy-900">
                        {t.name}
                      </span>
                      {selected && (
                        <Check size={16} className="text-cyan-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-navy-500 mt-1">
                      {t.description || "Reusable email design"}
                    </p>
                  </button>
                );
              })}
          </div>
          <h3 className={`${SECTION_TITLE} mt-8 mb-4`}>Or start from a layout</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CAMPAIGN_LAYOUTS.map((layout) => {
              const Icon = layoutIcons[layout.id] || SquareDashed;
              const selected =
                form.layout_key === layout.id && !form.template_id;
              return (
                <button
                  type="button"
                  key={layout.id}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Start a new design",
                        message: `Start a new design using the “${layout.name}” layout? The current design will be replaced.`,
                        confirmLabel: "Start new design",
                      })
                    )
                      chooseLayout(layout.id);
                  }}
                  disabled={locked}
                  className={`rounded-2xl border p-4 text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    selected
                      ? "border-cyan-500 ring-2 ring-cyan-500/20"
                      : "border-navy-100 hover:border-navy-200 hover:bg-navy-50/50"
                  }`}
                >
                  <Icon
                    size={22}
                    className={selected ? "text-cyan-600" : "text-navy-400"}
                  />
                  <p className="text-sm font-medium text-navy-900 mt-2">
                    {layout.name}
                  </p>
                  <p className="text-xs text-navy-500 mt-0.5">
                    {layout.description}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>
      )}
      {steps[step] === "Content & Design" && (
        <Card>
          {type !== "regular" && (
            <div className="mb-5 max-w-md">
              <FormField label="Start from a template">
                <select
                  disabled={locked}
                  className={INPUT}
                  value={form.template_id}
                  onChange={async (e) => {
                    const template = templates.find(
                      (row) => row.id === e.target.value,
                    );
                    if (!template) {
                      set("template_id", "");
                      return;
                    }
                    if (
                      await confirm({
                        title: "Replace design",
                        message:
                          "Replace this design with the selected template?",
                        confirmLabel: "Replace design",
                      })
                    )
                      applyTemplate(template);
                  }}
                >
                  <option value="">Current design</option>
                  {templates
                    .filter((row) => row.campaign_type === type)
                    .map((row) => (
                      <option value={row.id} key={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </FormField>
            </div>
          )}
          <CampaignEmailEditor
            design={form.design}
            onChange={(value) => set("design", value)}
            readOnly={locked}
            subject={form.subject}
            preheader={form.preheader}
            campaignType={type}
            previewVars={preview?.vars || {}}
            surveys={directory.surveys || []}
            resources={directory.resources || []}
            events={directory.events || []}
          />
        </Card>
      )}
      {isReview && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          <div className="space-y-6">
            <Card title="Review & send" subtitle="Check the details before delivery.">
              <dl className="divide-y divide-navy-100 -my-2">
                {[
                  ["Subject line", form.subject],
                  [
                    "Recipients",
                    `${audience?.included_count ?? 0} unique recipients`,
                  ],
                  ["Email language", "English"],
                  ["Sender", `${campaign.from_name} <${campaign.from_email}>`],
                  ["Internal campaign name", form.name],
                  ["Preview text", form.preheader || "Not set"],
                  ["Reply-to email", form.reply_to],
                  [
                    "Template",
                    templates.find((t) => t.id === form.template_id)?.name ||
                      CAMPAIGN_LAYOUTS.find((l) => l.id === form.layout_key)
                        ?.name ||
                      "Custom design",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-4 py-3 text-sm"
                  >
                    <dt className="text-navy-500">{label}</dt>
                    <dd
                      className={`text-right break-all font-medium ${value ? "text-navy-900" : "text-red-600"}`}
                    >
                      {value || "Required"}
                    </dd>
                  </div>
                ))}
              </dl>
              {review?.provider?.errors?.length > 0 && (
                <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-2">
                      Complete these items before sending
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      {review.provider.errors.map((issue) => (
                        <li
                          key={typeof issue === "string" ? issue : issue.code}
                        >
                          {typeof issue === "string" ? issue : issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={!canSend}
                  onClick={() => setDialog("send")}
                >
                  <Send size={15} />
                  Send now
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={!canSend}
                  onClick={() => setDialog("schedule")}
                >
                  <CalendarClock size={15} />
                  Schedule
                </button>
              </div>
            </Card>
            <Card
              title="Send a test email"
              subtitle="Send this design to yourself before going live."
            >
              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await sendCampaignTest(id, testEmail);
                    toast.success("Test email accepted for delivery.");
                  });
                }}
              >
                <input
                  className={INPUT}
                  type="email"
                  aria-label="Test email address"
                  placeholder="Email address"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <button
                  type="submit"
                  className={`${BTN_SECONDARY} shrink-0`}
                  disabled={
                    busy || !hasPermission("campaigns.send") || !testEmail
                  }
                >
                  <Mail size={15} />
                  Send test
                </button>
              </form>
            </Card>
          </div>
          <Card title="Email preview" className="self-start">
            {preview?.html ? (
              <iframe
                title="Campaign preview"
                sandbox=""
                srcDoc={preview.html}
                className="w-full h-[650px] bg-white rounded-xl border border-navy-100"
              />
            ) : (
              <p className="text-sm text-navy-500">Preview unavailable.</p>
            )}
          </Card>
        </div>
      )}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => next(Math.max(0, step - 1))}
          disabled={step === 0 || busy}
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <div className="flex flex-wrap gap-3 items-center">
          {dirty && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
          {steps[step] === "Content & Design" && !locked && (
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy}
              onClick={() => setTemplateName(form.name)}
            >
              <LayoutTemplate size={15} />
              Save as template
            </button>
          )}
          <LoadingButton
            className={BTN_SECONDARY}
            disabled={locked || !dirty}
            loading={busy && dirty}
            loadingLabel="Saving…"
            icon={Save}
            iconSize={15}
            onClick={() =>
              run(async () => {
                await save();
                toast.success("Campaign saved.");
              })
            }
          >
            Save
          </LoadingButton>
          {!isReview && (
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy}
              onClick={() => next(step + 1)}
            >
              Next
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
      <Modal
        isOpen={Boolean(dialog)}
        onClose={() => !busy && setDialog("")}
        title={dialog === "schedule" ? "Schedule campaign" : "Send campaign"}
        subtitle={
          dialog === "schedule"
            ? "Recipients are determined when delivery begins."
            : undefined
        }
        size="md"
        footer={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDialog("")}
              className={BTN_SECONDARY}
            >
              Cancel
            </button>
            <LoadingButton
              className={BTN_PRIMARY}
              loading={busy}
              loadingLabel="Submitting…"
              disabled={dialog === "schedule" && !schedule.date}
              icon={dialog === "schedule" ? CalendarClock : Send}
              iconSize={15}
              onClick={executeSend}
            >
              {dialog === "schedule" ? "Schedule" : "Send now"}
            </LoadingButton>
          </>
        }
      >
        {dialog === "schedule" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Date"
                type="date"
                required
                value={schedule.date}
                onChange={(e) =>
                  setSchedule((s) => ({ ...s, date: e.target.value }))
                }
              />
              <FormField
                label="Time"
                type="time"
                required
                value={schedule.time}
                onChange={(e) =>
                  setSchedule((s) => ({ ...s, time: e.target.value }))
                }
              />
            </div>
            <FormField
              label="Timezone"
              type="select"
              value={schedule.timezone}
              options={CAMPAIGN_TIMEZONES}
              onChange={(e) =>
                setSchedule((s) => ({ ...s, timezone: e.target.value }))
              }
            />
            <label className="flex items-start gap-2 text-sm text-navy-700">
              <input
                type="checkbox"
                className={`${CHECKBOX} mt-0.5`}
                disabled={!directory.push_configured}
                checked={schedule.push_enabled}
                onChange={(e) =>
                  setSchedule((s) => ({
                    ...s,
                    push_enabled: e.target.checked,
                  }))
                }
              />
              <span>
                Send a push notification to registered mobile devices
                {!directory.push_configured && (
                  <span className="block text-xs text-navy-400 mt-1">
                    Available after the organization’s mobile service is
                    connected.
                  </span>
                )}
              </span>
            </label>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-cyan-50 text-cyan-600 shrink-0">
              <Send size={20} />
            </div>
            <p className="text-sm text-navy-600 leading-relaxed pt-1">
              Send “{form.subject}” to{" "}
              <strong className="text-navy-900">
                {audience?.included_count ?? 0} unique recipients
              </strong>{" "}
              now? This cannot be undone once delivery starts.
            </p>
          </div>
        )}
      </Modal>
      <Modal
        isOpen={templateName !== null}
        onClose={() => !busy && setTemplateName(null)}
        title="Save as template"
        subtitle="Reuse this design in future campaigns."
        size="sm"
        footer={
          <>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy}
              onClick={() => setTemplateName(null)}
            >
              Cancel
            </button>
            <LoadingButton
              type="submit"
              form="campaign-save-template"
              className={BTN_PRIMARY}
              loading={busy}
              loadingLabel="Saving…"
              disabled={!templateName?.trim()}
            >
              Save template
            </LoadingButton>
          </>
        }
      >
        <form id="campaign-save-template" onSubmit={saveAsTemplate}>
          <FormField
            label="Template name"
            name="campaign-template-name"
            required
            value={templateName || ""}
            onChange={(e) => setTemplateName(e.target.value)}
          />
        </form>
      </Modal>
      {confirmDialog}
    </div>
  );
}
