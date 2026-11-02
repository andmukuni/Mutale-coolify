import { ClipboardList, MessagesSquare, Mic, Sparkles, Users } from 'lucide-react';

const FORMAT_ICONS = {
  keynotes: Mic,
  workshops: Users,
  'panel discussions': MessagesSquare,
  facilitation: ClipboardList,
};

/**
 * Formats are stored one per line as "Title | short description".
 * Blank lines and lines without a title are skipped.
 */
export function parseSpeakingFormats(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const [title, ...rest] = String(line || '').split('|');
      return { title: title.trim(), description: rest.join('|').trim() };
    })
    .filter((format) => format.title)
    .map((format) => ({ ...format, Icon: FORMAT_ICONS[format.title.toLowerCase()] || Sparkles }));
}
