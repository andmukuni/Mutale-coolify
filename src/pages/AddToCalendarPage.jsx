import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarPlus, Clock, MapPin, Download, ExternalLink } from 'lucide-react';
import { getApiBase, getAppOrigin } from '../utils/apiBase';
import { formatDate, formatTime } from '../utils/helpers';
import {
  buildCalendarOptions,
  buildIcsContent,
  buildIcsFilename,
} from '../../shared/googleCalendar.js';
import EventVenueMap from '../components/EventVenueMap';

const API_BASE = getApiBase();

function downloadIcs(event, detailsUrl) {
  const content = buildIcsContent(event, { detailsUrl, uid: event.id || event.slug });
  if (!content) return;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildIcsFilename(event);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AddToCalendarPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/events/${encodeURIComponent(slug || '')}/calendar`, {
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok || !json?.data) {
          setError(json?.message || 'Event not found.');
          setEvent(null);
          return;
        }
        setEvent(json.data);
      } catch {
        if (!cancelled) {
          setError('Unable to load this event right now.');
          setEvent(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [slug]);

  const detailsUrl = event?.slug
    ? `${getAppOrigin()}/events/${encodeURIComponent(event.slug)}`
    : '';
  const options = useMemo(
    () => (event ? buildCalendarOptions(event, { detailsUrl }) : []),
    [event, detailsUrl],
  );

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-navy-100 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-cyan-50 text-cyan-700">
            <CalendarPlus size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-navy-900">Add to your calendar</h1>
            <p className="text-sm text-navy-500">Choose Google, Outlook, Yahoo, or Apple Calendar</p>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-navy-500 animate-pulse">Loading event…</p>
        )}

        {!loading && error && (
          <div className="space-y-4">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>
            <Link to="/events" className="text-sm text-cyan-700 hover:underline">Back to events</Link>
          </div>
        )}

        {!loading && event && (
          <div className="space-y-5">
            <div>
              <p className="text-lg font-semibold text-navy-900">{event.title}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-navy-600">
                <Clock size={15} className="text-navy-400" />
                {formatDate(event.start_date || event.date)}
                {event.start_time ? ` · ${formatTime(event.start_time)}` : ''}
                {event.end_time ? ` – ${formatTime(event.end_time)}` : ''}
              </p>
              {(event.location || event.venue) && (
                <p className="mt-1 flex items-center gap-2 text-sm text-navy-600">
                  <MapPin size={15} className="text-navy-400" />
                  {event.location || event.venue}
                </p>
              )}
              <div className="mt-3">
                <EventVenueMap event={event} compact />
              </div>
            </div>

            {options.length === 0 ? (
              <p className="text-sm text-navy-500">This event does not have a start date yet.</p>
            ) : (
              <ul className="space-y-2">
                {options.map((option) => (
                  <li key={option.id}>
                    {option.download ? (
                      <button
                        type="button"
                        onClick={() => downloadIcs(event, detailsUrl)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-navy-200 bg-white px-4 py-3 text-left text-sm font-semibold text-navy-800 hover:border-cyan-500 hover:bg-cyan-50"
                      >
                        {option.label}
                        <Download size={16} className="text-navy-400" />
                      </button>
                    ) : (
                      <a
                        href={option.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm font-semibold text-navy-800 hover:border-cyan-500 hover:bg-cyan-50"
                      >
                        {option.label}
                        <ExternalLink size={16} className="text-navy-400" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {detailsUrl && (
              <Link to={`/events/${encodeURIComponent(event.slug)}`} className="inline-block text-sm text-cyan-700 hover:underline">
                View event page
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
