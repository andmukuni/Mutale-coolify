import { EyeOff, Globe, Info, PencilLine } from 'lucide-react';
import { Modal } from '../../ui';
import SpeakingEngagementCard from '../../speaking/SpeakingEngagementCard';
import SpeakingEngagementDetails from '../../speaking/SpeakingEngagementDetails';
import { previewEngagement } from '../../../../shared/speakingEngagements.js';
import { HIDE_NOTICE, visibilitySummary } from '../../../utils/speakingAdminText';

const PUBLICATION_STYLES = {
  published: 'bg-green-50 text-green-800 ring-green-600/20',
  draft: 'bg-navy-50 text-navy-700 ring-navy-500/20',
  hidden: 'bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200',
};
const PUBLICATION_ICONS = { published: Globe, draft: PencilLine, hidden: EyeOff };
const PUBLICATION_LABELS = { published: 'Published', draft: 'Draft', hidden: 'Hidden' };

export function PublicationBadge({ state }) {
  const Icon = PUBLICATION_ICONS[state] || PencilLine;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PUBLICATION_STYLES[state] || PUBLICATION_STYLES.draft}`}>
      <Icon size={12} aria-hidden="true" />
      {PUBLICATION_LABELS[state] || 'Draft'}
    </span>
  );
}

export function HideNotice({ className = '' }) {
  return (
    <p className={`flex items-start gap-2 text-xs leading-relaxed text-navy-600 ${className}`}>
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{HIDE_NOTICE}</span>
    </p>
  );
}

export function SpeakingPreviewModal({ record, isOpen, onClose }) {
  if (!record) return null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Preview"
      subtitle="How this engagement's card and its page look to website visitors."
      size="xl"
    >
      <p className="mb-4 rounded-xl bg-navy-50 px-3 py-2 text-sm text-navy-700">{visibilitySummary(record)}</p>
      {/* Not a link here: a draft's page can't be opened by visitors yet. */}
      <SpeakingEngagementCard engagement={previewEngagement(record)} linked={false} />
      <h3 className="mt-6 mb-3 text-sm font-semibold text-navy-900">On the engagement’s page</h3>
      <div className="rounded-2xl bg-navy-50 p-3 sm:p-4">
        <SpeakingEngagementDetails engagement={previewEngagement(record)} track={false} />
      </div>
    </Modal>
  );
}
