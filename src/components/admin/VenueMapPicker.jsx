import { useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { buildOsmEmbedUrl, parseEventCoords } from '../../utils/eventMaps';

export default function VenueMapPicker({
  searchHint = '',
  locationLat,
  locationLng,
  locationPlace,
  onSelect,
  onClear,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pinEvent = {
    location_lat: locationLat,
    location_lng: locationLng,
    location_place: locationPlace,
  };
  const coords = parseEventCoords(pinEvent);
  const embedUrl = buildOsmEmbedUrl(pinEvent);

  const runSearch = async (event) => {
    event.preventDefault();
    const q = String(query || searchHint || '').trim();
    if (q.length < 2) {
      setError('Type at least 2 characters to search the map.');
      setResults([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${getApiBase()}/admin/geo/search?q=${encodeURIComponent(q)}`,
        { headers: getAdminAuthHeaders() },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        setError(json?.message || 'Could not look up that location.');
        setResults([]);
        return;
      }
      const nextResults = Array.isArray(json.data) ? json.data : [];
      setResults(nextResults);
      if (!nextResults.length) {
        setError('No matching places. Try a more specific venue or city.');
      }
    } catch {
      setError('Could not look up that location.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-navy-100 p-4 bg-navy-50/40 space-y-3">
      <div>
        <p className="text-sm font-medium text-navy-800">Map pin</p>
        <p className="text-xs text-navy-400 mt-0.5">
          Search the map so attendees can open directions on their phone.
        </p>
      </div>

      <form onSubmit={runSearch} className="flex flex-col sm:flex-row gap-2">
        <label className="sr-only" htmlFor="venue-map-search">Look up venue on map</label>
        <input
          id="venue-map-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchHint || 'e.g. Mulungushi Conference Centre, Lusaka'}
          className="flex-1 px-4 py-2.5 rounded-xl border border-navy-200 bg-white text-sm text-navy-900 placeholder-navy-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white transition-colors"
        >
          <Search size={15} />
          {loading ? 'Searching…' : 'Look up'}
        </button>
      </form>

      {error && (
        <p role="status" className="text-xs text-amber-800">{error}</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100 bg-white overflow-hidden">
          {results.map((result) => (
            <li key={`${result.lat},${result.lng},${result.label}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect?.(result);
                  setResults([]);
                  setError('');
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-cyan-50 transition-colors"
              >
                <span className="block text-sm font-medium text-navy-800">{result.venue || result.label}</span>
                <span className="block text-xs text-navy-500 mt-0.5">{result.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {coords && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-navy-600 flex items-start gap-1.5 min-w-0">
              <MapPin size={14} className="text-cyan-700 shrink-0 mt-0.5" />
              <span className="break-words">{locationPlace || `${coords.lat}, ${coords.lng}`}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                onClear?.();
                setResults([]);
                setError('');
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-navy-500 hover:text-red-600 shrink-0"
            >
              <X size={13} />
              Clear pin
            </button>
          </div>
          {embedUrl && (
            <iframe
              title="Venue map preview"
              src={embedUrl}
              className="w-full h-52 rounded-xl border border-navy-100 bg-navy-50"
              loading="lazy"
            />
          )}
        </div>
      )}
    </div>
  );
}
