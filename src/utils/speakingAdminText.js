import { SECTION_TITLES, previewEngagement } from '../../shared/speakingEngagements.js';

export const HIDE_NOTICE = 'Hiding removes an engagement from the website. It cannot recall information visitors have already downloaded, or pages that external search engines have already cached.';

/** Plain-language answer to "can visitors see this right now?" */
export function visibilitySummary(record) {
  const state = record?.publication_state || 'draft';
  const declined = record?.participation_status === 'declined';
  if (state === 'draft') return 'Draft — not on the website yet.';
  if (state === 'hidden') {
    return declined
      ? 'Hidden — not on the website. Declined engagements stay private; change your participation before republishing.'
      : 'Hidden — not on the website. Republish to show it again.';
  }
  if (declined) {
    return 'Not on the website: declined engagements are always kept private. Saving it as declined hides it.';
  }
  const { section, participation_status: participation } = previewEngagement(record);
  // A past "Invited" record is still listed, with its label, so it is worth confirming.
  if (section === 'previous' && participation === 'invited') {
    return `Live on the website, under “${SECTION_TITLES.previous}”, labelled “Invited”. If you spoke, mark it Confirmed.`;
  }
  return `Live on the website, under “${SECTION_TITLES[section]}”.`;
}
