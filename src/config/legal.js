import { profileData } from '../data/profile.js';

/**
 * Facts the Terms and Cookie Policy depend on. Have a Zambian-qualified lawyer
 * review the documents and these values before relying on them. Empty values
 * are left out of the pages rather than shown as placeholders.
 */
export const LEGAL = {
  // Whose website this is. If you trade through a registered company, use its
  // exact registered name here and add the PACRA number below.
  operatorName: 'Mutale Mubanga',
  tradingName: 'Growing People',
  registrationNumber: '',
  physicalAddress: '',
  country: 'Zambia',
  website: 'mutalemubanga.org',
  email: profileData.email || 'grow@mutalemubanga.org',
  phone: profileData.phone || '',

  // Shown as "Last updated" on both documents. Change it whenever you edit them.
  lastUpdated: '27 October 2026',

  // Refund rules for paid event tickets.
  eventRefundCutoffDays: 7,
  // Days a shop customer has to report a damaged, faulty or wrong item.
  shopReportDays: 7,
};

export const operatorLabel = () =>
  LEGAL.tradingName ? `${LEGAL.operatorName}, trading as ${LEGAL.tradingName}` : LEGAL.operatorName;
