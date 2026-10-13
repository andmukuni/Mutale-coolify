import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader, Card, FormField, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import CampaignEmailEditor from "../../components/admin/campaigns/CampaignEmailEditor.jsx";
import CampaignAudienceSelector from "../../components/admin/campaigns/CampaignAudienceSelector.jsx";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav.jsx";
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

const input =
  "w-full rounded-lg border border-navy-200 px-3 py-2 text-sm bg-white disabled:bg-navy-50";
export default function CampaignWizardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
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
        dirty &&
        anchor &&
        anchor.target !== "_blank" &&
        anchor.href !== window.location.href &&
        !window.confirm("Leave this campaign and discard unsaved changes?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", navigation, true);
    };
  }, [dirty]);
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
  if (!campaign || !form)
    return <p className="p-6 text-sm">Loading campaign…</p>;
  const type = campaign.campaign_type;
  const isReview = step === steps.length - 1;
  return (
    <div>
      <CampaignWorkspaceNav />
      <PageHeader
        title={campaign.name}
        subtitle={`${type === "regular" ? "Regular Campaign" : type === "event_invitation" ? "Event Invitation" : "Event Notification"}${campaign.event_title ? ` · ${campaign.event_title}` : ""}`}
        breadcrumbs={[
          { label: "Campaigns", to: "/admin/campaigns" },
          { label: campaign.name },
        ]}
        actions={
          <div className="flex gap-3 items-center">
            <StatusBadge status={campaign.state} />
            <Link
              to={`/admin/campaigns/${id}/report`}
              className="text-sm text-blue-600"
            >
              Report
            </Link>
          </div>
        }
      />
      {campaign.state !== "draft" && (
        <Card className="mb-4">
          <p className="text-sm mb-3">
            {campaign.state === "scheduled"
              ? `Scheduled for ${campaign.schedule_wall_time || campaign.scheduled_at_utc} (${campaign.timezone || "UTC"}). Recipients will be checked when the campaign is due.`
              : "This campaign is locked for delivery. Duplicate it to create an editable campaign."}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            {hasPermission("campaigns.send") && (
              <>
                {["sending", "scheduled"].includes(campaign.state) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await pauseCampaign(id);
                        await load();
                      })
                    }
                  >
                    Pause
                  </button>
                )}
                {campaign.state === "paused" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await resumeCampaign(id);
                        await load();
                      })
                    }
                  >
                    Resume
                  </button>
                )}
                {["sending", "scheduled", "paused"].includes(
                  campaign.state,
                ) && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Cancel all messages that have not been sent?",
                        )
                      )
                        void run(async () => {
                          await cancelCampaign(id);
                          await load();
                        });
                    }}
                  >
                    Cancel delivery
                  </button>
                )}
                {campaign.state === "cancelled" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await campaignAction(id, "return-to-draft");
                        await load();
                      })
                    }
                  >
                    Return to draft
                  </button>
                )}
              </>
            )}
            <button
              onClick={() =>
                run(async () => {
                  const copy = await duplicateCampaign(id);
                  navigate(`/admin/campaigns/${copy.data.id}`);
                })
              }
            >
              Duplicate
            </button>
          </div>
        </Card>
      )}
      <nav
        aria-label="Campaign steps"
        className="flex overflow-x-auto border border-navy-200 mb-6 bg-white rounded-lg"
      >
        {steps.map((label, index) => (
          <button
            key={label}
            onClick={() => next(index)}
            disabled={busy}
            className={`flex-1 min-w-max px-4 py-4 text-sm border-r last:border-r-0 ${step === index ? "bg-blue-600 text-white font-semibold" : "text-navy-500"}`}
          >
            <span className="mr-2">{index + 1}.</span>
            {label}
          </button>
        ))}
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
        <Card>
          <div className="max-w-3xl space-y-8">
            <section>
              <h2 className="font-semibold text-lg mb-4">
                Campaign Name & Language
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Internal Campaign Name *">
                  <input
                    aria-label="Internal Campaign Name"
                    className={input}
                    value={form.name}
                    disabled={locked}
                    onChange={(e) => set("name", e.target.value)}
                    maxLength={180}
                  />
                  <p className="text-xs text-navy-400 mt-1">
                    Internal use only. Not visible to your recipients.
                  </p>
                </FormField>
                <FormField label="Email Language *">
                  <select
                    className={input}
                    value={form.language}
                    disabled={locked}
                    onChange={(e) => set("language", e.target.value)}
                  >
                    <option value="English">English</option>
                  </select>
                </FormField>
              </div>
            </section>
            <section>
              <h2 className="font-semibold text-lg mb-4">Subject Line</h2>
              <div className="space-y-4">
                <FormField label="Subject Line *">
                  <input
                    className={input}
                    value={form.subject}
                    onChange={(e) => set("subject", e.target.value)}
                    disabled={locked}
                    maxLength={250}
                  />
                </FormField>
                <FormField label="Preview text">
                  <input
                    aria-label="Preview text"
                    className={input}
                    value={form.preheader}
                    onChange={(e) => set("preheader", e.target.value)}
                    disabled={locked}
                    maxLength={250}
                  />
                  <p className="text-xs text-navy-400 mt-1">
                    Shown beside the subject in your recipients’ inbox.
                  </p>
                </FormField>
              </div>
            </section>
            <section>
              <h2 className="font-semibold text-lg mb-4">
                Sender & Reply-to Emails
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Sender *">
                  <select
                    aria-label="Sender"
                    className={input}
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
                  <Link
                    to="/admin/campaigns/manage/senders"
                    className="text-blue-600 text-xs mt-2 inline-block"
                  >
                    Edit senders in Email Settings
                  </Link>
                </FormField>
                <FormField label="Reply-to Email *">
                  <input
                    type="email"
                    className={input}
                    value={form.reply_to}
                    onChange={(e) => set("reply_to", e.target.value)}
                    disabled={locked}
                  />
                </FormField>
              </div>
            </section>
            <section>
              <h2 className="font-semibold text-lg mb-4">CC Emails</h2>
              <FormField label="CC Email list">
                <textarea
                  className={input}
                  value={form.cc}
                  onChange={(e) => set("cc", e.target.value)}
                  disabled={locked}
                  placeholder="Separate email addresses with commas"
                />
              </FormField>
              <label className="flex gap-2 text-sm mt-4">
                <input
                  type="checkbox"
                  checked={form.cc_assistant}
                  onChange={(e) => set("cc_assistant", e.target.checked)}
                  disabled={locked}
                />
                CC to Assistant for each Recipient
              </label>
              <p className="text-xs text-navy-400 mt-2">
                CC addresses receive a copy of each recipient’s personalized
                email.
              </p>
            </section>
          </div>
        </Card>
      )}
      {steps[step] === "Template" && (
        <Card>
          <h2 className="font-semibold text-lg mb-4">Select a Template</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates
              .filter((t) => t.campaign_type === "regular" || !t.campaign_type)
              .map((t) => (
                <button
                  key={t.id}
                  className={`border rounded-lg text-left p-5 hover:border-blue-600 ${form.template_id === t.id ? "border-blue-600 ring-1 ring-blue-600" : ""}`}
                  disabled={locked}
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm(
                        "Replace the current design with this template?",
                      )
                    )
                      applyTemplate(t);
                  }}
                >
                  <div className="h-24 bg-navy-50 flex items-center justify-center mb-3 text-3xl">
                    ✉
                  </div>
                  <strong>{t.name}</strong>
                  <p className="text-xs text-navy-500 mt-2">
                    {t.description || "Reusable email design"}
                  </p>
                </button>
              ))}
          </div>
          <h2 className="font-semibold text-lg mt-8 mb-4">Select a Layout</h2>
          <div className="grid sm:grid-cols-4 gap-3">
            {CAMPAIGN_LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                onClick={() => {
                  if (window.confirm("Start a new design using this layout?"))
                    chooseLayout(layout.id);
                }}
                disabled={locked}
                className={`border rounded-lg p-4 text-sm ${form.layout_key === layout.id && !form.template_id ? "border-blue-600 text-blue-600" : ""}`}
              >
                {layout.name}
              </button>
            ))}
          </div>
        </Card>
      )}
      {steps[step] === "Content & Design" && type !== "regular" && (
        <div className="mb-5 max-w-md">
          <label
            className="text-sm block mb-2"
            htmlFor="campaign-event-template"
          >
            Select a template
          </label>
          <select
            id="campaign-event-template"
            disabled={locked}
            className={input}
            value={form.template_id}
            onChange={(e) => {
              const template = templates.find(
                (row) => row.id === e.target.value,
              );
              if (!template) {
                set("template_id", "");
                return;
              }
              if (
                window.confirm(
                  "Replace this design with the selected template?",
                )
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
        </div>
      )}
      {steps[step] === "Content & Design" && (
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
      )}
      {isReview && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <Card>
            <h2 className="font-semibold text-lg mb-5">Review & Send</h2>
            <div className="divide-y">
              {[
                ["Subject Line", form.subject],
                [
                  "Recipients",
                  `${audience?.included_count ?? 0} Unique Recipients`,
                ],
                ["Email Language", "English"],
                ["Sender", `${campaign.from_name} <${campaign.from_email}>`],
                ["Internal Campaign Name", form.name],
                ["Preview text", form.preheader || "Not set"],
                ["Reply-to Email", form.reply_to],
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
                  className="flex justify-between gap-4 py-4 text-sm"
                >
                  <span className="text-navy-500">{label}</span>
                  <strong className="text-right break-all">
                    {value || "Required"}
                  </strong>
                </div>
              ))}
            </div>
            {review?.provider?.errors?.length > 0 && (
              <div className="mt-5 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold mb-2">
                  Complete these items before sending
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {review.provider.errors.map((issue) => (
                    <li key={typeof issue === "string" ? issue : issue.code}>
                      {typeof issue === "string" ? issue : issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                className="bg-blue-600 text-white rounded-lg px-6 py-2 disabled:opacity-50"
                disabled={
                  busy ||
                  !hasPermission("campaigns.send") ||
                  !review?.provider?.ready ||
                  !audience?.included_count ||
                  campaign.state !== "draft"
                }
                onClick={() => setDialog("send")}
              >
                Send
              </button>
              <button
                className="border border-blue-600 text-blue-600 rounded-lg px-6 py-2 disabled:opacity-50"
                disabled={
                  busy ||
                  !hasPermission("campaigns.send") ||
                  !review?.provider?.ready ||
                  !audience?.included_count ||
                  campaign.state !== "draft"
                }
                onClick={() => setDialog("schedule")}
              >
                Schedule
              </button>
            </div>
            <h3 className="font-semibold mt-8 mb-3">Send a Test Email</h3>
            <div className="flex gap-2">
              <input
                className={input}
                type="email"
                placeholder="Email address"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <button
                className="border rounded-lg px-4 shrink-0 disabled:opacity-50"
                disabled={
                  busy || !hasPermission("campaigns.send") || !testEmail
                }
                onClick={() =>
                  run(async () => {
                    await sendCampaignTest(id, testEmail);
                    toast.success("Test email accepted for delivery.");
                  })
                }
              >
                Send test
              </button>
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold mb-4">Email Preview</h3>
            {preview?.html && (
              <iframe
                title="Campaign preview"
                sandbox=""
                srcDoc={preview.html}
                className="w-full h-[650px] border"
              />
            )}
          </Card>
        </div>
      )}
      <div className="flex justify-between items-center gap-3 mt-6">
        <button
          className="border rounded-lg px-4 py-2 text-sm"
          onClick={() => next(Math.max(0, step - 1))}
          disabled={step === 0 || busy}
        >
          Back
        </button>
        <div className="flex gap-3 items-center">
          {dirty && (
            <span className="text-xs text-amber-700">Unsaved changes</span>
          )}
          {steps[step] === "Content & Design" && !locked && (
            <button
              type="button"
              className="text-sm text-blue-600"
              disabled={busy}
              onClick={() => {
                const name = window.prompt(
                  "Name this reusable template",
                  form.name,
                );
                if (name?.trim())
                  void run(async () => {
                    const saved = await save();
                    const result = await campaignRequest("/templates", {
                      method: "POST",
                      body: {
                        name: name.trim(),
                        campaign_type: type,
                        subject: saved.subject,
                        preheader: saved.preheader,
                        layout_key: form.layout_key,
                        design: saved.revision.design,
                      },
                    });
                    setTemplates((await fetchCampaignTemplates()).data);
                    set("template_id", result.id);
                    toast.success("Template saved.");
                  });
              }}
            >
              Save as Template
            </button>
          )}
          <button
            className="border rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy || locked || !dirty}
            onClick={() =>
              run(async () => {
                await save();
                toast.success("Campaign saved.");
              })
            }
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {!isReview && (
            <button
              className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm"
              disabled={busy}
              onClick={() => next(step + 1)}
            >
              Next
            </button>
          )}
        </div>
      </div>
      {dialog && (
        <div
          className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-title"
            className="bg-white rounded-xl p-6 max-w-lg w-full shadow-xl"
          >
            <h2 id="send-title" className="text-xl font-semibold mb-4">
              {dialog === "schedule" ? "Schedule" : "Send Campaign"}
            </h2>
            <p className="text-sm text-navy-600 mb-5">
              {dialog === "schedule"
                ? "Recipients are determined when delivery begins."
                : `Send “${form.subject}” to ${audience?.included_count} unique recipients now?`}
            </p>
            {dialog === "schedule" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Date">
                    <input
                      type="date"
                      className={input}
                      value={schedule.date}
                      onChange={(e) =>
                        setSchedule((s) => ({ ...s, date: e.target.value }))
                      }
                    />
                  </FormField>
                  <FormField label="Time">
                    <input
                      type="time"
                      className={input}
                      value={schedule.time}
                      onChange={(e) =>
                        setSchedule((s) => ({ ...s, time: e.target.value }))
                      }
                    />
                  </FormField>
                </div>
                <FormField label="Timezone">
                  <select
                    className={input}
                    value={schedule.timezone}
                    onChange={(e) =>
                      setSchedule((s) => ({ ...s, timezone: e.target.value }))
                    }
                  >
                    {CAMPAIGN_TIMEZONES.map((zone) => (
                      <option key={zone}>{zone}</option>
                    ))}
                  </select>
                </FormField>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!directory.push_configured}
                    checked={schedule.push_enabled}
                    onChange={(e) =>
                      setSchedule((s) => ({
                        ...s,
                        push_enabled: e.target.checked,
                      }))
                    }
                  />
                  Send a push notification to registered mobile devices
                </label>
                {!directory.push_configured && (
                  <p className="text-xs text-navy-500">
                    Mobile push is available after the organization’s mobile
                    service is connected.
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button
                disabled={busy}
                onClick={() => setDialog("")}
                className="border rounded-lg px-5 py-2"
              >
                Cancel
              </button>
              <button
                disabled={busy || (dialog === "schedule" && !schedule.date)}
                onClick={executeSend}
                className="bg-blue-600 text-white rounded-lg px-5 py-2 disabled:opacity-50"
              >
                {busy
                  ? "Submitting…"
                  : dialog === "schedule"
                    ? "Schedule"
                    : "Send"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
