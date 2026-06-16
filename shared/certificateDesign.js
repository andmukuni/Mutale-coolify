/** @typedef {'text'|'placeholder'|'image'|'qr'} CertificateElementType */

import { DEFAULT_BACKGROUND_THEME } from './certificateBackgrounds.js';
import { CERTIFICATE_BUNDLED_LOGO_SRC } from './certificateBundledAssets.js';
import { getCertificateSeal, DEFAULT_CERTIFICATE_SEAL_ID } from './certificateSeals.js';

export const CERTIFICATE_DESIGN_VERSION = 1;

export { CERTIFICATE_BUNDLED_LOGO_SRC } from './certificateBundledAssets.js';

export const CERTIFICATE_PRESET_ATTENDANCE = 'attendance';
export const CERTIFICATE_PRESET_ACHIEVEMENT = 'achievement';

export const PLACEHOLDER_KEYS = [
  'attendee_name',
  'event_name',
  'event_date',
  'certificate_number',
  'issue_date',
  'qr_code',
];

export const PLACEHOLDER_LABELS = {
  attendee_name: 'Attendee Name',
  event_name: 'Event Title',
  event_date: 'Event Date',
  certificate_number: 'Certificate Number',
  issue_date: 'Issue Date',
  qr_code: 'QR Code',
};

/** Fonts supported by jsPDF and the certificate designer preview. */
export const CERTIFICATE_FONTS = [
  {
    id: 'helvetica',
    label: 'Sans-serif',
    sample: 'Helvetica',
    pdfFont: 'helvetica',
    cssFamily: 'Helvetica, Arial, sans-serif',
    charFactor: 0.52,
  },
  {
    id: 'times',
    label: 'Serif',
    sample: 'Times New Roman',
    pdfFont: 'times',
    cssFamily: 'Georgia, "Times New Roman", serif',
    charFactor: 0.48,
  },
  {
    id: 'courier',
    label: 'Monospace',
    sample: 'Courier New',
    pdfFont: 'courier',
    cssFamily: '"Courier New", Courier, monospace',
    charFactor: 0.6,
  },
  {
    id: 'blackletter',
    label: 'Certificate Gothic',
    sample: 'Certificate of Achievement',
    pdfFont: 'UnifrakturMaguntia',
    pdfCustom: true,
    boldSupported: false,
    italicSupported: false,
    cssFamily: '"UnifrakturMaguntia", "Old English Text MT", fantasy',
    charFactor: 0.62,
  },
];

export function resolveCertificateFont(fontFamilyId) {
  const id = String(fontFamilyId || 'helvetica').toLowerCase();
  return CERTIFICATE_FONTS.find((font) => font.id === id) || CERTIFICATE_FONTS[0];
}

const A4_DIMENSIONS = {
  portrait: { widthMm: 210, heightMm: 297 },
  landscape: { widthMm: 297, heightMm: 210 },
};

export function getCanvasDimensions(orientation = 'landscape', paperSize = 'A4') {
  if (String(paperSize).toUpperCase() !== 'A4') {
    return A4_DIMENSIONS.landscape;
  }
  return A4_DIMENSIONS[orientation === 'portrait' ? 'portrait' : 'landscape'];
}

export function createElementId() {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clampBox(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const MM_PER_PT = 25.4 / 72;

/**
 * Estimate how many lines text occupies when wrapped inside a box width.
 * @param {string} text
 * @param {object} style
 * @param {number} boxWidthNorm
 * @param {{ widthMm?: number, heightMm?: number }} canvas
 */
export function estimateWrappedLineCount(text, style = {}, boxWidthNorm, canvas = { widthMm: 297 }) {
  const content = String(text || ' ').trim() || ' ';
  const fontSize = Number(style.fontSize) || 14;
  const bold = Boolean(style.bold);
  const font = resolveCertificateFont(style.fontFamily);
  const fontSizeMm = fontSize * MM_PER_PT;
  let charFactor = font.charFactor;
  if (bold) charFactor *= 1.08;

  const canvasW = canvas.widthMm || 297;
  const boxWidthMm = Math.max(fontSizeMm * 2, Number(boxWidthNorm) * canvasW);
  const charsPerLine = Math.max(1, Math.floor(boxWidthMm / (fontSizeMm * charFactor)));

  const paragraphs = content.split('\n');
  let totalLines = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      totalLines += 1;
      continue;
    }
    const words = trimmed.split(/\s+/);
    let lines = 1;
    let lineLen = 0;
    for (const word of words) {
      const addLen = lineLen === 0 ? word.length : word.length + 1;
      if (lineLen > 0 && lineLen + addLen > charsPerLine) {
        lines += 1;
        lineLen = word.length;
      } else {
        lineLen += addLen;
      }
    }
    totalLines += lines;
  }
  return Math.max(1, totalLines);
}

/**
 * Estimate normalized width/height for a single- or multi-line text box.
 * @param {string} text
 * @param {object} [style]
 * @param {{ widthMm?: number, heightMm?: number }} [canvas]
 * @param {{ boxWidthNorm?: number }} [options]
 */
export function estimateTextElementBox(
  text,
  style = {},
  canvas = { widthMm: 297, heightMm: 210 },
  options = {},
) {
  const content = String(text || ' ').trim() || ' ';
  const fontSize = Number(style.fontSize) || 14;
  const bold = Boolean(style.bold);
  const font = resolveCertificateFont(style.fontFamily);
  const fontSizeMm = fontSize * MM_PER_PT;

  const explicitLines = content.split('\n');
  const maxLineLen = Math.max(...explicitLines.map((line) => line.length), 1);
  let charFactor = font.charFactor;
  if (bold) charFactor *= 1.08;

  const textWidthMm = maxLineLen * fontSizeMm * charFactor;
  const lineHeightFactor = bold ? 1.42 : 1.35;
  const padW = fontSizeMm * 0.4;
  const padH = fontSizeMm * (bold ? 0.5 : 0.45);

  const canvasW = canvas.widthMm || 297;
  const canvasH = canvas.heightMm || 210;

  const contentWidth = clampBox((textWidthMm + padW * 2) / canvasW, 0.04, 0.95);
  const boxWidthNorm = Number(options.boxWidthNorm);
  const width = boxWidthNorm > 0 ? boxWidthNorm : contentWidth;
  const wrapWidth = boxWidthNorm > 0 ? boxWidthNorm : contentWidth;
  const lineCount = Math.max(
    explicitLines.length,
    estimateWrappedLineCount(content, style, wrapWidth, canvas),
  );
  const textHeightMm = fontSizeMm * lineHeightFactor * lineCount;

  return {
    width,
    height: clampBox((textHeightMm + padH * 2) / canvasH, 0.025, 0.4),
    contentWidth,
  };
}

/**
 * @param {object} element
 * @param {object} canvas
 * @param {string} displayText
 */
export function fitTextElement(element, canvas, displayText) {
  if (element.type !== 'text' && element.type !== 'placeholder') return element;
  const widthNorm = Number(element.width);
  const fit = estimateTextElementBox(displayText, element.style, canvas, {
    boxWidthNorm: widthNorm > 0 ? widthNorm : undefined,
  });
  return {
    ...element,
    width: widthNorm > 0 ? widthNorm : fit.width,
    height: fit.height,
  };
}

/**
 * Shrink text boxes that are much wider than their content (legacy templates).
 * @param {object} design
 * @param {Record<string, string>} [sampleData]
 */
export function tightenOversizedTextElements(design, sampleData = {}) {
  const canvas = design.canvas || getCanvasDimensions('landscape', 'A4');
  return {
    ...design,
    elements: (design.elements || []).map((el) => {
      if (el.type !== 'text' && el.type !== 'placeholder') return el;
      const text = resolveElementDisplayText(el, sampleData);
      const w = Number(el.width) || 0;
      const fit = estimateTextElementBox(text, el.style, canvas, {
        boxWidthNorm: w > 0 ? w : undefined,
      });
      const contentFit = estimateTextElementBox(text, el.style, canvas);
      const effectiveW = w || fit.width;
      const h = Number(el.height) || fit.height;
      const tooWide = effectiveW > contentFit.contentWidth * 1.12;
      const tooNarrow = effectiveW < contentFit.contentWidth * 0.88;
      const tooShort = h < fit.height * 0.92;
      const tooTall = h > fit.height * 1.35;
      if (tooWide || tooNarrow || tooShort || tooTall) {
        return {
          ...el,
          width: tooWide || tooNarrow ? contentFit.contentWidth : effectiveW,
          height: fit.height,
        };
      }
      return el;
    }),
  };
}

export function resolveElementDisplayText(element, sampleData = {}) {
  if (element.type === 'placeholder') {
    const key = element.key || 'attendee_name';
    return sampleData[key] || PLACEHOLDER_LABELS[key] || element.content || '';
  }
  return element.content || '';
}

/**
 * @param {CertificateElementType} type
 * @param {object} [overrides]
 */
export function createDesignElement(type, overrides = {}) {
  const {
    canvas: canvasOverride,
    sampleData: sampleDataOverride,
    event: eventOverride,
    ...elementOverrides
  } = overrides;
  const canvas = canvasOverride || getCanvasDimensions('landscape', 'A4');
  const base = {
    id: createElementId(),
    type,
    x: 0.5,
    y: 0.5,
    width: type === 'text' || type === 'placeholder' ? 0.32 : 0.4,
    height: type === 'text' || type === 'placeholder' ? 0.05 : 0.08,
    style: {
      fontSize: 14,
      fontFamily: 'helvetica',
      color: '#0B1D36',
      align: 'center',
      bold: false,
      italic: false,
      underline: false,
      highlight: '',
    },
    ...elementOverrides,
  };

  if (type === 'placeholder') {
    base.key = overrides.key || 'attendee_name';
    base.content = `{{${base.key}}}`;
  }
  if (type === 'text') {
    base.content = overrides.content || 'Text';
  }
  if (type === 'image') {
    base.width = 0.15;
    base.height = 0.15;
    base.src = overrides.src || '';
  }
  if (type === 'qr') {
    base.width = 0.12;
    base.height = 0.12;
    base.key = 'qr_code';
  }

  if (type === 'text' || type === 'placeholder') {
    const sampleData = sampleDataOverride || buildSamplePreviewData(eventOverride || {});
    const displayText = resolveElementDisplayText(base, sampleData);
    const widthOverride = elementOverrides.width;
    const fit = estimateTextElementBox(displayText, base.style, canvas, {
      boxWidthNorm: widthOverride != null ? Number(widthOverride) : undefined,
    });
    if (widthOverride == null) base.width = fit.width;
    if (elementOverrides.height == null) base.height = fit.height;
  }

  return base;
}

/**
 * Complete standard certificate layout with logo, all placeholders, labels, and QR.
 * @param {object} event
 * @param {object} canvas
 * @param {object} [opts]
 */
export function buildStandardCertificateElements(event = {}, canvas, opts = {}) {
  const eventTitle = String(event.title || opts.eventTitle || 'Event Title');
  const sampleData = buildSamplePreviewData(event, { event_name: eventTitle });
  const logoSrc = opts.logoSrc || CERTIFICATE_BUNDLED_LOGO_SRC;

  return [
    createDesignElement('image', {
      id: 'el_logo',
      x: 0.5,
      y: 0.095,
      width: 0.11,
      height: 0.11,
      src: logoSrc,
      canvas,
    }),
    createDesignElement('text', {
      id: 'el_subtitle',
      content: 'Certificate of Attendance',
      x: 0.5,
      y: 0.175,
      canvas,
      style: { fontSize: 13, fontFamily: 'times', color: '#6B5344', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_divider',
      content: '— ✦ —',
      x: 0.5,
      y: 0.215,
      canvas,
      style: { fontSize: 11, fontFamily: 'times', color: '#C9A227', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_certify_intro',
      content: 'This is to certify that',
      x: 0.5,
      y: 0.265,
      canvas,
      style: { fontSize: 11, fontFamily: 'helvetica', color: '#64748B', align: 'center', bold: false },
    }),
    createDesignElement('placeholder', {
      id: 'el_attendee',
      key: 'attendee_name',
      x: 0.5,
      y: 0.34,
      canvas,
      sampleData,
      style: { fontSize: 30, fontFamily: 'times', color: '#0B1D36', align: 'center', bold: true },
    }),
    createDesignElement('text', {
      id: 'el_has_attended',
      content: 'has successfully attended',
      x: 0.5,
      y: 0.415,
      canvas,
      style: { fontSize: 12, fontFamily: 'helvetica', color: '#64748B', align: 'center', bold: false },
    }),
    createDesignElement('placeholder', {
      id: 'el_event_name',
      key: 'event_name',
      x: 0.5,
      y: 0.475,
      canvas,
      sampleData,
      style: { fontSize: 18, fontFamily: 'helvetica', color: '#0D9488', align: 'center', bold: true },
    }),
    createDesignElement('text', {
      id: 'el_event_date_label',
      content: 'Event Date',
      x: 0.5,
      y: 0.535,
      canvas,
      style: { fontSize: 9, fontFamily: 'helvetica', color: '#94A3B8', align: 'center', bold: false },
    }),
    createDesignElement('placeholder', {
      id: 'el_event_date',
      key: 'event_date',
      x: 0.5,
      y: 0.565,
      canvas,
      sampleData,
      style: { fontSize: 11, fontFamily: 'helvetica', color: '#475569', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_issue_date_label',
      content: 'Date Issued',
      x: 0.5,
      y: 0.605,
      canvas,
      style: { fontSize: 9, fontFamily: 'helvetica', color: '#94A3B8', align: 'center', bold: false },
    }),
    createDesignElement('placeholder', {
      id: 'el_issue_date',
      key: 'issue_date',
      x: 0.5,
      y: 0.635,
      canvas,
      sampleData,
      style: { fontSize: 11, fontFamily: 'helvetica', color: '#475569', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_signature_line',
      content: '______________________________',
      x: 0.35,
      y: 0.755,
      canvas,
      style: { fontSize: 10, fontFamily: 'helvetica', color: '#CBD5E1', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_signature_label',
      content: 'Authorized Signature',
      x: 0.35,
      y: 0.785,
      canvas,
      style: { fontSize: 9, fontFamily: 'helvetica', color: '#64748B', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_presented_by',
      content: 'Presented by Mutale Mubanga',
      x: 0.5,
      y: 0.845,
      canvas,
      style: { fontSize: 10, fontFamily: 'helvetica', color: '#8B6914', align: 'center', bold: true },
    }),
    createDesignElement('text', {
      id: 'el_verify_hint',
      content: 'Scan QR code to verify authenticity',
      x: 0.82,
      y: 0.845,
      canvas,
      style: { fontSize: 7, fontFamily: 'helvetica', color: '#94A3B8', align: 'center', bold: false },
    }),
    createDesignElement('placeholder', {
      id: 'el_cert_number',
      key: 'certificate_number',
      x: 0.5,
      y: 0.915,
      canvas,
      sampleData,
      style: { fontSize: 8, fontFamily: 'courier', color: '#94A3B8', align: 'center', bold: false },
    }),
    createDesignElement('qr', {
      id: 'el_qr',
      x: 0.915,
      y: 0.885,
      width: 0.085,
      height: 0.085,
      canvas,
    }),
  ];
}

/**
 * Achievement certificate layout — ornate frame preset with presented-to footer.
 * @param {object} event
 * @param {object} canvas
 * @param {object} [opts]
 */
export function buildAchievementCertificateElements(event = {}, canvas, opts = {}) {
  const eventTitle = String(event.title || opts.eventTitle || 'Event Title');
  const sampleData = buildSamplePreviewData(event, { event_name: eventTitle });
  const sealSrc = opts.sealSrc || getCertificateSeal(opts.sealId || DEFAULT_CERTIFICATE_SEAL_ID).src;

  return [
    createDesignElement('text', {
      id: 'el_cert_number',
      content: 'Cert. No. {{certificate_number}}',
      x: 0.5,
      y: 0.07,
      canvas,
      style: { fontSize: 8, fontFamily: 'helvetica', color: '#8B6914', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_title',
      content: 'Certificate of Achievement',
      x: 0.5,
      y: 0.16,
      width: 0.55,
      canvas,
      style: { fontSize: 22, fontFamily: 'blackletter', color: '#C5A059', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_presented',
      content: 'PROUDLY PRESENTED TO',
      x: 0.5,
      y: 0.24,
      canvas,
      style: { fontSize: 10, fontFamily: 'times', color: '#64748B', align: 'center', bold: false },
    }),
    createDesignElement('placeholder', {
      id: 'el_attendee',
      key: 'attendee_name',
      x: 0.5,
      y: 0.34,
      canvas,
      sampleData,
      style: { fontSize: 28, fontFamily: 'times', color: '#0B1D36', align: 'center', bold: true },
    }),
    createDesignElement('text', {
      id: 'el_body',
      content: 'In recognition of outstanding achievement at {{event_name}} on {{event_date}}.',
      x: 0.5,
      y: 0.46,
      width: 0.72,
      canvas,
      style: { fontSize: 10, fontFamily: 'times', color: '#475569', align: 'center', bold: false },
    }),
    createDesignElement('placeholder', {
      id: 'el_issue_date',
      key: 'issue_date',
      x: 0.22,
      y: 0.78,
      canvas,
      sampleData,
      style: { fontSize: 10, fontFamily: 'helvetica', color: '#334155', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_date_line',
      content: '________________________',
      x: 0.22,
      y: 0.82,
      canvas,
      style: { fontSize: 9, fontFamily: 'helvetica', color: '#CBD5E1', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_date_label',
      content: 'Date:',
      x: 0.22,
      y: 0.855,
      canvas,
      style: { fontSize: 9, fontFamily: 'helvetica', color: '#334155', align: 'center', bold: true },
    }),
    createDesignElement('image', {
      id: 'el_seal_logo',
      x: 0.5,
      y: 0.84,
      width: 0.09,
      height: 0.09,
      src: sealSrc,
      seal: true,
      canvas,
    }),
    createDesignElement('text', {
      id: 'el_signature_name',
      content: 'Mutale Mubanga',
      x: 0.78,
      y: 0.76,
      canvas,
      style: { fontSize: 14, fontFamily: 'times', color: '#334155', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_signature_line',
      content: '________________________',
      x: 0.78,
      y: 0.82,
      canvas,
      style: { fontSize: 9, fontFamily: 'helvetica', color: '#CBD5E1', align: 'center', bold: false },
    }),
    createDesignElement('text', {
      id: 'el_signature_label',
      content: 'Signature',
      x: 0.78,
      y: 0.855,
      canvas,
      style: { fontSize: 9, fontFamily: 'helvetica', color: '#334155', align: 'center', bold: true },
    }),
    createDesignElement('qr', {
      id: 'el_qr',
      x: 0.92,
      y: 0.92,
      width: 0.06,
      height: 0.06,
      canvas,
    }),
  ];
}

export const CERTIFICATE_PRESETS = [
  {
    id: CERTIFICATE_PRESET_ATTENDANCE,
    name: 'Certificate of Attendance',
    description: 'Mutale logo header, event details, QR verify',
    backgroundTheme: 'elegant-gold',
    defaultTitle: 'Certificate of Attendance',
    buildElements: buildStandardCertificateElements,
  },
  {
    id: CERTIFICATE_PRESET_ACHIEVEMENT,
    name: 'Certificate of Achievement',
    description: 'Ornate gold frame, presented-to layout, signature footer',
    backgroundTheme: 'achievement-ornate',
    defaultTitle: 'Certificate of Achievement',
    buildElements: buildAchievementCertificateElements,
  },
];

export function getCertificatePreset(presetId) {
  const id = String(presetId || CERTIFICATE_PRESET_ATTENDANCE);
  return CERTIFICATE_PRESETS.find((p) => p.id === id) || CERTIFICATE_PRESETS[0];
}

export function inferCertificatePresetId(design) {
  const parsed = parseDesignJson(design);
  if (parsed?.presetId) return parsed.presetId;
  const elements = parsed?.elements || [];
  if (elements.some((el) => el.id === 'el_presented' || el.id === 'el_title')) {
    return CERTIFICATE_PRESET_ACHIEVEMENT;
  }
  return CERTIFICATE_PRESET_ATTENDANCE;
}

/**
 * @param {string} presetId
 * @param {object} event
 * @param {{ orientation?: string, paperSize?: string }} [opts]
 */
export function buildDesignFromPreset(presetId, event = {}, opts = {}) {
  const preset = getCertificatePreset(presetId);
  const orientation = opts.orientation || 'landscape';
  const paperSize = opts.paperSize || 'A4';
  const canvas = getCanvasDimensions(orientation, paperSize);

  return {
    version: CERTIFICATE_DESIGN_VERSION,
    presetId: preset.id,
    background: { theme: opts.backgroundTheme || preset.backgroundTheme },
    canvas,
    elements: preset.buildElements(event, canvas, opts),
  };
}

/**
 * Add any missing standard elements (logo, labels, QR) to an existing design.
 * @param {object} design
 * @param {object} [event]
 */
export function upgradeCertificateDesign(design, event = {}) {
  const parsed = parseDesignJson(design) || { version: CERTIFICATE_DESIGN_VERSION, elements: [] };
  const canvas = parsed.canvas || getCanvasDimensions('landscape', 'A4');
  const presetId = inferCertificatePresetId(parsed);
  const preset = getCertificatePreset(presetId);
  const standard = preset.buildElements(event, canvas);
  const byId = new Map((parsed.elements || []).map((el) => [el.id, el]));
  const hasLogo = (parsed.elements || []).some(
    (el) => el.type === 'image'
      && el.id === 'el_logo',
  );
  const hasSeal = (parsed.elements || []).some(
    (el) => el.type === 'image'
      && (el.id === 'el_seal_logo' || el.seal === true),
  );

  const merged = [...(parsed.elements || [])];

  for (const stdEl of standard) {
    if (stdEl.id === 'el_logo' && hasLogo) continue;
    if ((stdEl.id === 'el_seal_logo' || stdEl.seal) && hasSeal) continue;
    if (!byId.has(stdEl.id)) {
      merged.push(stdEl);
    }
  }

  const upgraded = {
    ...parsed,
    version: CERTIFICATE_DESIGN_VERSION,
    presetId,
    sealId: parsed.sealId || undefined,
    canvas,
    elements: merged,
  };

  return upgraded;
}

/**
 * @param {object} event
 * @param {{ orientation?: string, paperSize?: string }} [opts]
 */
export function buildDefaultCertificateDesign(event = {}, opts = {}) {
  return buildDesignFromPreset(CERTIFICATE_PRESET_ATTENDANCE, event, opts);
}

export function resolveBackgroundTheme(design, templateMeta = {}) {
  const fromDesign = design?.background?.theme;
  if (fromDesign) return fromDesign;
  if (templateMeta?.background_image) return null;
  return DEFAULT_BACKGROUND_THEME;
}

/**
 * @param {unknown} raw
 */
export function parseDesignJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * @param {string} content
 * @param {Record<string, string>} data
 */
export function resolvePlaceholders(content, data = {}) {
  let result = String(content || '');
  for (const key of PLACEHOLDER_KEYS) {
    const token = `{{${key}}}`;
    if (result.includes(token) && data[key] != null) {
      result = result.split(token).join(String(data[key]));
    }
  }
  return result;
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return '—';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue);
  return d.toLocaleDateString('en-ZM', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatEventDateRange(event = {}) {
  const start = event.start_date || event.date;
  const end = event.end_date || start;
  if (!start) return '—';
  if (end && end !== start) {
    return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  }
  return formatDisplayDate(start);
}

/**
 * @param {object} event
 * @param {object} [overrides]
 */
export function buildSamplePreviewData(event = {}, overrides = {}) {
  return {
    attendee_name: overrides.attendee_name || 'Jane M. Sample',
    event_name: overrides.event_name || String(event.title || 'Sample Event'),
    event_date: overrides.event_date || formatEventDateRange(event),
    certificate_number: overrides.certificate_number || 'MM-CERT-SAMPLE01',
    issue_date: overrides.issue_date || formatDisplayDate(new Date()),
    qr_code: overrides.qr_code || '',
  };
}

/**
 * @param {object} design
 * @param {object} [templateMeta]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDesignForPublish(design, templateMeta = {}) {
  const errors = [];
  const parsed = parseDesignJson(design);
  if (!parsed || !Array.isArray(parsed.elements)) {
    errors.push('Design must include a valid elements array.');
    return { ok: false, errors };
  }

  if (parsed.elements.length === 0) {
    errors.push('Add at least one design element before publishing.');
  }

  const hasAttendee = parsed.elements.some(
    (el) => el.type === 'placeholder' && el.key === 'attendee_name',
  );
  if (!hasAttendee) {
    errors.push('Include an attendee name placeholder ({{attendee_name}}).');
  }

  const hasEventName = parsed.elements.some(
    (el) => (el.type === 'placeholder' && el.key === 'event_name')
      || (el.type === 'text' && String(el.content || '').includes('{{event_name}}'))
      || (el.type === 'text' && String(el.content || '').trim().length > 0
        && !['el_subtitle', 'el_logo', 'el_title', 'el_presented', 'el_certify_intro', 'el_has_attended',
          'el_body', 'el_date_label', 'el_issue_date_label', 'el_signature_label', 'el_signature_name',
          'el_signature_line', 'el_date_line', 'el_verify_hint', 'el_presented_by', 'el_divider'].includes(el.id)),
  );
  const titleFromMeta = String(templateMeta.title || '').trim();
  if (!hasEventName && !titleFromMeta) {
    errors.push('Include an event title placeholder or certificate title.');
  }

  const visibleElements = parsed.elements.filter((el) => {
    if (el.type === 'text' || el.type === 'placeholder') {
      return String(el.content || el.key || '').trim().length > 0;
    }
    if (el.type === 'image') return Boolean(el.src);
    if (el.type === 'qr') return true;
    return false;
  });

  if (visibleElements.length === 0) {
    errors.push('Certificate design cannot be blank.');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Normalize design after orientation/paper change.
 * @param {object} design
 * @param {string} orientation
 * @param {string} paperSize
 */
export function syncDesignCanvas(design, orientation, paperSize) {
  const parsed = parseDesignJson(design) || { version: CERTIFICATE_DESIGN_VERSION, elements: [] };
  return {
    ...parsed,
    version: CERTIFICATE_DESIGN_VERSION,
    presetId: parsed.presetId || inferCertificatePresetId(parsed),
    background: parsed.background || { theme: DEFAULT_BACKGROUND_THEME },
    canvas: getCanvasDimensions(orientation, paperSize),
    elements: Array.isArray(parsed.elements) ? parsed.elements : [],
  };
}
