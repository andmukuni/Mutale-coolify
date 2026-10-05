import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { resolveRouteAdminPermission } from '../rbacService.js';
import {
  assembleAttendeeList,
  buildAttendeeExportBuffer,
  exportEventAttendees,
  listEventAttendees,
  snapshotBuyerPhone,
  snapshotMarketingOptIn,
} from '../registrationAttendeeService.js';

function createPool({ events = [], registrations = [], users = [], preferences = [], audits = [] } = {}) {
  return {
    audits,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('FROM events')) {
        return [events.filter((event) => event.id === params[0])];
      }
      if (text.includes('FROM event_registrations')) {
        const eventId = params[0];
        const rows = registrations
          .filter((row) => row.event_id === eventId)
          .map((row) => {
            const user = users.find((item) => item.id === row.user_id);
            const email = String(row.booked_for_email || row.user_email || '').trim().toLowerCase();
            const pref = preferences.find((item) => item.email_normalized === email);
            return {
              ...row,
              account_phone: user?.phone || null,
              current_marketing_opt_in: pref?.marketing_opt_in ?? null,
            };
          });
        return [rows];
      }
      if (text.includes('INSERT INTO email_audit_log')) {
        audits.push({
          id: params[0],
          actor_id: params[1],
          action: params[2],
          campaign_id: params[3],
          resource_id: params[4],
          detail: params[5],
        });
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
}

const event = { id: 'evt-1', title: 'Youth Summit', slug: 'youth-summit' };
const otherEvent = { id: 'evt-2', title: 'Other', slug: 'other' };

const selfRow = {
  id: 'reg-self',
  event_id: 'evt-1',
  user_id: 'user-ada',
  user_name: 'Ada Buyer',
  user_email: 'ada@example.com',
  booked_for_name: null,
  booked_for_email: null,
  booked_for_phone: null,
  attendee_slot_key: '__self__',
  attendee_type: 'adult',
  attendee_age: null,
  marketing_opt_in: 0,
  buyer_phone: '+260977000111',
  status: 'confirmed',
  payment_status: 'paid',
  notes: '=CMD()',
  reference_code: 'TKT-SELF',
  registered_at: '2026-10-01 10:00:00',
};

const guestRow = {
  id: 'reg-guest',
  event_id: 'evt-1',
  user_id: 'user-ada',
  user_name: 'Ada Buyer',
  user_email: 'ada@example.com',
  booked_for_name: 'Chisomo Guest',
  booked_for_email: 'chisomo@example.com',
  booked_for_phone: '0977123456',
  attendee_slot_key: 'chisomo guest::0',
  attendee_type: 'child',
  attendee_age: 0,
  guardian_phone: '+44 7700 900123',
  marketing_opt_in: 1,
  buyer_phone: '+260977000111',
  status: 'confirmed',
  payment_status: 'unpaid',
  notes: 'Line 1\n"quoted", café',
  reference_code: 'TKT-GUEST',
  registered_at: '2026-10-01 10:01:00',
};

const otherEventRow = {
  ...guestRow,
  id: 'reg-other',
  event_id: 'evt-2',
  booked_for_phone: '0999000000',
};

describe('attendee snapshots and RBAC', () => {
  it('snapshots marketing and buyer phone without inventing or normalising', () => {
    expect(snapshotMarketingOptIn({ marketing_opt_in: true })).toBe(1);
    expect(snapshotMarketingOptIn({ marketingOptIn: false })).toBe(0);
    expect(snapshotMarketingOptIn({})).toBeNull();
    expect(snapshotBuyerPhone({ phone: '0977123456' }, { phone: '260977123456' })).toBe('0977123456');
    expect(snapshotBuyerPhone({}, { phone: '+260977000111' })).toBe('+260977000111');
    expect(snapshotBuyerPhone({}, {})).toBeNull();
  });

  it('maps attendee routes to events.view', () => {
    expect(resolveRouteAdminPermission({ path: '/api/admin/events/evt-1/attendees', method: 'GET' })).toBe('events.view');
    expect(resolveRouteAdminPermission({
      path: '/api/admin/events/evt-1/attendees/export',
      method: 'POST',
    })).toBe('events.view');
  });
});

describe('event-scoped attendee list and export', () => {
  const pool = createPool({
    events: [event, otherEvent],
    registrations: [selfRow, guestRow, otherEventRow],
    users: [{ id: 'user-ada', phone: '0966123456' }],
    preferences: [{ email_normalized: 'ada@example.com', marketing_opt_in: 1 }],
  });

  it('lists only the requested event and keeps guest phones on the guest row', async () => {
    const listed = await listEventAttendees(pool, 'evt-1');
    expect(listed.rows.map((row) => row.id).sort()).toEqual(['reg-guest', 'reg-self']);
    expect(listed.rows.some((row) => row.event_id === 'evt-2')).toBe(false);
    const guest = listed.rows.find((row) => row.id === 'reg-guest');
    expect(guest.booked_for_phone).toBe('0977123456');
    expect(guest.account_phone).toBe('0966123456');
  });

  it('returns 404 when the event does not exist', async () => {
    await expect(listEventAttendees(pool, 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('exports all, filtered, and selected counts from the full event set', async () => {
    const all = await exportEventAttendees(pool, { eventId: 'evt-1', scope: 'all', format: 'csv', actorId: 'admin-1' });
    expect(all.count).toBe(2);
    expect(all.filename).toMatch(/^attendees-youth-summit-\d{4}-\d{2}-\d{2}\.csv$/);

    const filtered = await exportEventAttendees(pool, {
      eventId: 'evt-1',
      scope: 'filtered',
      format: 'csv',
      q: '0977123456',
    });
    expect(filtered.count).toBe(1);
    expect(filtered.buffer.toString('utf8')).toContain('0977123456');
    expect(filtered.buffer.toString('utf8')).not.toContain('0999000000');

    const selected = await exportEventAttendees(pool, {
      eventId: 'evt-1',
      scope: 'selected',
      format: 'csv',
      ids: ['reg-self'],
    });
    expect(selected.count).toBe(1);
    expect(selected.buffer.toString('utf8')).toContain('Ada Buyer');
  });

  it('writes an audit row without exported personal data', async () => {
    const audits = [];
    const auditPool = createPool({
      events: [event],
      registrations: [selfRow, guestRow],
      audits,
    });
    await exportEventAttendees(auditPool, {
      eventId: 'evt-1',
      scope: 'filtered',
      format: 'xlsx',
      q: '0977123456',
      actorId: 'admin-1',
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('attendees.exported');
    expect(audits[0].resource_id).toBe('evt-1');
    expect(audits[0].detail).toContain('scope=filtered');
    expect(audits[0].detail).toContain('count=1');
    expect(audits[0].detail).not.toContain('0977123456');
    expect(audits[0].detail).not.toContain('ada@example.com');
  });

  it('protects formula-like notes and formats xlsx phones as text', async () => {
    const csv = await exportEventAttendees(pool, { eventId: 'evt-1', scope: 'all', format: 'csv' });
    expect(csv.buffer.toString('utf8')).toContain("'=CMD()");

    const xlsx = await exportEventAttendees(pool, { eventId: 'evt-1', scope: 'selected', format: 'xlsx', ids: ['reg-guest'] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.buffer);
    const sheet = workbook.worksheets[0];
    const headers = sheet.getRow(1).values.slice(1);
    const phoneIndex = headers.indexOf('Attendee phone') + 1;
    const phoneCell = sheet.getRow(2).getCell(phoneIndex);
    expect(phoneCell.numFmt).toBe('@');
    expect(String(phoneCell.value)).toBe('0977123456');
  });

  it('keeps hidden-column-independent full field exports', () => {
    const assembled = assembleAttendeeList([selfRow, guestRow], { q: '0977123456' });
    expect(assembled.total).toBe(1);
    expect(assembled.fields.some((field) => field.id === 'attendee_phone')).toBe(true);
    expect(assembled.fields.some((field) => field.id === 'notes')).toBe(true);
  });
});

describe('export buffer helpers', () => {
  it('includes every catalog field in the generated csv', async () => {
    const built = await buildAttendeeExportBuffer({
      event,
      allRows: [selfRow, guestRow],
      exportRows: [guestRow],
      format: 'csv',
    });
    const text = built.buffer.toString('utf8');
    expect(text).toContain('Attendee phone');
    expect(text).toContain('Marketing opt-in (at registration)');
    expect(text).toContain('0977123456');
    expect(text).toContain('café');
  });
});
