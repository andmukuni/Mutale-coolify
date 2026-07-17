#!/usr/bin/env node
/**
 * Seed upcoming demo events + shop products + speakers/guests + subscribed attendees.
 *
 * Usage:
 *   node server/scripts/seed-remote-demo.js
 *   API_BASE=https://mutalemubanga.org/api ADMIN_EMAIL=... ADMIN_PASSWORD=... node server/scripts/seed-remote-demo.js
 */

const API_BASE = String(process.env.API_BASE || 'https://mutalemubanga.org/api').replace(/\/$/, '');
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@mutale.dev').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'admin123');
const DEMO_ATTENDEE_PASSWORD = 'DemoAttendee123!';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.message || `${method} ${path} failed (${response.status})`);
  }
  return json;
}

/** Stable Unsplash portraits — avoid broken placeholders */
const PORTRAITS = {
  a: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80',
  b: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
  c: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80',
  d: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80',
  e: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
  f: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
  g: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80',
  h: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
};

function speakersFor(title) {
  return [
    {
      name: 'Dr. Chanda Mwila',
      organisation: 'National Reference Laboratory',
      title: 'Keynote Speaker',
      bio: 'Leads national laboratory quality programmes and accreditation readiness initiatives across Zambia.',
      photo: PORTRAITS.b,
    },
    {
      name: 'Mutale Mubanga',
      organisation: 'Mutale Mubanga — Laboratory Quality & Training',
      title: 'Lead Facilitator',
      bio: `Facilitator for ${title}. Specialist in ISO 15189, IQC/EQA design, and practical laboratory leadership.`,
      photo: PORTRAITS.a,
    },
  ];
}

function guestsFor() {
  return [
    {
      name: 'Thandiwe Phiri',
      organisation: 'Ministry of Health',
      title: 'Guest of Honour',
      bio: 'Supporting diagnostic network strengthening and professional development for laboratory teams.',
      photo: PORTRAITS.c,
    },
    {
      name: 'James Banda',
      organisation: 'Diagnostics Africa Network',
      title: 'Industry Guest',
      bio: 'Advises programmes on post-market surveillance and quality indicators for diagnostics.',
      photo: PORTRAITS.d,
    },
  ];
}

const DEMO_ATTENDEES = [
  { name: 'Grace Tembo', email: 'demo.attendee1@mutale.dev', photo: PORTRAITS.e },
  { name: 'Joseph Mulenga', email: 'demo.attendee2@mutale.dev', photo: PORTRAITS.f },
  { name: 'Natasha Zulu', email: 'demo.attendee3@mutale.dev', photo: PORTRAITS.g },
  { name: 'Peter Sichone', email: 'demo.attendee4@mutale.dev', photo: PORTRAITS.h },
  { name: 'Mwansa Kabaso', email: 'demo.attendee5@mutale.dev', photo: PORTRAITS.c },
];

const DEMO_EVENTS = [
  {
    id: 'evt-demo-iso-15189',
    title: 'ISO 15189 Laboratory Accreditation Readiness Workshop',
    short_description: 'Hands-on gap assessment and documentation guidance for lab accreditation.',
    description:
      'A full-day workshop for laboratory managers and quality officers preparing for ISO 15189 accreditation. Covers gap assessments, documentation, internal audits, and practical next steps.',
    cover_image: 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=1200&q=80',
    event_mode: 'in_person',
    venue: 'Lusaka Hotel & Convention Centre',
    location: 'Lusaka, Zambia',
    start_date: '2026-08-12',
    end_date: '2026-08-12',
    start_time: '09:00',
    end_time: '16:00',
    capacity: 40,
    price: 350,
    is_free: false,
    category: 'Workshop',
    featured: true,
  },
  {
    id: 'evt-demo-diagnostics-qa',
    title: 'Diagnostics Quality Assurance Seminar',
    short_description: 'QA practices for diagnostics in low- and middle-income settings.',
    description:
      'Explore post-market surveillance, product performance monitoring, EQA participation, and quality indicators for diagnostic programmes.',
    cover_image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80',
    event_mode: 'virtual',
    meeting_platform: 'zoom',
    venue: 'Virtual Platform',
    location: 'Virtual (Zoom)',
    start_date: '2026-08-26',
    end_date: '2026-08-26',
    start_time: '10:00',
    end_time: '15:00',
    capacity: 120,
    price: 0,
    is_free: true,
    category: 'Seminar',
    featured: true,
  },
  {
    id: 'evt-demo-lab-leadership',
    title: 'Laboratory Leadership and Management Training',
    short_description: 'Strategy, QMS, and stakeholder engagement for laboratory leaders.',
    description:
      'An intensive multi-day programme covering strategic planning, HR, financial oversight, quality systems leadership, and stakeholder engagement.',
    cover_image: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80',
    event_mode: 'in_person',
    venue: 'Mulungushi International Conference Centre',
    location: 'Lusaka, Zambia',
    start_date: '2026-09-15',
    end_date: '2026-09-17',
    start_time: '08:30',
    end_time: '17:00',
    capacity: 60,
    price: 750,
    is_free: false,
    category: 'Training',
    featured: true,
  },
  {
    id: 'evt-demo-cv-career',
    title: 'Career CV & Interview Masterclass',
    short_description: 'Build a professional CV from your workshops and certificates — live coaching.',
    description:
      'Learn how to present laboratory and professional development experience on your CV, practice interview answers, and leave with a downloadable Mutale CV draft.',
    cover_image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
    event_mode: 'virtual',
    meeting_platform: 'zoom',
    venue: 'Virtual Platform',
    location: 'Virtual (Zoom)',
    start_date: '2026-07-30',
    end_date: '2026-07-30',
    start_time: '14:00',
    end_time: '17:00',
    capacity: 50,
    price: 150,
    is_free: false,
    category: 'Workshop',
    featured: false,
  },
];

const DEMO_PRODUCTS = [
  {
    id: 'prod-demo-tee-teal',
    title: 'Mutale Teal Wordmark T-Shirt',
    author: 'Mutale Mubanga',
    category: 'Apparel',
    product_type: 'tshirt',
    short_description: 'Soft cotton tee with the Mutale wordmark.',
    description: 'Premium cotton t-shirt featuring the Mutale Mubanga wordmark. Ideal event merch and everyday wear.',
    cover_image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80',
    price: 180,
    compare_at_price: 220,
    stock: 80,
    weight_kg: 0.25,
    is_digital: false,
    is_published: true,
    featured: true,
    format: 'physical',
    variants: [
      { id: 'size-s', label: 'S', value: 'S', stock: 20 },
      { id: 'size-m', label: 'M', value: 'M', stock: 25 },
      { id: 'size-l', label: 'L', value: 'L', stock: 20 },
      { id: 'size-xl', label: 'XL', value: 'XL', stock: 15 },
    ],
  },
  {
    id: 'prod-demo-mug',
    title: 'Quality First Ceramic Mug',
    author: 'Mutale Mubanga',
    category: 'Drinkware',
    product_type: 'mug',
    short_description: '11oz ceramic mug for lab & office mornings.',
    description: 'Dishwasher-safe ceramic mug with a clean “Quality First” print. Perfect companion for long audit days.',
    cover_image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=80',
    price: 95,
    stock: 120,
    weight_kg: 0.4,
    is_digital: false,
    is_published: true,
    featured: true,
    format: 'physical',
  },
  {
    id: 'prod-demo-cap',
    title: 'Mutale Field Cap',
    author: 'Mutale Mubanga',
    category: 'Apparel',
    product_type: 'cap',
    short_description: 'Structured cap for workshops and field visits.',
    description: 'Breathable structured cap with embroidered Mutale mark. One size with adjustable strap.',
    cover_image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=1200&q=80',
    price: 120,
    stock: 60,
    weight_kg: 0.15,
    is_digital: false,
    is_published: true,
    featured: false,
    format: 'physical',
  },
  {
    id: 'prod-demo-sticker-pack',
    title: 'Lab Quality Sticker Pack',
    author: 'Mutale Mubanga',
    category: 'Accessories',
    product_type: 'sticker',
    short_description: 'Vinyl sticker pack for laptops and lab notebooks.',
    description: 'Set of 6 waterproof vinyl stickers celebrating laboratory quality culture.',
    cover_image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=1200&q=80',
    price: 45,
    stock: 200,
    weight_kg: 0.05,
    is_digital: false,
    is_published: true,
    featured: false,
    format: 'physical',
  },
  {
    id: 'book-seed-004',
    title: 'Internal Audit Playbook for Medical Labs',
    author: 'Mutale Mubanga',
    isbn: '978-0-000-00004-1',
    category: 'Laboratory Science',
    product_type: 'book',
    short_description: 'Practical internal audit templates and checklists for ISO 15189 labs.',
    description:
      'A practitioner playbook with audit schedules, finding formats, CAPA workflows, and sample checklists tailored to medical laboratories.',
    cover_image: 'https://images.unsplash.com/photo-1456513080080-7f3ff4d8d1df?auto=format&fit=crop&w=1200&q=80',
    price: 210,
    compare_at_price: 260,
    stock: 40,
    weight_kg: 0.4,
    is_digital: false,
    is_published: true,
    featured: true,
    pages: 196,
    publisher: 'Lusaka Academic Press',
    publish_year: 2026,
    language: 'English',
    format: 'paperback',
  },
];

async function upsertEvent(token, event) {
  const payload = {
    ...event,
    slug: event.slug || slugify(event.title),
    timezone: 'Africa/Lusaka',
    status: 'published',
    visibility: 'public',
    booking_type: 'subscription',
    organizer_name: 'Mutale Mubanga',
    organizer_email: ADMIN_EMAIL,
    featured_speakers: event.featured_speakers || speakersFor(event.title),
    featured_guests: event.featured_guests || guestsFor(),
  };

  try {
    const created = await api('/events', { method: 'POST', token, body: payload });
    return { action: 'created', id: created.data?.id || payload.id, title: payload.title };
  } catch (error) {
    if (!/already exists|Slug already/i.test(error.message)) throw error;
    const updated = await api(`/events/${payload.id}`, { method: 'PUT', token, body: payload });
    return { action: 'updated', id: updated.data?.id || payload.id, title: payload.title };
  }
}

function eventLooksPast(event) {
  const end = String(event?.end_date || event?.start_date || '').trim();
  if (!end) return false;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return end < `${yyyy}-${mm}-${dd}`;
}

async function enrichExistingEvents(token) {
  const list = await api('/events', { token });
  const events = list.data || [];
  let patched = 0;
  for (const event of events) {
    if (eventLooksPast(event) || String(event.status || '').toLowerCase() === 'cancelled') {
      console.log(`[event] skip enrich (past/cancelled): ${event.title}`);
      continue;
    }
    const speakers = Array.isArray(event.featured_speakers) ? event.featured_speakers : [];
    const guests = Array.isArray(event.featured_guests) ? event.featured_guests : [];
    if (speakers.length && guests.length) continue;
    try {
      await api(`/events/${event.id}`, {
        method: 'PUT',
        token,
        body: {
          featured_speakers: speakers.length ? speakers : speakersFor(event.title),
          featured_guests: guests.length ? guests : guestsFor(),
        },
      });
      patched += 1;
      console.log(`[event] enriched speakers/guests: ${event.title}`);
    } catch (error) {
      console.warn(`[event] enrich failed for ${event.title}: ${error.message}`);
    }
  }
  return patched;
}

async function upsertProduct(token, product) {
  const payload = {
    currency: 'ZMW',
    language: 'English',
    ...product,
    slug: product.slug || slugify(product.title),
    is_published: true,
    variants: product.variants || undefined,
  };

  const created = await api('/products', { method: 'POST', token, body: payload });
  return { action: 'upserted', id: created.data?.id || payload.id, title: payload.title };
}

async function ensureAttendee(adminToken, attendee) {
  try {
    const created = await api('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        name: attendee.name,
        email: attendee.email,
        password: DEMO_ATTENDEE_PASSWORD,
        phone: '+260970000000',
        whatsapp: '+260970000000',
        user_type: 'local',
        email_verified: 1,
        profile_photo: attendee.photo,
      },
    });
    return { action: 'created', id: created.data?.id, email: attendee.email };
  } catch (error) {
    if (!/already exists/i.test(error.message)) throw error;
    const users = await api('/admin/users', { token: adminToken });
    const match = (users.data || []).find(
      (row) => String(row.email || '').toLowerCase() === attendee.email,
    );
    if (!match?.id) throw new Error(`Could not find existing attendee ${attendee.email}`);
    await api(`/admin/users/${match.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        name: attendee.name,
        profile_photo: attendee.photo,
        email_verified: 1,
      },
    });
    return { action: 'updated', id: match.id, email: attendee.email };
  }
}

async function registerAttendeeForEvents(attendee, eventIds) {
  const login = await api('/auth/login', {
    method: 'POST',
    body: { email: attendee.email, password: DEMO_ATTENDEE_PASSWORD },
  });
  const token = login.token;
  if (!token) throw new Error(`No token for ${attendee.email}`);

  let registered = 0;
  for (const eventId of eventIds) {
    try {
      await api('/registrations', {
        method: 'POST',
        token,
        body: {
          event_id: eventId,
          registration_type: 'subscription',
          payment_method: 'free',
          payment_status: 'not_required',
          status: 'confirmed',
          currency: 'ZMW',
          amount: 0,
        },
      });
      registered += 1;
    } catch (error) {
      if (/already registered|already have an active/i.test(error.message)) continue;
      console.warn(`[registration] ${attendee.email} → ${eventId}: ${error.message}`);
    }
  }
  return registered;
}

async function main() {
  console.log(`[seed-remote] API: ${API_BASE}`);
  const login = await api('/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = login.token;
  if (!token) throw new Error('Login succeeded but no token returned.');
  console.log(`[seed-remote] Authenticated as ${ADMIN_EMAIL}`);

  for (const event of DEMO_EVENTS) {
    const result = await upsertEvent(token, event);
    console.log(`[event] ${result.action}: ${result.title}`);
  }

  const enriched = await enrichExistingEvents(token);
  console.log(`[event] enriched ${enriched} existing event(s) with speakers/guests`);

  for (const product of DEMO_PRODUCTS) {
    const result = await upsertProduct(token, product);
    console.log(`[product] ${result.action}: ${result.title}`);
  }

  const attendeeIds = [];
  for (const attendee of DEMO_ATTENDEES) {
    const result = await ensureAttendee(token, attendee);
    attendeeIds.push(result.id);
    console.log(`[attendee] ${result.action}: ${result.email}`);
  }

  const publicEvents = await api('/events');
  const eventIds = (publicEvents.data || []).map((event) => event.id).filter(Boolean);

  let totalRegs = 0;
  for (const attendee of DEMO_ATTENDEES) {
    const count = await registerAttendeeForEvents(attendee, eventIds);
    totalRegs += count;
    console.log(`[registration] ${attendee.email}: ${count} event(s)`);
  }

  const verify = await api('/events');
  const withPeople = (verify.data || []).filter(
    (event) => (event.featured_speakers || []).length || (event.featured_guests || []).length,
  );
  const withSubs = (verify.data || []).filter(
    (event) => Number(event.subscriber_preview?.count || 0) > 0,
  );
  console.log(
    `[seed-remote] Done. events=${(verify.data || []).length}, with speakers/guests=${withPeople.length}, with subscribers=${withSubs.length}, new regs≈${totalRegs}`,
  );
}

main().catch((error) => {
  console.error('[seed-remote] failed:', error.message);
  process.exit(1);
});
