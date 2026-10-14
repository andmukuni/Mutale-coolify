import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Send } from "lucide-react";
import { Spinner } from "../components/ui";
import { fieldControlClass } from "../utils/formFieldHighlight";
import { getApiBase } from "../utils/apiBase";

const choiceClass =
  "flex items-center gap-3 rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm text-navy-700 cursor-pointer hover:bg-navy-50 has-[:checked]:border-cyan-500 has-[:checked]:bg-cyan-50/60 has-[:checked]:text-navy-900";

export default function CampaignSurveyPage() {
  const { id } = useParams();
  const [survey, setSurvey] = useState(null),
    [answers, setAnswers] = useState({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`${getApiBase()}/email/surveys/${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.message);
        if (active) setSurvey(j.data);
      })
      .catch((e) => {
        if (active) setError(e.message || "This survey is not available.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const change = (key, value) => setAnswers((a) => ({ ...a, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${getApiBase()}/email/surveys/${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        },
      );
      const j = await response.json();
      if (!response.ok || !j.ok) throw new Error(j.message);
      setDone(true);
    } catch (e) {
      setError(e.message || "We could not submit your response.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-navy-100 shadow-sm p-8 space-y-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
          Mutale Mubanga · Growing People.
        </p>
        <h1 className="text-xl font-semibold text-navy-900">
          {survey?.name || "Survey"}
        </h1>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-navy-500">
            <Spinner size={16} />
            Loading survey…
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
        {done ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} />
            </div>
            <p className="text-lg font-semibold text-navy-900">
              Thank you for your response.
            </p>
            <p className="text-sm text-navy-500 mt-1">
              Your feedback has been recorded.
            </p>
          </div>
        ) : (
          survey && (
            <form onSubmit={submit} className="space-y-6">
              {survey.description && (
                <p className="text-sm text-navy-600">{survey.description}</p>
              )}
              {survey.questions.map((q, index) => (
                <fieldset
                  key={q.id}
                  className="rounded-xl border border-navy-100 p-5"
                >
                  <legend className="px-1 text-sm font-semibold text-navy-900">
                    <span className="text-navy-400 mr-1">{index + 1}.</span>
                    {q.label}
                    {q.required && <span className="text-red-400"> *</span>}
                  </legend>
                  <div className="mt-2">
                    {q.type === "text" ? (
                      <textarea
                        aria-label={q.label}
                        className={`${fieldControlClass(false)} min-h-28 resize-y`}
                        maxLength={4000}
                        required={q.required}
                        value={answers[q.id] || ""}
                        onChange={(e) => change(q.id, e.target.value)}
                      />
                    ) : q.type === "rating" ? (
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <label
                            key={value}
                            className={`${choiceClass} justify-center font-semibold`}
                          >
                            <input
                              type="radio"
                              className="sr-only"
                              name={q.id}
                              required={q.required}
                              checked={Number(answers[q.id]) === value}
                              onChange={() => change(q.id, value)}
                            />
                            {value}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {q.options.map((option) => (
                          <label key={option} className={choiceClass}>
                            <input
                              type={q.type === "choice" ? "radio" : "checkbox"}
                              className="h-4 w-4 accent-cyan-600"
                              name={q.id}
                              required={q.type === "choice" && q.required}
                              checked={
                                q.type === "choice"
                                  ? answers[q.id] === option
                                  : (answers[q.id] || []).includes(option)
                              }
                              onChange={(e) =>
                                change(
                                  q.id,
                                  q.type === "choice"
                                    ? option
                                    : e.target.checked
                                      ? [...(answers[q.id] || []), option]
                                      : (answers[q.id] || []).filter(
                                          (v) => v !== option,
                                        ),
                                )
                              }
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </fieldset>
              ))}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
              >
                {busy ? <Spinner size={16} /> : <Send size={16} />}
                {busy ? "Submitting…" : "Submit response"}
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
}
