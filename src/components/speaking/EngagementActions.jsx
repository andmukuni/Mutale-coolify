import { CalendarPlus, FileText, Images, Newspaper, PlayCircle } from 'lucide-react';
import {
  buildSpeakingIcs,
  canAddToCalendar,
  speakingCalendarFilename,
} from '../../../shared/speakingCalendar.js';
import { mediaActionLabel } from '../../../shared/speakingEngagements.js';
import { trackSpeaking } from '../../utils/speakingMetrics';
import { publicMediaItems } from './engagementMedia';

const MEDIA_ICONS = { recording: PlayCircle, slides: FileText, photos: Images, article: Newspaper };

const actionClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-sm font-semibold text-navy-800 transition-colors hover:border-cyan-700 hover:text-cyan-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 dark:text-navy-100 dark:hover:text-cyan-300';

function downloadIcs(engagement) {
  const pageUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/speaking`;
  const content = buildSpeakingIcs(engagement, { pageUrl });
  if (!content) return;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = speakingCalendarFilename(engagement);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * An engagement's actions, on its page: recordings, slides, photos and
 * articles, plus "Add to calendar" for confirmed engagements with known dates.
 * `stacked` lays them out full width, one per line.
 */
export default function EngagementActions({ engagement, track = true, stacked = false }) {
  const media = publicMediaItems(engagement).filter((item) => MEDIA_ICONS[item.type]);
  const calendar = canAddToCalendar(engagement);
  if (!calendar && media.length === 0) return null;

  return (
    <div className={stacked ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}>
      {media.map((item, index) => {
        const Icon = MEDIA_ICONS[item.type];
        const label = mediaActionLabel(item);
        return (
          <a
            key={`${item.type}-${index}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label}: ${engagement.event_title} (opens in a new tab)`}
            onClick={() => { if (track) trackSpeaking('media_click', engagement.id); }}
            className={actionClass}
          >
            <Icon size={15} className="text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
            {label}
          </a>
        );
      })}
      {calendar && (
        <button
          type="button"
          onClick={() => {
            downloadIcs(engagement);
            if (track) trackSpeaking('calendar_add', engagement.id);
          }}
          // The visible label comes first, so voice users can say what they see (SC 2.5.3).
          aria-label={`Add to calendar: ${engagement.event_title}`}
          className={actionClass}
        >
          <CalendarPlus size={15} className="text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Add to calendar
        </button>
      )}
    </div>
  );
}
