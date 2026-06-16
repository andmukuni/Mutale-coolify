import { describe, it, expect } from 'vitest';
import {
  buildDefaultCertificateDesign,
  buildSamplePreviewData,
  parseDesignJson,
  resolvePlaceholders,
  validateDesignForPublish,
  getCanvasDimensions,
  createDesignElement,
  estimateTextElementBox,
  estimateWrappedLineCount,
  tightenOversizedTextElements,
  resolveCertificateFont,
  CERTIFICATE_FONTS,
  upgradeCertificateDesign,
  CERTIFICATE_BUNDLED_LOGO_SRC,
  buildDesignFromPreset,
  CERTIFICATE_PRESET_ACHIEVEMENT,
  inferCertificatePresetId,
  CERTIFICATE_PRESETS,
} from './certificateDesign.js';

describe('certificateDesign', () => {
  it('builds default design with background theme', () => {
    const design = buildDefaultCertificateDesign({ title: 'Leadership Summit' });
    expect(design.background?.theme).toBeTruthy();
    expect(design.elements.length).toBeGreaterThan(10);
    const keys = design.elements
      .filter((el) => el.type === 'placeholder')
      .map((el) => el.key);
    expect(keys).toContain('attendee_name');
    expect(keys).toContain('event_name');
    expect(keys).toContain('certificate_number');
    expect(design.elements.some((el) => el.id === 'el_logo' && el.type === 'image')).toBe(true);
    expect(design.elements.some((el) => el.id === 'el_qr')).toBe(true);
  });

  it('validates publish requirements', () => {
    const design = buildDefaultCertificateDesign({ title: 'Test Event' });
    const result = validateDesignForPublish(design, { title: 'Certificate' });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects blank design', () => {
    const result = validateDesignForPublish({ elements: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects design missing attendee placeholder', () => {
    const design = {
      version: 1,
      elements: [
        createDesignElement('placeholder', { key: 'event_name' }),
      ],
    };
    const result = validateDesignForPublish(design, { title: 'Cert' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('attendee'))).toBe(true);
  });

  it('resolves placeholders in content', () => {
    const text = resolvePlaceholders('Hello {{attendee_name}} at {{event_name}}', {
      attendee_name: 'Jane',
      event_name: 'Summit',
    });
    expect(text).toBe('Hello Jane at Summit');
  });

  it('parses design JSON string', () => {
    const design = buildDefaultCertificateDesign({});
    const parsed = parseDesignJson(JSON.stringify(design));
    expect(parsed?.elements?.length).toBe(design.elements.length);
  });

  it('returns landscape A4 dimensions by default', () => {
    const dims = getCanvasDimensions('landscape', 'A4');
    expect(dims.widthMm).toBe(297);
    expect(dims.heightMm).toBe(210);
  });

  it('builds sample preview data from event', () => {
    const data = buildSamplePreviewData({ title: 'Workshop', start_date: '2026-06-01' });
    expect(data.attendee_name).toBeTruthy();
    expect(data.event_name).toBe('Workshop');
    expect(data.certificate_number).toMatch(/MM-CERT/);
  });

  it('estimates tight text box for short labels', () => {
    const fit = estimateTextElementBox('MUTALE MUBANGA', { fontSize: 12, bold: true }, {
      widthMm: 297,
      heightMm: 210,
    });
    expect(fit.width).toBeLessThan(0.2);
    expect(fit.contentWidth).toBeLessThan(0.2);
  });

  it('estimates taller boxes when text wraps inside a fixed width', () => {
    const canvas = { widthMm: 297, heightMm: 210 };
    const style = { fontSize: 28, fontFamily: 'times', bold: true };
    const sample = 'Jane M. Sample';
    const singleLine = estimateTextElementBox(sample, style, canvas);
    const wrapped = estimateTextElementBox(sample, style, canvas, { boxWidthNorm: 0.18 });
    expect(estimateWrappedLineCount(sample, style, 0.18, canvas)).toBeGreaterThan(1);
    expect(wrapped.height).toBeGreaterThan(singleLine.height);
  });

  it('expands undersized attendee boxes on load', () => {
    const design = buildDesignFromPreset(CERTIFICATE_PRESET_ACHIEVEMENT, { title: 'Summit' });
    const sampleData = buildSamplePreviewData({ title: 'Summit' });
    const attendee = design.elements.find((el) => el.id === 'el_attendee');
    const shrunk = {
      ...design,
      elements: design.elements.map((el) => (
        el.id === 'el_attendee' ? { ...el, height: 0.04 } : el
      )),
    };
    const tightened = tightenOversizedTextElements(shrunk, sampleData);
    const fixed = tightened.elements.find((el) => el.id === 'el_attendee');
    expect(fixed.height).toBeGreaterThan(0.04);
    expect(fixed.height).toBeGreaterThanOrEqual(attendee.height * 0.95);
  });

  it('tightens legacy oversized text boxes on load', () => {
    const design = buildDefaultCertificateDesign({ title: 'Summit' });
    const widened = {
      ...design,
      elements: design.elements.map((el) => (
        el.id === 'el_subtitle' ? { ...el, width: 0.5, height: 0.12 } : el
      )),
    };
    const tightened = tightenOversizedTextElements(widened, buildSamplePreviewData({ title: 'Summit' }));
    const subtitle = tightened.elements.find((el) => el.id === 'el_subtitle');
    expect(subtitle.width).toBeLessThan(0.45);
  });

  it('upgrades old designs with logo and missing standard elements', () => {
    const legacy = {
      version: 1,
      canvas: { widthMm: 297, heightMm: 210 },
      elements: [
        createDesignElement('placeholder', { id: 'el_attendee', key: 'attendee_name' }),
      ],
    };
    const upgraded = upgradeCertificateDesign(legacy, { title: 'Workshop' });
    expect(upgraded.elements.some((el) => el.id === 'el_logo')).toBe(true);
    expect(upgraded.elements.some((el) => el.src === CERTIFICATE_BUNDLED_LOGO_SRC)).toBe(true);
    expect(upgraded.elements.some((el) => el.id === 'el_qr')).toBe(true);
  });

  it('resolves certificate font families for pdf and preview', () => {
    expect(resolveCertificateFont('times').pdfFont).toBe('times');
    expect(resolveCertificateFont('courier').cssFamily).toContain('Courier');
    expect(resolveCertificateFont('blackletter').pdfFont).toBe('UnifrakturMaguntia');
    expect(resolveCertificateFont('blackletter').cssFamily).toContain('UnifrakturMaguntia');
    expect(CERTIFICATE_FONTS.length).toBeGreaterThanOrEqual(4);
  });

  it('builds achievement preset with ornate background and required elements', () => {
    const design = buildDesignFromPreset(CERTIFICATE_PRESET_ACHIEVEMENT, { title: 'Summit' });
    expect(design.presetId).toBe(CERTIFICATE_PRESET_ACHIEVEMENT);
    expect(design.background.theme).toBe('achievement-ornate');
    expect(design.elements.some((el) => el.id === 'el_title')).toBe(true);
    expect(design.elements.some((el) => el.id === 'el_presented')).toBe(true);
    expect(design.elements.some((el) => el.id === 'el_seal_logo')).toBe(true);
    expect(design.elements.some((el) => el.id === 'el_attendee')).toBe(true);
    expect(design.elements.some((el) => el.id === 'el_qr')).toBe(true);
    const result = validateDesignForPublish(design, { title: 'Certificate of Achievement' });
    expect(result.ok).toBe(true);
  });

  it('infers preset from design elements', () => {
    const achievement = buildDesignFromPreset(CERTIFICATE_PRESET_ACHIEVEMENT, {});
    expect(inferCertificatePresetId(achievement)).toBe(CERTIFICATE_PRESET_ACHIEVEMENT);
    const attendance = buildDefaultCertificateDesign({});
    expect(inferCertificatePresetId(attendance)).toBe('attendance');
  });

  it('exposes attendance and achievement presets', () => {
    expect(CERTIFICATE_PRESETS.map((p) => p.id)).toEqual(['attendance', 'achievement']);
  });
});
