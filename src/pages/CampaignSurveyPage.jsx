import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApiBase } from "../utils/apiBase";
export default function CampaignSurveyPage() {
  const { id } = useParams();
  const [survey, setSurvey] = useState(null),
    [answers, setAnswers] = useState({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
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
        if (active) setError(e.message);
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
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-2xl mx-auto my-12 p-8 bg-white border rounded-xl">
      <p className="text-sm text-cyan-700 mb-3">
        Mutale Mubanga · Growing People.
      </p>
      <h1 className="text-2xl font-semibold mb-4">
        {survey?.name || "Survey"}
      </h1>
      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}
      {done ? (
        <p>Thank you for your response.</p>
      ) : (
        survey && (
          <form onSubmit={submit} className="space-y-8">
            <p className="text-navy-500 text-sm">{survey.description}</p>
            {survey.questions.map((q) => (
              <fieldset key={q.id}>
                <legend className="font-semibold mb-3">
                  {q.label}
                  {q.required ? " *" : ""}
                </legend>
                {q.type === "text" ? (
                  <textarea
                    className="w-full border rounded-lg p-3"
                    maxLength={4000}
                    required={q.required}
                    value={answers[q.id] || ""}
                    onChange={(e) => change(q.id, e.target.value)}
                  />
                ) : q.type === "rating" ? (
                  <div className="flex gap-3">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <label
                        key={value}
                        className="border rounded-lg p-3 flex gap-2"
                      >
                        <input
                          type="radio"
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
                  <div className="space-y-3">
                    {q.options.map((option) => (
                      <label key={option} className="flex gap-3 text-sm">
                        <input
                          type={q.type === "choice" ? "radio" : "checkbox"}
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
              </fieldset>
            ))}
            <button
              disabled={busy}
              className="bg-blue-600 text-white rounded-lg px-6 py-3"
            >
              {busy ? "Submitting…" : "Submit"}
            </button>
          </form>
        )
      )}
    </div>
  );
}
