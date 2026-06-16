import { describe, it, expect } from 'vitest';
import { renderCvDocumentHtml } from './cvDocumentHtml.js';
import { CV_TEMPLATES } from './cvTemplates.js';

const sampleOpts = {
  user: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    profession: 'Quality Specialist',
    about: 'Experienced in laboratory systems.',
    specialties: ['ISO 15189', 'CAPA'],
  },
  certificates: [{ event_title: 'Workshop', issued_at: '2026-01-01', certificate_code: 'C-1' }],
  developmentEvents: [{ event_title: 'Training', registered_at: '2025-06-01', status: 'attended' }],
};

describe('renderCvDocumentHtml templates', () => {
  it('renders classic template by default', () => {
    const html = renderCvDocumentHtml(sampleOpts);
    expect(html).toContain('Jane Doe');
    expect(html).toContain('#00a79d');
  });

  it('includes A4 print styles for PDF export', () => {
    const html = renderCvDocumentHtml(sampleOpts);
    expect(html).toContain('@page');
    expect(html).toContain('size: A4');
  });

  for (const tpl of CV_TEMPLATES) {
    it(`renders ${tpl.id} template with user content`, () => {
      const html = renderCvDocumentHtml({ ...sampleOpts, templateId: tpl.id });
      expect(html).toContain('Jane Doe');
      expect(html).toContain('Quality Specialist');
      expect(html).toContain('ISO 15189');
      expect(html.length).toBeGreaterThan(500);
    });
  }

  it('falls back to classic for unknown template id', () => {
    const html = renderCvDocumentHtml({ ...sampleOpts, templateId: 'unknown' });
    expect(html).toContain('#00a79d');
  });

  it('renders blue sidebar with timeline layout', () => {
    const html = renderCvDocumentHtml({ ...sampleOpts, templateId: 'sidebarBlue' });
    expect(html).toContain('#1a365d');
    expect(html).toContain('Professional profile');
    expect(html).toContain('timeline');
  });

  it('renders dark sidebar with accent blocks', () => {
    const html = renderCvDocumentHtml({ ...sampleOpts, templateId: 'sidebarDark' });
    expect(html).toContain('#3d4450');
    expect(html).toContain('#e8a317');
    expect(html).toContain('Professional summary');
  });
});
