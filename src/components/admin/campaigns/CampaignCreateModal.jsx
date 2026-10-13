import { useEffect, useRef, useState } from "react";
import { X, Send, CalendarClock, MailOpen, Check } from "lucide-react";
import { CAMPAIGN_TYPES } from "../../../../shared/campaignWorkspace.js";

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
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("input")?.focus();
    const keydown = (e) => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        const nodes = panel.current?.querySelectorAll(
          "button:not([disabled]),input,select",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus?.();
    };
  }, [open, onClose, busy]);
  if (!open) return null;
  const create = async () => {
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
    <div
      className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-create-title"
        className="relative w-full max-w-4xl max-h-[94vh] overflow-y-auto bg-white px-6 sm:px-10 py-8 text-navy-900"
      >
        <button
          aria-label="Close create campaign"
          className="absolute right-6 top-5 p-2 text-gray-500"
          onClick={onClose}
          disabled={busy}
        >
          <X size={26} />
        </button>
        <h2
          id="campaign-create-title"
          className="text-2xl sm:text-3xl font-semibold mb-10"
        >
          Create New Campaign
        </h2>
        <label
          className="block font-semibold mb-3"
          htmlFor="internal-campaign-name"
        >
          Name your campaign
        </label>
        <p className="text-gray-500 mb-4">
          Internal use only. Not visible to your recipients.
        </p>
        <input
          id="internal-campaign-name"
          className="w-full border border-gray-300 rounded px-3 py-2.5 mb-8"
          placeholder="Internal Campaign Name *"
          maxLength={180}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <h3 className="font-semibold mb-4">Select a campaign type</h3>
        <div className="grid md:grid-cols-3 gap-4 items-start">
          {CAMPAIGN_TYPES.map((item) => {
            const Icon = icons[item.id];
            return (
              <div
                key={item.id}
                className={`border rounded-sm bg-white p-4 shadow-sm ${type === item.id ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-100"}`}
              >
                <button
                  type="button"
                  className="text-left w-full"
                  onClick={() => setType(item.id)}
                  aria-pressed={type === item.id}
                >
                  <Icon size={48} className="text-blue-600 mx-auto my-6" />
                  <h4 className="font-bold text-base mb-2">{item.title}</h4>
                  <p className="text-gray-500 leading-snug min-h-[60px]">
                    {item.description}
                    {item.notice && (
                      <>
                        {" "}
                        <span className="text-orange-500">{item.notice}</span>
                      </>
                    )}
                  </p>
                  <span className="mt-4 pt-3 border-t border-gray-200 flex gap-1 text-blue-600 font-semibold">
                    {type === item.id ? (
                      <>
                        <Check size={20} /> Selected
                      </>
                    ) : (
                      "Select"
                    )}
                  </span>
                </button>
                {type === item.id && item.id !== "regular" && (
                  <select
                    aria-label="Select Event"
                    required
                    className="w-full mt-3 rounded border border-gray-300 px-2 py-2 text-sm"
                    value={event}
                    onChange={(e) => setEvent(e.target.value)}
                  >
                    <option value="">Select Event *</option>
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
        {error && (
          <p role="alert" className="mt-5 text-red-600">
            {error}
          </p>
        )}
        <footer className="flex justify-end gap-3 mt-10">
          <button
            onClick={onClose}
            disabled={busy}
            className="border border-gray-300 rounded px-7 py-2 text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={
              busy || !name.trim() || !type || (type !== "regular" && !event)
            }
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-8 py-2 font-medium"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </footer>
      </section>
    </div>
  );
}
