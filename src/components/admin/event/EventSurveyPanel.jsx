import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { getApiBase } from '../../../utils/apiBase';
import { getAdminAuthHeaders } from '../../../utils/authHeaders';
import { formatSurveyAnswerValue } from '../../../../shared/eventSurveyQuestions.js';

const API_BASE = getApiBase();

export default function EventSurveyPanel({ eventId }) {
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/survey`, {
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Unable to load survey results.');
      setData(json.data);
    } catch (err) {
      setError(err.message || 'Unable to load survey results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) void load();
  }, [eventId]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/survey/analyze`, {
        method: 'POST',
        headers: { ...getAdminAuthHeaders(), 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'AI analysis failed.');
      setData((prev) => ({ ...prev, analysis: json.data }));
    } catch (err) {
      setError(err.message || 'AI analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-navy-500">Loading survey results…</p>;
  }

  const analysis = data?.analysis?.summary || {};
  const responses = Array.isArray(data?.responses) ? data.responses : [];
  const questions = Array.isArray(data?.questions) ? data.questions : [];

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-600">
          {data?.response_count || 0} response{data?.response_count === 1 ? '' : 's'}
          {data?.average_rating != null ? ` · average ${data.average_rating}/${data.rating_max || 5}` : ''}
        </p>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={analyzing || !responses.length}
          className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-xs font-medium text-white hover:bg-navy-800 disabled:opacity-50"
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Analyze with AI
        </button>
      </div>

      {analysis.headline && (
        <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-4 space-y-2">
          <p className="text-sm font-semibold text-navy-900">{analysis.headline}</p>
          {analysis.sentiment && (
            <p className="text-xs uppercase tracking-wide text-cyan-800">Sentiment: {analysis.sentiment}</p>
          )}
          {Array.isArray(analysis.themes) && analysis.themes.length > 0 && (
            <ul className="text-sm text-navy-700 list-disc pl-5 space-y-1">
              {analysis.themes.map((theme) => (
                <li key={theme.theme}>{theme.theme}{theme.count ? ` (${theme.count})` : ''}</li>
              ))}
            </ul>
          )}
          {Array.isArray(analysis.highlights) && analysis.highlights.length > 0 && (
            <div className="text-sm text-navy-700">
              <p className="font-medium">Highlights</p>
              <ul className="list-disc pl-5 space-y-1">
                {analysis.highlights.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(analysis.improvements) && analysis.improvements.length > 0 && (
            <div className="text-sm text-navy-700">
              <p className="font-medium">Improvements</p>
              <ul className="list-disc pl-5 space-y-1">
                {analysis.improvements.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {analysis.recommendation && (
            <p className="text-sm text-navy-700">{analysis.recommendation}</p>
          )}
        </div>
      )}

      {responses.length === 0 ? (
        <p className="text-sm text-navy-400 text-center py-4">No survey responses yet.</p>
      ) : (
        <ul className="divide-y divide-navy-100">
          {responses.map((row) => (
            <li key={row.id} className="py-3">
              <p className="text-sm font-medium text-navy-900">{row.attendee_name}</p>
              <dl className="mt-2 space-y-1.5">
                {questions.map((question) => {
                  const formatted = formatSurveyAnswerValue(question, row.answers?.[question.id]);
                  if (!formatted) return null;
                  return (
                    <div key={question.id}>
                      <dt className="text-[11px] uppercase tracking-wide text-navy-400">{question.label}</dt>
                      <dd className="text-sm text-navy-700">{formatted}</dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
