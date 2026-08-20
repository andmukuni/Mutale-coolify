import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Loader2, XCircle } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';

const API_BASE = getApiBase();

export default function GuestSurveyPage() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);

  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(code || '')}/survey${tokenQuery}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.message || 'Unable to load this survey.');
        if (cancelled) return;
        setSurvey(json.data);
        setDone(Boolean(json.data?.submitted));
        if (json.data?.answers && typeof json.data.answers === 'object') {
          setAnswers(json.data.answers);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to load this survey.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [code, tokenQuery]);

  const questions = useMemo(() => (Array.isArray(survey?.questions) ? survey.questions : []), [survey]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(code || '')}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, answers }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Could not submit the survey.');
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not submit the survey.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[60vh] py-10 sm:py-14 px-4">
      <div className="max-w-xl mx-auto rounded-2xl border border-navy-100 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 text-cyan-700 mb-3">
          <ClipboardList size={18} />
          <p className="text-xs font-semibold uppercase tracking-wider">Event survey</p>
        </div>
        <h1 className="text-2xl font-bold text-navy-900">{survey?.event_title || 'Share your feedback'}</h1>
        <p className="text-sm text-navy-500 mt-2">
          {survey?.attendee_name ? `Hi ${survey.attendee_name}. ` : ''}
          Your answers help us improve future events.
        </p>

        {loading && (
          <p className="text-sm text-navy-500 mt-6 animate-pulse">Loading survey…</p>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <XCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {!loading && done && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
            <p className="font-semibold flex items-center gap-2">
              <CheckCircle2 size={18} />
              Thank you
            </p>
            <p className="text-sm mt-1">Your feedback has been recorded. We will review it with the rest of the responses.</p>
          </div>
        )}

        {!loading && survey && !done && !survey.can_submit && (
          <p className="text-sm text-navy-600 mt-6">{survey.message || 'The survey is not open yet.'}</p>
        )}

        {!loading && survey?.can_submit && !done && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {questions.map((question) => (
              <label key={question.id} className="block">
                <span className="text-sm font-medium text-navy-800">
                  {question.label}
                  {question.required ? ' *' : ''}
                </span>
                {question.type === 'rating' && (
                  <select
                    className="mt-2 w-full rounded-xl border border-navy-200 px-3 py-2.5 text-sm"
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                    required={question.required}
                  >
                    <option value="">Select a rating</option>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>{value} / 5</option>
                    ))}
                  </select>
                )}
                {question.type === 'choice' && (
                  <select
                    className="mt-2 w-full rounded-xl border border-navy-200 px-3 py-2.5 text-sm"
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                    required={question.required}
                  >
                    <option value="">Select an option</option>
                    {(question.options || []).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                )}
                {question.type === 'text' && (
                  <textarea
                    className="mt-2 w-full rounded-xl border border-navy-200 px-3 py-2.5 text-sm min-h-[90px]"
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                    required={question.required}
                  />
                )}
              </label>
            ))}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              Submit feedback
            </button>
          </form>
        )}

        <Link to={`/tickets/${encodeURIComponent(code || '')}`} className="inline-block mt-6 text-sm text-cyan-700 hover:text-cyan-600">
          Back to ticket
        </Link>
      </div>
    </div>
  );
}
