import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { jsPDF } from 'jspdf';
import {
  isEventEnded,
  isRegistrationEligibleForCertificate,
  getEventTimeBounds,
} from './certificateEligibility.js';
import {
  getActiveTemplateForEvent,
  eventHasActiveTemplate,
  mapDbTemplate,
} from './certificateTemplateService.js';
import { generateCertificatePdfFromTemplate } from '../shared/certificatePdf.js';
import { formatEventDateRange } from '../shared/certificateDesign.js';

const NAVY = '#0B1D36';
const CYAN = '#06B6D4';
const GREY = '#64748B';

const CHUNK_SIZE = 50;

export function buildCertificateCode() {
  const part = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `MM-CERT-${part}`;
}

export function mapDbCertificate(row) {
  if (!row) return null;
  return {
    id: row.id,
    certificate_code: row.certificate_code,
    event_id: row.event_id,
    registration_id: row.registration_id,
    user_id: row.user_id,
    attendee_name: row.attendee_name,
    attendee_email: row.attendee_email,
    event_title: row.event_title,
    event_end_date: row.event_end_date,
    pdf_path: row.pdf_path,
    certificate_template_id: row.certificate_template_id || null,
    issued_at: row.issued_at,
    email_status: row.email_status,
    email_sent_at: row.email_sent_at,
    email_error: row.email_error,
    revoked: Boolean(row.revoked),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return '—';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue);
  return d.toLocaleDateString('en-ZM', { day: 'numeric', month: 'long', year: 'numeric' });
}

function resolveAppOrigin() {
  return String(process.env.APP_ORIGIN || process.env.VITE_APP_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function buildCertificateRenderData({
  attendeeName,
  eventTitle,
  eventDates,
  issuedAt,
  certificateCode,
}) {
  return {
    attendee_name: attendeeName,
    event_name: eventTitle,
    event_date: eventDates,
    certificate_number: certificateCode,
    issue_date: formatDisplayDate(issuedAt),
  };
}

export function generateCertificatePdfBuffer({
  attendeeName,
  eventTitle,
  eventDates,
  issuedAt,
  certificateCode,
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  doc.setFillColor(NAVY);
  doc.rect(0, 0, pw, ph, 'F');

  doc.setDrawColor(CYAN);
  doc.setLineWidth(1.2);
  doc.rect(12, 12, pw - 24, ph - 24);

  doc.setDrawColor('#FFFFFF');
  doc.setLineWidth(0.4);
  doc.rect(16, 16, pw - 32, ph - 32);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(CYAN);
  doc.text('MUTALE MUBANGA', pw / 2, 32, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#94A3B8');
  doc.text('Certificate of Attendance', pw / 2, 40, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor('#FFFFFF');
  doc.text(String(attendeeName || 'Attendee'), pw / 2, 72, { align: 'center', maxWidth: pw - 50 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor('#CBD5E1');
  doc.text('has successfully attended', pw / 2, 88, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(CYAN);
  const titleLines = doc.splitTextToSize(String(eventTitle || 'Event'), pw - 60);
  doc.text(titleLines, pw / 2, 102, { align: 'center' });

  const detailsY = 102 + titleLines.length * 8 + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor('#E2E8F0');
  doc.text(`Event dates: ${eventDates || '—'}`, pw / 2, detailsY, { align: 'center' });
  doc.text(`Issued: ${formatDisplayDate(issuedAt)}`, pw / 2, detailsY + 8, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(GREY);
  doc.text(`Certificate ID: ${certificateCode}`, pw / 2, ph - 22, { align: 'center' });
  doc.text('mutalemubanga.org', pw / 2, ph - 14, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
}

async function generateCertificatePdf({
  pool,
  event,
  template,
  attendeeName,
  eventTitle,
  eventDates,
  issuedAt,
  certificateCode,
  appRoot,
}) {
  if (template) {
    const data = buildCertificateRenderData({
      attendeeName,
      eventTitle,
      eventDates,
      issuedAt,
      certificateCode,
    });
    return generateCertificatePdfFromTemplate(template, data, {
      appRoot,
      appOrigin: resolveAppOrigin(),
    });
  }

  return generateCertificatePdfBuffer({
    attendeeName,
    eventTitle,
    eventDates,
    issuedAt,
    certificateCode,
  });
}

export async function writeCertificateFile(buffer, certificateCode, appRoot) {
  const dir = path.join(appRoot, 'uploads', 'certificates');
  await fs.mkdir(dir, { recursive: true });
  const safeCode = String(certificateCode).replace(/[^a-zA-Z0-9-]/g, '');
  const filename = `${safeCode}.pdf`;
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, buffer);
  return {
    absolutePath,
    relativePath: `certificates/${filename}`,
  };
}

/** Return absolute PDF path, regenerating the file on disk if it was removed. */
export async function ensureCertificatePdfOnDisk(certRow, appRoot, pool = null) {
  if (!certRow?.certificate_code) {
    throw new Error('Certificate record is invalid.');
  }

  const relativePath = String(certRow.pdf_path || `certificates/${certRow.certificate_code}.pdf`);
  const absolutePath = path.join(appRoot, 'uploads', relativePath);

  try {
    await fs.access(absolutePath);
    return absolutePath;
  } catch {
    // File missing — rebuild from stored metadata.
  }

  let eventDates = '—';
  let event = null;
  if (pool && certRow.event_id) {
    const [[evt]] = await pool.query('SELECT * FROM events WHERE id = ?', [certRow.event_id]);
    event = evt;
    if (event) eventDates = formatEventDateRange(event);
  } else if (certRow.event_end_date) {
    eventDates = formatDisplayDate(certRow.event_end_date);
  }

  let template = null;
  if (pool && certRow.certificate_template_id) {
    const [[tplRow]] = await pool.query(
      'SELECT * FROM certificate_templates WHERE id = ? LIMIT 1',
      [certRow.certificate_template_id],
    );
    if (tplRow) template = mapDbTemplate(tplRow);
  }

  const buffer = await generateCertificatePdf({
    pool,
    event,
    template,
    attendeeName: certRow.attendee_name,
    eventTitle: certRow.event_title,
    eventDates,
    issuedAt: certRow.issued_at,
    certificateCode: certRow.certificate_code,
    appRoot,
  });

  const written = await writeCertificateFile(buffer, certRow.certificate_code, appRoot);
  if (pool && written.relativePath !== relativePath) {
    await pool.query('UPDATE event_certificates SET pdf_path = ? WHERE id = ?', [
      written.relativePath,
      certRow.id,
    ]);
  }
  return written.absolutePath;
}

function resolveAttendeeName(reg, user) {
  const booked = String(reg.booked_for_name || '').trim();
  if (booked) return booked;
  return String(reg.user_name || user?.name || 'Attendee').trim();
}

function resolveAttendeeEmail(reg, user) {
  return String(reg.user_email || user?.email || '').trim();
}

export async function issueCertificateForRegistration(pool, registrationId, appRoot) {
  const [[existing]] = await pool.query(
    'SELECT id FROM event_certificates WHERE registration_id = ? LIMIT 1',
    [registrationId],
  );
  if (existing?.id) {
    const [[row]] = await pool.query('SELECT * FROM event_certificates WHERE id = ?', [existing.id]);
    return { status: 'exists', certificate: mapDbCertificate(row) };
  }

  const [[reg]] = await pool.query('SELECT * FROM event_registrations WHERE id = ?', [registrationId]);
  if (!reg) return { status: 'error', reason: 'Registration not found.' };
  if (!isRegistrationEligibleForCertificate(reg)) {
    return { status: 'skipped', reason: 'Registration not eligible (must be attended, not cancelled).' };
  }

  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [reg.event_id]);
  if (!event) return { status: 'error', reason: 'Event not found.' };
  if (!isEventEnded(event)) {
    return { status: 'skipped', reason: 'Event has not ended yet.' };
  }

  const template = await getActiveTemplateForEvent(pool, reg.event_id);
  if (!template) {
    return { status: 'skipped', reason: 'Certificate template not activated for this event.' };
  }

  const [[user]] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [reg.user_id]);

  const certificateCode = buildCertificateCode();
  const issuedAt = new Date();
  const { end } = getEventTimeBounds(event);
  const eventEndDate = end ? end.toISOString().slice(0, 10) : (event.end_date || event.start_date || null);

  const attendeeName = resolveAttendeeName(reg, user);
  const attendeeEmail = resolveAttendeeEmail(reg, user);
  const eventTitle = String(reg.event_title || event.title || 'Event');
  const eventDates = formatEventDateRange(event);

  const pdfBuffer = await generateCertificatePdf({
    pool,
    event,
    template,
    attendeeName,
    eventTitle,
    eventDates,
    issuedAt: issuedAt.toISOString(),
    certificateCode,
    appRoot,
  });

  const { relativePath } = await writeCertificateFile(pdfBuffer, certificateCode, appRoot);
  const certId = `cert-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  await pool.query(
    `INSERT INTO event_certificates (
      id, certificate_code, event_id, registration_id, user_id,
      attendee_name, attendee_email, event_title, event_end_date,
      pdf_path, issued_at, email_status, certificate_template_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      certId,
      certificateCode,
      reg.event_id,
      reg.id,
      reg.user_id,
      attendeeName,
      attendeeEmail || null,
      eventTitle,
      eventEndDate,
      relativePath,
      issuedAt,
      template.id,
    ],
  );

  const [[row]] = await pool.query('SELECT * FROM event_certificates WHERE id = ?', [certId]);
  return { status: 'issued', certificate: mapDbCertificate(row) };
}

export async function sendCertificateEmailForRow(pool, certRow, appRoot, sendEmailWithAttachments, getSystemSettings) {
  if (!certRow?.attendee_email) {
    await pool.query(
      'UPDATE event_certificates SET email_status = ?, email_error = ? WHERE id = ?',
      ['skipped', 'No recipient email.', certRow.id],
    );
    return { status: 'skipped' };
  }

  let absolutePath;
  try {
    absolutePath = await ensureCertificatePdfOnDisk(certRow, appRoot, pool);
  } catch {
    await pool.query(
      'UPDATE event_certificates SET email_status = ?, email_error = ? WHERE id = ?',
      ['failed', 'PDF file missing.', certRow.id],
    );
    return { status: 'failed' };
  }

  const settings = await getSystemSettings();
  const subject = `Your certificate: ${certRow.event_title}`;
  const text = [
    `Dear ${certRow.attendee_name},`,
    '',
    `Thank you for attending "${certRow.event_title}".`,
    'Your certificate of attendance is attached to this email.',
    '',
    `Certificate ID: ${certRow.certificate_code}`,
    '',
    'Best regards,',
    'Mutale Mubanga',
  ].join('\n');

  const html = `
    <p>Dear ${certRow.attendee_name},</p>
    <p>Thank you for attending <strong>${certRow.event_title}</strong>.</p>
    <p>Your certificate of attendance is attached to this email.</p>
    <p><strong>Certificate ID:</strong> ${certRow.certificate_code}</p>
    <p>Best regards,<br/>Mutale Mubanga</p>
  `;

  const result = await sendEmailWithAttachments({
    settings,
    to: certRow.attendee_email,
    subject,
    text,
    html,
    attachments: [{
      filename: `Certificate-${certRow.certificate_code}.pdf`,
      path: absolutePath,
    }],
  });

  if (result?.status === 'sent') {
    await pool.query(
      'UPDATE event_certificates SET email_status = ?, email_sent_at = NOW(), email_error = NULL WHERE id = ?',
      ['sent', certRow.id],
    );
    return { status: 'sent' };
  }

  const errMsg = result?.reason || 'Email delivery failed.';
  await pool.query(
    'UPDATE event_certificates SET email_status = ?, email_error = ? WHERE id = ?',
    ['failed', errMsg, certRow.id],
  );
  return { status: 'failed', reason: errMsg };
}

export async function processEndedEventCertificates(pool, appRoot, deps = {}) {
  const { sendEmailWithAttachments, getSystemSettings } = deps;
  const summary = { issued: 0, emailed: 0, skipped: 0, errors: 0, existed: 0 };

  const [events] = await pool.query('SELECT * FROM events');
  const endedEvents = events.filter((e) => isEventEnded(e) && String(e.status || '').toLowerCase() !== 'cancelled');

  for (const event of endedEvents) {
    const hasTemplate = await eventHasActiveTemplate(pool, event.id);
    if (!hasTemplate) continue;

    const [regs] = await pool.query(
      `SELECT r.* FROM event_registrations r
       LEFT JOIN event_certificates c ON c.registration_id = r.id
       WHERE r.event_id = ? AND c.id IS NULL`,
      [event.id],
    );

    const eligible = regs.filter(isRegistrationEligibleForCertificate);
    for (let i = 0; i < eligible.length; i += CHUNK_SIZE) {
      const chunk = eligible.slice(i, i + CHUNK_SIZE);
      for (const reg of chunk) {
        try {
          const outcome = await issueCertificateForRegistration(pool, reg.id, appRoot);
          if (outcome.status === 'issued') {
            summary.issued += 1;
            if (sendEmailWithAttachments && getSystemSettings && outcome.certificate) {
              const emailOutcome = await sendCertificateEmailForRow(
                pool,
                outcome.certificate,
                appRoot,
                sendEmailWithAttachments,
                getSystemSettings,
              );
              if (emailOutcome.status === 'sent') summary.emailed += 1;
            }
          } else if (outcome.status === 'exists') {
            summary.existed += 1;
            if (sendEmailWithAttachments && getSystemSettings && outcome.certificate?.email_status === 'pending') {
              const emailOutcome = await sendCertificateEmailForRow(
                pool,
                outcome.certificate,
                appRoot,
                sendEmailWithAttachments,
                getSystemSettings,
              );
              if (emailOutcome.status === 'sent') summary.emailed += 1;
            }
          } else if (outcome.status === 'skipped') {
            summary.skipped += 1;
          } else {
            summary.errors += 1;
          }
        } catch (err) {
          summary.errors += 1;
          console.error('[certificates] issue failed for registration', reg.id, err.message);
        }
      }
    }
  }

  const [pendingEmail] = await pool.query(
    `SELECT * FROM event_certificates WHERE email_status = 'pending' AND revoked = 0 ORDER BY issued_at ASC LIMIT 100`,
  );
  if (sendEmailWithAttachments && getSystemSettings) {
    for (const row of pendingEmail) {
      try {
        const emailOutcome = await sendCertificateEmailForRow(
          pool,
          mapDbCertificate(row),
          appRoot,
          sendEmailWithAttachments,
          getSystemSettings,
        );
        if (emailOutcome.status === 'sent') summary.emailed += 1;
      } catch (err) {
        summary.errors += 1;
        console.error('[certificates] email failed', row.id, err.message);
      }
    }
  }

  return summary;
}

export async function processEventCertificates(pool, eventId, appRoot, deps = {}) {
  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) return { ok: false, message: 'Event not found.' };
  if (!isEventEnded(event)) return { ok: false, message: 'Event has not ended yet.' };

  const hasTemplate = await eventHasActiveTemplate(pool, eventId);
  if (!hasTemplate) {
    return { ok: false, message: 'Certificate template is not active for this event.' };
  }

  const [regs] = await pool.query('SELECT * FROM event_registrations WHERE event_id = ?', [eventId]);
  const eligible = regs.filter(isRegistrationEligibleForCertificate);
  let issued = 0;
  let emailed = 0;
  let skipped = 0;

  const { sendEmailWithAttachments, getSystemSettings } = deps;

  for (const reg of eligible) {
    const outcome = await issueCertificateForRegistration(pool, reg.id, appRoot);
    if (outcome.status === 'issued') {
      issued += 1;
      if (sendEmailWithAttachments && getSystemSettings && outcome.certificate) {
        const e = await sendCertificateEmailForRow(
          pool,
          outcome.certificate,
          appRoot,
          sendEmailWithAttachments,
          getSystemSettings,
        );
        if (e.status === 'sent') emailed += 1;
      }
    } else if (outcome.status === 'exists' && outcome.certificate?.email_status === 'pending') {
      if (sendEmailWithAttachments && getSystemSettings) {
        const e = await sendCertificateEmailForRow(
          pool,
          outcome.certificate,
          appRoot,
          sendEmailWithAttachments,
          getSystemSettings,
        );
        if (e.status === 'sent') emailed += 1;
      }
    } else if (outcome.status === 'skipped') {
      skipped += 1;
    }
  }

  return { ok: true, issued, emailed, skipped, eligible: eligible.length };
}

export { isEventEnded, isRegistrationEligibleForCertificate };
