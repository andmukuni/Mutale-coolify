import { resolveCvTemplateId } from './cvTemplates.js';

function wrapDocument(title, styles, body) {
  const printBase = `
    @page { size: A4; margin: 12mm; }
    @media print {
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>CV — ${title}</title>
  <style>${printBase}${styles}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function renderClassic(c) {
  const styles = `
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #141d45; margin: 0; padding: 32px 40px; font-size: 13px; line-height: 1.5; }
    h1 { margin: 0 0 4px; font-size: 26px; color: #141d45; }
    .headline { color: #00a79d; font-size: 15px; font-weight: 600; margin-bottom: 12px; }
    .contact { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12px; color: #475569; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #00a79d; }
    .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #00a79d; margin: 20px 0 8px; border-bottom: 1px solid #d4eeec; padding-bottom: 4px; }
    p { margin: 0 0 10px; }
    .cv-list { margin: 0; padding-left: 18px; }
    .cv-list li { margin-bottom: 6px; }
    .detail { color: #64748b; font-weight: 400; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { background: #e8f6f5; color: #141d45; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 500; }
    .muted { color: #94a3b8; font-size: 12px; }
    .footer { margin-top: 28px; font-size: 10px; color: #94a3b8; text-align: center; }
    @media print { body { padding: 24px; } }
  `;
  const body = `
  <h1>${c.name}</h1>
  ${c.hasProfession ? `<p class="headline">${c.profession}</p>` : ''}
  ${c.hasContact ? `<div class="contact">${c.contactInline}</div>` : ''}
  <h2 class="section-title">Professional summary</h2>
  <p>${c.aboutHtml}</p>
  <h2 class="section-title">Core competencies</h2>
  <div class="tags">${c.specialtyTags}</div>
  ${c.devSectionHtml}
  ${c.certSectionHtml}
  <p class="footer">Generated via Mutale Mubanga · ${c.footerDate}</p>`;
  return wrapDocument(c.name, styles, body);
}

function renderModern(c) {
  const styles = `
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; font-size: 12px; line-height: 1.55; color: #0f172a; background: #fff; }
    .layout { display: flex; min-height: 100vh; }
    .sidebar { width: 32%; background: linear-gradient(180deg, #0e7490 0%, #155e75 100%); color: #fff; padding: 28px 22px; }
    .sidebar h1 { margin: 0 0 6px; font-size: 22px; line-height: 1.2; }
    .sidebar .role { font-size: 13px; opacity: 0.92; margin-bottom: 22px; font-weight: 500; }
    .sidebar h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; margin: 18px 0 8px; opacity: 0.75; }
    .sidebar ul { list-style: none; margin: 0; padding: 0; font-size: 11px; }
    .sidebar li { margin-bottom: 8px; word-break: break-word; }
    .contact-label { display: block; font-size: 9px; text-transform: uppercase; opacity: 0.65; margin-bottom: 2px; }
    .tags { display: flex; flex-wrap: wrap; gap: 5px; }
    .tag { background: rgba(255,255,255,0.18); padding: 4px 8px; border-radius: 4px; font-size: 10px; }
    .main { flex: 1; padding: 28px 32px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #0e7490; margin: 0 0 10px; font-weight: 700; }
    .block { margin-bottom: 22px; }
    .cv-list { margin: 0; padding-left: 16px; }
    .cv-list li { margin-bottom: 7px; }
    .detail { color: #64748b; }
    .muted { color: #94a3b8; }
    .footer { margin-top: 24px; font-size: 9px; color: #94a3b8; }
    @media print { .layout { min-height: auto; } }
  `;
  const body = `
  <div class="layout">
    <aside class="sidebar">
      <h1>${c.name}</h1>
      ${c.hasProfession ? `<p class="role">${c.profession}</p>` : ''}
      ${c.hasContact ? `<h3>Contact</h3><ul>${c.contactList}</ul>` : ''}
      <h3>Competencies</h3>
      <div class="tags">${c.specialtyTags}</div>
    </aside>
    <main class="main">
      <div class="block">
        <h2 class="section-title">Professional summary</h2>
        <p>${c.aboutHtml}</p>
      </div>
      ${c.devSectionHtml ? `<div class="block">${c.devSectionHtml.replace(/section-title/g, 'section-title')}</div>` : ''}
      ${c.certSectionHtml ? `<div class="block">${c.certSectionHtml}</div>` : ''}
      <p class="footer">Mutale Mubanga · ${c.footerDate}</p>
    </main>
  </div>`;
  return wrapDocument(c.name, styles, body);
}

function renderMinimal(c) {
  const styles = `
    * { box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #292524; margin: 0; padding: 40px 48px; font-size: 13px; line-height: 1.65; background: #fafaf9; }
    .rule { border: none; border-top: 1px solid #292524; margin: 14px 0 22px; }
    h1 { margin: 0; font-size: 28px; font-weight: 400; letter-spacing: 0.02em; }
    .headline { font-style: italic; color: #57534e; margin: 6px 0 0; font-size: 14px; }
    .contact { font-size: 11px; color: #78716c; margin-top: 10px; letter-spacing: 0.02em; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; margin: 24px 0 10px; font-weight: 600; }
    .cv-list { margin: 0; padding-left: 18px; }
    .cv-list li { margin-bottom: 5px; }
    .detail { color: #a8a29e; }
    .tags .tag { display: inline; }
    .tags .tag::after { content: ' · '; color: #d6d3d1; }
    .tags .tag:last-child::after { content: ''; }
    .tag { font-size: 12px; }
    .muted { color: #a8a29e; font-style: italic; }
    .footer { margin-top: 32px; font-size: 10px; color: #a8a29e; text-align: center; font-family: system-ui, sans-serif; }
    @media print { body { background: #fff; padding: 32px; } }
  `;
  const body = `
  <h1>${c.name}</h1>
  ${c.hasProfession ? `<p class="headline">${c.profession}</p>` : ''}
  ${c.hasContact ? `<p class="contact">${c.contactInline}</p>` : ''}
  <hr class="rule"/>
  <h2 class="section-title">Summary</h2>
  <p>${c.aboutHtml}</p>
  <h2 class="section-title">Competencies</h2>
  <div class="tags">${c.specialtyTags}</div>
  ${c.devSectionHtml.replace(/Professional development/g, 'Development')}
  ${c.certSectionHtml.replace(/Certificates &amp; credentials/g, 'Credentials')}
  <p class="footer">Mutale Mubanga · ${c.footerDate}</p>`;
  return wrapDocument(c.name, styles, body);
}

function renderExecutive(c) {
  const styles = `
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; font-size: 12px; line-height: 1.55; color: #1e293b; }
    .banner { background: #141d45; color: #fff; padding: 28px 40px 24px; }
    .banner h1 { margin: 0 0 6px; font-size: 28px; font-weight: 600; }
    .banner .headline { color: #c9a227; font-size: 14px; font-weight: 600; margin: 0; }
    .banner .contact { margin-top: 12px; font-size: 11px; opacity: 0.88; display: flex; flex-wrap: wrap; gap: 6px 14px; }
    .content { padding: 24px 40px 32px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #141d45; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #c9a227; display: inline-block; font-weight: 700; }
    .cv-list { margin: 8px 0 0; padding-left: 18px; }
    .cv-list li { margin-bottom: 6px; }
    .detail { color: #64748b; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .tag { border: 1px solid #e2e8f0; padding: 4px 10px; border-radius: 4px; font-size: 11px; background: #f8fafc; }
    .muted { color: #94a3b8; }
    .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 20px; }
    @media print { .banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;
  const body = `
  <header class="banner">
    <h1>${c.name}</h1>
    ${c.hasProfession ? `<p class="headline">${c.profession}</p>` : ''}
    ${c.hasContact ? `<div class="contact">${c.contactInline}</div>` : ''}
  </header>
  <div class="content">
    <h2 class="section-title">Professional summary</h2>
    <p>${c.aboutHtml}</p>
    <h2 class="section-title">Core competencies</h2>
    <div class="tags">${c.specialtyTags}</div>
    ${c.devSectionHtml}
    ${c.certSectionHtml}
    <p class="footer">Mutale Mubanga · ${c.footerDate}</p>
  </div>`;
  return wrapDocument(c.name, styles, body);
}

function renderCreative(c) {
  const styles = `
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 28px 32px; font-size: 12px; line-height: 1.55; color: #1e1b4b; background: #faf5ff; }
    .hero { background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%); color: #fff; border-radius: 16px; padding: 24px 28px; margin-bottom: 20px; }
    .hero h1 { margin: 0 0 4px; font-size: 26px; }
    .hero .headline { margin: 0; font-size: 14px; opacity: 0.95; }
    .hero .contact { margin-top: 12px; font-size: 11px; opacity: 0.9; display: flex; flex-wrap: wrap; gap: 6px 12px; }
    .card { background: #fff; border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(30,27,75,0.08); }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #7c3aed; margin: 0 0 8px; font-weight: 700; }
    .cv-list { margin: 0; padding-left: 16px; }
    .cv-list li { margin-bottom: 6px; }
    .detail { color: #64748b; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 600; }
    .muted { color: #94a3b8; }
    .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 8px; }
    @media print { body { background: #fff; } .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;
  const body = `
  <div class="hero">
    <h1>${c.name}</h1>
    ${c.hasProfession ? `<p class="headline">${c.profession}</p>` : ''}
    ${c.hasContact ? `<div class="contact">${c.contactInline}</div>` : ''}
  </div>
  <div class="card">
    <h2 class="section-title">Professional summary</h2>
    <p>${c.aboutHtml}</p>
  </div>
  <div class="card">
    <h2 class="section-title">Core competencies</h2>
    <div class="tags">${c.specialtyTags}</div>
  </div>
  ${c.devSectionHtml ? `<div class="card">${c.devSectionHtml}</div>` : ''}
  ${c.certSectionHtml ? `<div class="card">${c.certSectionHtml}</div>` : ''}
  <p class="footer">Mutale Mubanga · ${c.footerDate}</p>`;
  return wrapDocument(c.name, styles, body);
}

/** Blue sidebar + timeline (reference: professional two-column CV) */
function renderSidebarBlue(c) {
  const styles = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11.5px; line-height: 1.5; color: #1e293b; }
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: 32%; max-width: 240px; min-width: 200px;
      background: #1a365d; color: #fff; padding: 22px 18px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .cv-photo { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; border: 3px solid rgba(255,255,255,0.35); margin-bottom: 18px; }
    .cv-photo-placeholder {
      width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.12); border: 3px solid rgba(255,255,255,0.35);
      font-size: 28px; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 18px;
    }
    .side-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
      margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.35); }
    .sidebar-bullets { margin: 0; padding-left: 16px; font-size: 10.5px; }
    .sidebar-bullets li { margin-bottom: 6px; }
    .sidebar-muted { font-size: 10px; opacity: 0.75; margin: 0; }
    .contact-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; list-style: none; font-size: 10px; }
    .contact-icon { width: 14px; height: 14px; flex-shrink: 0; margin-top: 2px; border-radius: 2px; background: rgba(255,255,255,0.25); }
    .contact-loc .contact-icon { border-radius: 50%; }
    .lang-row { list-style: none; margin-bottom: 10px; font-size: 10px; }
    .lang-name { font-weight: 600; display: block; }
    .lang-level { opacity: 0.8; font-size: 9px; }
    .lang-bar { height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin-top: 4px; overflow: hidden; }
    .lang-bar span { display: block; height: 100%; background: #fff; border-radius: 2px; }
    .main { flex: 1; padding: 28px 32px 32px 36px; position: relative; }
    .main-name { font-size: 26px; font-weight: 700; color: #1a365d; margin: 0 0 6px; line-height: 1.15; }
    .main-headline { font-size: 13px; color: #475569; margin: 0 0 20px; font-weight: 600; }
    .main-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
      color: #1a365d; margin: 0 0 12px; }
    .summary-text { margin: 0 0 24px; text-align: justify; }
    .timeline { position: relative; padding-left: 28px; border-left: 2px solid #cbd5e1; margin-left: 8px; }
    .timeline-item { position: relative; margin-bottom: 20px; }
    .timeline-marker {
      position: absolute; left: -37px; top: 4px; width: 12px; height: 12px;
      background: #1a365d; border: 2px solid #fff; box-shadow: 0 0 0 2px #1a365d;
    }
    .timeline-marker.cert { background: #3182ce; box-shadow: 0 0 0 2px #3182ce; }
    .timeline-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; align-items: baseline; }
    .timeline-title { margin: 0; font-size: 12px; font-weight: 700; color: #0f172a; }
    .timeline-date { font-size: 10px; color: #64748b; font-weight: 600; }
    .timeline-sub { margin: 4px 0 6px; font-size: 10.5px; color: #475569; font-style: italic; }
    .timeline-bullets { margin: 0; padding-left: 16px; color: #334155; }
    .timeline-bullets li { margin-bottom: 4px; }
    .timeline-section { margin-bottom: 8px; }
    .ref-list { margin: 0; padding-left: 16px; font-size: 11px; }
    .ref-list li { margin-bottom: 6px; }
    .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; text-align: right; }
    @media print { .layout { min-height: auto; } }
  `;
  const body = `
  <div class="layout">
    <aside class="sidebar">
      ${c.profilePhotoHtml}
      ${c.hasContact ? `<h3 class="side-title">Contact</h3><ul class="contact-icons">${c.contactIconsHtml}</ul>` : ''}
      <h3 class="side-title">Skills</h3>
      ${c.skillsSidebarHtml}
      <h3 class="side-title">Languages</h3>
      <ul>${c.languagesSidebarHtml}</ul>
      <h3 class="side-title">Diplomas</h3>
      ${c.diplomasSidebarHtml}
    </aside>
    <main class="main">
      <h1 class="main-name">${c.name}</h1>
      ${c.hasProfession ? `<p class="main-headline">${c.profession}</p>` : ''}
      <section>
        <h2 class="main-section-title">Professional profile</h2>
        <p class="summary-text">${c.aboutHtml}</p>
      </section>
      ${c.timelineWorkBlock}
      ${c.timelineEduBlock}
      ${c.timelineDevBlock}
      ${c.timelineCertBlock}
      ${c.referencesBlock || ''}
      <p class="footer">Mutale Mubanga · ${c.footerDate}</p>
    </main>
  </div>`;
  return wrapDocument(c.name, styles, body);
}

/** Dark sidebar + orange accents (reference: executive contact layout) */
function renderSidebarDark(c) {
  const styles = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.55; color: #111; }
    .layout { display: flex; min-height: 100vh; position: relative; }
    .accent { position: absolute; width: 18px; height: 18px; background: #e8a317; z-index: 2;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .accent-tl { top: 0; left: 0; }
    .accent-br { bottom: 0; left: calc(30% - 9px); }
    .accent-tr { top: 0; right: 0; }
    .sidebar {
      width: 30%; max-width: 220px; min-width: 190px;
      background: #3d4450; color: #f1f5f9; padding: 28px 20px 24px;
      position: relative; z-index: 1;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .cv-photo { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; margin-bottom: 14px; border: 4px solid #fff; }
    .cv-photo-placeholder {
      width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
      background: #525863; border: 4px solid #fff; font-size: 26px; font-weight: 700; margin-bottom: 14px;
    }
    .side-name { font-size: 20px; font-weight: 400; margin: 0 0 6px; line-height: 1.25; color: #fff; }
    .side-role { font-size: 11px; margin: 0 0 18px; opacity: 0.88; line-height: 1.35; }
    .side-h2 { font-size: 12px; font-weight: 700; margin: 0 0 6px; color: #fff; }
    .side-rule { border: none; border-top: 1px solid rgba(255,255,255,0.45); margin: 0 0 10px; }
    .contact-block p { margin: 0 0 8px; font-size: 10px; line-height: 1.45; word-break: break-word; }
    .contact-block .lbl { font-weight: 700; color: #fff; }
    .sidebar-bullets { margin: 0; padding-left: 16px; font-size: 10px; }
    .sidebar-bullets li { margin-bottom: 5px; }
    .sidebar-muted { font-size: 10px; opacity: 0.7; }
    .main { flex: 1; padding: 32px 36px 28px 40px; background: #fff; position: relative; }
    .main-h2 { font-size: 13px; font-weight: 700; margin: 0 0 4px; color: #000; }
    .main-rule { border: none; border-top: 1px solid #222; margin: 0 0 14px; }
    .main-block { margin-bottom: 22px; }
    .main-block p { margin: 0 0 12px; text-align: justify; }
    .exp-entry { margin-bottom: 16px; }
    .exp-date { text-align: right; font-size: 10px; font-weight: 600; margin: 0 0 4px; color: #333; }
    .exp-title { margin: 0 0 6px; font-size: 11px; }
    .exp-bullets { margin: 0; padding-left: 16px; }
    .exp-bullets li { margin-bottom: 3px; }
    .exp-sub { margin: 0 0 6px; font-size: 10px; color: #555; font-style: italic; }
    .main-h3 { font-size: 11px; font-weight: 700; margin: 14px 0 8px; color: #333; }
    .footer { margin-top: 16px; font-size: 9px; color: #888; }
    @media print { .layout { min-height: auto; } }
  `;
  const body = `
  <div class="layout">
    <span class="accent accent-tl" aria-hidden="true"></span>
    <span class="accent accent-br" aria-hidden="true"></span>
    <span class="accent accent-tr" aria-hidden="true"></span>
    <aside class="sidebar">
      ${c.profilePhotoHtml}
      <h2 class="side-name">${c.name}</h2>
      ${c.hasProfession ? `<p class="side-role">${c.profession}</p>` : ''}
      <h3 class="side-h2">Contact</h3>
      <hr class="side-rule" />
      <div class="contact-block">${c.contactLabeledHtml || '<p class="sidebar-muted">Add contact in profile</p>'}</div>
      <h3 class="side-h2">Additional skills</h3>
      <hr class="side-rule" />
      ${c.skillsSidebarHtml}
    </aside>
    <main class="main">
      <section class="main-block">
        <h2 class="main-h2">Professional summary</h2>
        <hr class="main-rule" />
        <p>${c.aboutHtml}</p>
      </section>
      ${c.expBlock}
      ${c.certExpHtml ? `<section class="main-block"><h2 class="main-h2">Certificates</h2><hr class="main-rule" />${c.certExpHtml}</section>` : ''}
      ${c.hasProfession ? `<section class="main-block"><h2 class="main-h2">Current role</h2><hr class="main-rule" /><p><strong>${c.profession}</strong>${c.address ? ` · ${c.address}` : ''}</p></section>` : ''}
      <p class="footer">Generated via Mutale Mubanga · ${c.footerDate}</p>
    </main>
  </div>`;
  return wrapDocument(c.name, styles, body);
}

const RENDERERS = {
  classic: renderClassic,
  modern: renderModern,
  minimal: renderMinimal,
  executive: renderExecutive,
  creative: renderCreative,
  sidebarBlue: renderSidebarBlue,
  sidebarDark: renderSidebarDark,
};

/**
 * @param {import('./cvContent.js').normalizeCvContent extends Function ? ReturnType<import('./cvContent.js').normalizeCvContent> : object} content
 * @param {string} [templateId]
 */
export function renderCvHtmlFromContent(content, templateId) {
  const id = resolveCvTemplateId(templateId);
  const render = RENDERERS[id] || RENDERERS.classic;
  return render(content);
}
