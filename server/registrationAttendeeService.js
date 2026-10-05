import ExcelJS from 'exceljs';
import { writeAudit } from './emailCampaignService.js';
import {
  buildCsvDocument,
  exportFilename,
  filterAttendeeRows,
  formatExportDisplay,
  getFieldValue,
  mapAttendeeExportMatrix,
  resolveAttendeeFields,
} from '../shared/registrationAttendeeFields.js';

export function snapshotMarketingOptIn(incoming = {}) {
  const raw = incoming?.marketing_opt_in ?? incoming?.marketingOptIn;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw === 'number') return raw === 1 ? 1 : 0;
  const value = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return 1;
  if (['0', 'false', 'no', 'off'].includes(value)) return 0;
  return null;
}

export function snapshotBuyerPhone(incoming = {}, authUser = {}) {
  const submitted = String(incoming?.buyer_phone || incoming?.phone || incoming?.buyerPhone || '').trim();
  if (submitted) return submitted;
  return String(authUser?.phone || '').trim() || null;
}

function applyRegistrationSnapshots(payload, incoming, authUser) {
  return {
    ...payload,
    marketing_opt_in: snapshotMarketingOptIn(incoming),
    buyer_phone: snapshotBuyerPhone(incoming, authUser),
  };
}

export { applyRegistrationSnapshots };

function normalizeListedRow(row = {}) {
  return {
    ...row,
    account_phone: row.account_phone ?? null,
    current_marketing_opt_in: row.current_marketing_opt_in ?? null,
  };
}

export async function loadEventAttendeeRows(pool, eventId) {
  const id = String(eventId || '').trim();
  const [[event]] = await pool.query(
    'SELECT id, title, slug FROM events WHERE id = ? LIMIT 1',
    [id],
  );
  if (!event) {
    const error = new Error('Event not found.');
    error.status = 404;
    throw error;
  }

  const [rows] = await pool.query(
    `SELECT
       r.*,
       u.phone AS account_phone,
       pref.marketing_opt_in AS current_marketing_opt_in
     FROM event_registrations r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN email_preferences pref
       ON pref.email_normalized = LOWER(TRIM(COALESCE(NULLIF(r.booked_for_email, ''), r.user_email)))
     WHERE r.event_id = ?
     ORDER BY r.registered_at DESC, r.created_at DESC`,
    [id],
  );

  return {
    event,
    rows: (rows || []).map(normalizeListedRow),
  };
}

export function assembleAttendeeList(rows, filters = {}) {
  const fields = resolveAttendeeFields(rows);
  const filtered = filterAttendeeRows(rows, filters);
  return {
    fields,
    rows: filtered,
    total: filtered.length,
    unfiltered_total: rows.length,
  };
}

export async function listEventAttendees(pool, eventId, filters = {}) {
  const { event, rows } = await loadEventAttendeeRows(pool, eventId);
  return {
    event,
    ...assembleAttendeeList(rows, filters),
  };
}

export async function getEventAttendee(pool, eventId, registrationId) {
  const { event, rows } = await loadEventAttendeeRows(pool, eventId);
  const row = rows.find((item) => String(item.id) === String(registrationId));
  if (!row) {
    const error = new Error('Attendee record not found.');
    error.status = 404;
    throw error;
  }
  return {
    event,
    fields: resolveAttendeeFields(rows),
    row,
  };
}

function resolveExportRows(allRows, { scope = 'all', q, status, payment_status, attended, ids } = {}) {
  const normalizedScope = String(scope || 'all').trim().toLowerCase();
  if (normalizedScope === 'selected') {
    const selectedIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
    if (!selectedIds.length) {
      const error = new Error('Select at least one attendee to export.');
      error.status = 400;
      throw error;
    }
    return {
      scope: 'selected',
      rows: filterAttendeeRows(allRows, { ids: selectedIds }),
    };
  }
  if (normalizedScope === 'filtered') {
    return {
      scope: 'filtered',
      rows: filterAttendeeRows(allRows, { q, status, payment_status, attended }),
    };
  }
  return { scope: 'all', rows: allRows };
}

export async function buildXlsxBuffer(fields, registrations) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mutale';
  const sheet = workbook.addWorksheet('Attendees', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = fields.map((field) => ({
    header: field.label,
    width: Math.min(40, Math.max(14, Math.round((field.minWidth || 140) / 8))),
  }));

  for (const row of registrations) {
    const values = fields.map((field) => {
      const cell = getFieldValue(row, field);
      return formatExportDisplay(cell, { format: 'xlsx', field });
    });
    const added = sheet.addRow(values);
    fields.forEach((field, index) => {
      const excelCell = added.getCell(index + 1);
      if (field.type === 'phone') {
        excelCell.numFmt = '@';
        const raw = formatExportDisplay(getFieldValue(row, field), { sanitize: false, format: 'xlsx', field });
        const safe = formatExportDisplay(getFieldValue(row, field), { format: 'xlsx', field });
        excelCell.value = raw && !/^[=@\t\r-]/.test(raw) ? String(raw) : String(safe);
      }
    });
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildAttendeeExportBuffer({ event, allRows, exportRows, format = 'csv' }) {
  const fields = resolveAttendeeFields(allRows);
  const normalizedFormat = String(format || 'csv').trim().toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
  const filename = exportFilename(event, normalizedFormat);
  if (normalizedFormat === 'xlsx') {
    const buffer = await buildXlsxBuffer(fields, exportRows);
    return {
      filename,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
      count: exportRows.length,
      fields,
    };
  }
  const { headers, rows } = mapAttendeeExportMatrix(exportRows, fields, { format: 'csv' });
  return {
    filename,
    mime: 'text/csv; charset=utf-8',
    buffer: Buffer.from(buildCsvDocument(headers, rows), 'utf8'),
    count: exportRows.length,
    fields,
  };
}

export async function exportEventAttendees(pool, {
  eventId,
  scope = 'all',
  format = 'csv',
  q = '',
  status = '',
  payment_status = '',
  attended = '',
  ids = [],
  actorId = null,
} = {}) {
  const { event, rows: allRows } = await loadEventAttendeeRows(pool, eventId);
  const resolved = resolveExportRows(allRows, { scope, q, status, payment_status, attended, ids });
  const built = await buildAttendeeExportBuffer({
    event,
    allRows,
    exportRows: resolved.rows,
    format,
  });

  try {
    await writeAudit(pool, {
      actorId,
      action: 'attendees.exported',
      resourceId: String(event.id),
      detail: `scope=${resolved.scope} format=${format === 'xlsx' ? 'xlsx' : 'csv'} count=${built.count}`,
    });
  } catch (error) {
    console.warn('[attendees-export] audit skipped:', error.message);
  }

  return {
    ...built,
    event,
    scope: resolved.scope,
  };
}
