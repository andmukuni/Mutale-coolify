import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  XCircle,
} from "lucide-react";
import { Spinner } from "../components/ui";
import { getApiBase } from "../utils/apiBase";

export default function CampaignInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch(`${getApiBase()}/email/invitation?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok || !result.ok) throw new Error(result.message);
        if (active) setData(result.data);
      })
      .catch((e) => {
        if (active) setError(e.message || "This invitation link is not valid.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const respond = async (response) => {
    setBusy(response);
    setError("");
    try {
      const r = await fetch(`${getApiBase()}/email/invitation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, response }),
      });
      const result = await r.json();
      if (!r.ok || !result.ok) throw new Error(result.message);
      setData(result.data);
    } catch (e) {
      setError(e.message || "We could not record your response.");
    } finally {
      setBusy("");
    }
  };
  const event = data?.event;
  const responded = ["accepted", "declined"].includes(data?.state);
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-navy-100 shadow-sm p-8 space-y-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
          Mutale Mubanga · Growing People.
        </p>
        <h1 className="text-xl font-semibold text-navy-900">
          {event?.title || "Event invitation"}
        </h1>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-navy-500">
            <Spinner size={16} />
            Loading your invitation…
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
          >
            {error}
          </p>
        )}
        {data && (
          <>
            <p className="text-sm text-navy-700">
              Dear {data.name || "Guest"}, you’re invited to join us.
            </p>
            <ul className="space-y-2 rounded-xl bg-navy-50 border border-navy-100 p-4 text-sm text-navy-700">
              {event.start_date && (
                <li className="flex items-center gap-2">
                  <CalendarDays size={16} className="text-cyan-600 shrink-0" />
                  {String(event.start_date).slice(0, 10)}
                </li>
              )}
              {event.start_time && (
                <li className="flex items-center gap-2">
                  <Clock size={16} className="text-cyan-600 shrink-0" />
                  {event.start_time}
                </li>
              )}
              {(event.venue || event.location || event.event_mode) && (
                <li className="flex items-center gap-2">
                  <MapPin size={16} className="text-cyan-600 shrink-0" />
                  {event.venue || event.location || event.event_mode}
                </li>
              )}
            </ul>
            {responded ? (
              <div className="space-y-4">
                <div
                  className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
                    data.state === "accepted"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-navy-200 bg-navy-50 text-navy-700"
                  }`}
                >
                  {data.state === "accepted" ? (
                    <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={18} className="shrink-0 mt-0.5" />
                  )}
                  <p>
                    {data.state === "accepted"
                      ? "Thank you. Your attendance response has been recorded."
                      : "Your response has been recorded. You will not receive further invitations for this event."}
                  </p>
                </div>
                {data.state === "accepted" && (
                  <>
                    <Link
                      to={data.registration_url}
                      className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    >
                      Continue to registration
                      <ArrowRight size={16} />
                    </Link>
                    <p className="text-xs text-navy-500">
                      Complete registration and any required payment to
                      reserve your place.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => respond("accepted")}
                  className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {busy === "accepted" ? (
                    <Spinner size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  I will attend
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => respond("declined")}
                  className="inline-flex items-center gap-2 bg-white border border-navy-200 text-navy-700 hover:bg-navy-50 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {busy === "declined" ? (
                    <Spinner size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                  No, I can’t attend
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
