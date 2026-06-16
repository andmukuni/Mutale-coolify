/**
 * Actionable CV improvement tips from profile + activity data.
 * @param {object} input
 * @param {object} [input.user]
 * @param {object[]} [input.certificates]
 * @param {object[]} [input.registrations] - with optional .event
 * @returns {{ suggestions: Array<{ id: string, priority: 'high'|'medium'|'low', title: string, detail: string }>, score: number }}
 */
export function buildCvStrengthSuggestions({
  user = {},
  certificates = [],
  registrations = [],
} = {}) {
  const suggestions = [];
  const about = String(user.about || '').trim();
  const profession = String(user.profession || '').trim();
  const specialties = Array.isArray(user.specialties) ? user.specialties.filter(Boolean) : [];
  const attended = registrations.filter((r) => r.status === 'attended');
  const active = registrations.filter((r) => r.status !== 'cancelled');

  if (!profession) {
    suggestions.push({
      id: 'profession',
      priority: 'high',
      title: 'Add a professional headline',
      detail: 'State your role clearly (e.g. Laboratory Quality Officer) so recruiters see your focus in the first line.',
    });
  }

  if (about.length < 80) {
    suggestions.push({
      id: 'about',
      priority: 'high',
      title: 'Expand your professional summary',
      detail: 'Write 3–5 sentences covering years of experience, core strengths, and the settings you work in (e.g. public health laboratories).',
    });
  } else if (about.length < 200) {
    suggestions.push({
      id: 'about-depth',
      priority: 'medium',
      title: 'Deepen your summary with outcomes',
      detail: 'Add one or two measurable results (accreditation support, audits led, teams trained) to show impact.',
    });
  }

  if (!user.organization) {
    suggestions.push({
      id: 'organization',
      priority: 'medium',
      title: 'List your current organization',
      detail: 'Employers expect to see where you work today and your institutional context.',
    });
  }

  if (!user.phone?.trim()) {
    suggestions.push({
      id: 'phone',
      priority: 'medium',
      title: 'Add a contact phone number',
      detail: 'Include a reachable mobile number on your CV for local recruiters and partners.',
    });
  }

  if (specialties.length === 0) {
    suggestions.push({
      id: 'specialties',
      priority: 'high',
      title: 'Add specialty areas',
      detail: 'List 3–6 skills (e.g. ISO 15189, IQC, method validation, CAPA) as keywords recruiters search for.',
    });
  } else if (specialties.length < 3) {
    suggestions.push({
      id: 'specialties-more',
      priority: 'low',
      title: 'Add more specialty keywords',
      detail: 'Aim for at least three focused skills that match the roles you are targeting.',
    });
  }

  if (!user.linkedin_url?.trim()) {
    suggestions.push({
      id: 'linkedin',
      priority: 'medium',
      title: 'Link your LinkedIn profile',
      detail: 'A LinkedIn URL helps hiring managers verify your background and endorsements.',
    });
  }

  if (!user.portfolio_url?.trim()) {
    suggestions.push({
      id: 'portfolio',
      priority: 'low',
      title: 'Add a portfolio or publications link',
      detail: 'Optional but strong: link to publications, posters, or a personal site if you have one.',
    });
  }

  if (certificates.length === 0 && active.length > 0) {
    suggestions.push({
      id: 'certificates',
      priority: 'medium',
      title: 'Include training certificates',
      detail: 'After you attend Mutale events, add issued certificates under professional development on your CV.',
    });
  } else if (certificates.length > 0 && certificates.length < 2) {
    suggestions.push({
      id: 'certificates-more',
      priority: 'low',
      title: 'Highlight continuing education',
      detail: 'Group certificates by theme (quality systems, diagnostics, leadership) with dates.',
    });
  }

  if (active.length > 0 && attended.length === 0) {
    suggestions.push({
      id: 'attendance',
      priority: 'medium',
      title: 'Complete registered events',
      detail: 'Attending events you registered for lets you list real workshops and CPD on your CV.',
    });
  }

  if (attended.length > 0) {
    const withoutTitles = attended.filter((r) => !r.event_title && !r.event?.title);
    if (withoutTitles.length === 0) {
      suggestions.push({
        id: 'events-cv',
        priority: 'low',
        title: 'Feature relevant events on your CV',
        detail: `You have ${attended.length} attended event${attended.length === 1 ? '' : 's'} — add a "Professional development" section with titles and dates.`,
      });
    }
  }

  if (/quality|laboratory|iso|diagnostic/i.test(`${profession} ${about}`)) {
    suggestions.push({
      id: 'iso-keywords',
      priority: 'low',
      title: 'Align with ISO and quality language',
      detail: 'Mention standards you work with (e.g. ISO 15189, ISO 17025) and your role in audits, IQC, or EQA where accurate.',
    });
  }

  suggestions.push({
    id: 'action-verbs',
    priority: 'low',
    title: 'Use strong action verbs',
    detail: 'Start bullet points with verbs like Led, Implemented, Coordinated, Trained, or Audited instead of "Responsible for".',
  });

  const priorityWeight = { high: 3, medium: 2, low: 1 };
  const maxDeduction = suggestions.reduce((sum, s) => sum + priorityWeight[s.priority], 0);
  const deduction = suggestions.slice(0, 8).reduce((sum, s) => sum + priorityWeight[s.priority], 0);
  const score = Math.max(35, Math.min(100, 100 - Math.round((deduction / Math.max(maxDeduction, 1)) * 45)));

  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...suggestions].sort((a, b) => order[a.priority] - order[b.priority]);

  return { suggestions: sorted, score };
}
