import {
  CERTIFICATE_DESIGN_VERSION,
  CERTIFICATE_BUNDLED_LOGO_SRC,
  BADGE_PAPER_SIZE,
  createDesignElement,
  getCanvasDimensions,
  buildSamplePreviewData,
  formatBadgeEventDate,
  buildDefaultBadgeDesign,
} from './certificateDesign.js';

export const BADGE_PRESET_TICKET = 'badge-ticket';
export const BADGE_PRESET_EXECUTIVE = 'badge-executive';
export const BADGE_PRESET_SUMMIT = 'badge-summit';
export const BADGE_PRESET_LANYARD = 'badge-lanyard';
export const BADGE_PRESET_FORMAL = 'badge-formal';

function badgeContext(event = {}) {
  const canvas = getCanvasDimensions('portrait', BADGE_PAPER_SIZE);
  const sampleData = buildSamplePreviewData(event, {
    event_name: String(event?.title || 'Event Name'),
    attendee_name: 'Jane M. Sample',
    event_date: formatBadgeEventDate(event),
    reference_code: 'MM-20260813-4821',
  });
  return { canvas, sampleData };
}

function pack(presetId, theme, canvas, elements) {
  return {
    version: CERTIFICATE_DESIGN_VERSION,
    presetId,
    canvas,
    background: { theme },
    elements,
  };
}

function text(id, content, canvas, sampleData, style, box) {
  return createDesignElement('text', {
    id,
    content,
    canvas,
    sampleData,
    style,
    ...box,
  });
}

function field(id, key, canvas, sampleData, style, box) {
  return createDesignElement('placeholder', {
    id,
    key,
    canvas,
    sampleData,
    style,
    ...box,
  });
}

function logo(canvas, box) {
  return createDesignElement('image', {
    id: 'el_badge_logo',
    src: CERTIFICATE_BUNDLED_LOGO_SRC,
    canvas,
    ...box,
  });
}

function qr(canvas, box) {
  return createDesignElement('qr', {
    id: 'el_badge_qr',
    canvas,
    ...box,
  });
}

function buildExecutiveElements(event, canvas) {
  const sampleData = badgeContext(event).sampleData;
  const white = { fontFamily: 'helvetica', color: '#FFFFFF', align: 'center', bold: false };
  const cyan = { fontFamily: 'helvetica', color: '#67E8F9', align: 'center', bold: false };
  return [
    logo(canvas, { x: 0.5, y: 0.09, width: 0.22, height: 0.1 }),
    text('el_badge_label', 'OFFICIAL PASS', canvas, sampleData, { ...cyan, fontSize: 9, bold: true }, {
      x: 0.5, y: 0.18, width: 0.8, height: 0.04,
    }),
    field('el_badge_name', 'attendee_name', canvas, sampleData, { ...white, fontSize: 26, bold: true }, {
      x: 0.5, y: 0.32, width: 0.9, height: 0.1,
    }),
    field('el_badge_event', 'event_name', canvas, sampleData, { ...cyan, fontSize: 12, bold: true }, {
      x: 0.5, y: 0.44, width: 0.88, height: 0.08,
    }),
    text('el_badge_date', '{{event_date}}', canvas, sampleData, { ...white, fontSize: 10 }, {
      x: 0.5, y: 0.54, width: 0.86, height: 0.04,
    }),
    text('el_badge_location', '{{event_location}}', canvas, sampleData, { ...cyan, fontSize: 10 }, {
      x: 0.5, y: 0.6, width: 0.86, height: 0.04,
    }),
    qr(canvas, { x: 0.5, y: 0.76, width: 0.28, height: 0.22 }),
    text('el_badge_ref', '{{reference_code}}', canvas, sampleData, {
      fontSize: 8, fontFamily: 'courier', color: '#94A3B8', align: 'center', bold: false,
    }, { x: 0.5, y: 0.92, width: 0.86, height: 0.035 }),
    text('el_badge_footer', 'Scan at the gate for entry', canvas, sampleData, { ...cyan, fontSize: 8 }, {
      x: 0.5, y: 0.965, width: 0.86, height: 0.03,
    }),
  ];
}

function buildSummitElements(event, canvas) {
  const sampleData = badgeContext(event).sampleData;
  const navy = { fontFamily: 'helvetica', color: '#102A43', align: 'center', bold: false };
  const teal = { fontFamily: 'helvetica', color: '#0F766E', align: 'center', bold: false };
  return [
    logo(canvas, { x: 0.5, y: 0.08, width: 0.2, height: 0.09 }),
    field('el_badge_name', 'attendee_name', canvas, sampleData, { ...navy, fontSize: 26, bold: true }, {
      x: 0.5, y: 0.22, width: 0.9, height: 0.1,
    }),
    text('el_badge_label', 'DELEGATE', canvas, sampleData, { ...teal, fontSize: 11, bold: true }, {
      x: 0.5, y: 0.32, width: 0.5, height: 0.04,
    }),
    field('el_badge_event', 'event_name', canvas, sampleData, { ...navy, fontSize: 12, bold: true }, {
      x: 0.5, y: 0.4, width: 0.88, height: 0.08,
    }),
    qr(canvas, { x: 0.5, y: 0.58, width: 0.34, height: 0.26 }),
    text('el_badge_date', '{{event_date}}', canvas, sampleData, { ...teal, fontSize: 10 }, {
      x: 0.5, y: 0.76, width: 0.88, height: 0.04,
    }),
    text('el_badge_location', '{{event_location}}', canvas, sampleData, { ...navy, fontSize: 10 }, {
      x: 0.5, y: 0.82, width: 0.88, height: 0.04,
    }),
    text('el_badge_ref', 'Ref {{reference_code}}', canvas, sampleData, {
      fontSize: 8, fontFamily: 'courier', color: '#64748B', align: 'center', bold: false,
    }, { x: 0.5, y: 0.88, width: 0.88, height: 0.035 }),
    text('el_badge_footer', 'Show this QR code at the gate for entry', canvas, sampleData, { ...teal, fontSize: 8 }, {
      x: 0.5, y: 0.95, width: 0.88, height: 0.035,
    }),
  ];
}

function buildLanyardElements(event, canvas) {
  const sampleData = badgeContext(event).sampleData;
  const ink = { fontFamily: 'helvetica', color: '#0F172A', align: 'center', bold: false };
  const mute = { fontFamily: 'helvetica', color: '#475569', align: 'center', bold: false };
  return [
    logo(canvas, { x: 0.5, y: 0.075, width: 0.18, height: 0.08 }),
    field('el_badge_name', 'attendee_name', canvas, sampleData, { ...ink, fontSize: 28, bold: true }, {
      x: 0.5, y: 0.2, width: 0.92, height: 0.11,
    }),
    field('el_badge_event', 'event_name', canvas, sampleData, { ...mute, fontSize: 11, bold: true }, {
      x: 0.5, y: 0.33, width: 0.88, height: 0.07,
    }),
    text('el_badge_label', 'NAME BADGE', canvas, sampleData, { ...ink, fontSize: 8, bold: true }, {
      x: 0.5, y: 0.41, width: 0.5, height: 0.03,
    }),
    qr(canvas, { x: 0.5, y: 0.58, width: 0.36, height: 0.28 }),
    text('el_badge_date', '{{event_date}}  ·  {{event_location}}', canvas, sampleData, { ...mute, fontSize: 9 }, {
      x: 0.5, y: 0.78, width: 0.9, height: 0.045,
    }),
    text('el_badge_ref', '{{reference_code}}', canvas, sampleData, {
      fontSize: 8, fontFamily: 'courier', color: '#64748B', align: 'center', bold: false,
    }, { x: 0.5, y: 0.85, width: 0.88, height: 0.035 }),
    text('el_badge_purchaser', 'Hosted by Mutale Mubanga', canvas, sampleData, { ...ink, fontSize: 9, bold: true }, {
      x: 0.5, y: 0.915, width: 0.88, height: 0.035,
    }),
    text('el_badge_footer', 'Present this badge at registration', canvas, sampleData, { ...mute, fontSize: 8 }, {
      x: 0.5, y: 0.96, width: 0.88, height: 0.03,
    }),
  ];
}

function buildFormalElements(event, canvas) {
  const sampleData = badgeContext(event).sampleData;
  const ink = { fontFamily: 'times', color: '#3F2E14', align: 'center', bold: false };
  const gold = { fontFamily: 'helvetica', color: '#8B6914', align: 'center', bold: false };
  return [
    logo(canvas, { x: 0.5, y: 0.09, width: 0.18, height: 0.08 }),
    text('el_badge_label', 'GUEST BADGE', canvas, sampleData, { ...gold, fontSize: 10, bold: true }, {
      x: 0.5, y: 0.175, width: 0.7, height: 0.04,
    }),
    field('el_badge_name', 'attendee_name', canvas, sampleData, { ...ink, fontSize: 26, bold: true }, {
      x: 0.5, y: 0.3, width: 0.88, height: 0.1,
    }),
    field('el_badge_event', 'event_name', canvas, sampleData, {
      fontSize: 12, fontFamily: 'times', color: '#5C4A24', align: 'center', bold: false,
    }, { x: 0.5, y: 0.42, width: 0.86, height: 0.08 }),
    text('el_badge_date', '{{event_date}}', canvas, sampleData, { ...gold, fontSize: 10 }, {
      x: 0.5, y: 0.52, width: 0.86, height: 0.04,
    }),
    text('el_badge_location', '{{event_location}}', canvas, sampleData, { ...ink, fontSize: 10 }, {
      x: 0.5, y: 0.575, width: 0.86, height: 0.04,
    }),
    qr(canvas, { x: 0.5, y: 0.73, width: 0.28, height: 0.22 }),
    text('el_badge_ref', '{{reference_code}}', canvas, sampleData, {
      fontSize: 8, fontFamily: 'courier', color: '#8B6914', align: 'center', bold: false,
    }, { x: 0.5, y: 0.89, width: 0.86, height: 0.035 }),
    text('el_badge_footer', 'Kindly present this badge at reception', canvas, sampleData, { ...gold, fontSize: 8 }, {
      x: 0.5, y: 0.95, width: 0.86, height: 0.035,
    }),
  ];
}

export const BADGE_PRESETS = [
  {
    id: BADGE_PRESET_TICKET,
    name: 'Gate Ticket',
    description: 'Navy header, QR-first — matches the event ticket',
    backgroundTheme: 'badge-ticket',
    defaultTitle: 'Name Badge',
    build: (event) => buildDefaultBadgeDesign(event, { backgroundTheme: 'badge-ticket' }),
  },
  {
    id: BADGE_PRESET_EXECUTIVE,
    name: 'Executive Navy',
    description: 'Dark navy conference pass with cyan accents',
    backgroundTheme: 'classic-navy',
    defaultTitle: 'Official Pass',
    build: (event) => {
      const { canvas } = badgeContext(event);
      return pack(BADGE_PRESET_EXECUTIVE, 'classic-navy', canvas, buildExecutiveElements(event, canvas));
    },
  },
  {
    id: BADGE_PRESET_SUMMIT,
    name: 'Summit Teal',
    description: 'Name-first delegate pass on a clean teal field',
    backgroundTheme: 'modern-teal',
    defaultTitle: 'Delegate Badge',
    build: (event) => {
      const { canvas } = badgeContext(event);
      return pack(BADGE_PRESET_SUMMIT, 'modern-teal', canvas, buildSummitElements(event, canvas));
    },
  },
  {
    id: BADGE_PRESET_LANYARD,
    name: 'Lanyard Classic',
    description: 'Large name for hanging badges, spare professional type',
    backgroundTheme: 'minimal-slate',
    defaultTitle: 'Name Badge',
    build: (event) => {
      const { canvas } = badgeContext(event);
      return pack(BADGE_PRESET_LANYARD, 'minimal-slate', canvas, buildLanyardElements(event, canvas));
    },
  },
  {
    id: BADGE_PRESET_FORMAL,
    name: 'Formal Gold',
    description: 'Cream and gold guest badge for roundtables and receptions',
    backgroundTheme: 'elegant-gold',
    defaultTitle: 'Guest Badge',
    build: (event) => {
      const { canvas } = badgeContext(event);
      return pack(BADGE_PRESET_FORMAL, 'elegant-gold', canvas, buildFormalElements(event, canvas));
    },
  },
];

export function getBadgePreset(presetId) {
  const normalized = inferBadgePresetId({ presetId });
  return BADGE_PRESETS.find((preset) => preset.id === normalized) || BADGE_PRESETS[0];
}

export function inferBadgePresetId(design = {}) {
  const raw = String(design?.presetId || '').trim();
  if (raw === 'badge' || raw === '') return BADGE_PRESET_TICKET;
  if (BADGE_PRESETS.some((preset) => preset.id === raw)) return raw;
  if (raw.startsWith('badge')) return BADGE_PRESET_TICKET;
  return BADGE_PRESET_TICKET;
}

export function buildBadgeDesignFromPreset(presetId, event = {}, opts = {}) {
  const preset = getBadgePreset(presetId);
  const design = preset.build(event, opts);
  return {
    ...design,
    presetId: preset.id,
    background: { theme: opts.backgroundTheme || design.background?.theme || preset.backgroundTheme },
  };
}

/**
 * Stable, professional preset choice for an event (used when seeding / first activate).
 */
export function pickBadgePresetIdForEvent(event = {}, index = 0) {
  const title = String(event.title || '').toLowerCase();
  const category = String(event.category || '').toLowerCase();
  const hay = `${title} ${category}`;
  if (/gala|dinner|awards|reception|formal|vip/.test(hay)) return BADGE_PRESET_FORMAL;
  if (/summit|roundtable|retreat|stakeholder|forum/.test(title) || /retreat|roundtable/.test(category)) {
    return BADGE_PRESET_EXECUTIVE;
  }
  if (/workshop|training|bootcamp|masterclass|clinic|seminar/.test(hay)) {
    return Number(index) % 2 === 0 ? BADGE_PRESET_SUMMIT : BADGE_PRESET_LANYARD;
  }
  const cycle = [
    BADGE_PRESET_LANYARD,
    BADGE_PRESET_TICKET,
    BADGE_PRESET_SUMMIT,
    BADGE_PRESET_EXECUTIVE,
    BADGE_PRESET_FORMAL,
  ];
  return cycle[Math.abs(Number(index) || 0) % cycle.length];
}

export function isOnsiteEventForBadges(event = {}) {
  const mode = String(event.event_mode || '').trim().toLowerCase();
  if (mode === 'virtual') return false;
  if (mode === 'in_person' || mode === 'hybrid') return true;
  const loc = String(event.location || event.venue || '').toLowerCase();
  return !loc.includes('virtual');
}
