import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiBase } from "../utils/apiBase";

import { UNSUBSCRIBE_REASONS } from "../../shared/campaignWorkspace";

const API_BASE = getApiBase();

export default function EmailUnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("ready");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    if (!token) setError("This unsubscribe link is missing a token.");
  }, [token]);

  const confirm = async () => {
    setStatus("saving");
    try {
      const res = await fetch(
        `${API_BASE}/email/unsubscribe?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, reason, details }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok)
        throw new Error(json.message || "Unable to unsubscribe.");
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("ready");
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-navy-100 shadow-sm p-8 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
          Mutale Mubanga · Growing People.
        </p>
        <h1 className="text-xl font-semibold text-navy-900">Unsubscribe</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {status === "done" ? (
          <p className="text-sm text-navy-600">
            You will no longer receive promotional event emails.
          </p>
        ) : (
          <>
            <p className="text-sm text-navy-600">
              This only stops promotional mail. Event service messages about a
              registration you already have may still be sent.
            </p>
            <label className="block text-sm">
              Reason (optional)
              <select
                className="w-full border rounded p-2 mt-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Select a reason</option>
                {UNSUBSCRIBE_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            {reason === "Other" && (
              <textarea
                className="w-full border rounded p-2"
                placeholder="Tell us more (optional)"
                maxLength={1000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            )}
            <button
              type="button"
              disabled={status === "saving" || !token}
              onClick={confirm}
              className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm"
            >
              Confirm unsubscribe
            </button>
          </>
        )}
        <Link
          to={`/email/preferences?token=${encodeURIComponent(token)}`}
          className="text-sm text-cyan-700"
        >
          Manage preferences
        </Link>
      </div>
    </div>
  );
}
