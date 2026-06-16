import { promises as fs } from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import {
  parseDesignJson,
  resolvePlaceholders,
  getCanvasDimensions,
  resolveBackgroundTheme,
} from './certificateDesign.js';
import { registerCertificatePdfFonts, applyCertificatePdfTextStyle } from './certificatePdfFonts.js';
import { CERTIFICATE_BUNDLED_LOGO_SRC } from './certificateBundledAssets.js';
import { drawCertificateBackgroundPdf, getBackgroundTheme, isImageBackgroundTheme } from './certificateBackgrounds.js';
import { buildCertificateQrDataUrl } from './certificateQr.js';
import { loadCertificateLogoDataUrl } from './certificateLogoAsset.js';
import { loadCertificateSealDataUrl, isBundledCertificateSealSrc } from './certificateSealAsset.js';
import { resolveCertificateBackgroundImageSrc } from './certificateBackgroundAssets.js';

function hexToRgb(hex) {
  const raw = String(hex || '#000000').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 0, g: 0, b: 0 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function extractUploadRelativePath(src) {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return '';
  const match = raw.match(/\/uploads\/([^?#\s]+)/i);
  if (match) return match[1];
  if (!raw.includes('://') && !raw.startsWith('data:')) {
    return raw.replace(/^\/+/, '').replace(/^uploads\//, '');
  }
  return '';
}

async function loadImageAsDataUrl(src, appRoot) {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (raw === CERTIFICATE_BUNDLED_LOGO_SRC) {
    return loadCertificateLogoDataUrl(appRoot);
  }
  if (isBundledCertificateSealSrc(raw)) {
    return loadCertificateSealDataUrl(raw);
  }
  if (raw.startsWith('data:')) return raw;

  const relative = extractUploadRelativePath(raw);
  if (relative && appRoot) {
    try {
      const absolute = path.join(appRoot, 'uploads', relative);
      const buffer = await fs.readFile(absolute);
      const ext = path.extname(relative).toLowerCase();
      const mime = ext === '.png' ? 'image/png'
        : ext === '.webp' ? 'image/webp'
          : ext === '.gif' ? 'image/gif'
            : 'image/jpeg';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      // fall through
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const res = await fetch(raw);
      if (!res.ok) return '';
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'image/png';
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch {
      return '';
    }
  }

  return '';
}

function applyTextStyle(doc, style = {}) {
  applyCertificatePdfTextStyle(doc, style);
  const { r, g, b } = hexToRgb(style.color || '#0B1D36');
  doc.setTextColor(r, g, b);
}

function drawTextElement(doc, element, pageW, pageH, text) {
  const x = (Number(element.x) || 0) * pageW;
  const y = (Number(element.y) || 0) * pageH;
  const width = (Number(element.width) || 0.4) * pageW;
  const style = element.style || {};
  const align = style.align || 'center';

  applyTextStyle(doc, style);
  const lines = doc.splitTextToSize(String(text || ''), width);
  const fontSize = Number(style.fontSize) || 12;
  const lineHeight = fontSize * 0.35;
  const blockHeight = lines.length * lineHeight;
  const startY = y - blockHeight / 2 + lineHeight;

  if (style.highlight) {
    const { r, g, b } = hexToRgb(style.highlight);
    doc.setFillColor(r, g, b);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lineWidth = doc.getTextWidth(line);
      let lineX = x;
      if (align === 'center') lineX = x - lineWidth / 2;
      else if (align === 'right') lineX = x - lineWidth;
      const padX = fontSize * 0.08;
      const padY = fontSize * 0.06;
      doc.rect(
        lineX - padX,
        startY + i * lineHeight - fontSize * 0.32 - padY,
        lineWidth + padX * 2,
        lineHeight,
        'F',
      );
    }
    applyTextStyle(doc, style);
  }

  doc.text(lines, x, startY, { align, maxWidth: width });

  if (style.underline) {
    const { r, g, b } = hexToRgb(style.color || '#0B1D36');
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(Math.max(0.2, fontSize * 0.02));
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lineWidth = doc.getTextWidth(line);
      let lineX = x;
      if (align === 'center') lineX = x - lineWidth / 2;
      else if (align === 'right') lineX = x - lineWidth;
      const underlineY = startY + i * lineHeight + fontSize * 0.08;
      doc.line(lineX, underlineY, lineX + lineWidth, underlineY);
    }
  }
}

async function drawImageElement(doc, element, pageW, pageH, dataUrl) {
  if (!dataUrl) return;
  const x = ((Number(element.x) || 0) - (Number(element.width) || 0.1) / 2) * pageW;
  const y = ((Number(element.y) || 0) - (Number(element.height) || 0.1) / 2) * pageH;
  const w = (Number(element.width) || 0.1) * pageW;
  const h = (Number(element.height) || 0.1) * pageH;
  const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
  try {
    doc.addImage(dataUrl, format, x, y, w, h);
  } catch {
    // Skip invalid or unreadable image data (e.g. corrupt uploads).
  }
}

/**
 * @param {object} template - DB template row or API object with design_json, orientation, paper_size, background_image
 * @param {Record<string, string>} data - Resolved placeholder values
 * @param {{ appOrigin?: string, appRoot?: string, qrDataUrl?: string }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function generateCertificatePdfFromTemplate(template, data = {}, opts = {}) {
  const design = parseDesignJson(template?.design_json);
  if (!design) {
    throw new Error('Certificate template design is invalid.');
  }

  const orientation = template?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const paperSize = String(template?.paper_size || 'A4');
  const canvas = design.canvas || getCanvasDimensions(orientation, paperSize);

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: paperSize.toLowerCase() === 'a4' ? 'a4' : 'a4',
  });

  const appRoot = opts.appRoot || process.cwd();
  await registerCertificatePdfFonts(doc, appRoot);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const appOrigin = opts.appOrigin || '';

  const bgTheme = resolveBackgroundTheme(design, template);
  if (bgTheme && isImageBackgroundTheme(bgTheme)) {
    const theme = getBackgroundTheme(bgTheme);
    const frameDataUrl = await resolveCertificateBackgroundImageSrc(theme.imageSrc, appRoot);
    if (frameDataUrl) {
      try {
        doc.addImage(frameDataUrl, 'PNG', 0, 0, pageW, pageH);
      } catch {
        drawCertificateBackgroundPdf(doc, pageW, pageH, 'elegant-gold');
      }
    } else {
      drawCertificateBackgroundPdf(doc, pageW, pageH, 'elegant-gold');
    }
  } else if (bgTheme) {
    drawCertificateBackgroundPdf(doc, pageW, pageH, bgTheme);
  } else if (template?.background_image) {
    const bgDataUrl = await loadImageAsDataUrl(template.background_image, appRoot);
    if (bgDataUrl) {
      const format = bgDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      try {
        doc.addImage(bgDataUrl, format, 0, 0, pageW, pageH);
      } catch {
        drawCertificateBackgroundPdf(doc, pageW, pageH, 'elegant-gold');
      }
    } else {
      drawCertificateBackgroundPdf(doc, pageW, pageH, 'elegant-gold');
    }
  } else {
    drawCertificateBackgroundPdf(doc, pageW, pageH, 'elegant-gold');
  }

  let qrDataUrl = opts.qrDataUrl || '';
  if (!qrDataUrl && data.certificate_number && appOrigin) {
    qrDataUrl = await buildCertificateQrDataUrl(data.certificate_number, appOrigin, {
      size: Math.round(Math.min(pageW, pageH) * 12),
    });
  }

  const elements = Array.isArray(design.elements) ? design.elements : [];

  for (const element of elements) {
    if (element.type === 'qr') {
      await drawImageElement(doc, element, pageW, pageH, qrDataUrl);
      continue;
    }

    if (element.type === 'image') {
      const imgDataUrl = await loadImageAsDataUrl(element.src, appRoot);
      await drawImageElement(doc, element, pageW, pageH, imgDataUrl);
      continue;
    }

    if (element.type === 'placeholder') {
      const key = element.key || 'attendee_name';
      if (key === 'qr_code') {
        await drawImageElement(doc, element, pageW, pageH, qrDataUrl);
        continue;
      }
      const value = data[key] ?? resolvePlaceholders(`{{${key}}}`, data);
      drawTextElement(doc, element, pageW, pageH, value);
      continue;
    }

    if (element.type === 'text') {
      const text = resolvePlaceholders(element.content || '', data);
      drawTextElement(doc, element, pageW, pageH, text);
    }
  }

  return Buffer.from(doc.output('arraybuffer'));
}

export function isValidCertificatePdfBuffer(buffer) {
  if (!buffer || buffer.byteLength < 100) return false;
  const head = Buffer.from(buffer.slice(0, 5)).toString('ascii');
  return head === '%PDF-';
}
