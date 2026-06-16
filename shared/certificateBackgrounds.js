/** Preset certificate background themes — rendered in canvas (CSS) and PDF (jsPDF). */

import { CERTIFICATE_ACHIEVEMENT_FRAME_SRC } from './certificateBundledAssets.js';

export const DEFAULT_BACKGROUND_THEME = 'elegant-gold';

export const CERTIFICATE_BACKGROUND_THEMES = [
  {
    id: 'elegant-gold',
    name: 'Elegant Gold',
    description: 'Cream parchment with ornate gold frame',
    preview: {
      background: 'linear-gradient(145deg, #FFFDF7 0%, #F5EDD8 45%, #EDE4CC 100%)',
      borderColor: '#C9A227',
      accentColor: '#8B6914',
    },
  },
  {
    id: 'classic-navy',
    name: 'Classic Navy',
    description: 'Deep navy with cyan accent borders',
    preview: {
      background: 'linear-gradient(160deg, #0B1D36 0%, #132D4F 50%, #0B1D36 100%)',
      borderColor: '#06B6D4',
      accentColor: '#FFFFFF',
    },
  },
  {
    id: 'modern-teal',
    name: 'Modern Teal',
    description: 'Clean white with teal geometric accents',
    preview: {
      background: 'linear-gradient(180deg, #FFFFFF 0%, #F0FDFA 100%)',
      borderColor: '#0D9488',
      accentColor: '#0F766E',
    },
  },
  {
    id: 'royal-burgundy',
    name: 'Royal Burgundy',
    description: 'Rich burgundy with gold trim',
    preview: {
      background: 'linear-gradient(145deg, #4A1C28 0%, #6B2D3E 50%, #4A1C28 100%)',
      borderColor: '#D4AF37',
      accentColor: '#F5E6C8',
    },
  },
  {
    id: 'parchment',
    name: 'Parchment',
    description: 'Warm aged paper texture',
    preview: {
      background: 'linear-gradient(160deg, #FAF3E8 0%, #EDE0C8 40%, #E2D4B8 100%)',
      borderColor: '#A68B5B',
      accentColor: '#6B5344',
    },
  },
  {
    id: 'minimal-slate',
    name: 'Minimal Slate',
    description: 'Soft grey with subtle frame',
    preview: {
      background: 'linear-gradient(180deg, #F8FAFC 0%, #EEF2F7 100%)',
      borderColor: '#64748B',
      accentColor: '#334155',
    },
  },
  {
    id: 'achievement-ornate',
    name: 'Achievement Ornate',
    type: 'image',
    imageSrc: CERTIFICATE_ACHIEVEMENT_FRAME_SRC,
    description: 'Floral gold border for achievement certificates',
    preview: {
      background: '#FDFBF2',
      borderColor: '#C5A059',
      accentColor: '#8B6914',
    },
  },
];

export function getBackgroundTheme(themeId) {
  const id = String(themeId || DEFAULT_BACKGROUND_THEME);
  return CERTIFICATE_BACKGROUND_THEMES.find((t) => t.id === id)
    || CERTIFICATE_BACKGROUND_THEMES.find((t) => t.id === DEFAULT_BACKGROUND_THEME);
}

export function isImageBackgroundTheme(themeId) {
  const theme = getBackgroundTheme(themeId);
  return theme?.type === 'image' && Boolean(theme.imageSrc);
}

function hexToRgb(hex) {
  const raw = String(hex || '#000000').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [0, 0, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function setFill(doc, hex) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setDraw(doc, hex, width = 0.4) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(width);
}

function drawCornerOrnaments(doc, pageW, pageH, color, inset = 18) {
  setDraw(doc, color, 0.6);
  const len = 12;
  // top-left
  doc.line(inset, inset + len, inset, inset);
  doc.line(inset, inset, inset + len, inset);
  // top-right
  doc.line(pageW - inset - len, inset, pageW - inset, inset);
  doc.line(pageW - inset, inset, pageW - inset, inset + len);
  // bottom-left
  doc.line(inset, pageH - inset - len, inset, pageH - inset);
  doc.line(inset, pageH - inset, inset + len, pageH - inset);
  // bottom-right
  doc.line(pageW - inset - len, pageH - inset, pageW - inset, pageH - inset);
  doc.line(pageW - inset, pageH - inset, pageW - inset, pageH - inset - len);
}

function drawParchmentLines(doc, pageW, pageH) {
  setDraw(doc, '#E8DCC8', 0.08);
  for (let y = 24; y < pageH - 20; y += 4) {
    doc.line(20, y, pageW - 20, y);
  }
}

function drawGeometricAccents(doc, pageW, pageH, color) {
  setFill(doc, color);
  doc.rect(pageW - 22, 0, 22, 22, 'F');
  doc.rect(0, pageH - 22, 22, 22, 'F');
  setDraw(doc, color, 0.5);
  doc.line(14, pageH / 2, pageW - 14, pageH / 2);
}

/**
 * Draw preset background onto jsPDF doc (full page).
 * @param {import('jspdf').jsPDF} doc
 * @param {number} pageW
 * @param {number} pageH
 * @param {string} themeId
 */
export function drawCertificateBackgroundPdf(doc, pageW, pageH, themeId) {
  const theme = getBackgroundTheme(themeId);
  const id = theme.id;

  if (id === 'classic-navy') {
    setFill(doc, '#0B1D36');
    doc.rect(0, 0, pageW, pageH, 'F');
    setFill(doc, '#132D4F');
    doc.rect(8, 8, pageW - 16, pageH - 16, 'F');
    setDraw(doc, '#06B6D4', 1.2);
    doc.rect(14, 14, pageW - 28, pageH - 28);
    setDraw(doc, '#FFFFFF', 0.35);
    doc.rect(18, 18, pageW - 36, pageH - 36);
    drawCornerOrnaments(doc, pageW, pageH, '#06B6D4', 22);
    return;
  }

  if (id === 'elegant-gold') {
    setFill(doc, '#F5EDD8');
    doc.rect(0, 0, pageW, pageH, 'F');
    setFill(doc, '#FFFDF7');
    doc.rect(10, 10, pageW - 20, pageH - 20, 'F');
    setDraw(doc, '#C9A227', 1.5);
    doc.rect(14, 14, pageW - 28, pageH - 28);
    setDraw(doc, '#8B6914', 0.4);
    doc.rect(18, 18, pageW - 36, pageH - 36);
    drawCornerOrnaments(doc, pageW, pageH, '#C9A227', 20);
    return;
  }

  if (id === 'modern-teal') {
    setFill(doc, '#FFFFFF');
    doc.rect(0, 0, pageW, pageH, 'F');
    setFill(doc, '#F0FDFA');
    doc.rect(12, 12, pageW - 24, pageH - 24, 'F');
    setDraw(doc, '#0D9488', 0.8);
    doc.rect(16, 16, pageW - 32, pageH - 32);
    drawGeometricAccents(doc, pageW, pageH, '#14B8A6');
    return;
  }

  if (id === 'royal-burgundy') {
    setFill(doc, '#4A1C28');
    doc.rect(0, 0, pageW, pageH, 'F');
    setFill(doc, '#5C2433');
    doc.rect(10, 10, pageW - 20, pageH - 20, 'F');
    setDraw(doc, '#D4AF37', 1.4);
    doc.rect(14, 14, pageW - 28, pageH - 28);
    setDraw(doc, '#F5E6C8', 0.35);
    doc.rect(18, 18, pageW - 36, pageH - 36);
    drawCornerOrnaments(doc, pageW, pageH, '#D4AF37', 20);
    return;
  }

  if (id === 'parchment') {
    setFill(doc, '#EDE0C8');
    doc.rect(0, 0, pageW, pageH, 'F');
    setFill(doc, '#FAF3E8');
    doc.rect(12, 12, pageW - 24, pageH - 24, 'F');
    drawParchmentLines(doc, pageW, pageH);
    setDraw(doc, '#A68B5B', 0.9);
    doc.rect(16, 16, pageW - 32, pageH - 32);
    drawCornerOrnaments(doc, pageW, pageH, '#A68B5B', 20);
    return;
  }

  // minimal-slate (default fallback)
  setFill(doc, '#F8FAFC');
  doc.rect(0, 0, pageW, pageH, 'F');
  setFill(doc, '#FFFFFF');
  doc.rect(14, 14, pageW - 28, pageH - 28, 'F');
  setDraw(doc, '#64748B', 0.6);
  doc.rect(18, 18, pageW - 36, pageH - 36);
}

/** CSS inline style for canvas preview background layer. */
export function getBackgroundPreviewStyle(themeId) {
  const theme = getBackgroundTheme(themeId);
  const { preview } = theme;
  return {
    background: preview.background,
  };
}

/** Whether text on this theme should default to light colors. */
export function isDarkBackgroundTheme(themeId) {
  return ['classic-navy', 'royal-burgundy'].includes(String(themeId || ''));
}
