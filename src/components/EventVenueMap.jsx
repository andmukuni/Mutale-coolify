import { ExternalLink, MapPin } from 'lucide-react';
import {
  buildOpenInMapsUrl,
  buildOsmEmbedUrl,
  eventMapLabel,
  hasEventMapPin,
} from '../utils/eventMaps';

export default function EventVenueMap({ event, compact = false }) {
  if (!hasEventMapPin(event)) return null;

  const mapsUrl = buildOpenInMapsUrl(event);
  const embedUrl = buildOsmEmbedUrl(event);
  const label = eventMapLabel(event);

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {label && !compact && (
        <p className="text-sm text-navy-600 flex items-start gap-2">
          <MapPin size={16} className="text-cyan-700 shrink-0 mt-0.5" />
          <span>{label}</span>
        </p>
      )}
      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 font-semibold text-cyan-700 hover:text-cyan-800 hover:underline ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          Open in Maps
          <ExternalLink size={compact ? 13 : 14} />
        </a>
      )}
      {embedUrl && (
        <iframe
          title="Event venue map"
          src={embedUrl}
          className={`w-full rounded-xl border border-navy-100 bg-navy-50 ${compact ? 'h-36' : 'h-56'}`}
          loading="lazy"
        />
      )}
    </div>
  );
}
