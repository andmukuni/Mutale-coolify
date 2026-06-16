import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';

function formatCvDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).split('T')[0]);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-ZM', { month: 'short', year: 'numeric' });
}

function sectionHeading(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
  });
}

function bulletLine(parts) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: parts,
  });
}

/**
 * @param {object} opts
 * @param {object} opts.user
 * @param {object[]} [opts.certificates]
 * @param {object[]} [opts.developmentEvents]
 * @returns {Promise<Blob>}
 */
export async function buildCvDocxBlob({
  user = {},
  certificates = [],
  developmentEvents = [],
} = {}) {
  const name = String(user.name || 'Your name');
  const profession = String(user.profession || user.occupation || '');
  const about = String(user.about || '').trim()
    || 'Add a summary in your profile to populate this section.';
  const specialties = Array.isArray(user.specialties) ? user.specialties : [];

  const contactParts = [
    user.email,
    user.phone,
    user.organization,
    user.linkedin_url,
    user.portfolio_url,
  ].filter(Boolean);

  const children = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: name, bold: true, size: 48, color: '141D45' }),
      ],
    }),
  ];

  if (profession) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: profession, size: 24, color: '00A79D', bold: true }),
        ],
      }),
    );
  }

  if (contactParts.length) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: contactParts.map((part, i) => {
          const runs = [new TextRun({ text: String(part), size: 20, color: '475569' })];
          if (i < contactParts.length - 1) {
            runs.push(new TextRun({ text: '  ·  ', size: 20, color: '94A3B8' }));
          }
          return runs;
        }).flat(),
      }),
    );
  }

  children.push(sectionHeading('Professional summary'));
  children.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: about, size: 22 })],
    }),
  );

  children.push(sectionHeading('Core competencies'));
  if (specialties.length) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: specialties.join(' · '),
            size: 22,
          }),
        ],
      }),
    );
  } else {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: 'Add specialties in your profile', italics: true, color: '94A3B8' })],
      }),
    );
  }

  const devSlice = developmentEvents.slice(0, 10);
  if (devSlice.length) {
    children.push(sectionHeading('Professional development'));
    for (const r of devSlice) {
      const title = String(r.event_title || r.event?.title || 'Event');
      const date = r.registered_at ? formatCvDate(r.registered_at) : '';
      const detail = [date, 'Attended'].filter(Boolean).join(' · ');
      children.push(
        bulletLine([
          new TextRun({ text: title, bold: true }),
          ...(detail ? [new TextRun({ text: ` · ${detail}`, color: '64748B' })] : []),
        ]),
      );
    }
  }

  const certSlice = certificates.slice(0, 12);
  if (certSlice.length) {
    children.push(sectionHeading('Certificates & credentials'));
    for (const c of certSlice) {
      const title = String(c.event_title || 'Training');
      const parts = [
        c.issued_at ? formatCvDate(c.issued_at) : '',
        c.certificate_code ? String(c.certificate_code) : '',
      ].filter(Boolean);
      const detail = parts.length ? ` · ${parts.join(' · ')}` : '';
      children.push(
        bulletLine([
          new TextRun({ text: title, bold: true }),
          ...(detail ? [new TextRun({ text: detail, color: '64748B' })] : []),
        ]),
      );
    }
  }

  const footerDate = new Date().toLocaleDateString('en-ZM', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: `Generated via Mutale Mubanga · ${footerDate}`,
          size: 18,
          color: '94A3B8',
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBlob(doc);
}

/**
 * @param {object} opts
 * @param {string} [opts.filename]
 */
export async function buildCvDocxBlobWithFilename(opts = {}) {
  const user = opts.user || {};
  const safeName = String(user.name || 'CV')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'CV';
  const blob = await buildCvDocxBlob(opts);
  return { blob, filename: opts.filename || `${safeName}-CV.docx` };
}
