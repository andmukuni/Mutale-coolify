import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getApiBase } from "../utils/apiBase";

const API_BASE = getApiBase();

export default function EmailPreferencesPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [lists, setLists] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/email/preferences?token=${encodeURIComponent(token)}`,
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok)
          throw new Error(
            json.message || "This preferences link is not valid.",
          );
        if (!cancelled) {
          setData(json.data);
          const response = await fetch(
            `${API_BASE}/email/subscriptions?token=${encodeURIComponent(token)}`,
          );
          const groups = await response.json();
          if (response.ok && !cancelled) setLists(groups.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const updateList = async (group, subscribed) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/email/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, group_id: group.id, subscribed }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message);
      setLists((old) =>
        old.map((row) =>
          row.id === group.id
            ? { ...row, state: subscribed ? "active" : "unsubscribed" }
            : row,
        ),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const update = async (body) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/email/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok)
        throw new Error(json.message || "Unable to save preferences.");
      setData((prev) => ({ ...prev, preference: json.data.preference }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-navy-100 shadow-sm p-8 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
          Mutale Mubanga · Growing People.
        </p>
        <h1 className="text-xl font-semibold text-navy-900">
          Email preferences
        </h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {data && (
          <>
            <p className="text-sm text-navy-600">
              Preferences for {data.email}. This page does not change anything
              until you choose an option.
            </p>
            <p className="text-sm text-navy-500">{data.consent?.wording}</p>
            <div className="space-y-4 border-y py-4">
              {lists.map((group) => (
                <label key={group.id} className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={group.state === "active"}
                    onChange={(e) => updateList(group, e.target.checked)}
                  />
                  <span>
                    {group.name}
                    <span className="block text-xs text-navy-500 mt-1">
                      {group.description}
                      {group.active_only ? " · Active members only" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => update({ marketing_opt_in: true })}
                className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm"
              >
                Stay subscribed
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => update({ unsubscribe: true })}
                className="px-4 py-2 rounded-xl border border-navy-200 text-sm"
              >
                Unsubscribe from marketing
              </button>
            </div>
            {data.preference?.unsubscribed_at && (
              <p className="text-sm text-navy-500">
                You are unsubscribed from promotional mail.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
