import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Gauge, Server, Send } from "lucide-react";
import { Card, LoadingButton } from "../../ui";
import useCampaignConfirm from "./useCampaignConfirm";
import { BTN_SECONDARY, INPUT_SM } from "./campaignStyles";
import { campaignRequest } from "../../../utils/campaignWorkspaceApi";

// Campaign delivery: the SMTP account from Admin → Settings → Email, the
// switch that allows sending to real recipients, and the hourly send limit.
export default function CampaignDeliveryPanel({ canManage, toast }) {
  const [settings, setSettings] = useState(null);
  const [limit, setLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useCampaignConfirm();

  const load = useCallback(async () => {
    try {
      const data = await campaignRequest("/senders/delivery");
      setSettings(data);
      setLimit(String(data.hourly_limit));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (changes, message) => {
    setSaving(true);
    try {
      const data = await campaignRequest("/senders/delivery", {
        method: "PUT",
        body: {
          live: settings.live,
          hourly_limit: Number(limit) || settings.hourly_limit,
          ...changes,
        },
      });
      setSettings(data);
      setLimit(String(data.hourly_limit));
      toast.success(message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const toggleLive = async () => {
    if (
      !settings.live &&
      !(await confirm({
        title: "Send campaigns to real recipients?",
        message: `Campaigns you send or schedule will email their real audience through ${settings.smtp_host}, at up to ${settings.hourly_limit} emails an hour.`,
        confirmLabel: "Turn on live sending",
      }))
    )
      return;
    await save(
      { live: !settings.live },
      settings.live
        ? "Live sending turned off. Queued emails will wait."
        : "Live sending turned on.",
    );
  };

  if (error)
    return (
      <Card title="Campaign delivery">
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      </Card>
    );
  if (!settings)
    return (
      <Card title="Campaign delivery">
        <div className="h-24 animate-pulse rounded-xl bg-navy-100" />
      </Card>
    );

  const limitChanged =
    Number(limit) > 0 && Number(limit) !== Number(settings.hourly_limit);
  return (
    <Card
      title="Campaign delivery"
      subtitle="Campaigns send through the same SMTP account as account, ticket and receipt emails."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-navy-50 p-2 text-navy-500">
            <Server size={16} />
          </div>
          <div className="min-w-0 text-sm">
            <p className="text-xs text-navy-400">SMTP server</p>
            {settings.configured ? (
              <>
                <p className="truncate font-medium text-navy-900">
                  {settings.smtp_host}:{settings.smtp_port}
                </p>
                {settings.smtp_user && (
                  <p className="truncate text-xs text-navy-500">
                    Signed in as {settings.smtp_user}
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-start gap-1.5 text-amber-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                Not set up.
              </p>
            )}
            <Link
              to="/admin/settings"
              className="mt-1 inline-block text-xs font-medium text-cyan-700 hover:text-cyan-600"
            >
              Edit in Admin → Settings → Email
            </Link>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-navy-50 p-2 text-navy-500">
            <Send size={16} />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-xs text-navy-400">Send to real recipients</p>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={settings.live}
                aria-label="Send campaigns to real recipients"
                disabled={!canManage || saving || !settings.configured}
                onClick={() => void toggleLive()}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  settings.live ? "bg-cyan-600" : "bg-navy-200"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    settings.live ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="font-medium text-navy-900">
                {settings.live ? "On" : "Off"}
              </span>
            </div>
            <p className="mt-1 text-xs text-navy-500">
              {settings.live
                ? "Sent and scheduled campaigns go to their audience."
                : "Only test emails are sent. Queued campaigns wait until this is on."}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-navy-50 p-2 text-navy-500">
            <Gauge size={16} />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <label
              htmlFor="campaign-hourly-limit"
              className="text-xs text-navy-400"
            >
              Emails per hour
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="campaign-hourly-limit"
                type="number"
                min="1"
                max="5000"
                inputMode="numeric"
                className={`${INPUT_SM} w-28`}
                value={limit}
                disabled={!canManage}
                onChange={(e) => setLimit(e.target.value)}
              />
              {canManage && (
                <LoadingButton
                  className={BTN_SECONDARY}
                  disabled={!limitChanged}
                  loading={saving && limitChanged}
                  loadingLabel="Saving…"
                  onClick={() =>
                    void save(
                      { hourly_limit: Number(limit) },
                      "Hourly limit saved.",
                    )
                  }
                >
                  Save
                </LoadingButton>
              )}
            </div>
            <p className="mt-1 text-xs text-navy-500">
              Keep this under your mail host's hourly cap. Going over can get
              the mailbox suspended.
            </p>
          </div>
        </div>
      </div>
      <p className="mt-6 border-t border-navy-100 pt-4 text-xs text-navy-500">
        Opens are counted with a small tracking image and clicks with link
        redirects; both are estimates. Bounces that come back later by email
        aren't recorded, only addresses the mail server rejects while sending.
      </p>
      {confirmDialog}
    </Card>
  );
}
