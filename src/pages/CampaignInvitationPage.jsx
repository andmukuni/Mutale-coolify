import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiBase } from "../utils/apiBase";
export default function CampaignInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`${getApiBase()}/email/invitation?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok || !result.ok) throw new Error(result.message);
        if (active) setData(result.data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const respond = async (response) => {
    setBusy(true);
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
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-xl mx-auto my-16 p-8 bg-white border rounded-2xl">
      <p className="text-sm text-cyan-700 mb-3">
        Mutale Mubanga · Growing People.
      </p>
      <h1 className="text-2xl font-semibold mb-4">
        {data?.event.title || "Event Invitation"}
      </h1>
      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="text-sm mb-4">
            Dear {data.name || "Guest"}, you’re invited to join us.
          </p>
          <p className="text-sm text-navy-500 mb-6">
            {String(data.event.start_date || "").slice(0, 10)}{" "}
            {data.event.start_time} ·{" "}
            {data.event.venue || data.event.location || data.event.event_mode}
          </p>
          {["accepted", "declined"].includes(data.state) ? (
            <>
              <p className="mb-5">
                {data.state === "accepted"
                  ? "Thank you. Your attendance response has been recorded."
                  : "Your response has been recorded. You will not receive further invitations for this event."}
              </p>
              {data.state === "accepted" && (
                <>
                  <Link
                    to={data.registration_url}
                    className="inline-block bg-blue-600 text-white rounded-lg px-5 py-3"
                  >
                    Continue to Registration
                  </Link>
                  <p className="text-sm text-navy-500 mt-3">
                    Complete registration and any required payment to reserve
                    your place.
                  </p>
                </>
              )}
            </>
          ) : (
            <div className="flex gap-4">
              <button
                disabled={busy}
                onClick={() => respond("accepted")}
                className="bg-blue-600 text-white rounded-lg px-5 py-3"
              >
                I Will Attend
              </button>
              <button
                disabled={busy}
                onClick={() => respond("declined")}
                className="border rounded-lg px-8 py-3"
              >
                No
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
