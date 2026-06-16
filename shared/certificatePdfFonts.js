import { promises as fs } from 'fs';
import path from 'path';
import { resolveCertificateFont } from './certificateDesign.js';

const CUSTOM_FONT_FILES = {
  blackletter: {
    vfsName: 'UnifrakturMaguntia-Regular.ttf',
    pdfFamily: 'UnifrakturMaguntia',
    relativePath: path.join('public', 'fonts', 'UnifrakturMaguntia-Regular.ttf'),
  },
};

/**
 * Register custom TTF fonts on a jsPDF document instance.
 * @param {import('jspdf').jsPDF} doc
 * @param {string} appRoot
 */
export async function registerCertificatePdfFonts(doc, appRoot = '') {
  if (!doc || !appRoot) return;

  doc.__mutaleRegisteredFonts = doc.__mutaleRegisteredFonts || new Set();

  for (const [fontId, meta] of Object.entries(CUSTOM_FONT_FILES)) {
    if (doc.__mutaleRegisteredFonts.has(fontId)) continue;

    const absolute = path.join(appRoot, meta.relativePath);
    let buffer;
    try {
      buffer = await fs.readFile(absolute);
    } catch {
      continue;
    }

    const base64 = buffer.toString('base64');
    doc.addFileToVFS(meta.vfsName, base64);
    doc.addFont(meta.vfsName, meta.pdfFamily, 'normal');
    doc.__mutaleRegisteredFonts.add(fontId);
  }
}

/**
 * @param {import('jspdf').jsPDF} doc
 * @param {object} [style]
 */
export function applyCertificatePdfTextStyle(doc, style = {}) {
  const font = resolveCertificateFont(style.fontFamily);
  const wantsBold = Boolean(style.bold) && font.boldSupported !== false;
  const wantsItalic = Boolean(style.italic) && font.italicSupported !== false;

  if (font.pdfCustom) {
    doc.setFont(font.pdfFont, 'normal');
  } else {
    let variant = 'normal';
    if (wantsBold && wantsItalic) variant = 'bolditalic';
    else if (wantsBold) variant = 'bold';
    else if (wantsItalic) variant = 'italic';
    doc.setFont(font.pdfFont, variant);
  }

  doc.setFontSize(Number(style.fontSize) || 12);
}

export { CUSTOM_FONT_FILES };
