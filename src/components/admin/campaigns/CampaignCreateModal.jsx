import { useEffect, useRef, useState } from "react";
import { Send, CalendarClock, MailOpen, CheckCircle2, Circle } from "lucide-react";
import { Modal, FormField, LoadingButton } from "../../ui";
import { CAMPAIGN_TYPES } from "../../../../shared/campaignWorkspace.js";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_SM } from "./campaignStyles";

const icons = {
  regular: Send,
  event_notification: CalendarClock,
  event_invitation: MailOpen,
};

export default function CampaignCreateModal({
  open,
  onClose,
  onCreate,
  events = [],
  eventId = "",
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [event, setEvent] = useState(eventId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const body = useRef(null);

  useEffect(() => {
    if (open) body.current?.querySelector("input")?.focus();
  }, [open]);

  const close = () => {
    if (!busy) onClose();
  };
  const ready = name.trim() && type && (type === "regular" || event);

  const create = async (e) => {
    e?.preventDefault();
    if (!ready) return;
    setError("");
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        campaign_type: type,
        purpose:
          type === "event_notification" ? "event_service" : "promotional",
        event_id: type === "regular" ? null : event,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title="Create campaign"
      subtitle="Name it, pick a type, and you'll continue to recipients."
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className={BTN_SECONDARY}
          >
            Cancel
          </button>
          <LoadingButton
            type="submit"
            form="campaign-create-form"
            loading={busy}
            loadingLabel="Creating…"
            disabled={!ready}
            className={BTN_PRIMARY}
          >
            Create campaign
          </LoadingButton>
        </>
      }
    >
      <form
        id="campaign-create-form"
        ref={body}
        onSubmit={create}
        className="space-y-6"
      >
        <FormField
          label="Internal campaign name"
          name="internal-campaign-name"
          required
          maxLength={180}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Leadership Summit – early bird reminder"
          helpText="Internal use only. Not visible to your recipients."
        />
        <fieldset>
          <legend className="block text-sm font-medium text-navy-700 mb-3">
            Campaign type <span className="text-red-400">*</span>
          </legend>
          <div className="grid md:grid-cols-3 gap-4 items-start">
            {CAMPAIGN_TYPES.map((item) => {
              const Icon = icons[item.id] || Send;
              const selected = type === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    selected
                      ? "border-cyan-500 ring-2 ring-cyan-500/20 bg-cyan-50/40"
                      : "border-navy-100 bg-white hover:border-navy-200"
                  }`}
                >
                  <button
                    type="button"
                    className="text-left w-full"
                    onClick={() => setType(item.id)}
                    aria-pressed={selected}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="p-2.5 rounded-xl bg-cyan-50 text-cyan-600">
                        <Icon size={20} />
                      </div>
                      {selected ? (
                        <CheckCircle2 size={20} className="text-cyan-600" />
                      ) : (
                        <Circle size={20} className="text-navy-200" />
                      )}
                    </div>
                    <h4 className="font-semibold text-sm text-navy-900 mb-1">
                      {item.title}
                    </h4>
                    <p className="text-xs text-navy-500 leading-relaxed">
                      {item.description}
                      {item.notice && (
                        <>
                          {" "}
                          <span className="text-amber-700">{item.notice}</span>
                        </>
                      )}
                    </p>
                  </button>
                  {selected && item.id !== "regular" && (
                    <select
                      aria-label="Select event"
                      required
                      className={`${INPUT_SM} mt-3`}
                      value={event}
                      onChange={(e) => setEvent(e.target.value)}
                    >
                      <option value="">Select event *</option>
                      <optgroup label="Public Events">
                        {events.map((row) => (
                          <option key={row.id} value={row.id}>
                            {[
                              row.start_date,
                              row.title,
                              row.location || row.venue,
                            ]
                              .filter(Boolean)
                              .join(" - ")}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
