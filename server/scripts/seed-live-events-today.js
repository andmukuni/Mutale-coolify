#!/usr/bin/env node
/**
 * Seed a paid event live today and republish all past events as live today.
 *
 * Uses direct SQL (PUT /api/events blocks edits on ended events).
 *
 * Usage:
 *   node server/scripts/seed-live-events-today.js
 *   bash scripts/coolify-seed.sh   # then inside container:
 *   node server/scripts/seed-live-events-today.js
 *
 * Env: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (same as API server).
 */

import pool from '../db.js';

const EVENT_FIELDS = [
  'id', 'title', 'slug', 'short_description', 'description', 'cover_image',
  'event_mode', 'meeting_platform', 'meeting_link',
  'venue', 'location', 'start_date', 'end_date', 'start_time', 'end_time',
  'timezone', 'capacity', 'booking_type', 'price', 'is_free', 'status',
  'registration_deadline', 'visibility', 'organizer_name', 'organizer_email',
  'organizer_phone', 'category', 'featured', 'featured_speakers', 'partners',
];

function todayInLusaka() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lusaka' }).format(new Date());
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function paidEventForToday(today) {
  const title = 'ISO 15189 Accreditation Workshop — Live Today (Paid)';
  return {
    id: 'evt-paid-live-today',
    title,
    slug: slugify(title),
    short_description:
      'Paid live workshop for testing mobile money and card checkout. Covers ISO 15189 readiness and documentation.',
    description:
      'A one-day paid workshop for laboratory quality teams. Use this event to test Lenco mobile money and card payments on web and mobile. Sessions include gap assessment, QMS documentation, and accreditation milestones.',
    cover_image:
      'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=1200&q=80',
    event_mode: 'in_person',
    meeting_platform: '',
    meeting_link: '',
    venue: 'Lusaka Hotel & Convention Centre',
    location: 'Lusaka, Zambia',
    start_date: today,
    end_date: today,
    start_time: '00:00:00',
    end_time: '23:59:00',
    timezone: 'Africa/Lusaka',
    capacity: 50,
    booking_type: 'subscription',
    price: 350,
    is_free: false,
    status: 'published',
    registration_deadline: today,
    visibility: 'public',
    organizer_name: 'Mutale Mubanga',
    organizer_email: 'mubangamubs@gmail.com',
    organizer_phone: '',
    category: 'Workshop',
    featured: true,
    featured_speakers: JSON.stringify([
      {
        name: 'Mutale Mubanga',
        organisation: 'Mutale Mubanga — Laboratory Quality & Training',
        title: 'Lead Facilitator',
        bio: 'Specialist in ISO 15189, IQC/EQA design, and laboratory leadership.',
        photo:
          'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80',
      },
    ]),
    partners: null,
  };
}

async function upsertPaidEvent(today) {
  const event = paidEventForToday(today);
  const placeholders = EVENT_FIELDS.map(() => '?').join(', ');
  const updates = EVENT_FIELDS.filter((f) => f !== 'id')
    .map((f) => `${f}=VALUES(${f})`)
    .join(', ');
  const values = EVENT_FIELDS.map((f) => event[f]);

  await pool.query(
    `INSERT INTO events (${EVENT_FIELDS.join(', ')}) VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${updates}`,
    values,
  );

  return event;
}

async function republishPastEventsAsLiveToday(today) {
  const [result] = await pool.query(
    `UPDATE events
     SET
       start_date = ?,
       end_date = ?,
       start_time = '00:00:00',
       end_time = '23:59:00',
       status = 'published',
       registration_deadline = ?,
       updated_at = NOW()
     WHERE status <> 'cancelled'
       AND id <> 'evt-paid-live-today'
       AND (
         end_date < ?
         OR (end_date = ? AND COALESCE(end_time, '23:59:59') < CURTIME())
       )`,
    [today, today, today, today, today],
  );

  return Number(result.affectedRows || 0);
}

async function summarize(today) {
  const [rows] = await pool.query(
    `SELECT id, title, start_date, end_date, status, price, is_free
     FROM events
     WHERE start_date <= ? AND end_date >= ? AND status = 'published'
     ORDER BY is_free ASC, title ASC`,
    [today, today],
  );
  return rows;
}

async function main() {
  const today = todayInLusaka();
  console.log(`[seed-live-today] Using date (Africa/Lusaka): ${today}`);

  const paid = await upsertPaidEvent(today);
  console.log(`[seed-live-today] Paid event upserted: ${paid.id} — ZMW ${paid.price}`);

  const republished = await republishPastEventsAsLiveToday(today);
  console.log(`[seed-live-today] Republished ${republished} past event(s) as live today`);

  const liveToday = await summarize(today);
  console.log(`[seed-live-today] ${liveToday.length} published event(s) live today:`);
  for (const row of liveToday) {
    const paidLabel = row.is_free ? 'free' : `ZMW ${row.price}`;
    console.log(`  • ${row.id} — ${row.title} (${paidLabel})`);
  }
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error('[seed-live-today] failed:', error.message);
    pool.end().finally(() => process.exit(1));
  });
