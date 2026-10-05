import { describe, expect, it } from 'vitest';
import {
  BASE_ATTENDEE_FIELDS,
  attendeeMatchesQuery,
  buildCsvDocument,
  exportFilename,
  filterAttendeeRows,
  formatExportDisplay,
  formatTableDisplay,
  getFieldValue,
  isSelfTicket,
  mapAttendeeExportMatrix,
  resolveAttendeeFields,
  sanitizeSpreadsheetValue,
  trimPhoneText,
} from './registrationAttendeeFields.js';

function field(id) {
  return BASE_ATTENDEE_FIELDS.find((item) => item.id === id);
}

function cell(row, id) {
  return getFieldValue(row, field(id));
}

const selfRow = {
  id: 'reg-self',
  user_name: 'Ada Buyer',
  user_email: 'ada@example.com',
  booked_for_name: null,
  booked_for_email: null,
  booked_for_phone: null,
  attendee_slot_key: '__self__',
  attendee_type: 'adult',
  attendee_age: null,
  booked_for_relation: null,
  guardian_phone: null,
  buyer_phone: '+260977000111',
  marketing_opt_in: 0,
  notes: '',
};

const guestRow = {
  id: 'reg-guest',
  user_name: 'Ada Buyer',
  user_email: 'ada@example.com',
  booked_for_name: 'Chisomo Guest',
  booked_for_email: 'chisomo@example.com',
  booked_for_phone: '0977123456',
  attendee_slot_key: 'chisomo guest::0',
  attendee_type: 'child',
  attendee_sex: 'female',
  attendee_age: 0,
  booked_for_relation: 'child',
  guardian_phone: '+260977123456',
  buyer_phone: '+260977000111',
  marketing_opt_in: 1,
  notes: 'Needs aisle seat, "front row"',
};

describe('registration attendee field catalog', () => {
  it('keeps guest answers on the guest row and payer answers on the self row', () => {
    expect(isSelfTicket(selfRow)).toBe(true);
    expect(isSelfTicket(guestRow)).toBe(false);

    expect(cell(selfRow, 'attendee_name').display).toBe('Ada Buyer');
    expect(cell(selfRow, 'attendee_email').display).toBe('ada@example.com');
    expect(cell(selfRow, 'attendee_phone').display).toBe('+260977000111');
    expect(formatTableDisplay(cell(selfRow, 'booked_for_relation'))).toBe('Not applicable');
    expect(formatTableDisplay(cell(selfRow, 'guardian_phone'))).toBe('Not applicable');
    expect(formatTableDisplay(cell(selfRow, 'attendee_age'))).toBe('Not applicable');
    expect(formatTableDisplay(cell(selfRow, 'marketing_opt_in'))).toBe('No');

    expect(cell(guestRow, 'attendee_name').display).toBe('Chisomo Guest');
    expect(cell(guestRow, 'attendee_email').display).toBe('chisomo@example.com');
    expect(cell(guestRow, 'attendee_phone').display).toBe('0977123456');
    expect(cell(guestRow, 'attendee_phone').display).not.toBe(selfRow.buyer_phone);
    expect(formatTableDisplay(cell(guestRow, 'attendee_age'))).toBe('0');
    expect(formatTableDisplay(cell(guestRow, 'marketing_opt_in'))).toBe('Yes');
  });

  it('preserves phone text including leading zeros, plus, blanks, and spacing', () => {
    expect(trimPhoneText('0977123456')).toBe('0977123456');
    expect(cell({ booked_for_phone: '0977123456', attendee_slot_key: 'g' }, 'attendee_phone').display).toBe('0977123456');
    expect(cell({ booked_for_phone: '+260977123456', attendee_slot_key: 'g' }, 'attendee_phone').display).toBe('+260977123456');
    expect(cell({ booked_for_phone: '+44 7700 900123', attendee_slot_key: 'g' }, 'attendee_phone').display).toBe('+44 7700 900123');
    expect(cell({ booked_for_phone: '0977 123 456 x12', attendee_slot_key: 'g' }, 'attendee_phone').display).toBe('0977 123 456 x12');
    expect(formatTableDisplay(cell({ booked_for_phone: '', attendee_slot_key: 'g' }, 'attendee_phone'))).toBe('—');
    expect(formatExportDisplay(cell({ booked_for_phone: '', attendee_slot_key: 'g' }, 'attendee_phone'))).toBe('');
  });

  it('keeps missing, explicit No, zero, and not-applicable distinct', () => {
    expect(formatTableDisplay(cell({ notes: '' }, 'notes'))).toBe('—');
    expect(formatExportDisplay(cell({ notes: '' }, 'notes'))).toBe('');
    expect(formatTableDisplay(cell({ marketing_opt_in: 0 }, 'marketing_opt_in'))).toBe('No');
    expect(formatTableDisplay(cell({ marketing_opt_in: null }, 'marketing_opt_in'))).toBe('—');
    expect(formatTableDisplay(cell({ attendee_type: 'child', attendee_age: 0 }, 'attendee_age'))).toBe('0');
    expect(formatTableDisplay(cell({ attendee_type: 'adult', attendee_age: null }, 'attendee_age'))).toBe('Not applicable');
    expect(formatExportDisplay(cell({ attendee_type: 'adult', attendee_age: null }, 'attendee_age'))).toBe('Not applicable');
  });

  it('unions historical stored keys without merging labels or exposing secrets', () => {
    const fields = resolveAttendeeFields([
      { ...guestRow, dietary: 'Vegetarian', password_hash: 'nope', verification_token: 'tok' },
    ]);
    const extra = fields.find((item) => item.id === 'extra:dietary');
    expect(extra.label).toContain('Dietary');
    expect(extra.historical).toBe(true);
    expect(extra.labelUncertain).toBe(true);
    expect(getFieldValue({ dietary: 'Vegetarian' }, extra).display).toBe('Vegetarian');
    expect(fields.some((item) => String(item.id).includes('password'))).toBe(false);
    expect(fields.some((item) => String(item.sourceKey || '').includes('token'))).toBe(false);
  });

  it('sanitises spreadsheet injection without using executable formulas for phones', () => {
    expect(sanitizeSpreadsheetValue('=HYPERLINK("http://evil")')).toBe("'=HYPERLINK(\"http://evil\")");
    expect(sanitizeSpreadsheetValue('+260977123456')).toBe("'+260977123456");
    expect(sanitizeSpreadsheetValue('-1+1')).toBe("'-1+1");
    expect(sanitizeSpreadsheetValue('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(formatExportDisplay(cell(guestRow, 'attendee_phone'), { format: 'xlsx', field: field('attendee_phone') }))
      .toBe('0977123456');
    expect(formatExportDisplay(cell(selfRow, 'attendee_phone'), { format: 'xlsx', field: field('attendee_phone') }))
      .toBe('+260977000111');
  });

  it('exports every catalog field even when some table columns are hidden', () => {
    const hidden = new Set(['notes', 'attendee_phone']);
    const visible = BASE_ATTENDEE_FIELDS.filter((item) => !hidden.has(item.id));
    expect(visible.some((item) => item.id === 'attendee_phone')).toBe(false);

    const { headers, rows } = mapAttendeeExportMatrix([guestRow, selfRow], BASE_ATTENDEE_FIELDS);
    expect(headers).toContain('Attendee phone');
    expect(headers).toContain('Notes');
    expect(rows).toHaveLength(2);
    const phoneIndex = headers.indexOf('Attendee phone');
    expect(rows[0][phoneIndex]).toBe('0977123456');
    expect(rows[1][phoneIndex]).toBe("'+260977000111");
  });

  it('escapes commas, quotes, newlines, and unicode in CSV', () => {
    const csv = buildCsvDocument(
      ['Name', 'Notes'],
      [['Mutale, Mwansa', 'Line 1\n"quoted" café']],
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Mutale, Mwansa"');
    expect(csv).toContain('"Line 1\n""quoted"" café"');
  });

  it('searches name, email, and phones across the full dataset', () => {
    const rows = [selfRow, guestRow, { id: 'other', user_name: 'Bwalya', user_email: 'b@x.com' }];
    expect(filterAttendeeRows(rows, { q: '0977123456' }).map((row) => row.id)).toEqual(['reg-guest']);
    expect(filterAttendeeRows(rows, { q: '+260977000111' }).map((row) => row.id)).toEqual(['reg-self', 'reg-guest']);
    expect(attendeeMatchesQuery(guestRow, 'chisomo@example.com')).toBe(true);
    expect(filterAttendeeRows(rows, { q: 'Ada', status: 'confirmed' })).toEqual([]);
  });

  it('builds a dated export filename from the event identity', () => {
    expect(exportFilename({ slug: 'Youth Summit', id: 'evt-1' }, 'xlsx', new Date('2026-10-05T08:00:00Z')))
      .toBe('attendees-youth-summit-2026-10-05.xlsx');
  });
});
