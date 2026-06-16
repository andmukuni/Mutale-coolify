export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import {
  parseCvSectionsFromDb,
  formatExperienceDates,
  formatEducationDates,
  experienceDescriptionLines,
} from './cvProfileSections.js';

export function formatCvDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).split('T')[0]);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-ZM', { month: 'short', year: 'numeric' });
}

/**
 * Normalized CV fields for HTML template renderers.
 * @param {object} opts
 * @param {object} opts.user
 * @param {object[]} [opts.certificates]
 * @param {object[]} [opts.developmentEvents]
 */
function userInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return String(name).slice(0, 2).toUpperCase() || 'CV';
}

function buildLanguagesBars() {
  const rows = [
    { name: 'English', level: 'Professional working proficiency', pct: 90 },
    { name: 'Bemba', level: 'Native', pct: 100 },
  ];
  return rows.map((lang) => `
    <li class="lang-row">
      <span class="lang-name">${escapeHtml(lang.name)}</span>
      <span class="lang-level">${escapeHtml(lang.level)}</span>
      <div class="lang-bar" role="presentation"><span style="width:${lang.pct}%"></span></div>
    </li>
  `).join('');
}

/**
 * @param {object} opts
 * @param {object} opts.user
 * @param {object[]} [opts.certificates]
 * @param {object[]} [opts.developmentEvents]
 * @param {string} [opts.profilePhotoUrl] - absolute URL for CV photo
 */
export function normalizeCvContent({
  user = {},
  certificates = [],
  developmentEvents = [],
  profilePhotoUrl = '',
} = {}) {
  const name = escapeHtml(user.name || 'Your name');
  const address = escapeHtml(user.address || '');
  const profession = escapeHtml(user.profession || user.occupation || '');
  const organization = escapeHtml(user.organization || '');
  const email = escapeHtml(user.email || '');
  const phone = escapeHtml(user.phone || '');
  const aboutRaw = escapeHtml(user.about || '').replace(/\n/g, '<br/>');
  const aboutHtml = aboutRaw
    || '<span class="muted">Add a summary in your profile to populate this section.</span>';
  const specialties = (Array.isArray(user.specialties) ? user.specialties : [])
    .map((s) => escapeHtml(s));

  const contactItems = [
    email && { label: 'Email', value: email },
    phone && { label: 'Phone', value: phone },
    organization && { label: 'Organization', value: organization },
    user.linkedin_url && { label: 'LinkedIn', value: escapeHtml(user.linkedin_url) },
    user.portfolio_url && { label: 'Portfolio', value: escapeHtml(user.portfolio_url) },
  ].filter(Boolean);

  const contactInline = contactItems
    .map((c) => `<span>${c.value}</span>`)
    .join('');

  const contactList = contactItems
    .map((c) => `<li><span class="contact-label">${c.label}</span> ${c.value}</li>`)
    .join('');

  const certRows = certificates.slice(0, 12).map((c) => `
    <li>
      <strong>${escapeHtml(c.event_title || 'Training')}</strong>
      ${c.issued_at ? ` · ${formatCvDate(c.issued_at)}` : ''}
      ${c.certificate_code ? `<span class="detail"> · ${escapeHtml(c.certificate_code)}</span>` : ''}
    </li>
  `).join('');

  const devRows = developmentEvents.slice(0, 10).map((r) => `
    <li>
      <strong>${escapeHtml(r.event_title || r.event?.title || 'Event')}</strong>
      ${r.registered_at ? ` · ${formatCvDate(r.registered_at)}` : ''}
      <span class="detail"> · Attended</span>
    </li>
  `).join('');

  const specialtyTags = specialties.length
    ? specialties.map((s) => `<span class="tag">${s}</span>`).join('')
    : '<span class="muted">Add specialties in your profile</span>';

  const footerDate = escapeHtml(
    new Date().toLocaleDateString('en-ZM', { day: 'numeric', month: 'long', year: 'numeric' }),
  );

  const devSectionHtml = devRows
    ? `<h2 class="section-title">Professional development</h2><ul class="cv-list">${devRows}</ul>`
    : '';

  const certSectionHtml = certRows
    ? `<h2 class="section-title">Certificates &amp; credentials</h2><ul class="cv-list">${certRows}</ul>`
    : '';

  const photoSrc = String(profilePhotoUrl || user.profile_photo || '').trim();
  const profilePhotoHtml = photoSrc
    ? `<img src="${escapeHtml(photoSrc)}" alt="" class="cv-photo" />`
    : `<div class="cv-photo-placeholder">${escapeHtml(userInitials(user.name))}</div>`;

  const skillsSidebarHtml = specialties.length
    ? `<ul class="sidebar-bullets">${specialties.map((s) => `<li>${s}</li>`).join('')}</ul>`
    : '<p class="sidebar-muted">Add specialties in your profile</p>';

  const cvSections = parseCvSectionsFromDb(user.cv_sections);
  const eduSidebarItems = cvSections.education.map((e) => {
    const label = escapeHtml([e.degree, e.field].filter(Boolean).join(', ') || 'Qualification');
    const inst = e.institution ? ` — ${escapeHtml(e.institution)}` : '';
    const dates = formatEducationDates(e) ? ` · ${escapeHtml(formatEducationDates(e))}` : '';
    return `<li>${label}${inst}${dates}</li>`;
  });
  const certSidebarItems = certificates.slice(0, 8).map((c) => `
      <li>${escapeHtml(c.event_title || 'Certificate')}${c.issued_at ? ` · ${formatCvDate(c.issued_at)}` : ''}</li>
    `);
  const diplomaItems = [...eduSidebarItems, ...certSidebarItems];
  const diplomasSidebarHtml = diplomaItems.length
    ? `<ul class="sidebar-bullets">${diplomaItems.join('')}</ul>`
    : '<p class="sidebar-muted">Add education or earn certificates</p>';

  const contactIconRows = [
    address && { icon: 'loc', label: address },
    phone && { icon: 'tel', label: phone },
    email && { icon: 'mail', label: email },
    user.portfolio_url && { icon: 'web', label: escapeHtml(user.portfolio_url) },
    user.linkedin_url && { icon: 'in', label: escapeHtml(user.linkedin_url) },
  ].filter(Boolean);

  const contactIconsHtml = contactIconRows.length
    ? contactIconRows.map((row) => `
      <li class="contact-row contact-${row.icon}">
        <span class="contact-icon" aria-hidden="true"></span>
        <span class="contact-text">${row.label}</span>
      </li>
    `).join('')
    : '<li class="contact-row"><span class="contact-text sidebar-muted">Add contact details in your profile</span></li>';

  const contactLabeledHtml = [
    address && `<p><span class="lbl">Address:</span> ${address}</p>`,
    phone && `<p><span class="lbl">Phone:</span> ${phone}</p>`,
    email && `<p><span class="lbl">E-mail:</span> ${email}</p>`,
    user.linkedin_url && `<p><span class="lbl">LinkedIn:</span> ${escapeHtml(user.linkedin_url)}</p>`,
    user.portfolio_url && `<p><span class="lbl">Website:</span> ${escapeHtml(user.portfolio_url)}</p>`,
  ].filter(Boolean).join('');

  const timelineWorkHtml = cvSections.experience.map((row) => {
    const title = escapeHtml(row.title || 'Role');
    const company = escapeHtml(row.company || '');
    const dateLabel = escapeHtml(formatExperienceDates(row));
    const loc = row.location ? escapeHtml(row.location) : '';
    const bullets = experienceDescriptionLines(row.description);
    const bulletHtml = bullets.length
      ? bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')
      : '<li>Key responsibilities and outcomes in this role</li>';
    return `
      <article class="timeline-item">
        <div class="timeline-marker" aria-hidden="true"></div>
        <div class="timeline-body">
          <div class="timeline-head">
            <h3 class="timeline-title">${title}${company ? ` · ${company}` : ''}</h3>
            ${dateLabel ? `<span class="timeline-date">${dateLabel}</span>` : ''}
          </div>
          ${loc ? `<p class="timeline-sub">${loc}</p>` : ''}
          <ul class="timeline-bullets">${bulletHtml}</ul>
        </div>
      </article>
    `;
  }).join('');

  const timelineWorkBlock = timelineWorkHtml
    ? `<section class="timeline-section"><h2 class="main-section-title">Work experience</h2><div class="timeline">${timelineWorkHtml}</div></section>`
    : '';

  const timelineEduHtml = cvSections.education.map((row) => {
    const degree = escapeHtml([row.degree, row.field].filter(Boolean).join(' — ') || 'Qualification');
    const inst = escapeHtml(row.institution || '');
    const dateLabel = escapeHtml(formatEducationDates(row));
    return `
      <article class="timeline-item">
        <div class="timeline-marker cert" aria-hidden="true"></div>
        <div class="timeline-body">
          <div class="timeline-head">
            <h3 class="timeline-title">${degree}</h3>
            ${dateLabel ? `<span class="timeline-date">${dateLabel}</span>` : ''}
          </div>
          ${inst ? `<p class="timeline-sub">${inst}</p>` : ''}
          ${row.description ? `<ul class="timeline-bullets"><li>${escapeHtml(row.description)}</li></ul>` : ''}
        </div>
      </article>
    `;
  }).join('');

  const timelineEduBlock = timelineEduHtml
    ? `<section class="timeline-section"><h2 class="main-section-title">Education</h2><div class="timeline">${timelineEduHtml}</div></section>`
    : '';

  const timelineDevHtml = developmentEvents.slice(0, 8).map((r) => {
    const title = escapeHtml(r.event_title || r.event?.title || 'Professional development');
    const date = r.attended_at || r.registered_at;
    const dateLabel = date ? formatCvDate(date) : '';
    const org = r.event?.location || organization;
    return `
      <article class="timeline-item">
        <div class="timeline-marker" aria-hidden="true"></div>
        <div class="timeline-body">
          <div class="timeline-head">
            <h3 class="timeline-title">${title}</h3>
            ${dateLabel ? `<span class="timeline-date">${dateLabel}</span>` : ''}
          </div>
          ${org ? `<p class="timeline-sub">${escapeHtml(org)}</p>` : ''}
          <ul class="timeline-bullets">
            <li>Attended — professional development programme</li>
            <li>Skills applied to laboratory quality and team capacity building</li>
          </ul>
        </div>
      </article>
    `;
  }).join('');

  const devSectionTitle = timelineWorkHtml ? 'Training &amp; events' : 'Professional development';
  const timelineDevBlock = timelineDevHtml
    ? `<section class="timeline-section"><h2 class="main-section-title">${devSectionTitle}</h2><div class="timeline">${timelineDevHtml}</div></section>`
    : '';

  const timelineCertHtml = certificates.slice(0, 6).map((c) => {
    const title = escapeHtml(c.event_title || 'Certificate');
    const dateLabel = c.issued_at ? formatCvDate(c.issued_at) : '';
    const code = c.certificate_code ? escapeHtml(c.certificate_code) : '';
    return `
      <article class="timeline-item">
        <div class="timeline-marker cert" aria-hidden="true"></div>
        <div class="timeline-body">
          <div class="timeline-head">
            <h3 class="timeline-title">${title}</h3>
            ${dateLabel ? `<span class="timeline-date">${dateLabel}</span>` : ''}
          </div>
          ${code ? `<p class="timeline-sub">Credential ID: ${code}</p>` : ''}
          <ul class="timeline-bullets"><li>Issued via Mutale Mubanga training platform</li></ul>
        </div>
      </article>
    `;
  }).join('');

  const timelineCertBlock = timelineCertHtml
    ? `<section class="timeline-section"><h2 class="main-section-title">Certificates &amp; credentials</h2><div class="timeline">${timelineCertHtml}</div></section>`
    : '';

  const profileExpHtml = cvSections.experience.map((row) => {
    const dateLabel = escapeHtml(formatExperienceDates(row));
    const title = escapeHtml(row.title || 'Role');
    const company = escapeHtml(row.company || '');
    const loc = row.location ? escapeHtml(row.location) : '';
    const bullets = experienceDescriptionLines(row.description);
    const bulletHtml = bullets.length
      ? bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')
      : '<li>Delivered quality and training outcomes in this role</li>';
    return `
      <div class="exp-entry">
        ${dateLabel ? `<p class="exp-date">${dateLabel}</p>` : ''}
        <p class="exp-title"><strong>${title}</strong>${company ? ` — ${company}` : ''}</p>
        ${loc ? `<p class="exp-sub">${loc}</p>` : ''}
        <ul class="exp-bullets">${bulletHtml}</ul>
      </div>
    `;
  }).join('');

  const eventExpHtml = developmentEvents.slice(0, 6).map((r) => {
    const title = escapeHtml(r.event_title || r.event?.title || 'Training programme');
    const date = r.attended_at || r.registered_at;
    const dateLabel = date ? formatCvDate(date) : '';
    const loc = r.event?.location ? escapeHtml(r.event.location) : (organization || 'Mutale Mubanga');
    return `
      <div class="exp-entry">
        ${dateLabel ? `<p class="exp-date">${dateLabel}</p>` : ''}
        <p class="exp-title"><strong>${title}</strong> — ${loc}</p>
        <ul class="exp-bullets">
          <li>Participated in structured professional development</li>
          <li>Applied learning to quality systems and laboratory practice</li>
        </ul>
      </div>
    `;
  }).join('');

  const expParts = [];
  if (profileExpHtml) expParts.push(profileExpHtml);
  if (eventExpHtml) {
    expParts.push(
      profileExpHtml
        ? `<h3 class="main-h3">Training &amp; events</h3>${eventExpHtml}`
        : eventExpHtml,
    );
  }
  const expBlock = expParts.length
    ? `<section class="main-block"><h2 class="main-h2">${profileExpHtml ? 'Work experience' : 'Professional development'}</h2>${expParts.join('')}</section>`
    : '';

  const certExpHtml = certificates.slice(0, 4).map((c) => {
    const title = escapeHtml(c.event_title || 'Certificate');
    const dateLabel = c.issued_at ? formatCvDate(c.issued_at) : '';
    return `
      <div class="exp-entry">
        ${dateLabel ? `<p class="exp-date">${dateLabel}</p>` : ''}
        <p class="exp-title"><strong>${title}</strong></p>
        <ul class="exp-bullets"><li>Credential verified on Mutale Mubanga</li></ul>
      </div>
    `;
  }).join('');

  return {
    name,
    profession,
    aboutHtml,
    specialtyTags,
    contactInline,
    contactList,
    devSectionHtml,
    certSectionHtml,
    footerDate,
    hasProfession: Boolean(profession),
    hasContact: contactItems.length > 0,
    address,
    profilePhotoHtml,
    skillsSidebarHtml,
    diplomasSidebarHtml,
    languagesSidebarHtml: buildLanguagesBars(),
    contactIconsHtml,
    contactLabeledHtml,
    timelineWorkBlock,
    timelineEduBlock,
    timelineDevBlock,
    timelineCertBlock,
    expBlock,
    certExpHtml,
    referencesBlock: cvSections.references.length
      ? `<section class="references-block"><h2 class="main-section-title">References</h2><ul class="ref-list">${cvSections.references.map((ref) => `
        <li><strong>${escapeHtml(ref.name)}</strong> — ${escapeHtml([ref.title, ref.organization].filter(Boolean).join(', '))}
        ${ref.email ? `<span class="detail"> · ${escapeHtml(ref.email)}</span>` : ''}</li>
      `).join('')}</ul></section>`
      : '',
    hasTimelineDev: Boolean(timelineDevHtml),
    hasTimelineCert: Boolean(timelineCertHtml),
  };
}
