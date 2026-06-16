import pool from './db.js';
import { defaultEventsData } from '../src/data/events.js';
import { defaultBlogData } from '../src/data/blog.js';
import { defaultBooksData } from '../src/data/books.js';
import { profileData } from '../src/data/profile.js';

const EVENT_FIELDS = [
  'id', 'title', 'slug', 'short_description', 'description', 'cover_image',
  'event_mode', 'meeting_platform', 'meeting_link',
  'venue', 'location', 'start_date', 'end_date', 'start_time', 'end_time',
  'timezone', 'capacity', 'booking_type', 'price', 'is_free', 'status',
  'registration_deadline', 'visibility', 'organizer_name', 'organizer_email',
  'organizer_phone', 'category', 'featured', 'featured_speakers', 'partners',
];

const BLOG_FIELDS = [
  'id', 'title', 'slug', 'category', 'date', 'excerpt',
  'content', 'featured', 'read_time', 'image',
];

const BOOK_FIELDS = [
  'id', 'title', 'slug', 'author', 'isbn', 'category',
  'description', 'short_description', 'cover_image',
  'price', 'compare_at_price', 'currency', 'stock', 'weight_kg',
  'is_digital', 'is_published', 'featured', 'pages',
  'publisher', 'publish_year', 'language', 'format',
];

function normalizeEventPayload(payload = {}) {
  const inferredMode =
    payload.event_mode
    || (String(payload.location || '').toLowerCase().includes('virtual') ? 'virtual' : 'in_person');

  return {
    id: String(payload.id || `evt-${Date.now()}`),
    title: String(payload.title || '').trim(),
    slug: String(payload.slug || '').trim(),
    short_description: payload.short_description || '',
    description: payload.description || '',
    cover_image: payload.cover_image || '',
    event_mode: inferredMode,
    meeting_platform: payload.meeting_platform || (inferredMode !== 'in_person' ? 'zoom' : ''),
    meeting_link: payload.meeting_link || '',
    venue: payload.venue || '',
    location: payload.location || '',
    start_date: payload.start_date || payload.date || null,
    end_date: payload.end_date || payload.start_date || payload.date || null,
    start_time: payload.start_time || payload.time || null,
    end_time: payload.end_time || payload.endTime || null,
    timezone: payload.timezone || 'Africa/Lusaka',
    capacity: payload.capacity === '' || payload.capacity == null ? null : Number(payload.capacity),
    booking_type: 'subscription',
    price: Number(payload.price || 0),
    is_free: Boolean(payload.is_free),
    status: payload.status || 'draft',
    registration_deadline: payload.registration_deadline || null,
    visibility: payload.visibility || 'public',
    organizer_name: payload.organizer_name || '',
    organizer_email: payload.organizer_email || '',
    organizer_phone: payload.organizer_phone || '',
    category: payload.category || 'Other',
    featured: Boolean(payload.featured),
    featured_speakers: payload.featured_speakers ? JSON.stringify(payload.featured_speakers) : null,
    partners: payload.partners ? JSON.stringify(payload.partners) : null,
  };
}

function normalizeBlogPayload(payload = {}) {
  return {
    id: String(payload.id || `blog-${Date.now()}`),
    title: String(payload.title || '').trim(),
    slug: String(payload.slug || '').trim(),
    category: payload.category || 'Other',
    date: payload.date || new Date().toISOString().split('T')[0],
    excerpt: payload.excerpt || '',
    content: payload.content || '',
    featured: Boolean(payload.featured),
    read_time: payload.readTime || payload.read_time || '1 min read',
    image: payload.image || null,
  };
}

function normalizeBookPayload(payload = {}) {
  return {
    id: String(payload.id || `book-${Date.now()}`),
    title: String(payload.title || '').trim(),
    slug: String(payload.slug || '').trim(),
    author: String(payload.author || '').trim(),
    isbn: String(payload.isbn || '').trim(),
    category: payload.category || 'Other',
    description: payload.description || '',
    short_description: payload.short_description || '',
    cover_image: payload.cover_image || '',
    price: Number(payload.price || 0),
    compare_at_price: Number(payload.compare_at_price || 0),
    currency: payload.currency || 'ZMW',
    stock: payload.stock == null ? 0 : Number(payload.stock),
    weight_kg: Number(payload.weight_kg || 0),
    is_digital: Boolean(payload.is_digital),
    is_published: Boolean(payload.is_published),
    featured: Boolean(payload.featured),
    pages: Number(payload.pages || 0),
    publisher: String(payload.publisher || '').trim(),
    publish_year: Number.isFinite(Number(payload.publish_year)) ? Number(payload.publish_year) : null,
    language: payload.language || 'English',
    format: payload.format || 'paperback',
  };
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(80) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      short_description TEXT,
      description LONGTEXT,
      cover_image LONGTEXT,
      event_mode VARCHAR(50) DEFAULT 'virtual',
      meeting_platform VARCHAR(50) DEFAULT '',
      meeting_link LONGTEXT,
      venue VARCHAR(255),
      location VARCHAR(255),
      start_date DATE,
      end_date DATE,
      start_time TIME,
      end_time TIME,
      timezone VARCHAR(100),
      capacity INT,
      booking_type VARCHAR(30) DEFAULT 'subscription',
      price DECIMAL(10,2) DEFAULT 0,
      is_free BOOLEAN DEFAULT TRUE,
      status VARCHAR(30) DEFAULT 'draft',
      registration_deadline DATE,
      visibility VARCHAR(30) DEFAULT 'public',
      organizer_name VARCHAR(255),
      organizer_email VARCHAR(255),
      organizer_phone VARCHAR(50),
      category VARCHAR(100),
      featured BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id VARCHAR(80) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      category VARCHAR(120),
      date DATE,
      excerpt TEXT,
      content LONGTEXT,
      featured BOOLEAN DEFAULT FALSE,
      read_time VARCHAR(80) DEFAULT '1 min read',
      image LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_profile (
      id TINYINT PRIMARY KEY,
      data JSON NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id TINYINT PRIMARY KEY,
      data JSON NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      id VARCHAR(80) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      author VARCHAR(255),
      isbn VARCHAR(40),
      category VARCHAR(120),
      description LONGTEXT,
      short_description TEXT,
      cover_image LONGTEXT,
      price DECIMAL(10,2) DEFAULT 0,
      compare_at_price DECIMAL(10,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'ZMW',
      stock INT DEFAULT 0,
      weight_kg DECIMAL(6,2) DEFAULT 0,
      is_digital BOOLEAN DEFAULT FALSE,
      is_published BOOLEAN DEFAULT FALSE,
      featured BOOLEAN DEFAULT FALSE,
      pages INT DEFAULT 0,
      publisher VARCHAR(255),
      publish_year INT,
      language VARCHAR(60) DEFAULT 'English',
      format VARCHAR(40) DEFAULT 'paperback',
      product_type VARCHAR(40) NOT NULL DEFAULT 'book',
      event_id VARCHAR(90) NULL,
      tagline VARCHAR(255) NULL,
      variants JSON NULL,
      gallery JSON NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_types (
      id VARCHAR(80) PRIMARY KEY,
      value VARCHAR(40) NOT NULL UNIQUE,
      label VARCHAR(120) NOT NULL,
      icon VARCHAR(40) NOT NULL DEFAULT 'box',
      default_category VARCHAR(120) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

async function seedEvents() {
  const placeholders = EVENT_FIELDS.map(() => '?').join(', ');
  const updates = EVENT_FIELDS
    .filter((f) => f !== 'id')
    .map((f) => `${f}=VALUES(${f})`)
    .join(', ');

  for (const raw of defaultEventsData) {
    const event = normalizeEventPayload(raw);
    const values = EVENT_FIELDS.map((f) => event[f]);
    await pool.query(
      `INSERT INTO events (${EVENT_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );
  }
}

async function seedBlog() {
  const placeholders = BLOG_FIELDS.map(() => '?').join(', ');
  const updates = BLOG_FIELDS
    .filter((f) => f !== 'id')
    .map((f) => `${f}=VALUES(${f})`)
    .join(', ');

  for (const raw of defaultBlogData) {
    const post = normalizeBlogPayload(raw);
    const values = BLOG_FIELDS.map((f) => post[f]);
    await pool.query(
      `INSERT INTO blog_posts (${BLOG_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );
  }
}

async function seedBooks() {
  const placeholders = BOOK_FIELDS.map(() => '?').join(', ');
  const updates = BOOK_FIELDS
    .filter((f) => f !== 'id')
    .map((f) => `${f}=VALUES(${f})`)
    .join(', ');

  for (const raw of defaultBooksData) {
    const book = normalizeBookPayload(raw);
    const values = BOOK_FIELDS.map((f) => book[f]);
    await pool.query(
      `INSERT INTO books (${BOOK_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );
  }
}

async function seedProfile() {
  await pool.query(
    'INSERT INTO site_profile (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [JSON.stringify(profileData)],
  );
}

function envBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

async function seedSystemSettings() {
  const defaults = {
    email: {
      smtpHost: process.env.SMTP_HOST || '',
      smtpPort: process.env.SMTP_PORT || '587',
      smtpUser: process.env.SMTP_USER || '',
      smtpPassword: process.env.SMTP_PASSWORD || '',
      fromName: process.env.SMTP_FROM_NAME || 'Mutale Admin',
      fromEmail: process.env.SMTP_FROM_EMAIL || '',
      replyTo: process.env.SMTP_REPLY_TO || '',
    },
    payment: {
      provider: process.env.PAYMENT_PROVIDER || 'lenco',
      publicKey: process.env.LENCO_PUBLIC_KEY || '',
      secretKey: process.env.LENCO_SECRET_KEY || '',
      webhookSecret: process.env.LENCO_WEBHOOK_SECRET || '',
      accountId: process.env.LENCO_ACCOUNT_ID || '',
      currency: process.env.PAYMENT_CURRENCY || 'ZMW',
      sandboxMode: envBoolean(process.env.LENCO_SANDBOX, true),
    },
    sms: {
      provider: process.env.SMS_PROVIDER || 'twilio',
      senderId: process.env.SMS_SENDER_ID || '',
      apiKey: process.env.SMS_API_KEY || '',
      apiSecret: process.env.SMS_API_SECRET || '',
      defaultCountryCode: process.env.SMS_DEFAULT_COUNTRY_CODE || '+260',
      webhookUrl: process.env.SMS_WEBHOOK_URL || '',
    },
    whatsapp: {
      provider: process.env.WHATSAPP_PROVIDER || 'meta_cloud',
      senderNumber: process.env.WHATSAPP_SENDER_NUMBER || '',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || '',
    },
    notifications: {
      emailOnNewRegistration: true,
      emailOnEventReminder: true,
      smsOnNewRegistration: false,
      whatsappOnNewRegistration: false,
      weeklySummary: true,
      adminAlertEmail: process.env.ADMIN_ALERT_EMAIL || '',
      adminAlertPhone: process.env.ADMIN_ALERT_PHONE || '',
      adminAlertWhatsApp: process.env.ADMIN_ALERT_WHATSAPP || '',
      digestDay: 'monday',
    },
    security: {
      sessionTimeoutMinutes: '120',
      require2faAdmin: false,
      loginAlertEmails: true,
      passwordRotationDays: '90',
      allowedIps: '',
    },
    integrations: {
      googleAnalyticsId: process.env.GA_ID || '',
      metaPixelId: process.env.META_PIXEL_ID || '',
      slackWebhook: process.env.SLACK_WEBHOOK || '',
      zapierWebhook: process.env.ZAPIER_WEBHOOK || '',
    },
  };

  await pool.query(
    'INSERT INTO system_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [JSON.stringify(defaults)],
  );
}

async function main() {
  try {
    await ensureSchema();
    await seedEvents();
    await seedBlog();
    await seedBooks();
    await seedProfile();
  await seedSystemSettings();

    const [[eventsCount]] = await pool.query('SELECT COUNT(*) AS count FROM events');
    const [[blogCount]] = await pool.query('SELECT COUNT(*) AS count FROM blog_posts');
    const [[booksCount]] = await pool.query('SELECT COUNT(*) AS count FROM books');
    const [[profileCount]] = await pool.query('SELECT COUNT(*) AS count FROM site_profile');
  const [[settingsCount]] = await pool.query('SELECT COUNT(*) AS count FROM system_settings');

    console.log('✅ Dummy seed complete');
    console.log(`   events: ${eventsCount.count}`);
    console.log(`   blog_posts: ${blogCount.count}`);
    console.log(`   books: ${booksCount.count}`);
    console.log(`   site_profile: ${profileCount.count}`);
  console.log(`   system_settings: ${settingsCount.count}`);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
