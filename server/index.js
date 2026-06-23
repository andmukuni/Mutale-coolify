import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import pool, { testConnection } from './db.js';
import {
  mapDbCertificate,
  processEndedEventCertificates,
  processEventCertificates,
  sendCertificateEmailForRow,
  ensureCertificatePdfOnDisk,
} from './certificateService.js';
import {
  getTemplateForEvent,
  activateOrCreateTemplate,
  saveTemplateDraft,
  publishTemplate,
  deactivateTemplate,
  generateTemplatePreviewPdf,
} from './certificateTemplateService.js';
import { isValidCertificatePdfBuffer } from '../shared/certificatePdf.js';
import {
  buildReceiptAttachmentIfEligible,
  maybeSendReceiptOnSettlement,
  markReceiptEmailSent,
  buildReceiptFilename,
  generateRegistrationReceiptBuffer,
  isReceiptEligible,
  resolveReceiptRecordForDownload,
  assertReceiptDownloadAllowedForUser,
  mapToReceiptRecord,
  CV_PRODUCT_EVENT_ID,
  SHOP_ORDER_EVENT_ID,
} from './receiptService.js';
import { mergeReceiptRecords } from '../shared/receiptHelpers.js';
import { buildCvStrengthSuggestions } from '../shared/cvStrengthSuggestions.js';
import { normalizeCvSections, parseCvSectionsFromDb } from '../shared/cvProfileSections.js';
import {
  rateLimitCv,
  getCachedCvSuggestions,
  invalidateCvSuggestionsCache,
} from './cvApiHelpers.js';
import {
  rateLimitByKey,
  evaluateCorsOrigin,
  sanitizeMeetingJoinUrl,
  maskSystemSettingsSecrets,
  preserveMaskedSecrets,
  apiErrorPayload,
  isAllowedUploadMime,
  bufferMatchesImageMime,
  MAX_GENERAL_UPLOAD_BYTES,
  isCatalogAdminMutation,
} from './securityHelpers.js';
import { sanitizeBlogHtml } from '../shared/blogSanitize.js';
import { DEFAULT_PARTNER_LOGOS } from '../shared/partnerLogos.js';
import { DEFAULT_MENU_ITEMS, MENU_LOCATIONS } from '../shared/menuItems.js';
import { getEventRegistrationGateReason, isEventEnded } from '../shared/eventRegistration.js';
import {
  ensureRbacTables,
  seedRbac,
  loadUserAdminPermissions,
  loadUserAdminRoles,
  loadAdminRolesByUserIds,
  listRolesWithPermissions,
  getRoleById,
  setRolePermissions,
  setUserAdminRoles,
  resolveRouteAdminPermission,
  permissionMatches,
  userCanAccessAdmin,
  ADMIN_PERMISSIONS,
  ALL_PERMISSION_KEYS,
} from './rbacService.js';
import { getBundledReceiptLogoPath } from '../shared/receiptLogoAsset.js';
import { isValidPdfBuffer } from '../shared/receiptPdf.js';

// Load `.env` from the app root (parent of server/), not relying on cwd — cPanel Passenger often starts with cwd ≠ project root.
const __filename = fileURLToPath(import.meta.url);
const __serverDirname = path.dirname(__filename);
const __appRoot = path.resolve(__serverDirname, '..');
dotenv.config({ path: path.join(__appRoot, '.env') });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (process.env.TRUST_PROXY === '1' || IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

/** Bumps when auth/API behavior changes — check GET /api/health on cPanel after deploy */
const API_DEPLOYMENT_TAG = '2026-06-02-cv-generator';

const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean);

app.disable('x-powered-by');

function isEventJoinPagePath(pathname = '') {
  return /^\/events\/[^/]+\/join\/?$/i.test(String(pathname || ''));
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isEventJoinPagePath(req.path)) {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  } else {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; connect-src 'self' https:; frame-src https:;",
  );
  next();
});

const SERVER_ORIGIN = String(process.env.APP_URL || process.env.CORS_ORIGINS?.split(',')[0] || '').trim().replace(/\/$/, '');

// CORS only gates the API. Static assets (dist/, /uploads) and the SPA must
// never be CORS-checked: Vite emits asset tags with `crossorigin`, so browsers
// send an `Origin` header even for same-origin requests, and a global CORS gate
// would 403 every asset → blank page.
app.use('/api', cors({
  origin(origin, callback) {
    const result = evaluateCorsOrigin(origin, {
      corsOrigins: CORS_ORIGINS,
      serverOrigin: SERVER_ORIGIN,
      nodeEnv: process.env.NODE_ENV || 'development',
    });
    if (result.allowed) return callback(null, true);
    if (result.reason === 'cors_origins_unset') {
      console.error('[CORS] CORS_ORIGINS is not set in production. Rejecting cross-origin request.');
    }
    return callback(new Error('CORS not allowed for this origin'));
  },
}));
// 10 MB allows base64-encoded cover images in JSON (events, blog, books, profile).
// Regular API calls are typically <50 KB so this is still a safe ceiling.
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf?.toString('utf8') || '';
  },
}));

app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      message: 'Payload too large. Please remove oversized pasted content or images and try again.',
    });
  }
  return next(err);
});

// Prevent browser/proxy caching of all API responses
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use('/uploads', express.static(path.join(__appRoot, 'uploads')));

const EVENT_FIELDS = [
  'id',
  'title',
  'slug',
  'short_description',
  'description',
  'cover_image',
  'event_mode',
  'meeting_platform',
  'meeting_link',
  'venue',
  'location',
  'start_date',
  'end_date',
  'start_time',
  'end_time',
  'timezone',
  'capacity',
  'booking_type',
  'price',
  'is_free',
  'status',
  'registration_deadline',
  'registration_deadline_time',
  'visibility',
  'organizer_name',
  'organizer_email',
  'organizer_phone',
  'category',
  'featured',
  'featured_speakers',
  'partners',
  'delivery_mode',
  'provider',
  'zoom_meeting_id',
  'zoom_uuid',
  'zoom_join_url',
  'zoom_start_url',
  'zoom_password',
  'zoom_host_email',
  'zoom_status',
  'zoom_created_at',
  'zoom_synced_at',
  'daily_room_name',
  'daily_room_url',
  'daily_status',
  'daily_created_at',
  'daily_synced_at',
  'forum_enabled',
];

const BLOG_FIELDS = [
  'id',
  'title',
  'slug',
  'category',
  'date',
  'excerpt',
  'content',
  'featured',
  'read_time',
  'image',
];

const PUBLICATION_FIELDS = [
  'id',
  'title',
  'authors',
  'journal',
  'year',
  'volume',
  'doi',
  'abstract',
];

const CONTACT_MESSAGE_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'subject',
  'message',
  'is_read',
];

const BOOK_FIELDS = [
  'id',
  'title',
  'slug',
  'author',
  'isbn',
  'category',
  'description',
  'short_description',
  'cover_image',
  'price',
  'compare_at_price',
  'currency',
  'stock',
  'weight_kg',
  'is_digital',
  'is_published',
  'featured',
  'pages',
  'publisher',
  'publish_year',
  'language',
  'format',
  // Generalised shop / product fields (additive — existing rows default to type 'book')
  'product_type',
  'event_id',
  'tagline',
  'variants',
  'gallery',
];

const PRODUCT_TYPES = [
  'book',
  'tshirt',
  'mug',
  'keyholder',
  'wristwatch',
  'sticker',
  'sweatshirt',
  'cap',
  'bag',
  'other',
];

const BOOK_ORDER_FIELDS = [
  'id',
  'user_id',
  'user_name',
  'user_email',
  'items',
  'subtotal',
  'shipping_cost',
  'shipping_method',
  'shipping_label',
  'total',
  'currency',
  'shipping_address',
  'shipping_zone',
  'payment_method',
  'payment_reference',
  'payment_status',
  'status',
  'notes',
];

const PAYMENT_COLLECTION_FIELDS = [
  'id',
  'reference',
  'event_id',
  'event_title',
  'customer_name',
  'customer_email',
  'customer_phone',
  'amount',
  'currency',
  'status',
  'channel',
  'provider',
  'provider_response',
  'error_message',
];

const EVENT_REGISTRATION_FIELDS = [
  'id',
  'user_id',
  'user_name',
  'user_email',
  'event_id',
  'event_title',
  'event_slug',
  'reference_code',
  'registration_type',
  'status',
  'amount',
  'currency',
  'amount_zmw',
  'payment_status',
  'payment_method',
  'payment_reference',
  'booked_for_name',
  'booked_for_relation',
  'attendee_slot_key',
  'coupon_id',
  'coupon_code',
  'list_price_zmw',
  'discount_zmw',
  'notes',
];

function deriveAttendeeSlotKey(bookedForNameRaw = '') {
  const raw = String(bookedForNameRaw || '').trim();
  if (!raw) return '__self__';
  return raw.toLowerCase().slice(0, 160);
}

function normalizeEventCouponCode(raw = '') {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function roundMoney2(n) {
  return Math.round(toNumber(n, 0) * 100) / 100;
}

function computeCouponDiscountZmw(listZmw, discountType, discountValue) {
  const list = roundMoney2(listZmw);
  const v = roundMoney2(discountValue);
  if (list <= 0) return 0;
  const t = String(discountType || '').toLowerCase().trim();
  if (t === 'fixed' || t === 'amount') {
    return roundMoney2(Math.min(list, Math.max(0, v)));
  }
  const pct = Math.min(100, Math.max(0, v));
  return roundMoney2(list * (pct / 100));
}

async function loadEventCouponRow(queryFn, eventId, codeNormalized, forUpdate = false) {
  const sql = forUpdate
    ? 'SELECT * FROM event_coupons WHERE event_id = ? AND code = ? LIMIT 1 FOR UPDATE'
    : 'SELECT * FROM event_coupons WHERE event_id = ? AND code = ? LIMIT 1';
  const [[row]] = await queryFn(sql, [String(eventId), String(codeNormalized || '')]);
  return row || null;
}

async function countUserCouponRedemptions(queryFn, couponId, userId) {
  if (!couponId || !userId) return 0;
  const [[cnt]] = await queryFn(
    `SELECT COUNT(*) AS n FROM event_registrations
     WHERE coupon_id = ? AND user_id = ? AND status <> ?`,
    [couponId, String(userId), 'cancelled'],
  );
  return Number(cnt?.n || 0);
}

/**
 * Resolves coupon for an event booking. Optionally locks coupon row inside a transaction (forUpdate).
 * Returns { ok, error?, list_zmw, discount_zmw, final_zmw, coupon } ; coupon row object or null.
 */
async function resolveEventCouponForBooking(poolOrConn, eventRow, rawCode = '', userId = null, opts = {}) {
  const queryFn = poolOrConn.query.bind(poolOrConn);
  const listZmw = roundMoney2(toNumber(eventRow?.price, 0));
  const codeNorm = normalizeEventCouponCode(rawCode);
  const isFreeEventRow = parseBoolean(eventRow?.is_free, false) || listZmw <= 0;

  if (!codeNorm) {
    return {
      ok: true,
      error: null,
      list_zmw: listZmw,
      discount_zmw: 0,
      final_zmw: listZmw,
      coupon: null,
    };
  }

  if (isFreeEventRow || listZmw <= 0) {
    return { ok: false, error: 'This event cannot be discounted with a coupon.' };
  }

  const couponRow = await loadEventCouponRow(queryFn, eventRow.id, codeNorm, Boolean(opts.lockRow));
  if (!couponRow) return { ok: false, error: 'That coupon code is not valid for this event.' };

  const activeVal = couponRow.active;
  const isActive =
    typeof activeVal === 'boolean'
      ? activeVal
      : ![0, false, null, '', '0', 'false', 'FALSE'].includes(activeVal);

  if (!isActive) {
    return { ok: false, error: 'That coupon code is inactive.' };
  }

  const now = new Date();
  if (couponRow.valid_from) {
    const from = new Date(couponRow.valid_from);
    if (!Number.isNaN(from.getTime()) && now < from) {
      return { ok: false, error: 'That coupon code is not valid yet.' };
    }
  }
  if (couponRow.valid_until) {
    const until = new Date(couponRow.valid_until);
    if (!Number.isNaN(until.getTime())) {
      until.setHours(23, 59, 59, 999);
      if (now > until) {
        return { ok: false, error: 'That coupon code has expired.' };
      }
    }
  }

  const maxUses = couponRow.max_redemptions == null || couponRow.max_redemptions === ''
    ? null
    : Number(couponRow.max_redemptions);

  const usedGlobally = Number(couponRow.redemptions_count || 0);
  if (maxUses != null && Number.isFinite(maxUses) && usedGlobally >= maxUses) {
    return { ok: false, error: 'That coupon has reached its redemption limit.' };
  }

  const maxPerUser = Number(couponRow.max_per_user || 1);
  if (userId && Number.isFinite(maxPerUser) && maxPerUser >= 1) {
    const userUses = await countUserCouponRedemptions(queryFn, couponRow.id, userId);
    if (userUses >= maxPerUser) {
      return { ok: false, error: 'You already used this coupon the maximum times allowed.' };
    }
  }

  const discountType = String(couponRow.discount_type || 'percent').toLowerCase();
  const dv = roundMoney2(toNumber(couponRow.discount_value, 0));

  let discount_zmw = 0;
  if (discountType === 'fixed' || discountType === 'amount') {
    discount_zmw = computeCouponDiscountZmw(listZmw, 'fixed', dv);
  } else {
    if (dv <= 0 || dv > 100) {
      return { ok: false, error: 'This coupon configuration is invalid. Contact the organiser.' };
    }
    discount_zmw = computeCouponDiscountZmw(listZmw, 'percent', dv);
  }

  const final_zmw = roundMoney2(listZmw - discount_zmw);
  if (!Number.isFinite(final_zmw) || final_zmw < 0) {
    return { ok: false, error: 'Could not calculate the discounted amount.' };
  }

  return {
    ok: true,
    error: null,
    list_zmw: listZmw,
    discount_zmw,
    final_zmw,
    coupon: couponRow,
  };
}

function mapPublicCouponPreviewCoupon(row = {}) {
  if (!row?.id) return null;
  return {
    label: row.label || null,
    discount_type: String(row.discount_type || 'percent').toLowerCase(),
    discount_value: roundMoney2(toNumber(row.discount_value, 0)),
  };
}

function mapAdminEventCouponRow(row = {}) {
  const activeVal = row.active;
  const isActive =
    typeof activeVal === 'boolean'
      ? activeVal
      : ![0, false, null, '', '0', 'false', 'FALSE'].includes(activeVal);

  return {
    ...row,
    discount_value: roundMoney2(toNumber(row.discount_value, 0)),
    discount_type: String(row.discount_type || 'percent').toLowerCase(),
    max_redemptions: row.max_redemptions == null ? null : Number(row.max_redemptions),
    redemptions_count: Number(row.redemptions_count || 0),
    max_per_user: Number(row.max_per_user || 1),
    active: isActive,
  };
}

function parseOptionalDateSql(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeAdminCouponCreate(body = {}, eventId) {
  const code = normalizeEventCouponCode(body.code || body.coupon_code || '');
  let discountType = String(body.discount_type || 'percent').trim().toLowerCase();
  if (discountType === 'amount') discountType = 'fixed';
  if (discountType !== 'percent' && discountType !== 'fixed') discountType = 'percent';

  const dv = roundMoney2(toNumber(body.discount_value, 0));
  const maxRedemptionsRaw = body.max_redemptions;
  const maxRedemptions = maxRedemptionsRaw == null || maxRedemptionsRaw === ''
    ? null
    : Math.max(0, Math.floor(Number(maxRedemptionsRaw)));

  const maxPerUser = Math.max(1, Math.floor(toNumber(body.max_per_user ?? 1, 1)));

  return {
    id: String(body.id || generateEntityId('ecpn')).trim(),
    event_id: String(eventId || '').trim(),
    code,
    discount_type: discountType,
    discount_value: dv,
    max_redemptions: maxRedemptions,
    redemptions_count: 0,
    max_per_user: maxPerUser,
    valid_from: parseOptionalDateSql(body.valid_from),
    valid_until: parseOptionalDateSql(body.valid_until),
    active: parseBoolean(body.active, true),
    label: String(body.label || '').trim() || null,
  };
}

function envBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

const SYSTEM_SETTINGS_DEFAULTS = {
  email: {
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: process.env.SMTP_PORT || '587',
    smtpUser: process.env.SMTP_USER || 'futuretechzm@gmail.com',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || 'Mutale Mubanga',
    fromEmail: process.env.SMTP_FROM_EMAIL || 'futuretechzm@gmail.com',
    replyTo: process.env.SMTP_REPLY_TO || 'futuretechzm@gmail.com',
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'lenco',
    publicKey: process.env.LENCO_PUBLIC_KEY || '',
    secretKey: process.env.LENCO_SECRET_KEY || '',
    webhookSecret: process.env.LENCO_WEBHOOK_SECRET || '',
    accountId: process.env.LENCO_ACCOUNT_ID || '',
    currency: process.env.PAYMENT_CURRENCY || 'ZMW',
    sandboxMode: envBoolean(process.env.LENCO_SANDBOX, false),
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
    provider: process.env.WHATSAPP_PROVIDER || 'green_api',
    senderNumber: process.env.WHATSAPP_SENDER_NUMBER || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    greenApiUrl: process.env.GREEN_API_URL || 'https://api.green-api.com',
    greenApiInstanceId: process.env.GREEN_API_INSTANCE_ID || '',
    greenApiToken: process.env.GREEN_API_TOKEN || '',
    webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || '',
  },
  notifications: {
    emailOnNewRegistration: true,
    emailOnEventReminder: true,
    smsOnNewRegistration: false,
    whatsappOnNewRegistration: false,
    whatsappClientOnRegistration: false,
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
    nrcVerificationEnabled: process.env.NRC_VERIFICATION_ENABLED !== 'false',
    smartdataApiKey: process.env.SMARTDATA_API_KEY || '',
    smartdataBaseUrl: process.env.SMARTDATA_BASE_URL || 'https://mysmartdata.tech/api/v1',
  },
  video: {
    defaultProvider: 'zoom',
    enabledProviders: ['zoom', 'daily'],
    joinMode: 'embed',
  },
  zoom: {
    accountId: process.env.ZOOM_ACCOUNT_ID || '',
    clientId: process.env.ZOOM_CLIENT_ID || '',
    clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
    sdkKey: process.env.ZOOM_MEETING_SDK_KEY || '',
    sdkSecret: process.env.ZOOM_MEETING_SDK_SECRET || '',
    defaultHostEmail: process.env.ZOOM_DEFAULT_HOST_EMAIL || '',
    webhookSecretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '',
  },
  daily: {
    apiKey: process.env.DAILY_API_KEY || '',
    domain: process.env.DAILY_DOMAIN || '',
    webhookSecret: process.env.DAILY_WEBHOOK_SECRET || '',
    defaultRoomPrivacy: 'private',
    maxParticipantsDefault: 200,
  },
  shipping: {
    currency: 'ZMW',
    defaultMethod: 'flat',
    flatRate: 50,
    baseRate: 30,
    perKgRate: 15,
    freeShippingEnabled: true,
    freeShippingThreshold: 500,
    zones: {
      domestic: { label: 'Zambia (Domestic)', flatRate: 50, method: 'flat', baseRate: 30, perKgRate: 15 },
      regional: { label: 'Southern Africa (Regional)', flatRate: 150, method: 'flat', baseRate: 80, perKgRate: 35 },
      international: { label: 'International', flatRate: 350, method: 'weight', baseRate: 150, perKgRate: 60 },
    },
  },
  cvGenerator: {
    enabled: true,
    priceZmw: Number(process.env.CV_GENERATOR_PRICE_ZMW || 75),
  },
};

function normalizeCvGeneratorSettings(cv = {}) {
  return {
    enabled: parseBoolean(cv.enabled, true),
    priceZmw: Math.max(0, toNumber(cv.priceZmw, SYSTEM_SETTINGS_DEFAULTS.cvGenerator.priceZmw)),
  };
}

function mergeSystemSettings(stored = {}) {
  const normalizedStored = typeof stored === 'string'
    ? (() => {
      try {
        return JSON.parse(stored);
      } catch {
        return {};
      }
    })()
    : (stored || {});

  return {
    ...SYSTEM_SETTINGS_DEFAULTS,
    ...normalizedStored,
    email: { ...SYSTEM_SETTINGS_DEFAULTS.email, ...(normalizedStored.email || {}) },
    payment: { ...SYSTEM_SETTINGS_DEFAULTS.payment, ...(normalizedStored.payment || {}) },
    sms: { ...SYSTEM_SETTINGS_DEFAULTS.sms, ...(normalizedStored.sms || {}) },
    whatsapp: { ...SYSTEM_SETTINGS_DEFAULTS.whatsapp, ...(normalizedStored.whatsapp || {}) },
    notifications: { ...SYSTEM_SETTINGS_DEFAULTS.notifications, ...(normalizedStored.notifications || {}) },
    security: { ...SYSTEM_SETTINGS_DEFAULTS.security, ...(normalizedStored.security || {}) },
    integrations: { ...SYSTEM_SETTINGS_DEFAULTS.integrations, ...(normalizedStored.integrations || {}) },
    video: normalizeVideoSettings({ ...SYSTEM_SETTINGS_DEFAULTS.video, ...(normalizedStored.video || {}) }),
    zoom: { ...SYSTEM_SETTINGS_DEFAULTS.zoom, ...(normalizedStored.zoom || {}) },
    daily: { ...SYSTEM_SETTINGS_DEFAULTS.daily, ...(normalizedStored.daily || {}) },
    shipping: { ...SYSTEM_SETTINGS_DEFAULTS.shipping, ...(normalizedStored.shipping || {}) },
    cvGenerator: normalizeCvGeneratorSettings({
      ...SYSTEM_SETTINGS_DEFAULTS.cvGenerator,
      ...(normalizedStored.cvGenerator || {}),
    }),
  };
}

function normalizeVideoSettings(video = {}) {
  const defaultProvider = ['zoom', 'daily'].includes(String(video.defaultProvider || '').toLowerCase())
    ? String(video.defaultProvider).toLowerCase()
    : 'zoom';
  let enabledProviders = Array.isArray(video.enabledProviders)
    ? video.enabledProviders.map((v) => String(v).toLowerCase()).filter((v) => v === 'zoom' || v === 'daily')
    : ['zoom', 'daily'];
  if (!enabledProviders.length) enabledProviders = ['zoom'];
  if (!enabledProviders.includes(defaultProvider)) {
    enabledProviders = [...new Set([...enabledProviders, defaultProvider])];
  }
  const joinMode = String(video.joinMode || '').toLowerCase() === 'embed' ? 'embed' : 'redirect';
  return { defaultProvider, enabledProviders, joinMode };
}

function parseJsonColumn(value, fallback = {}) {
  if (value == null) return fallback;

  let parsed = value;

  // Handle plain JSON and repeatedly-stringified JSON payloads.
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof parsed !== 'string') break;
    const text = parsed.trim();
    if (!text) return fallback;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  if (!parsed || typeof parsed !== 'object') return fallback;

  // Legacy recovery:
  // some writes spread a JSON string into an object, producing keys "0","1","2",...
  // Rebuild the original JSON string and parse it back to an object.
  const keys = Object.keys(parsed);
  const numericKeys = keys.filter((key) => /^\d+$/.test(key));
  const nonNumericEntries = Object.entries(parsed).filter(([key]) => !/^\d+$/.test(key));
  if (numericKeys.length > 0) {
    const reconstructed = numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => String(parsed[key] ?? ''))
      .join('');

    if (reconstructed.trim()) {
      let repaired = reconstructed;
      for (let depth = 0; depth < 4; depth += 1) {
        if (typeof repaired !== 'string') break;
        try {
          repaired = JSON.parse(repaired);
        } catch {
          break;
        }
      }
      if (repaired && typeof repaired === 'object') {
        parsed = Array.isArray(repaired)
          ? repaired
          : { ...repaired, ...Object.fromEntries(nonNumericEntries) };
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') return fallback;

  if (!Array.isArray(parsed)) {
    // Drop any numeric artifact keys that may still be present.
    return Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !/^\d+$/.test(key)),
    );
  }

  return parsed;
}

function normalizeSectionVisibility(map = {}) {
  const flat = {};
  const walk = (node, prefix) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'boolean') {
        flat[path] = value;
      } else if (value && typeof value === 'object') {
        walk(value, path);
      }
    }
  };
  walk(map, '');
  return flat;
}

function mergeWebsitePagesProfile(existingPages = {}, nextPages = {}) {
  if (!nextPages || typeof nextPages !== 'object') return existingPages || {};
  const existing = existingPages && typeof existingPages === 'object' ? existingPages : {};
  return {
    ...existing,
    ...nextPages,
    home: { ...(existing.home || {}), ...(nextPages.home || {}) },
    about: { ...(existing.about || {}), ...(nextPages.about || {}) },
    experience: { ...(existing.experience || {}), ...(nextPages.experience || {}) },
    blog: { ...(existing.blog || {}), ...(nextPages.blog || {}) },
    events: { ...(existing.events || {}), ...(nextPages.events || {}) },
    shop: { ...(existing.shop || {}), ...(nextPages.shop || {}) },
    contact: { ...(existing.contact || {}), ...(nextPages.contact || {}) },
    global: { ...(existing.global || {}), ...(nextPages.global || {}) },
    sectionVisibility: {
      ...normalizeSectionVisibility(existing.sectionVisibility || {}),
      ...normalizeSectionVisibility(nextPages.sectionVisibility || {}),
    },
    customPages: Array.isArray(nextPages.customPages)
      ? nextPages.customPages
      : (Array.isArray(existing.customPages) ? existing.customPages : []),
  };
}

function getLencoConfig(systemSettings) {
  const payment = systemSettings?.payment || {};
  const sandboxMode = Boolean(payment.sandboxMode);

  return {
    provider: payment.provider || 'lenco',
    publicKey: String(payment.publicKey || ''),
    secretKey: String(payment.secretKey || ''),
    webhookSecret: String(payment.webhookSecret || ''),
    accountId: String(payment.accountId || ''),
    currency: String(payment.currency || 'ZMW'),
    sandboxMode,
    baseUrl: sandboxMode ? 'https://api.sandbox.lenco.co/access/v2' : 'https://api.lenco.co/access/v2',
    widgetUrl: sandboxMode ? 'https://pay.sandbox.lenco.co/js/v1/inline.js' : 'https://pay.lenco.co/js/v1/inline.js',
  };
}

async function getZoomConfig() {
  let dbZoom = {};
  try {
    const settings = await getSystemSettings();
    dbZoom = settings?.zoom || {};
  } catch { /* fall through to env defaults */ }
  return {
    accountId: String(dbZoom.accountId || process.env.ZOOM_ACCOUNT_ID || '').trim(),
    clientId: String(dbZoom.clientId || process.env.ZOOM_CLIENT_ID || '').trim(),
    clientSecret: String(dbZoom.clientSecret || process.env.ZOOM_CLIENT_SECRET || '').trim(),
    sdkKey: String(dbZoom.sdkKey || process.env.ZOOM_MEETING_SDK_KEY || '').trim(),
    sdkSecret: String(dbZoom.sdkSecret || process.env.ZOOM_MEETING_SDK_SECRET || '').trim(),
    defaultHostEmail: String(dbZoom.defaultHostEmail || process.env.ZOOM_DEFAULT_HOST_EMAIL || '').trim(),
    webhookSecretToken: String(dbZoom.webhookSecretToken || process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '').trim(),
    oauthBaseUrl: 'https://zoom.us',
    apiBaseUrl: 'https://api.zoom.us/v2',
  };
}

async function getDailyConfig() {
  let dbDaily = {};
  try {
    const settings = await getSystemSettings();
    dbDaily = settings?.daily || {};
  } catch { /* fall through to env defaults */ }
  const domain = String(dbDaily.domain || process.env.DAILY_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return {
    apiKey: String(dbDaily.apiKey || process.env.DAILY_API_KEY || '').trim(),
    domain,
    webhookSecret: String(dbDaily.webhookSecret || process.env.DAILY_WEBHOOK_SECRET || '').trim(),
    defaultRoomPrivacy: String(dbDaily.defaultRoomPrivacy || 'private').toLowerCase() === 'public' ? 'public' : 'private',
    maxParticipantsDefault: Math.min(200, Math.max(2, Number(dbDaily.maxParticipantsDefault || 200) || 200)),
    apiBaseUrl: 'https://api.daily.co/v1',
  };
}

async function getVideoSettings() {
  try {
    const settings = await getSystemSettings();
    return normalizeVideoSettings(settings?.video || {});
  } catch {
    return normalizeVideoSettings({});
  }
}

function resolveEventVideoProvider(event = {}, videoSettings = null) {
  const platform = String(event.meeting_platform || '').toLowerCase();
  if (platform === 'zoom' || platform === 'daily') return platform;
  const normalized = videoSettings ? normalizeVideoSettings(videoSettings) : { defaultProvider: 'zoom' };
  const fallback = String(normalized.defaultProvider || 'zoom').toLowerCase();
  return ['zoom', 'daily'].includes(fallback) ? fallback : 'zoom';
}

function isVideoProviderEnabled(provider, videoSettings) {
  const normalized = normalizeVideoSettings(videoSettings || {});
  return normalized.enabledProviders.includes(String(provider || '').toLowerCase());
}

function sanitizeDailyRoomName(value = '') {
  const base = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const name = base || `room-${Date.now()}`;
  return name.slice(0, 128);
}

function buildDailyRoomNameForEvent(event = {}) {
  const slugPart = sanitizeDailyRoomName(String(event.slug || '').slice(0, 40));
  const idPart = sanitizeDailyRoomName(String(event.id || '').slice(0, 40));
  return sanitizeDailyRoomName(`evt-${idPart || slugPart}`);
}

async function dailyRequest({ dailyConfig, method = 'GET', path: endpointPath = '', body = null }) {
  if (!dailyConfig?.apiKey) {
    throw new Error('Daily API key is missing. Configure it in Settings → Video Meetings.');
  }
  const response = await fetch(`${dailyConfig.apiBaseUrl}${endpointPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${dailyConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const detail = json?.error || json?.info || json?.message || text || response.statusText;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return json;
}

function getDailyRoomWindowForEvent(event = {}) {
  const start = toZoomDateTime(event);
  if (!start) return { nbf: null, exp: null };
  const joinWindow = getJoinWindowForEvent(event);
  const joinFrom = joinWindow.joinFrom ? Math.floor(new Date(joinWindow.joinFrom).getTime() / 1000) : null;
  const joinUntil = joinWindow.joinUntil ? Math.floor(new Date(joinWindow.joinUntil).getTime() / 1000) : null;
  return { nbf: joinFrom, exp: joinUntil };
}

function mapDailyWebhookEventToStatus(eventType = '') {
  const normalized = String(eventType || '').trim().toLowerCase();
  if (normalized === 'meeting.started') return 'started';
  if (normalized === 'meeting.ended') return 'ended';
  return normalized || 'unknown';
}

function verifyDailyWebhookRequest(req, dailyConfig) {
  const secret = String(dailyConfig.webhookSecret || '').trim();
  if (!secret) {
    return { ok: false, reason: 'DAILY_WEBHOOK_SECRET is not configured.' };
  }
  const signature = String(req.headers['x-webhook-signature'] || '').trim();
  const timestamp = String(req.headers['x-webhook-timestamp'] || '').trim();
  if (!signature || !timestamp) {
    return { ok: false, reason: 'Missing Daily webhook signature headers.' };
  }
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signingPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signingPayload).digest('base64');
  if (!timingSafeCompare(signature, expected)) {
    return { ok: false, reason: 'Invalid Daily webhook signature.' };
  }
  return { ok: true };
}

async function getZoomProviderStatus() {
  const zoomConfig = await getZoomConfig();
  const hasOAuth = !!(zoomConfig.accountId && zoomConfig.clientId && zoomConfig.clientSecret);
  const hasHostEmail = !!String(zoomConfig.defaultHostEmail || '').trim();
  const hasSdk = !!(zoomConfig.sdkKey && zoomConfig.sdkSecret);
  const hasWebhook = !!String(zoomConfig.webhookSecretToken || '').trim();
  return {
    configured: hasOAuth && hasHostEmail,
    oauth: hasOAuth,
    hostEmail: hasHostEmail,
    sdk: hasSdk,
    webhook: hasWebhook,
  };
}

async function getDailyProviderStatus() {
  const dailyConfig = await getDailyConfig();
  const hasApiKey = !!dailyConfig.apiKey;
  const hasDomain = !!dailyConfig.domain;
  const hasWebhook = !!dailyConfig.webhookSecret;
  return {
    configured: hasApiKey && hasDomain,
    apiKey: hasApiKey,
    domain: hasDomain,
    webhook: hasWebhook,
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwtHmacSha256(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signature}`;
}

function verifyJwtHmacSha256(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (!timingSafeCompare(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
    return payload;
  } catch {
    return null;
  }
}

function toZoomDateTime(event = {}) {
  const datePart = String(event.start_date || '').trim();
  if (!datePart) return null;
  const timePart = String(event.start_time || '00:00:00').trim() || '00:00:00';
  const normalizedTime = timePart.length === 5 ? `${timePart}:00` : timePart;
  const timezone = String(event.timezone || 'Africa/Lusaka').trim();

  // Parse date+time as UTC first (appending Z), then correct for the event's timezone.
  const asIfUtc = new Date(`${datePart}T${normalizedTime}Z`);
  if (Number.isNaN(asIfUtc.getTime())) return null;

  try {
    // Ask Intl what the local wall-clock reads in the event timezone for this UTC instant.
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(asIfUtc).reduce((m, p) => { m[p.type] = p.value; return m; }, {});
    // What UTC instant corresponds to that wall-clock time? Build it as UTC.
    const wallAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    // offsetMs > 0 means the timezone is ahead of UTC (e.g. UTC+2 → +7200000 ms)
    const offsetMs = wallAsUtc.getTime() - asIfUtc.getTime();
    // Subtract offset to turn local event time into UTC
    return new Date(asIfUtc.getTime() - offsetMs);
  } catch {
    // Fallback: treat as local time without adjustment
    return new Date(`${datePart}T${normalizedTime}`);
  }
}

function toZoomDurationMinutes(event = {}) {
  const start = toZoomDateTime(event);
  if (!start) return 90;

  const endDatePart = String(event.end_date || event.start_date || '').trim();
  const endTimePart = String(event.end_time || '').trim();
  if (!endDatePart || !endTimePart) return 90;

  const normalizedEndTime = endTimePart.length === 5 ? `${endTimePart}:00` : endTimePart;
  const end = new Date(`${endDatePart}T${normalizedEndTime}`);
  if (Number.isNaN(end.getTime())) return 90;

  const duration = Math.round((end.getTime() - start.getTime()) / 60000);
  return Number.isFinite(duration) && duration > 0 ? duration : 90;
}

let zoomAccessTokenCache = {
  token: '',
  expiresAt: 0,
};

async function getZoomAccessToken(zoomConfig) {
  if (!zoomConfig.accountId || !zoomConfig.clientId || !zoomConfig.clientSecret) {
    throw new Error('Zoom credentials are missing. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.');
  }

  const now = Date.now();
  if (zoomAccessTokenCache.token && zoomAccessTokenCache.expiresAt - 60_000 > now) {
    return zoomAccessTokenCache.token;
  }

  const credentials = Buffer.from(`${zoomConfig.clientId}:${zoomConfig.clientSecret}`).toString('base64');
  const response = await fetch(
    `${zoomConfig.oauthBaseUrl}/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(zoomConfig.accountId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok || !parsed?.access_token) {
    throw new Error(parsed?.reason || parsed?.message || `Failed to obtain Zoom access token (${response.status}).`);
  }

  const expiresInMs = Math.max(Number(parsed.expires_in || 3600) * 1000, 60_000);
  zoomAccessTokenCache = {
    token: String(parsed.access_token),
    expiresAt: now + expiresInMs,
  };
  return zoomAccessTokenCache.token;
}

async function zoomRequest({ zoomConfig, method = 'GET', path: endpointPath = '', body = null }) {
  const token = await getZoomAccessToken(zoomConfig);
  const response = await fetch(`${zoomConfig.apiBaseUrl}${endpointPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed?.message || parsed?.reason || `Zoom request failed (${response.status}).`;
    throw new Error(message);
  }

  return parsed;
}

function timingSafeCompare(a = '', b = '') {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || '').trim();
const DEFAULT_AUTH_TOKEN_SECRET = 'dev-only-auth-secret';
const AUTH_TOKEN_SECRET_SOURCE = String(process.env.AUTH_TOKEN_SECRET || process.env.JWT_SECRET || '').trim();
const AUTH_TOKEN_SECRET = AUTH_TOKEN_SECRET_SOURCE || DEFAULT_AUTH_TOKEN_SECRET;

if (IS_PRODUCTION && (!AUTH_TOKEN_SECRET_SOURCE || AUTH_TOKEN_SECRET === DEFAULT_AUTH_TOKEN_SECRET)) {
  throw new Error('AUTH_TOKEN_SECRET or JWT_SECRET must be set to a strong value in production.');
}

function getBearerToken(req) {
  const bearer = String(req.headers.authorization || '').trim();
  return bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
}

function getJwtAuth(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, message: 'Authentication required.', token: '' };
  }

  const claims = verifyJwtHmacSha256(token, AUTH_TOKEN_SECRET);
  if (!claims?.sub) {
    return { ok: false, status: 401, message: 'Invalid session. Please log in again.', token };
  }

  // Require exp — tokens without an expiry claim are rejected
  if (!claims.exp) {
    return { ok: false, status: 401, message: 'Invalid session token. Please log in again.', token };
  }

  if (Math.floor(Date.now() / 1000) > Number(claims.exp)) {
    return { ok: false, status: 401, message: 'Session expired. Please log in again.', token };
  }

  return { ok: true, claims, token };
}

function getAdminAuth(req) {
  const jwt = getJwtAuth(req);
  if (jwt.ok) {
    const perms = Array.isArray(jwt.claims.permissions) ? jwt.claims.permissions : [];
    if (jwt.claims.role === 'admin' || jwt.claims.admin === true || perms.length > 0) {
      return { ok: true, source: 'jwt', claims: jwt.claims };
    }
    return { ok: false, status: 403, message: 'Administrator privileges required.' };
  }

  const headerKey = String(req.headers['x-admin-api-key'] || '').trim();
  const candidate = headerKey || jwt.token;
  if (ADMIN_API_KEY && candidate && timingSafeCompare(candidate, ADMIN_API_KEY)) {
    return {
      ok: true,
      source: 'api-key',
      claims: { role: 'admin', admin: true, permissions: ALL_PERMISSION_KEYS },
    };
  }

  return { ok: false, status: jwt.status || 401, message: jwt.message || 'Unauthorized admin request. Please log in as an administrator.' };
}

function sendAuthFailure(res, auth) {
  return res.status(auth?.status || 401).json({
    ok: false,
    message: auth?.message || 'Unauthorized request.',
  });
}

function isAdminProtectedRoute(req) {
  const method = String(req.method || '').toUpperCase();
  const routePath = String(req.path || '');

  // Public safe reads
  if (routePath === '/api/settings/payment/public' && method === 'GET') return false;
  if (routePath === '/api/settings/zoom/status' && method === 'GET') return false;
  if (routePath === '/api/settings/video/status' && method === 'GET') return false;
  if (routePath === '/api/contact-messages' && method === 'POST') return false;
  // Users join meetings — must not require admin
  if (/^\/api\/events\/[^/]+\/zoom\/join-auth$/.test(routePath) && method === 'POST') return false;
  if (/^\/api\/events\/[^/]+\/daily\/join-auth$/.test(routePath) && method === 'POST') return false;
  if (/^\/api\/events\/[^/]+\/video\/join-auth$/.test(routePath) && method === 'POST') return false;
  if (/^\/api\/events\/[^/]+\/coupon-preview$/.test(routePath) && method === 'POST') return false;
  if (/^\/api\/certificates\/verify\/[^/]+$/.test(routePath) && method === 'GET') return false;
  if (routePath === '/api/partner-logos' && method === 'GET') {
    const all = String(req.query?.all || '').toLowerCase();
    return all === '1' || all === 'true';
  }
  if (routePath === '/api/menu-items' && method === 'GET') {
    const all = String(req.query?.all || '').toLowerCase();
    return all === '1' || all === 'true';
  }

  if (routePath === '/api/db-test') return true;
  if (routePath === '/api/notifications/test') return true;
  if (routePath.startsWith('/api/admin/')) return true;
  if (routePath.startsWith('/api/settings/')) return true;
  if (routePath === '/api/profile' && method === 'PUT') return true;
  if (routePath.startsWith('/api/site-images')) return true;
  if (routePath.startsWith('/api/events') && ['POST', 'PUT', 'DELETE'].includes(method)) return true;
  if (/^\/api\/events\/[^/]+\/zoom\/meta$/.test(routePath)) return true;
  if (/^\/api\/events\/[^/]+\/daily\/meta$/.test(routePath)) return true;
  if (routePath.startsWith('/api/blog') && ['POST', 'PUT', 'DELETE'].includes(method)) return true;
  if (routePath.startsWith('/api/publications') && ['POST', 'PUT', 'DELETE'].includes(method)) return true;
  if (routePath.startsWith('/api/contact-messages')) return true;
  if (routePath === '/api/books/orders' && method === 'POST') return false;
  if (routePath === '/api/books/orders' && method === 'GET') return true;
  if (/^\/api\/books\/orders\/[^/]+\/status$/.test(routePath)) return true;
  if (routePath.startsWith('/api/books') && ['POST', 'PUT', 'DELETE'].includes(method)) return true;
  if (routePath.startsWith('/api/shipping/config') && method === 'PUT') return true;
  if (routePath === '/api/payments/lenco/dashboard') return true;
  if (routePath === '/api/payments/lenco/banks') return true;
  if (routePath === '/api/payments/lenco/bank-lookup') return true;
  if (routePath === '/api/payments/lenco/mobile-money-lookup') return true;
  if (routePath.startsWith('/api/finance/')) return true;
  if (isCatalogAdminMutation(routePath, method)) return true;
  if (routePath.startsWith('/api/partner-logos') && method !== 'GET') return true;
  if (routePath.startsWith('/api/menu-items') && method !== 'GET') return true;

  return false;
}

const rateLimitNrcVerify = rateLimitByKey({
  routeKey: 'nrc-verify',
  windowMs: 60_000,
  max: 10,
  getKey: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
});

const rateLimitContactMessages = rateLimitByKey({
  routeKey: 'contact-messages',
  windowMs: 60 * 60_000,
  max: 8,
  getKey: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
});

app.use((req, res, next) => {
  if (!isAdminProtectedRoute(req)) return next();

  const auth = getAdminAuth(req);
  if (!auth.ok) return sendAuthFailure(res, auth);

  const permissions = Array.isArray(auth.claims.permissions) ? auth.claims.permissions : [];
  const required = resolveRouteAdminPermission(req);
  if (required && !permissionMatches(permissions, required)) {
    return res.status(403).json({
      ok: false,
      message: 'You do not have permission to perform this action.',
      required_permission: required,
    });
  }

  req.adminUser = { ...auth.claims, permissions };
  return next();
});

function verifyZoomWebhookRequest(req, zoomConfig) {
  const secret = String(zoomConfig.webhookSecretToken || '').trim();
  if (!secret) {
    return { ok: false, reason: 'ZOOM_WEBHOOK_SECRET_TOKEN is not configured.' };
  }

  const timestampHeader = String(req.headers['x-zm-request-timestamp'] || '').trim();
  const signatureHeader = String(req.headers['x-zm-signature'] || '').trim();
  if (!timestampHeader || !signatureHeader) {
    return { ok: false, reason: 'Missing Zoom webhook signature headers.' };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: 'Invalid Zoom webhook timestamp.' };
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > 60 * 5) {
    return { ok: false, reason: 'Zoom webhook signature timestamp expired.' };
  }

  const rawBody = String(req.rawBody || JSON.stringify(req.body || {}));
  const message = `v0:${timestampHeader}:${rawBody}`;
  const expected = `v0=${crypto.createHmac('sha256', secret).update(message).digest('hex')}`;

  if (!timingSafeCompare(signatureHeader, expected)) {
    return { ok: false, reason: 'Zoom webhook signature mismatch.' };
  }

  return { ok: true, reason: null };
}

function mapZoomWebhookEventToStatus(eventName = '') {
  const normalized = String(eventName || '').trim().toLowerCase();
  if (normalized === 'meeting.started') return 'started';
  if (normalized === 'meeting.ended') return 'ended';
  if (normalized === 'meeting.created') return 'scheduled';
  if (normalized === 'meeting.updated') return 'updated';
  if (normalized === 'meeting.deleted') return 'deleted';
  return 'synced';
}

function normalizePhone(phone = '') {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return '';

  let digits = trimmed.replace(/\s+/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = `260${digits.slice(1)}`;
  return digits;
}

function detectMobileOperator(phone = '') {
  const digits = normalizePhone(phone);
  const local = digits.startsWith('260') ? `0${digits.slice(3)}` : digits;
  const prefix = local.slice(0, 3);

  if (['097', '077'].includes(prefix)) return 'AIRTEL';
  if (['096', '076'].includes(prefix)) return 'MTN';
  if (['095', '075'].includes(prefix)) return 'ZAMTEL';
  return null;
}

function generatePaymentReference(prefix = 'MM') {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}

function generateEntityId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10).toLowerCase();
  return `${prefix}-${Date.now()}-${random}`;
}

function toArrayLike(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.collections)) return payload.collections;
  if (Array.isArray(payload?.banks)) return payload.banks;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.data?.collections)) return payload.data.collections;
  if (Array.isArray(payload?.data?.banks)) return payload.data.banks;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  return [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCollectionStatus(raw = '') {
  const status = String(raw || '').trim().toLowerCase();
  if (['successful', 'success', 'succeeded', 'completed', 'paid'].includes(status)) return 'successful';
  if (['pending', 'processing', 'initiated', 'queued'].includes(status)) return 'pending';
  if (['failed', 'cancelled', 'canceled', 'reversed', 'expired'].includes(status)) return 'failed';
  return status || 'unknown';
}

function getCvGeneratorConfig(settings = {}) {
  return normalizeCvGeneratorSettings(settings.cvGenerator || {});
}

function isPaidCollectionStatus(status = '') {
  return normalizeCollectionStatus(status) === 'successful';
}

async function ensureCvUnlockColumn() {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN cv_unlocked_at DATETIME NULL');
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME') throw e;
  }
}

async function ensureCvSectionsColumn() {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN cv_sections JSON NULL');
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME') throw e;
  }
}

async function grantCvUnlock(userId) {
  await ensureCvUnlockColumn();
  await pool.query('UPDATE users SET cv_unlocked_at = NOW() WHERE id = ?', [userId]);
}

async function loadCvSuggestionContext(userId) {
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return null;

  const [certRows] = await pool.query(
    `SELECT event_title, certificate_code, issued_at FROM event_certificates
     WHERE user_id = ? AND revoked = 0 ORDER BY issued_at DESC LIMIT 20`,
    [userId],
  );

  const [regRows] = await pool.query(
    `SELECT r.status, r.registered_at, e.title AS event_title
     FROM event_registrations r
     LEFT JOIN events e ON e.id = r.event_id
     WHERE r.user_id = ?
     ORDER BY r.registered_at DESC LIMIT 30`,
    [userId],
  );

  const sessionUser = {
    ...user,
    specialties: user.specialties
      ? String(user.specialties).split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  };

  return {
    user: sessionUser,
    certificates: certRows,
    registrations: regRows.map((r) => ({
      status: r.status,
      registered_at: r.registered_at,
      event_title: r.event_title,
    })),
  };
}

function normalizePayoutStatus(raw = '') {
  const status = String(raw || '').trim().toLowerCase();
  if (['successful', 'success', 'succeeded', 'completed', 'paid'].includes(status)) return 'successful';
  if (['pending', 'processing', 'initiated', 'queued'].includes(status)) return 'pending';
  if (['failed', 'cancelled', 'canceled', 'reversed', 'rejected', 'expired'].includes(status)) return 'failed';
  return status || 'pending';
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(v)) return false;
  }
  return fallback;
}

function normalizeBank(bank = {}, index = 0) {
  const code = String(
    bank.code
    ?? bank.bankCode
    ?? bank.bank_code
    ?? bank.id
    ?? bank.sortCode
    ?? bank.sort_code
    ?? `bank-${index}`,
  ).trim();

  const name = String(
    bank.name
    ?? bank.bankName
    ?? bank.bank_name
    ?? bank.bank
    ?? code,
  ).trim();

  return {
    code,
    name,
  };
}

function extractLookupPayload(payload = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const accountName = String(
    data.accountName
    ?? data.account_name
    ?? data.name
    ?? data.beneficiaryName
    ?? data.beneficiary_name
    ?? '',
  ).trim();

  const accountNumber = String(
    data.accountNumber
    ?? data.account_number
    ?? data.number
    ?? '',
  ).trim();

  const bankCode = String(
    data.bankCode
    ?? data.bank_code
    ?? data.bankId
    ?? data.bank_id
    ?? '',
  ).trim();

  const bankName = String(
    data.bankName
    ?? data.bank_name
    ?? data.bank
    ?? '',
  ).trim();

  return {
    accountName,
    accountNumber,
    bankCode,
    bankName,
    raw: payload,
  };
}

function extractMobileMoneyLookupPayload(payload = {}) {
  const root = payload || {};
  const data = root?.data && typeof root.data === 'object' ? root.data : root;
  const deep = data?.data && typeof data.data === 'object' ? data.data : data;

  const fullName = String(
    deep.fullName
    ?? deep.full_name
    ?? deep.customerName
    ?? deep.customer_name
    ?? deep.accountName
    ?? deep.account_name
    ?? deep.name
    ?? data.fullName
    ?? data.customerName
    ?? data.accountName
    ?? root.fullName
    ?? root.customerName
    ?? root.accountName
    ?? '',
  ).trim();

  const phone = String(
    deep.phoneNumber
    ?? deep.phone
    ?? data.phoneNumber
    ?? data.phone
    ?? root.phoneNumber
    ?? root.phone
    ?? '',
  ).trim();

  return {
    fullName,
    phone,
    raw: payload,
  };
}

async function lencoRequestAny({ secretKey, baseUrl, candidates = [] }) {
  const errors = [];

  for (const candidate of candidates) {
    try {
      const response = await lencoRequest({
        method: candidate.method || 'GET',
        path: candidate.path,
        body: candidate.body,
        secretKey,
        baseUrl,
      });

      return {
        path: candidate.path,
        method: candidate.method || 'GET',
        response,
      };
    } catch (error) {
      errors.push(`${candidate.method || 'GET'} ${candidate.path}: ${error.message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function getSystemSettings() {
  const [[row]] = await pool.query('SELECT data FROM system_settings WHERE id = 1');
  return mergeSystemSettings(row?.data || {});
}

async function saveSystemSettings(payload = {}) {
  const stored = await getSystemSettings();
  const withSecrets = preserveMaskedSecrets(payload, stored);
  const merged = mergeSystemSettings(withSecrets);
  validateVideoSettingsBeforeSave(merged);
  await pool.query(
    'INSERT INTO system_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [JSON.stringify(merged)],
  );
  // Clear cached Zoom access token so new credentials take effect immediately
  zoomAccessTokenCache = { token: null, expiresAt: 0 };
  return merged;
}

async function lencoRequest({ method = 'GET', path = '', secretKey, baseUrl, body = null }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let parsed;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed?.message || parsed?.error || `Lenco request failed (${response.status})`;
    throw new Error(message);
  }

  return parsed;
}

/** Strip ISO timestamps to YYYY-MM-DD for MySQL DATE columns. */
function toDateOnly(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length > 10 && s.includes('T')) return s.slice(0, 10);
  return s;
}

function toTimeOnly(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return null;
}

function buildLocalDateTime(dateValue, timeValue, fallbackTime = '00:00:00') {
  const datePart = String(dateValue || '').trim();
  if (!datePart) return null;
  const normalizedTime = toTimeOnly(timeValue) || fallbackTime;
  const dt = new Date(`${datePart}T${normalizedTime}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function hasEventEnded(event = {}) {
  return isEventEnded(event);
}

function validateEventTemporalRules(payload = {}) {
  const startDate = payload.start_date;
  const endDate = payload.end_date || payload.start_date;

  if (!startDate) {
    return 'Start date is required.';
  }
  if (!endDate) {
    return 'End date is required.';
  }

  const start = buildLocalDateTime(startDate, payload.start_time, '00:00:00');
  const end = buildLocalDateTime(endDate, payload.end_time, '23:59:59');

  if (!start || !end) {
    return 'Invalid start/end date or time.';
  }

  if (end.getTime() < start.getTime()) {
    return 'End date/time cannot be earlier than start date/time.';
  }

  const hasDeadlineDate = Boolean(payload.registration_deadline);
  const hasDeadlineTime = Boolean(payload.registration_deadline_time);

  if (hasDeadlineDate !== hasDeadlineTime) {
    return 'Registration deadline must include both date and time.';
  }

  if (hasDeadlineDate && hasDeadlineTime) {
    const deadline = buildLocalDateTime(payload.registration_deadline, payload.registration_deadline_time, '00:00:00');
    if (!deadline) {
      return 'Invalid registration deadline date/time.';
    }
    if (deadline.getTime() > end.getTime()) {
      return 'Registration deadline cannot be after the event ends.';
    }
  }

  return null;
}

function normalizeEventPayload(payload = {}, fallbackId = null) {
  return {
    id: String(payload.id || fallbackId || `evt-${Date.now()}`),
    title: String(payload.title || '').trim(),
    slug: String(payload.slug || '').trim(),
    short_description: payload.short_description || '',
    description: payload.description || '',
    cover_image: payload.cover_image || '',
    event_mode: payload.event_mode || 'virtual',
    meeting_platform: payload.meeting_platform || '',
    meeting_link: payload.meeting_link || '',
    venue: payload.venue || '',
    location: payload.location || '',
    start_date: toDateOnly(payload.start_date),
    end_date: toDateOnly(payload.end_date),
    start_time: payload.start_time || null,
    end_time: payload.end_time || null,
    timezone: payload.timezone || 'Africa/Lusaka',
    capacity: payload.capacity === '' || payload.capacity == null ? null : Number(payload.capacity),
    booking_type: payload.booking_type || 'subscription',
    price: Number(payload.price || 0),
    is_free: parseBoolean(payload.is_free, false),
    status: payload.status || 'draft',
    registration_deadline: toDateOnly(payload.registration_deadline),
  registration_deadline_time: toTimeOnly(payload.registration_deadline_time),
    visibility: payload.visibility || 'public',
    organizer_name: payload.organizer_name || '',
    organizer_email: payload.organizer_email || '',
    organizer_phone: payload.organizer_phone || '',
    category: payload.category || 'Other',
    featured: parseBoolean(payload.featured, false),
    featured_speakers: payload.featured_speakers ? JSON.stringify(
      Array.isArray(payload.featured_speakers)
        ? payload.featured_speakers
        : (() => { try { return JSON.parse(payload.featured_speakers); } catch { return []; } })()
    ) : null,
    partners: payload.partners ? JSON.stringify(
      Array.isArray(payload.partners)
        ? payload.partners
        : (() => { try { return JSON.parse(payload.partners); } catch { return []; } })()
    ) : null,
    delivery_mode: payload.delivery_mode || (payload.event_mode === 'in_person' ? 'physical' : 'virtual'),
    provider: payload.provider || (
      payload.meeting_platform === 'zoom' ? 'zoom'
        : payload.meeting_platform === 'daily' ? 'daily'
          : 'internal'
    ),
    zoom_meeting_id: payload.zoom_meeting_id ? String(payload.zoom_meeting_id) : null,
    zoom_uuid: payload.zoom_uuid || null,
    zoom_join_url: payload.zoom_join_url || null,
    zoom_start_url: payload.zoom_start_url || null,
    zoom_password: payload.zoom_password || null,
    zoom_host_email: payload.zoom_host_email || null,
    zoom_status: payload.zoom_status || null,
    zoom_created_at: payload.zoom_created_at || null,
    zoom_synced_at: payload.zoom_synced_at || null,
    daily_room_name: payload.daily_room_name || null,
    daily_room_url: payload.daily_room_url || null,
    daily_status: payload.daily_status || null,
    daily_created_at: payload.daily_created_at || null,
    daily_synced_at: payload.daily_synced_at || null,
    forum_enabled: parseBoolean(payload.forum_enabled, false),
  };
}

function normalizeBlogPayload(payload = {}, fallbackId = null) {
  return {
    id: String(payload.id || fallbackId || `blog-${Date.now()}`),
    title: String(payload.title || '').trim(),
    slug: String(payload.slug || '').trim(),
    category: payload.category || 'Other',
    date: payload.date || new Date().toISOString().split('T')[0],
    excerpt: payload.excerpt || '',
    content: sanitizeBlogHtml(payload.content || ''),
    featured: Boolean(payload.featured),
    read_time: payload.readTime || payload.read_time || '1 min read',
    image: payload.image || null,
  };
}

function normalizePublicationPayload(payload = {}, fallbackId = null) {
  return {
    id: String(payload.id || fallbackId || `pub-${Date.now()}`),
    title: String(payload.title || '').trim(),
    authors: String(payload.authors || '').trim(),
    journal: String(payload.journal || '').trim(),
    year: Number.isFinite(Number(payload.year)) ? Number(payload.year) : null,
    volume: String(payload.volume || '').trim(),
    doi: String(payload.doi || '').trim(),
    abstract: String(payload.abstract || '').trim(),
  };
}

function normalizeContactMessagePayload(payload = {}, fallbackId = null) {
  return {
    id: String(payload.id || fallbackId || generateEntityId('msg')),
    name: String(payload.name || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: String(payload.phone || '').trim(),
    subject: String(payload.subject || '').trim(),
    message: String(payload.message || '').trim(),
    is_read: parseBoolean(payload.is_read, false),
  };
}

function normalizeBookPayload(payload = {}, fallbackId = null) {
  // Product type is sourced from the dynamic product_types table; the admin form
  // restricts choices to active rows, so we just lowercase and trust the value.
  // Empty / null falls back to 'book' for backward-compat with seeded rows.
  const productType = String(payload.product_type || '').toLowerCase().trim() || 'book';
  const safeProductType = productType;

  const serializeJsonArray = (value) => {
    if (value == null) return '[]';
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return JSON.stringify(Array.isArray(parsed) ? parsed : []);
      } catch {
        return '[]';
      }
    }
    return JSON.stringify(Array.isArray(value) ? value : []);
  };

  return {
    id: String(payload.id || fallbackId || generateEntityId('book')),
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
    stock: payload.stock === '' || payload.stock == null ? 0 : Number(payload.stock),
    weight_kg: Number(payload.weight_kg || 0),
    is_digital: parseBoolean(payload.is_digital, false),
    is_published: parseBoolean(payload.is_published, false),
    featured: parseBoolean(payload.featured, false),
    pages: payload.pages === '' || payload.pages == null ? 0 : Number(payload.pages),
    publisher: String(payload.publisher || '').trim(),
    publish_year: Number.isFinite(Number(payload.publish_year)) ? Number(payload.publish_year) : null,
    language: payload.language || 'English',
    format: payload.format || 'paperback',
    product_type: safeProductType,
    event_id: payload.event_id ? String(payload.event_id).trim() : null,
    tagline: String(payload.tagline || '').trim(),
    variants: serializeJsonArray(payload.variants),
    gallery: serializeJsonArray(payload.gallery),
  };
}

function normalizeBookOrderPayload(payload = {}) {
  return {
    id: String(payload.id || generateEntityId('ord')),
    user_id: String(payload.user_id || ''),
    user_name: String(payload.user_name || '').trim(),
    user_email: String(payload.user_email || '').trim().toLowerCase(),
    items: typeof payload.items === 'string' ? payload.items : JSON.stringify(payload.items || []),
    subtotal: Number(payload.subtotal || 0),
    shipping_cost: Number(payload.shipping_cost || 0),
    shipping_method: String(payload.shipping_method || ''),
    shipping_label: String(payload.shipping_label || ''),
    total: Number(payload.total || 0),
    currency: payload.currency || 'ZMW',
    shipping_address: typeof payload.shipping_address === 'string' ? payload.shipping_address : JSON.stringify(payload.shipping_address || {}),
    shipping_zone: String(payload.shipping_zone || 'domestic'),
    payment_method: String(payload.payment_method || ''),
    payment_reference: String(payload.payment_reference || ''),
    payment_status: String(payload.payment_status || 'unpaid'),
    status: String(payload.status || 'pending'),
    notes: String(payload.notes || ''),
  };
}

function parseBookOrderItems(row = {}) {
  try {
    return typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
  } catch {
    return [];
  }
}

async function computeBookOrderTotalsFromDb(items = [], shippingCost = 0) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return { subtotal: 0, total: Number(shippingCost || 0) };
  }
  const bookIds = [...new Set(list.map((i) => i.bookId).filter(Boolean))];
  if (bookIds.length === 0) {
    return { subtotal: 0, total: Number(shippingCost || 0) };
  }
  const [bookRows] = await pool.query(
    `SELECT id, price FROM books WHERE id IN (${bookIds.map(() => '?').join(', ')})`,
    bookIds,
  );
  const priceMap = Object.fromEntries(bookRows.map((b) => [b.id, Number(b.price || 0)]));
  const subtotal = list.reduce((sum, item) => {
    const unitPrice = priceMap[item.bookId] ?? 0;
    return sum + unitPrice * (Number(item.quantity) || 1);
  }, 0);
  const shipping = Number(shippingCost || 0);
  return { subtotal, total: subtotal + shipping };
}

async function decrementBookOrderStock(items = []) {
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (item.bookId && !item.is_digital) {
      await pool.query(
        'UPDATE books SET stock = GREATEST(stock - ?, 0) WHERE id = ?',
        [item.quantity || 1, item.bookId],
      );
    }
  }
}

async function sendBookOrderReceiptIfNeeded({ previousOrder, currentOrder, req }) {
  const settings = await getSystemSettings();
  const receiptRecord = mapToReceiptRecord('order', currentOrder);
  return maybeSendReceiptOnSettlement({
    previousRegistration: { payment_status: previousOrder?.payment_status || 'unpaid' },
    currentRegistration: {
      ...receiptRecord,
      receipt_source: 'order',
      receipt_source_id: currentOrder.id,
    },
    settings,
    sendEmailNotification,
    buildBrandedEmailHtml,
    appRoot: __appRoot,
    appOrigin: resolvePublicAppUrl(req),
    pool,
  });
}

async function finalizePaidBookOrder({
  orderId,
  reference = '',
  paymentMethod = 'online',
  req,
  decrementStock = true,
}) {
  const [[existing]] = await pool.query('SELECT * FROM book_orders WHERE id = ? LIMIT 1', [orderId]);
  if (!existing) return { ok: false, status: 404, message: 'Order not found.' };

  const wasEligible = isReceiptEligible(existing.payment_status);
  await pool.query(
    `UPDATE book_orders SET payment_status = ?, payment_reference = ?, payment_method = ?,
      status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END
     WHERE id = ?`,
    ['paid', reference || existing.payment_reference, paymentMethod, orderId],
  );

  const [[row]] = await pool.query('SELECT * FROM book_orders WHERE id = ?', [orderId]);
  const parsed = {
    ...row,
    items: parseBookOrderItems(row),
  };

  if (decrementStock && !wasEligible) {
    try {
      await decrementBookOrderStock(parsed.items);
    } catch (stockErr) {
      console.warn('[shop/order] Stock decrement failed:', stockErr.message);
    }
  }

  if (!wasEligible) {
    try {
      await sendBookOrderReceiptIfNeeded({ previousOrder: existing, currentOrder: parsed, req });
    } catch (receiptErr) {
      console.warn('[shop/order] Receipt email failed:', receiptErr.message);
    }
  }

  return { ok: true, order: parsed };
}

function normalizeDateTimeText(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.includes('T')) return raw;
  if (raw.includes(' ')) return raw.replace(' ', 'T');
  return raw;
}

function mapDbRegistration(row = {}) {
  return {
    ...row,
    amount: toNumber(row.amount, 0),
    amount_zmw: toNumber(row.amount_zmw, 0),
    join_count: Number(row.join_count || 0),
    has_attended: Boolean(row.attended_at) || String(row.status || '').toLowerCase() === 'attended',
    registered_at: normalizeDateTimeText(row.registered_at),
    created_at: normalizeDateTimeText(row.created_at),
    updated_at: normalizeDateTimeText(row.updated_at),
    attended_at: normalizeDateTimeText(row.attended_at),
    last_joined_at: normalizeDateTimeText(row.last_joined_at),
  };
}

function mapPublicRegistration(row = {}) {
  return {
    event_id: String(row.event_id || ''),
    registration_type: String(row.registration_type || 'subscription'),
    status: String(row.status || 'confirmed'),
  };
}

function normalizeRegistrationPayload(payload = {}, idOverride) {
  const userId = String(payload.user_id || '').trim();
  const eventId = String(payload.event_id || '').trim();
  const eventPrice = toNumber(payload.event_price, 0);
  const isFreeEvent = parseBoolean(payload.is_free_event, false);
  const normalizedAmount = payload.amount == null || payload.amount === ''
    ? (isFreeEvent ? 0 : eventPrice)
    : toNumber(payload.amount, 0);

  return {
    id: String(idOverride || payload.id || generateEntityId('reg')).trim(),
    user_id: userId,
    user_name: String(payload.user_name || '').trim(),
    user_email: String(payload.user_email || '').trim().toLowerCase(),
    event_id: eventId,
    event_title: String(payload.event_title || '').trim(),
    event_slug: String(payload.event_slug || '').trim(),
    reference_code: String(payload.reference_code || payload.payment_reference || generatePaymentReference('REG')).trim(),
    registration_type: String(payload.registration_type || 'subscription').trim().toLowerCase(),
    status: String(payload.status || 'confirmed').trim().toLowerCase(),
    amount: normalizedAmount,
    currency: String(payload.currency || 'ZMW').trim().toUpperCase(),
    amount_zmw: payload.amount_zmw == null || payload.amount_zmw === ''
      ? (String(payload.currency || 'ZMW').trim().toUpperCase() === 'ZMW' ? normalizedAmount : eventPrice)
      : toNumber(payload.amount_zmw, 0),
    payment_status: String(payload.payment_status || (isFreeEvent ? 'not_required' : 'unpaid')).trim().toLowerCase(),
    payment_method: String(payload.payment_method || (isFreeEvent ? 'free' : '')).trim().toLowerCase(),
    payment_reference: String(payload.payment_reference || '').trim(),
    booked_for_name: String(payload.booked_for_name || '').trim() || null,
    booked_for_relation: String(payload.booked_for_relation || '').trim().toLowerCase() || null,
    attendee_slot_key: deriveAttendeeSlotKey(payload.booked_for_name),
    coupon_id: String(payload.coupon_id || '').trim() || null,
    coupon_code: String(payload.coupon_code || '').trim() || null,
    list_price_zmw: payload.list_price_zmw != null && payload.list_price_zmw !== ''
      ? roundMoney2(toNumber(payload.list_price_zmw, 0))
      : null,
    discount_zmw: roundMoney2(toNumber(payload.discount_zmw, 0)),
    notes: String(payload.notes || '').trim(),
  };
}

async function getUserByClaims(claims = {}) {
  const userId = String(claims.sub || '').trim();
  if (!userId) return null;

  const [[user]] = await pool.query(
    `SELECT id, name, email, phone, whatsapp, role, email_verified, cv_unlocked_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  );
  return user || null;
}

function cvRateLimitUserOrIp(req) {
  const auth = getJwtAuth(req);
  if (auth.ok && auth.claims?.sub) return String(auth.claims.sub);
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function cvRateLimitAdminKey(req) {
  const admin = req.adminUser;
  if (admin?.sub) return String(admin.sub);
  if (admin?.email) return String(admin.email);
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

const rateLimitCvAccess = rateLimitCv({
  routeKey: 'cv-access',
  windowMs: 60_000,
  max: 30,
  getKey: cvRateLimitUserOrIp,
});

const rateLimitCvSuggestions = rateLimitCv({
  routeKey: 'cv-suggestions',
  windowMs: 60_000,
  max: 10,
  getKey: cvRateLimitUserOrIp,
});

const rateLimitCvCheckout = rateLimitCv({
  routeKey: 'cv-checkout',
  windowMs: 15 * 60_000,
  max: 5,
  getKey: cvRateLimitUserOrIp,
});

const rateLimitAdminCvList = rateLimitCv({
  routeKey: 'admin-cv-list',
  windowMs: 60_000,
  max: 20,
  getKey: cvRateLimitAdminKey,
});

async function getVerifiedPaymentStatus(reference = '', eventId = null) {
  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference) return 'unknown';

  let collection;
  if (eventId) {
    const [[row]] = await pool.query(
      'SELECT status FROM payment_collections WHERE reference = ? AND event_id = ? LIMIT 1',
      [normalizedReference, String(eventId)],
    );
    collection = row;
  } else {
    const [[row]] = await pool.query(
      'SELECT status FROM payment_collections WHERE reference = ? LIMIT 1',
      [normalizedReference],
    );
    collection = row;
  }
  return normalizeCollectionStatus(collection?.status || '');
}

async function applyTrustedRegistrationPaymentState(payload, event) {
  const next = { ...payload };
  const listPrice = roundMoney2(toNumber(event?.price, 0));
  const explicitZmw = payload.amount_zmw != null && payload.amount_zmw !== ''
    ? roundMoney2(toNumber(payload.amount_zmw, listPrice))
    : null;
  const quotedPayZmw = explicitZmw != null ? explicitZmw : listPrice;

  const isFreeCatalog = parseBoolean(event?.is_free, false) || listPrice <= 0;
  const isZeroDue = quotedPayZmw <= 0;

  if (isFreeCatalog || isZeroDue) {
    next.amount = 0;
    next.amount_zmw = 0;
    next.currency = 'ZMW';
    next.payment_status = 'not_required';
    next.payment_method = next.payment_method || 'free';
    next.status = 'confirmed';
    return next;
  }

  next.amount_zmw = quotedPayZmw;
  if (String(next.currency || 'ZMW').toUpperCase() === 'ZMW') {
    next.amount = quotedPayZmw;
  }

  const paymentStatus = await getVerifiedPaymentStatus(
    next.payment_reference || next.reference_code,
    event?.id || null,
  );
  if (paymentStatus === 'successful') {
    next.payment_status = 'paid';
    next.status = 'confirmed';
  } else {
    next.payment_status = paymentStatus === 'failed' ? 'failed' : 'pending';
    next.status = paymentStatus === 'failed' ? 'cancelled' : 'pending';
  }

  return next;
}

function extractZoomMeetingNumber(rawId) {
  const raw = String(rawId || '').trim();
  if (!raw) return '';

  // Common Zoom URL formats:
  // - https://us06web.zoom.us/j/12345678901?pwd=...
  // - https://zoom.us/wc/join/12345678901?pwd=...
  const fromJoinPath = raw.match(/\/(?:j|wc\/join)\/(\d{9,12})(?:\b|\?|\/|$)/i);
  if (fromJoinPath?.[1]) return fromJoinPath[1];

  // Plain meeting number format.
  if (/^\d{9,12}$/.test(raw)) return raw;

  // Last-resort: find a likely meeting number chunk, but avoid concatenating
  // unrelated digits (e.g., from passcode query params).
  const chunk = raw.match(/\b(\d{9,12})\b/);
  if (chunk?.[1]) return chunk[1];

  return '';
}

function getJoinWindowForEvent(event = {}) {
  const start = toZoomDateTime(event);
  if (!start) return { allowed: false, reason: 'Event start time is not configured.' };

  const joinFrom = new Date(start.getTime() - 60 * 60 * 1000);  // open 60 min before start
  const durationMinutes = toZoomDurationMinutes(event);
  const eventEnd = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const joinUntil = new Date(eventEnd.getTime() + 30 * 60 * 1000);
  const now = new Date();

  if (now < joinFrom) {
    return {
      allowed: false,
      reason: 'Join will be available 60 minutes before the event starts.',
      joinFrom: joinFrom.toISOString(),
      joinUntil: joinUntil.toISOString(),
    };
  }

  if (now > joinUntil) {
    return {
      allowed: false,
      reason: 'This meeting join window has closed.',
      joinFrom: joinFrom.toISOString(),
      joinUntil: joinUntil.toISOString(),
    };
  }

  return {
    allowed: true,
    reason: null,
    joinFrom: joinFrom.toISOString(),
    joinUntil: joinUntil.toISOString(),
  };
}

async function assertCanJoinEvent({ eventId, authUser, reqBody = {}, providerLabel = 'this meeting' }) {
  const userId = String(authUser?.id || '').trim();
  const userEmail = String(authUser?.email || '').trim().toLowerCase();
  const userName = String(authUser?.name || '').trim() || 'Attendee';
  const role = authUser?.role === 'admin' && Number(reqBody?.role || 0) === 1 ? 1 : 0;

  if (!eventId) {
    return { ok: false, status: 400, message: 'eventId is required.' };
  }
  if (!userId || !userEmail) {
    return { ok: false, status: 401, message: 'Authenticated user context is required.' };
  }

  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return { ok: false, status: 404, message: 'Event not found.' };
  }

  const status = String(event.status || '').toLowerCase();
  if (status === 'cancelled') {
    return { ok: false, status: 403, message: 'This event has been cancelled.', event, userId, userEmail };
  }

  const windowState = getJoinWindowForEvent(event);
  if (!windowState.allowed) {
    return {
      ok: false,
      status: 403,
      message: windowState.reason,
      joinWindow: windowState,
      event,
      userId,
      userEmail,
    };
  }

  const [rows] = await pool.query(
    `SELECT * FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND user_email = ? AND status <> ?
     ORDER BY CASE WHEN COALESCE(attendee_slot_key, '__self__') = '__self__' THEN 0 ELSE 1 END,
              registered_at DESC
     LIMIT 1`,
    [eventId, userId, userEmail, 'cancelled'],
  );

  const registration = rows?.[0] || null;
  if (!registration) {
    return {
      ok: false,
      status: 403,
      message: `You must register for this event before joining ${providerLabel}.`,
      event,
      userId,
      userEmail,
    };
  }

  const paymentStatus = String(registration.payment_status || '').toLowerCase();
  const allowedPaymentStatuses = ['paid', 'not_required', 'waived'];
  if (!allowedPaymentStatuses.includes(paymentStatus)) {
    return {
      ok: false,
      status: 403,
      message: 'Registration payment is not approved for joining yet.',
      event,
      registration,
      userId,
      userEmail,
      paymentStatus,
    };
  }

  return {
    ok: true,
    event,
    registration,
    windowState,
    userId,
    userEmail,
    userName,
    role,
  };
}

function sanitizeForumText(raw, maxLen = 5000) {
  return String(raw || '').replace(/\0/g, '').trim().slice(0, maxLen);
}

function mapDbForumTopic(row) {
  if (!row) return null;
  return {
    id: row.id,
    event_id: row.event_id,
    user_id: row.user_id,
    user_name: row.user_name || '',
    title: row.title || '',
    body: row.body || '',
    pinned: Boolean(row.pinned),
    hidden: Boolean(row.hidden),
    reply_count: Number(row.reply_count || 0),
    last_activity_at: row.last_activity_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDbForumReply(row) {
  if (!row) return null;
  return {
    id: row.id,
    topic_id: row.topic_id,
    event_id: row.event_id,
    user_id: row.user_id,
    user_name: row.user_name || '',
    body: row.body || '',
    hidden: Boolean(row.hidden),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isForumVisibleEvent(event) {
  if (!event || !parseBoolean(event.forum_enabled, false)) return false;
  const status = String(event.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'draft') return false;
  if (String(event.visibility || '').toLowerCase() === 'private') return false;
  return ['published', 'closed', 'ongoing'].includes(status);
}

async function loadEventForForum(eventId) {
  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [eventId]);
  return event || null;
}

async function userIsRegisteredForEventForum(eventId, userId, userEmail) {
  const [rows] = await pool.query(
    `SELECT id FROM event_registrations
     WHERE event_id = ? AND user_id = ? AND user_email = ? AND status <> 'cancelled'
       AND LOWER(COALESCE(payment_status, '')) IN ('paid', 'not_required', 'waived')
     LIMIT 1`,
    [eventId, userId, userEmail],
  );
  return Boolean(rows?.[0]);
}

async function assertForumWriteAccess(eventId, authUser) {
  const event = await loadEventForForum(eventId);
  if (!event) {
    return { ok: false, status: 404, message: 'Event not found.' };
  }
  if (!isForumVisibleEvent(event)) {
    return { ok: false, status: 403, message: 'Forum is not available for this event.' };
  }
  const userId = String(authUser?.id || '').trim();
  const userEmail = String(authUser?.email || '').trim().toLowerCase();
  if (!userId || !userEmail) {
    return { ok: false, status: 401, message: 'Authentication required.' };
  }
  const adminAuth = authUser?.role === 'admin';
  const registered = adminAuth || await userIsRegisteredForEventForum(eventId, userId, userEmail);
  if (!registered) {
    return { ok: false, status: 403, message: 'Register for this event to join the forum.' };
  }
  return { ok: true, event, userId, userEmail, userName: String(authUser?.name || '').trim() || 'Attendee' };
}

async function markEventRegistrationAttendance(registrationId, joinSource = 'zoom') {
  await pool.query(
    `UPDATE event_registrations
     SET attended_at = COALESCE(attended_at, NOW()),
         last_joined_at = NOW(),
         join_count = join_count + 1,
         join_source = ?,
         status = CASE WHEN status = 'confirmed' THEN 'attended' ELSE status END
     WHERE id = ?`,
    [joinSource, registrationId],
  );
  const [[refreshed]] = await pool.query(
    'SELECT * FROM event_registrations WHERE id = ?',
    [registrationId],
  );
  return refreshed || null;
}

async function validateVideoSettingsBeforeSave(merged = {}) {
  const video = normalizeVideoSettings(merged.video || {});
  merged.video = video;

  if (!video.enabledProviders.includes(video.defaultProvider)) {
    throw new Error('Default video provider must be included in enabled providers.');
  }

  // Provider credentials are validated when creating meetings, not when saving email/payment settings.
  return merged;
}

/**
 * Cached SMTP transport — reused across sends to avoid TCP connection churn.
 * Invalidated when config changes (fingerprinted by host+port+user).
 */
let _smtpTransport = null;
let _smtpFingerprint = '';

function buildSmtpTransport(emailSettings = {}) {
  const host = String(emailSettings.smtpHost || '').trim();
  const port = Number(emailSettings.smtpPort || 587);
  const user = String(emailSettings.smtpUser || '').trim();
  const pass = String(emailSettings.smtpPassword || '').trim();

  if (!host || !port) {
    throw new Error('SMTP host/port are not configured. Update Admin Settings → Email Configuration.');
  }

  const fingerprint = `${host}:${port}:${user}`;
  if (_smtpTransport && _smtpFingerprint === fingerprint) {
    return _smtpTransport;
  }

  // Close stale transport if config changed
  if (_smtpTransport) {
    try { _smtpTransport.close(); } catch { /* ignore */ }
  }

  const secure = port === 465;
  const config = {
    host,
    port,
    secure,
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  };

  if (user && pass) {
    config.auth = { user, pass };
  }

  _smtpTransport = nodemailer.createTransport(config);
  _smtpFingerprint = fingerprint;
  return _smtpTransport;
}

function normalizePhoneForChannel(phone = '', defaultCountryCode = '+260') {
  const raw = String(phone || '').trim();
  if (!raw) return '';

  let digits = raw.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) {
    // Already international — validate minimum length (country code + 7 digits)
    return digits.length >= 10 ? digits : '';
  }

  if (digits.startsWith('0')) {
    const countryCode = String(defaultCountryCode || '+260').replace(/\s+/g, '') || '+260';
    const normalized = `${countryCode}${digits.slice(1)}`;
    return normalized.length >= 10 ? normalized : '';
  }

  // Bare digits — prepend +
  const normalized = `+${digits}`;
  return normalized.length >= 10 ? normalized : '';
}

function phoneToGreenApiChatId(phone = '', defaultCountryCode = '+260') {
  const normalized = normalizePhoneForChannel(phone, defaultCountryCode);
  const digits = normalized.replace(/\D/g, '');
  return digits ? `${digits}@c.us` : '';
}

/** Mask a secret for safe logging (show first 4 and last 2 chars). */
function maskSecret(value = '') {
  const s = String(value || '');
  if (s.length <= 8) return s ? '****' : '';
  return `${s.slice(0, 4)}${'*'.repeat(Math.max(s.length - 6, 4))}${s.slice(-2)}`;
}

async function sendWebhookNotification({ webhookUrl, payload, timeoutMs = 9000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.error || `Webhook request failed (${response.status})`);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function sendGreenApiWhatsApp({ settings, to, message }) {
  const waCfg = settings?.whatsapp || {};
  const apiUrl = String(waCfg.greenApiUrl || 'https://api.green-api.com').trim().replace(/\/+$/, '');
  const idInstance = String(waCfg.greenApiInstanceId || '').trim();
  const apiTokenInstance = String(waCfg.greenApiToken || '').trim();
  const chatId = phoneToGreenApiChatId(to, settings?.sms?.defaultCountryCode || '+260');

  if (!chatId) {
    return { channel: 'whatsapp', status: 'skipped', reason: 'No valid WhatsApp recipient configured.' };
  }
  if (!idInstance || !apiTokenInstance) {
    return {
      channel: 'whatsapp',
      status: 'failed',
      recipient: chatId,
      reason: 'Green API instance ID or API token is not configured.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${apiUrl}/waInstance${encodeURIComponent(idInstance)}/sendMessage/${encodeURIComponent(apiTokenInstance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        message: String(message || '').slice(0, 20000),
      }),
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.error || `Green API request failed (${response.status})`);
    }

    console.log(`[notification:whatsapp] ✓ sent to ${chatId} via green_api (instance: ${maskSecret(idInstance)})`);
    return { channel: 'whatsapp', status: 'sent', recipient: chatId, provider: 'green_api', data };
  } catch (error) {
    const messageText = error?.name === 'AbortError' ? 'Green API request timed out.' : error.message;
    console.error(`[notification:whatsapp] ✗ failed via green_api — ${messageText}`);
    return { channel: 'whatsapp', status: 'failed', recipient: chatId, provider: 'green_api', reason: messageText };
  } finally {
    clearTimeout(timer);
  }
}

function resolvePublicAppUrl(req) {
  const envUrl = String(process.env.APP_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/$/, '');

  const origin = String(req?.headers?.origin || '').trim();
  if (origin) return origin.replace(/\/$/, '');

  const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || '').trim() || 'http';
  const host = String(req?.headers?.['x-forwarded-host'] || req?.get?.('host') || '').trim();
  if (host) return `${proto}://${host}`.replace(/\/$/, '');

  return 'http://localhost:5173';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildBrandedEmailHtml({ title, previewText = '', greeting = 'Hi there,', bodyLines = [], buttonText = '', buttonUrl = '', footerLines = [] }) {
  const safeTitle = escapeHtml(title);
  const safePreview = escapeHtml(previewText);
  const safeGreeting = escapeHtml(greeting);
  const safeBody = bodyLines.map((l) => `<p style="margin:0 0 12px;color:#0f172a;font-size:15px;line-height:1.6">${escapeHtml(l)}</p>`).join('');
  const button = buttonText && buttonUrl
    ? `<div style="margin:18px 0 8px">
        <a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px">
          ${escapeHtml(buttonText)}
        </a>
      </div>
      <p style="margin:10px 0 0;color:#64748b;font-size:12px;line-height:1.6">
        If the button doesn&rsquo;t work, copy and paste this link into your browser:<br/>
        <span style="word-break:break-all">${escapeHtml(buttonUrl)}</span>
      </p>`
    : '';
  const footer = footerLines.length
    ? footerLines.map((l) => `<p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">${escapeHtml(l)}</p>`).join('')
    : `<p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">You received this email because you have an account on Mutale Mubanga.</p>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${safePreview}</div>
    <div style="padding:28px 14px">
      <div style="max-width:560px;margin:0 auto">
        <div style="text-align:center;margin-bottom:16px">
          <div style="display:inline-block;background:#0f172a;color:#ffffff;border-radius:16px;padding:10px 14px;font-weight:800;letter-spacing:.2px">
            Mutale Mubanga
          </div>
        </div>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:22px">
          <h1 style="margin:0 0 10px;font-size:18px;color:#0f172a">${safeTitle}</h1>
          <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.6">${safeGreeting}</p>
          ${safeBody}
          ${button}
          <div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:14px">
            ${footer}
          </div>
        </div>
        <p style="margin:14px 0 0;text-align:center;color:#94a3b8;font-size:12px">© ${new Date().getFullYear()} Mutale Mubanga</p>
      </div>
    </div>
  </body>
</html>`;
}

// Build a Google Calendar "add event" link from event date/time fields.
function buildGoogleCalendarLink(event = {}, fallbackUrl = '') {
  try {
    const startDate = event.start_date || event.date;
    if (!startDate) return fallbackUrl;
    const startTime = String(event.start_time || event.time || '').trim();
    const endDate = event.end_date || startDate;
    const endTime = String(event.end_time || '').trim();
    const allDay = !startTime;
    const pad = (n) => String(n).padStart(2, '0');
    const compact = (d) => (allDay
      ? `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
      : `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`);

    const start = new Date(`${String(startDate).slice(0, 10)}T${(startTime || '00:00').slice(0, 5)}:00`);
    if (Number.isNaN(start.getTime())) return fallbackUrl;

    let end;
    if (allDay) {
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (endTime) {
      end = new Date(`${String(endDate).slice(0, 10)}T${endTime.slice(0, 5)}:00`);
      if (Number.isNaN(end.getTime()) || end <= start) {
        end = new Date(start);
        end.setHours(end.getHours() + 2);
      }
    } else {
      end = new Date(start);
      end.setHours(end.getHours() + 2);
    }

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: String(event.title || 'Event'),
      dates: `${compact(start)}/${compact(end)}`,
      location: String(event.location || event.venue || ''),
      details: fallbackUrl ? `More details: ${fallbackUrl}` : '',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  } catch {
    return fallbackUrl;
  }
}

/**
 * Branded HTML for event registration confirmation emails.
 * Self-contained, table-based layout for broad email-client support.
 */
function buildRegistrationEmailHtml({
  recipientName = 'there',
  recipientEmail = '',
  eventTitle = '',
  eventDate = 'TBA',
  eventTime = '',
  eventLocation = 'Online',
  registrationTypeLabel = 'Complimentary',
  referenceCode = '',
  accessPassUrl = '',
  addToCalendarUrl = '',
  statusLabel = 'CONFIRMED',
  statusNote = 'Your registration is confirmed. No further action is required.',
  previewText = 'You are registered! Your registration has been received.',
  brand = {},
} = {}) {
  const NAVY = '#0B1B3A';
  const NAVY_TEXT = '#141D45';
  const TEAL = '#00A79D';
  const CORAL = '#E76869';
  const GRAY = '#64748b';
  const LIGHT = '#f1f6f6';
  const BORDER = '#e6ebf0';

  const brandName = escapeHtml(brand.name || 'Mutale Mubanga');
  const brandTagline = escapeHtml(brand.tagline || 'Growing People.');
  const supportEmail = escapeHtml(brand.supportEmail || 'info@mutalemubanga.org');
  const websiteUrl = brand.websiteUrl || '';
  const websiteLabel = escapeHtml(brand.websiteLabel || (websiteUrl ? websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'mutalemubanga.org'));
  const linkedinUrl = brand.linkedinUrl || '';
  const youtubeUrl = brand.youtubeUrl || '';
  const instagramUrl = brand.instagramUrl || '';
  const signoffPrimary = escapeHtml(brand.signoffPrimary || 'Thank you for being part of this journey.');
  const signoffSecondary = escapeHtml(brand.signoffSecondary || 'Real conversations. Meaningful impact.');

  const safeName = escapeHtml(recipientName || 'there');
  const safeEmail = escapeHtml(recipientEmail);
  const initials = String(recipientName || 'G')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'G';

  const detailRows = [
    eventTitle ? { label: 'Event', value: eventTitle } : null,
    { label: 'Date', value: eventDate || 'TBA' },
    eventTime ? { label: 'Time', value: eventTime } : null,
    { label: 'Venue', value: eventLocation || 'Online' },
    { label: 'Registration Type', value: registrationTypeLabel || 'Complimentary' },
    referenceCode ? { label: 'Reference', value: referenceCode } : null,
  ].filter(Boolean);

  const rowsHtml = detailRows.map((row, i) => `
    <tr>
      <td style="padding:12px 0;${i < detailRows.length - 1 ? `border-bottom:1px solid ${BORDER};` : ''}width:42%;color:${GRAY};font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;vertical-align:top">${escapeHtml(row.label)}</td>
      <td style="padding:12px 0;${i < detailRows.length - 1 ? `border-bottom:1px solid ${BORDER};` : ''}color:${NAVY_TEXT};font-size:15px;font-weight:700;vertical-align:top">${escapeHtml(row.value)}</td>
    </tr>`).join('');

  const button = (label, url, primary) => (url
    ? `<a href="${escapeHtml(url)}" target="_blank" style="display:block;text-align:center;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.4px;padding:14px 18px;border-radius:12px;${primary ? `background:${TEAL};color:#ffffff;` : `background:#ffffff;color:${NAVY_TEXT};border:1px solid ${BORDER};`}">${escapeHtml(label)}</a>`
    : '');

  const socialBadge = (letters, url) => `
    <a href="${escapeHtml(url || websiteUrl || '#')}" target="_blank" style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border:1px solid ${TEAL};border-radius:50%;color:${TEAL};font-size:11px;font-weight:700;text-decoration:none;margin:0 3px">${letters}</a>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(eventTitle ? `Registration Confirmed: ${eventTitle}` : 'Registration Confirmed')}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f5;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(11,27,58,0.10)">
            <!-- Header -->
            <tr>
              <td style="background:${NAVY};padding:26px 28px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="vertical-align:middle">
                          <div style="width:46px;height:46px;border:2px solid ${TEAL};border-radius:12px;text-align:center;line-height:42px;color:#ffffff;font-size:22px;font-weight:800">M</div>
                        </td>
                        <td style="vertical-align:middle;padding-left:12px">
                          <div style="font-size:19px;font-weight:800;letter-spacing:.5px;color:#ffffff">MUTALE <span style="color:${TEAL}">MUBANGA</span></div>
                          <div style="font-size:12px;color:#aab4c5;margin-top:2px">${brandTagline}</div>
                        </td>
                      </tr></table>
                    </td>
                    <td style="vertical-align:middle;text-align:right">
                      <div style="display:inline-block;width:42px;height:42px;border:2px solid ${TEAL};border-radius:50%;text-align:center;line-height:40px;color:${TEAL};font-size:20px;font-weight:700">&#10003;</div>
                      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:${TEAL};text-transform:uppercase;margin-top:6px">Registration<br/>Confirmed</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Accent bar -->
            <tr>
              <td style="padding:0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="background:${TEAL};height:5px;line-height:5px;font-size:0;width:74%">&nbsp;</td>
                  <td style="background:${CORAL};height:5px;line-height:5px;font-size:0;width:26%">&nbsp;</td>
                </tr></table>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:30px 28px 8px">
                <p style="margin:0 0 6px;color:${GRAY};font-size:15px">Hi ${safeName},</p>
                <h1 style="margin:0 0 12px;color:${NAVY_TEXT};font-size:28px;line-height:1.2;font-weight:800">You are registered!</h1>
                <p style="margin:0 0 22px;color:${GRAY};font-size:15px;line-height:1.6">Your registration for the event below has been received successfully. Please keep this email for your records. We look forward to welcoming you.</p>

                <!-- Registrant card -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LIGHT};border-radius:14px;margin:0 0 24px">
                  <tr>
                    <td style="padding:18px 20px">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="vertical-align:middle">
                          <div style="width:48px;height:48px;border-radius:50%;background:#ffffff;border:2px solid ${TEAL};text-align:center;line-height:44px;color:${TEAL};font-size:16px;font-weight:800">${escapeHtml(initials)}</div>
                        </td>
                        <td style="vertical-align:middle;padding-left:16px">
                          <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${TEAL}">Registrant</div>
                          <div style="font-size:17px;font-weight:700;color:${NAVY_TEXT};margin-top:2px">${safeName}</div>
                          ${safeEmail ? `<div style="font-size:13px;color:${GRAY};margin-top:1px">${safeEmail}</div>` : ''}
                        </td>
                      </tr></table>
                    </td>
                  </tr>
                </table>

                <!-- Event details -->
                <div style="font-size:13px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${TEAL};margin:0 0 6px">Event Details</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
                  ${rowsHtml}
                </table>

                <!-- Status card -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:14px;margin:0 0 24px">
                  <tr>
                    <td style="padding:20px 22px">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="vertical-align:middle">
                          <div style="width:48px;height:48px;border:2px solid ${TEAL};border-radius:50%;text-align:center;line-height:46px;color:${TEAL};font-size:22px;font-weight:700">&#10003;</div>
                        </td>
                        <td style="vertical-align:middle;padding-left:16px">
                          <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${TEAL}">Registration Status</div>
                          <div style="font-size:22px;font-weight:800;color:#ffffff;margin:2px 0 4px">${escapeHtml(statusLabel)}</div>
                          <div style="font-size:13px;color:#aab4c5;line-height:1.5">${escapeHtml(statusNote)}</div>
                        </td>
                      </tr></table>
                    </td>
                  </tr>
                </table>

                <!-- Buttons -->
                ${(accessPassUrl || addToCalendarUrl) ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr>
                  ${accessPassUrl ? `<td style="padding:0 6px 0 0;width:50%">${button('VIEW ACCESS PASS  →', accessPassUrl, true)}</td>` : ''}
                  ${addToCalendarUrl ? `<td style="padding:0 0 0 6px;width:50%">${button('📅  ADD TO CALENDAR', addToCalendarUrl, false)}</td>` : ''}
                </tr></table>` : ''}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:18px 28px 28px">
                <div style="border-top:1px solid ${BORDER};padding-top:22px;text-align:center">
                  <p style="margin:0 0 4px;color:${GRAY};font-size:14px">${signoffPrimary}</p>
                  <p style="margin:0 0 22px;color:${TEAL};font-size:14px;font-style:italic;font-weight:600">${signoffSecondary}</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                    <td style="vertical-align:top;text-align:center;padding:6px">
                      <div style="font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${NAVY_TEXT}">Need help?</div>
                      <a href="mailto:${supportEmail}" style="font-size:12px;color:${TEAL};text-decoration:none">${supportEmail}</a>
                      <div style="font-size:11px;color:${GRAY}">We&rsquo;re here to help.</div>
                    </td>
                    <td style="vertical-align:top;text-align:center;padding:6px">
                      <div style="font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${NAVY_TEXT}">Visit our website</div>
                      <a href="${escapeHtml(websiteUrl || '#')}" target="_blank" style="font-size:12px;color:${TEAL};text-decoration:none">${websiteLabel}</a>
                      <div style="font-size:11px;color:${GRAY}">Learn more about our work.</div>
                    </td>
                    <td style="vertical-align:top;text-align:center;padding:6px">
                      <div style="font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${NAVY_TEXT};margin-bottom:6px">Follow us</div>
                      ${socialBadge('in', linkedinUrl)}${socialBadge('YT', youtubeUrl)}${socialBadge('IG', instagramUrl)}
                    </td>
                  </tr></table>
                  <p style="margin:22px 0 0;color:#9aa6b6;font-size:11px">© ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendEmailNotification({ settings, to, subject, text, html, attachments = [] }) {
  const recipient = String(to || '').trim();
  if (!recipient) return { channel: 'email', status: 'skipped', reason: 'No email recipient configured.' };

  const emailCfg = settings?.email || {};
  const fromName = String(emailCfg.fromName || 'Mutale Admin').trim();
  const fromEmail = String(emailCfg.fromEmail || '').trim();
  const replyTo = String(emailCfg.replyTo || fromEmail).trim();

  if (!fromEmail) {
    return { channel: 'email', status: 'failed', reason: 'From email is not configured.' };
  }

  try {
    const transport = buildSmtpTransport(emailCfg);
    await transport.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: recipient,
      replyTo: replyTo || undefined,
      subject,
      text,
      html: html || undefined,
      attachments: Array.isArray(attachments) ? attachments : [],
    });

    console.log(`[notification:email] ✓ sent to ${recipient} — "${subject}"`);
    return { channel: 'email', status: 'sent', recipient };
  } catch (error) {
    console.error(`[notification:email] ✗ failed to ${recipient} — ${error.message}`);
    return { channel: 'email', status: 'failed', recipient, reason: error.message };
  }
}

async function sendSmsNotification({ settings, to, message, meta = {} }) {
  const smsCfg = settings?.sms || {};
  const provider = String(smsCfg.provider || 'none').toLowerCase();
  const recipient = normalizePhoneForChannel(to, smsCfg.defaultCountryCode);

  if (!recipient) return { channel: 'sms', status: 'skipped', reason: 'No phone recipient configured.' };
  if (provider === 'none') return { channel: 'sms', status: 'skipped', recipient, reason: 'SMS provider is disabled.' };

  const webhookUrl = String(smsCfg.webhookUrl || '').trim();
  if (!webhookUrl) {
    return {
      channel: 'sms',
      status: 'failed',
      recipient,
      reason: 'SMS webhook URL is not configured. Add it in Admin Settings → SMS Configuration.',
    };
  }

  try {
    const apiKey = String(smsCfg.apiKey || '').trim();
    const apiSecret = String(smsCfg.apiSecret || '').trim();

    await sendWebhookNotification({
      webhookUrl,
      payload: {
        provider,
        to: recipient,
        senderId: String(smsCfg.senderId || '').trim(),
        message,
        credentials: {
          apiKey,
          apiSecret,
        },
        meta,
      },
    });

    console.log(`[notification:sms] ✓ sent to ${recipient} via ${provider} (key: ${maskSecret(apiKey)})`);
    return { channel: 'sms', status: 'sent', recipient };
  } catch (error) {
    console.error(`[notification:sms] ✗ failed to ${recipient} — ${error.message}`);
    return { channel: 'sms', status: 'failed', recipient, reason: error.message };
  }
}

async function sendWhatsAppNotification({ settings, to, message, meta = {} }) {
  const waCfg = settings?.whatsapp || {};
  const provider = String(waCfg.provider || 'none').toLowerCase();
  const recipient = normalizePhoneForChannel(to, settings?.sms?.defaultCountryCode || '+260');

  if (!recipient) return { channel: 'whatsapp', status: 'skipped', reason: 'No WhatsApp recipient configured.' };
  if (provider === 'none') return { channel: 'whatsapp', status: 'skipped', recipient, reason: 'WhatsApp provider is disabled.' };
  if (provider === 'green_api') {
    return sendGreenApiWhatsApp({ settings, to: recipient, message });
  }

  const webhookUrl = String(waCfg.webhookUrl || '').trim();
  if (!webhookUrl) {
    return {
      channel: 'whatsapp',
      status: 'failed',
      recipient,
      reason: 'WhatsApp webhook URL is not configured. Add it in Admin Settings → WhatsApp Configuration.',
    };
  }

  try {
    const accessToken = String(waCfg.accessToken || '').trim();

    await sendWebhookNotification({
      webhookUrl,
      payload: {
        provider,
        to: recipient,
        senderNumber: String(waCfg.senderNumber || '').trim(),
        phoneNumberId: String(waCfg.phoneNumberId || '').trim(),
        accessToken,
        message,
        meta,
      },
    });

    console.log(`[notification:whatsapp] ✓ sent to ${recipient} via ${provider} (token: ${maskSecret(accessToken)})`);
    return { channel: 'whatsapp', status: 'sent', recipient };
  } catch (error) {
    console.error(`[notification:whatsapp] ✗ failed to ${recipient} — ${error.message}`);
    return { channel: 'whatsapp', status: 'failed', recipient, reason: error.message };
  }
}

async function dispatchRegistrationNotifications({ settings, payload = {} }) {
  const notifications = settings?.notifications || {};

  const eventTitle = String(payload?.event?.title || payload?.event_title || payload?.registration?.event_title || '').trim();
  const userName = String(payload?.user?.name || payload?.user_name || payload?.registration?.user_name || '').trim();
  const userEmail = String(payload?.user?.email || payload?.user_email || payload?.registration?.user_email || '').trim();
  const reference = String(payload?.registration?.reference_code || payload?.registration?.payment_reference || payload?.reference || '').trim();
  const amount = Number(payload?.registration?.amount ?? payload?.amount ?? 0);
  const currency = String(payload?.registration?.currency || payload?.currency || 'ZMW').trim();

  const summaryLine = [
    eventTitle ? `Event: ${eventTitle}` : null,
    userName ? `Attendee: ${userName}` : null,
    userEmail ? `Email: ${userEmail}` : null,
    reference ? `Reference: ${reference}` : null,
    Number.isFinite(amount) ? `Amount: ${currency} ${amount}` : null,
  ].filter(Boolean).join('\n');

  const subject = eventTitle
    ? `New registration received: ${eventTitle}`
    : 'New event registration received';

  const message = `A new event registration was received.\n\n${summaryLine || 'No registration details supplied.'}`;

  const tasks = [];

  if (parseBoolean(notifications.emailOnNewRegistration, true)) {
    tasks.push(sendEmailNotification({
      settings,
      to: notifications.adminAlertEmail,
      subject,
      text: message,
    }));
  } else {
    tasks.push(Promise.resolve({ channel: 'email', status: 'skipped', reason: 'Email notifications are disabled.' }));
  }

  if (parseBoolean(notifications.smsOnNewRegistration, false)) {
    tasks.push(sendSmsNotification({
      settings,
      to: notifications.adminAlertPhone,
      message,
      meta: { type: 'new_registration' },
    }));
  } else {
    tasks.push(Promise.resolve({ channel: 'sms', status: 'skipped', reason: 'SMS notifications are disabled.' }));
  }

  if (parseBoolean(notifications.whatsappOnNewRegistration, false)) {
    tasks.push(sendWhatsAppNotification({
      settings,
      to: notifications.adminAlertWhatsApp,
      message,
      meta: { type: 'new_registration' },
    }));
  } else {
    tasks.push(Promise.resolve({ channel: 'whatsapp', status: 'skipped', reason: 'WhatsApp notifications are disabled.' }));
  }

  const results = await Promise.all(tasks);

  const summary = {
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  };

  console.log(`[notification:dispatch] registration — sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped} event="${eventTitle}"`);

  return { results, summary };
}

async function dispatchTestNotification({ settings, channel, recipient = '', message = '' }) {
  const normalizedChannel = String(channel || '').trim().toLowerCase();
  const notifications = settings?.notifications || {};

  const defaultMessage = `This is a test notification from Mutale Admin Settings.\n\nChannel: ${normalizedChannel || 'unknown'}\nTime: ${new Date().toISOString()}`;
  const text = String(message || '').trim() || defaultMessage;

  const supportedChannels = ['email', 'sms', 'text', 'whatsapp'];
  if (!supportedChannels.includes(normalizedChannel)) {
    return { channel: normalizedChannel || 'unknown', status: 'failed', reason: `Unsupported channel "${normalizedChannel}". Use one of: email, sms, whatsapp.` };
  }

  console.log(`[notification:test] initiating ${normalizedChannel} test notification…`);

  if (normalizedChannel === 'email') {
    return sendEmailNotification({
      settings,
      to: String(recipient || notifications.adminAlertEmail || '').trim(),
      subject: 'Mutale notification test (Email)',
      text,
    });
  }

  if (normalizedChannel === 'sms' || normalizedChannel === 'text') {
    return sendSmsNotification({
      settings,
      to: String(recipient || notifications.adminAlertPhone || '').trim(),
      message: text,
      meta: { type: 'test_notification' },
    });
  }

  // whatsapp
  return sendWhatsAppNotification({
    settings,
    to: String(recipient || notifications.adminAlertWhatsApp || '').trim(),
    message: text,
    meta: { type: 'test_notification' },
  });
}

async function sendRegistrationWhatsAppConfirmation({ settings, to, recipientName, event, registration, eventUrl }) {
  const notifications = settings?.notifications || {};
  if (!parseBoolean(notifications.whatsappClientOnRegistration, false)) {
    return { channel: 'whatsapp', status: 'skipped', reason: 'Client WhatsApp confirmations are disabled.' };
  }

  const eventDate = event.start_date || event.date
    ? new Date(event.start_date || event.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'TBA';
  const eventTime = event.start_time || event.time || 'TBA';
  const eventLocation = event.location || event.venue || (event.event_mode === 'in_person' ? 'TBA' : 'Online');
  const reference = String(registration.reference_code || registration.payment_reference || '').trim();
  const amountZmw = roundMoney2(toNumber(registration.amount_zmw ?? registration.amount, 0));
  const amountLine = amountZmw > 0.005
    ? `Amount: ZMW ${amountZmw.toFixed(2)}`
    : 'Amount: Free';

  const message = [
    `Hi ${recipientName || 'there'},`,
    '',
    `Your registration for "${event.title}" is confirmed.`,
    '',
    `Date: ${eventDate}`,
    `Time: ${eventTime}`,
    `Location: ${eventLocation}`,
    amountLine,
    reference ? `Reference: ${reference}` : '',
    eventUrl ? `Event page: ${eventUrl}` : '',
    '',
    'Thank you,',
    'Mutale Mubanga',
  ].filter(Boolean).join('\n');

  return sendWhatsAppNotification({
    settings,
    to,
    message,
    meta: { type: 'registration_confirmation', registrationId: registration.id, eventId: event.id },
  });
}

async function upsertPaymentCollection(partial = {}) {
  const reference = String(partial.reference || '').trim();
  if (!reference) return null;

  const [[existing]] = await pool.query('SELECT * FROM payment_collections WHERE reference = ?', [reference]);

  const merged = {
    id: String(existing?.id || partial.id || generateEntityId('paytx')),
    reference,
    event_id: String(partial.event_id ?? existing?.event_id ?? '').trim() || null,
    event_title: String(partial.event_title ?? existing?.event_title ?? '').trim() || null,
    customer_name: String(partial.customer_name ?? existing?.customer_name ?? '').trim() || null,
    customer_email: String(partial.customer_email ?? existing?.customer_email ?? '').trim() || null,
    customer_phone: String(partial.customer_phone ?? existing?.customer_phone ?? '').trim() || null,
    amount: Number.isFinite(Number(partial.amount))
      ? Number(partial.amount)
      : toNumber(existing?.amount, 0),
    currency: String(partial.currency ?? existing?.currency ?? 'ZMW').trim() || 'ZMW',
    status: normalizeCollectionStatus(partial.status ?? existing?.status ?? 'pending'),
    channel: String(partial.channel ?? existing?.channel ?? 'unknown').trim() || 'unknown',
    provider: String(partial.provider ?? existing?.provider ?? 'lenco').trim() || 'lenco',
    provider_response: partial.provider_response ?? existing?.provider_response ?? {},
    error_message: String(partial.error_message ?? existing?.error_message ?? '').trim() || null,
  };

  const placeholders = PAYMENT_COLLECTION_FIELDS.map(() => '?').join(', ');
  const updates = PAYMENT_COLLECTION_FIELDS
    .filter((field) => field !== 'id')
    .map((field) => `${field}=VALUES(${field})`)
    .join(', ');

  const values = PAYMENT_COLLECTION_FIELDS.map((field) => {
    if (field === 'provider_response') return JSON.stringify(merged.provider_response || {});
    return merged[field];
  });

  await pool.query(
    `INSERT INTO payment_collections (${PAYMENT_COLLECTION_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
    values,
  );

  const [[row]] = await pool.query('SELECT * FROM payment_collections WHERE reference = ?', [reference]);
  return row;
}

async function createIntegrationLog({
  provider,
  action,
  relatedType = null,
  relatedId = null,
  status,
  requestPayload = null,
  responsePayload = null,
  errorMessage = null,
}) {
  try {
    await pool.query(
      `INSERT INTO integration_logs
      (id, provider, action, related_type, related_id, status, request_payload, response_payload, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateEntityId('ilog'),
        String(provider || '').trim() || 'unknown',
        String(action || '').trim() || 'unknown_action',
        relatedType ? String(relatedType).trim() : null,
        relatedId ? String(relatedId).trim() : null,
        String(status || '').trim() || 'unknown',
        requestPayload == null ? null : JSON.stringify(requestPayload),
        responsePayload == null ? null : JSON.stringify(responsePayload),
        errorMessage ? String(errorMessage).trim().slice(0, 2000) : null,
      ],
    );
  } catch (error) {
    console.error(`[integration:log] failed (${provider}/${action}) — ${error.message}`);
  }
}

function getImageExtension(mimeType = '') {
  const raw = String(mimeType).toLowerCase();
  if (raw.includes('jpeg') || raw.includes('jpg')) return 'jpg';
  if (raw.includes('png')) return 'png';
  if (raw.includes('webp')) return 'webp';
  if (raw.includes('gif')) return 'gif';
  return 'img';
}

async function persistCoverImageIfNeeded(value, req) {
  return persistImageIfNeeded(value, req, { folder: 'events', prefix: 'event' });
}

async function persistBlogImageIfNeeded(value, req) {
  return persistImageIfNeeded(value, req, { folder: 'blog', prefix: 'blog' });
}

async function persistBlogContentImages(html, req) {
  const raw = String(html || '');
  if (!raw || !raw.includes('data:image')) return raw;

  const srcPattern = /src=(["'])(data:image\/[\w.+-]+;base64,[^"']+)\1/gi;
  let result = raw;
  const seen = new Set();

  for (const match of raw.matchAll(srcPattern)) {
    const dataUrl = match[2];
    if (seen.has(dataUrl)) continue;
    seen.add(dataUrl);
    const url = await persistImageIfNeeded(dataUrl, req, { folder: 'blog', prefix: 'blog-inline' });
    result = result.split(dataUrl).join(url);
  }

  return result;
}

async function persistBookImageIfNeeded(value, req) {
  return persistImageIfNeeded(value, req, { folder: 'books', prefix: 'book' });
}

async function persistSpeakerPhotoIfNeeded(value, req) {
  return persistImageIfNeeded(value, req, { folder: 'events', prefix: 'speaker' });
}

async function persistPartnerLogoIfNeeded(value, req) {
  return persistImageIfNeeded(value, req, { folder: 'events', prefix: 'partner' });
}

async function persistEventPeopleImages(incoming, req) {
  if (Array.isArray(incoming.featured_speakers)) {
    for (let i = 0; i < incoming.featured_speakers.length; i++) {
      const s = incoming.featured_speakers[i];
      if (s.photo && String(s.photo).startsWith('data:')) {
        incoming.featured_speakers[i] = { ...s, photo: await persistSpeakerPhotoIfNeeded(s.photo, req) };
      }
    }
  }
  if (Array.isArray(incoming.partners)) {
    for (let i = 0; i < incoming.partners.length; i++) {
      const p = incoming.partners[i];
      if (p.logo && String(p.logo).startsWith('data:')) {
        incoming.partners[i] = { ...p, logo: await persistPartnerLogoIfNeeded(p.logo, req) };
      }
    }
  }
}

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const PROFILE_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function resolvePublicUploadUrl(stored, req) {
  const raw = String(stored || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  const relative = raw.replace(/^\/+/, '').replace(/^uploads\//, '');
  if (!req) return `/uploads/${relative}`;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/${relative}`;
}

function profilePhotoRelativePath(stored) {
  const raw = String(stored || '').trim();
  if (!raw) return '';
  const match = raw.match(/profile-photos\/[^?#\s]+/i);
  if (match) return match[0];
  return raw.startsWith('profile-photos/') ? raw : '';
}

async function deleteProfilePhotoFile(stored) {
  const rel = profilePhotoRelativePath(stored);
  if (!rel) return;
  try {
    await fs.unlink(path.join(process.cwd(), 'uploads', rel));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[profile-photo] Could not delete old file:', error.message);
    }
  }
}

async function persistProfilePhotoFromDataUrl(value, req, userId) {
  const raw = String(value || '');
  const match = raw.match(/^data:(image\/[\w.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('Invalid image payload. Use JPEG, PNG, or WebP.');
  }

  const mimeType = match[1].toLowerCase();
  if (!PROFILE_PHOTO_MIMES.has(mimeType)) {
    throw new Error('Only JPEG, PNG, and WebP images are allowed.');
  }

  const base64Data = (match[2] || '').replace(/\s+/g, '');
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error('Image is too large. Maximum size is 2 MB.');
  }

  const folder = 'profile-photos';
  const uploadsDir = path.join(process.cwd(), 'uploads', folder);
  await fs.mkdir(uploadsDir, { recursive: true });

  const ext = getImageExtension(mimeType);
  const safeUserId = String(userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `profile-${safeUserId}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(uploadsDir, filename), buffer);

  return `${folder}/${filename}`;
}

async function persistImageIfNeeded(value, req, options = {}) {
  const raw = String(value || '');
  const match = raw.match(/^data:(image\/[\w.+-]+);base64,(.+)$/i);
  if (!match) return value || '';

  const folder = options.folder || 'uploads';
  const prefix = options.prefix || 'file';

  const mimeType = match[1].toLowerCase();
  if (!isAllowedUploadMime(mimeType)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.');
  }

  const base64Data = (match[2] || '').replace(/\s+/g, '');
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_GENERAL_UPLOAD_BYTES) {
    throw new Error('Image is too large. Maximum size is 3 MB.');
  }
  if (!bufferMatchesImageMime(buffer, mimeType)) {
    throw new Error('Image file does not match its declared type.');
  }

  const uploadsDir = path.join(process.cwd(), 'uploads', folder);
  await fs.mkdir(uploadsDir, { recursive: true });

  const ext = getImageExtension(mimeType);
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const absolutePath = path.join(uploadsDir, filename);
  await fs.writeFile(absolutePath, buffer);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/${folder}/${filename}`;
}

function mapAuthSessionUser(user, req) {
  const specialtiesRaw = user.specialties;
  const interestsRaw = user.interests;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role || 'user',
    profession: user.profession || '',
    organization: user.organization || '',
    about: user.about || '',
    specialties: specialtiesRaw
      ? (Array.isArray(specialtiesRaw)
        ? specialtiesRaw
        : String(specialtiesRaw).split(',').map((s) => s.trim()).filter(Boolean))
      : [],
    portfolio_url: user.portfolio_url || '',
    linkedin_url: user.linkedin_url || '',
    linkedin_handle: user.linkedin_handle || '',
    occupation: user.occupation || '',
    nrc_id: user.nrc_id || '',
    address: user.address || '',
    interests: interestsRaw
      ? (Array.isArray(interestsRaw)
        ? interestsRaw
        : String(interestsRaw).split(',').map((s) => s.trim()).filter(Boolean))
      : [],
    kyc_completed: Boolean(user.kyc_completed),
    profile_photo: resolvePublicUploadUrl(user.profile_photo, req),
    cv_unlocked_at: user.cv_unlocked_at || null,
    cv_sections: parseCvSectionsFromDb(user.cv_sections),
    created_at: user.created_at,
  };
}

function safeParseJson(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try { return JSON.parse(val); } catch { return []; }
  }
  return val ?? [];
}

function mapDbEvent(row) {
  return {
    ...row,
    featured_speakers: safeParseJson(row.featured_speakers),
    partners: safeParseJson(row.partners),
  };
}

// Strips host-sensitive Zoom fields before sending events to unauthenticated clients.
const ZOOM_PRIVATE_FIELDS = [
  'zoom_start_url', 'zoom_uuid', 'zoom_host_email', 'zoom_created_at', 'zoom_synced_at',
  'zoom_password', 'zoom_join_url', 'daily_room_url', 'daily_created_at', 'daily_synced_at',
  'meeting_link',
];
function mapPublicEvent(row) {
  const event = mapDbEvent(row);
  for (const field of ZOOM_PRIVATE_FIELDS) {
    delete event[field];
  }
  return event;
}

function mapDbBlogPost(row) {
  return {
    ...row,
    readTime: row.read_time,
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
  registration_deadline_time TIME,
      visibility VARCHAR(30) DEFAULT 'public',
      organizer_name VARCHAR(255),
      organizer_email VARCHAR(255),
      organizer_phone VARCHAR(50),
      category VARCHAR(100),
      featured BOOLEAN DEFAULT FALSE,
      featured_speakers JSON,
      partners JSON,
      delivery_mode VARCHAR(30) DEFAULT 'virtual',
      provider VARCHAR(30) DEFAULT 'internal',
      zoom_meeting_id VARCHAR(64),
      zoom_uuid VARCHAR(255),
      zoom_join_url LONGTEXT,
      zoom_start_url LONGTEXT,
      zoom_password VARCHAR(64),
      zoom_host_email VARCHAR(255),
      zoom_status VARCHAR(50),
      zoom_created_at DATETIME,
      zoom_synced_at DATETIME,
      daily_room_name VARCHAR(128),
      daily_room_url LONGTEXT,
      daily_status VARCHAR(50),
      daily_created_at DATETIME,
      daily_synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const eventColumnsToAdd = [
    ['featured_speakers', 'JSON NULL'],
    ['partners', 'JSON NULL'],
    ['delivery_mode', "VARCHAR(30) DEFAULT 'virtual'"],
    ['provider', "VARCHAR(30) DEFAULT 'internal'"],
    ['zoom_meeting_id', 'VARCHAR(64) NULL'],
    ['zoom_uuid', 'VARCHAR(255) NULL'],
    ['zoom_join_url', 'LONGTEXT NULL'],
    ['zoom_start_url', 'LONGTEXT NULL'],
    ['zoom_password', 'VARCHAR(64) NULL'],
    ['zoom_host_email', 'VARCHAR(255) NULL'],
    ['zoom_status', 'VARCHAR(50) NULL'],
    ['zoom_created_at', 'DATETIME NULL'],
    ['zoom_synced_at', 'DATETIME NULL'],
    ['daily_room_name', 'VARCHAR(128) NULL'],
    ['daily_room_url', 'LONGTEXT NULL'],
    ['daily_status', 'VARCHAR(50) NULL'],
    ['daily_created_at', 'DATETIME NULL'],
    ['daily_synced_at', 'DATETIME NULL'],
    ['registration_deadline_time', 'TIME NULL'],
    ['forum_enabled', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ];

  for (const [name, sqlType] of eventColumnsToAdd) {
    try {
      await pool.query(`ALTER TABLE events ADD COLUMN ${name} ${sqlType}`);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

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
    CREATE TABLE IF NOT EXISTS publications (
      id VARCHAR(80) PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      authors VARCHAR(500) NOT NULL,
      journal VARCHAR(255),
      year INT,
      volume VARCHAR(120),
      doi VARCHAR(255),
      abstract LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_publications_year (year),
      INDEX idx_publications_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id VARCHAR(90) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(60) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      message LONGTEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_contact_messages_created_at (created_at),
      INDEX idx_contact_messages_is_read (is_read)
    )
  `);

  // Backward-compatible migration in case table was created before `phone` field existed.
  try {
    await pool.query('ALTER TABLE contact_messages ADD COLUMN phone VARCHAR(60) NOT NULL DEFAULT "" AFTER email');
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  // Backward-compatible migration: add whatsapp and user_type to users table.
  for (const [col, def] of [['whatsapp', 'VARCHAR(60)'], ['user_type', "VARCHAR(30) DEFAULT 'local'"]]) {
    try { await pool.query(`ALTER TABLE users ADD COLUMN ${col} ${def}`); } catch (e) { if (e?.code !== 'ER_DUP_FIELDNAME') throw e; }
  }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN profile_photo VARCHAR(500) NULL');
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME') throw e;
  }

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
    CREATE TABLE IF NOT EXISTS settlement_accounts (
      id VARCHAR(90) PRIMARY KEY,
      alias VARCHAR(120) NOT NULL,
      bank_code VARCHAR(80) NOT NULL,
      bank_name VARCHAR(180) NOT NULL,
      account_number VARCHAR(40) NOT NULL,
      account_name VARCHAR(180) NOT NULL,
      currency VARCHAR(10) DEFAULT 'ZMW',
      is_default BOOLEAN DEFAULT FALSE,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settlement_transactions (
      id VARCHAR(90) PRIMARY KEY,
      settlement_account_id VARCHAR(90) NOT NULL,
      reference VARCHAR(120) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'ZMW',
      narration VARCHAR(255),
      status VARCHAR(40) DEFAULT 'pending',
      provider VARCHAR(40) DEFAULT 'lenco',
      provider_response JSON,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_settlement_transactions_created_at (created_at),
      INDEX idx_settlement_transactions_reference (reference),
      CONSTRAINT fk_settlement_transactions_account
        FOREIGN KEY (settlement_account_id) REFERENCES settlement_accounts(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_collections (
      id VARCHAR(90) PRIMARY KEY,
      reference VARCHAR(120) NOT NULL UNIQUE,
      event_id VARCHAR(90),
      event_title VARCHAR(255),
      customer_name VARCHAR(180),
      customer_email VARCHAR(255),
      customer_phone VARCHAR(60),
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'ZMW',
      status VARCHAR(40) DEFAULT 'pending',
      channel VARCHAR(40) DEFAULT 'unknown',
      provider VARCHAR(40) DEFAULT 'lenco',
      provider_response JSON,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payment_collections_created_at (created_at),
      INDEX idx_payment_collections_status (status),
      INDEX idx_payment_collections_reference (reference)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_logs (
      id VARCHAR(90) PRIMARY KEY,
      provider VARCHAR(50) NOT NULL,
      action VARCHAR(100) NOT NULL,
      related_type VARCHAR(50),
      related_id VARCHAR(120),
      status VARCHAR(50) NOT NULL,
      request_payload JSON,
      response_payload JSON,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_integration_logs_provider (provider),
      INDEX idx_integration_logs_action (action),
      INDEX idx_integration_logs_related (related_type, related_id),
      INDEX idx_integration_logs_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_registrations (
      id VARCHAR(90) PRIMARY KEY,
      user_id VARCHAR(90) NOT NULL,
      user_name VARCHAR(180),
      user_email VARCHAR(255),
      event_id VARCHAR(90) NOT NULL,
      event_title VARCHAR(255),
      event_slug VARCHAR(255),
      reference_code VARCHAR(120) NOT NULL,
      registration_type VARCHAR(40) DEFAULT 'subscription',
      status VARCHAR(40) DEFAULT 'confirmed',
      amount DECIMAL(12,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'ZMW',
      amount_zmw DECIMAL(12,2) DEFAULT 0,
      payment_status VARCHAR(40) DEFAULT 'unpaid',
      payment_method VARCHAR(60) DEFAULT '',
      payment_reference VARCHAR(120) DEFAULT '',
      booked_for_name VARCHAR(180) NULL,
      booked_for_relation VARCHAR(60) NULL,
      attendee_slot_key VARCHAR(160) NOT NULL DEFAULT '__self__',
      notes TEXT,
      coupon_id VARCHAR(90) NULL,
      coupon_code VARCHAR(64) NULL,
      list_price_zmw DECIMAL(12,2) NULL,
      discount_zmw DECIMAL(12,2) NOT NULL DEFAULT 0,
      attended_at DATETIME NULL,
      last_joined_at DATETIME NULL,
      join_count INT NOT NULL DEFAULT 0,
      join_source VARCHAR(30) NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_event_user_type_slot (event_id, user_id, registration_type, attendee_slot_key),
      UNIQUE KEY uq_event_reference_code (reference_code),
      INDEX idx_event_registrations_event_id (event_id),
      INDEX idx_event_registrations_user_id (user_id),
      INDEX idx_event_registrations_status (status),
      INDEX idx_event_registrations_registered_at (registered_at),
      INDEX idx_event_registrations_attended_at (attended_at),
      CONSTRAINT fk_event_registrations_event
        FOREIGN KEY (event_id) REFERENCES events(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  // Backward-compatible migration: add attendance tracking columns if missing.
  const registrationColumnsToAdd = [
    ['attended_at', 'DATETIME NULL'],
    ['last_joined_at', 'DATETIME NULL'],
    ['join_count', 'INT NOT NULL DEFAULT 0'],
    ['join_source', 'VARCHAR(30) NULL'],
    ['booked_for_name', 'VARCHAR(180) NULL'],
    ['booked_for_relation', 'VARCHAR(60) NULL'],
    ['attendee_slot_key', "VARCHAR(160) NOT NULL DEFAULT '__self__'"],
    ['coupon_id', 'VARCHAR(90) NULL'],
    ['coupon_code', 'VARCHAR(64) NULL'],
    ['list_price_zmw', 'DECIMAL(12,2) NULL'],
    ['discount_zmw', 'DECIMAL(12,2) NOT NULL DEFAULT 0'],
  ];
  for (const [name, sqlType] of registrationColumnsToAdd) {
    try {
      await pool.query(`ALTER TABLE event_registrations ADD COLUMN ${name} ${sqlType}`);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  try {
    await pool.query('ALTER TABLE event_registrations ADD INDEX idx_event_registrations_attended_at (attended_at)');
  } catch (error) {
    if (error?.code !== 'ER_DUP_KEYNAME') throw error;
  }

  try {
    await pool.query('ALTER TABLE event_registrations DROP INDEX uq_event_user_type');
  } catch (error) {
    if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error;
  }
  try {
    await pool.query(
      'ALTER TABLE event_registrations ADD UNIQUE KEY uq_event_user_type_slot (event_id, user_id, registration_type, attendee_slot_key)',
    );
  } catch (error) {
    if (error?.code !== 'ER_DUP_KEYNAME') throw error;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_forum_topics (
      id VARCHAR(90) PRIMARY KEY,
      event_id VARCHAR(90) NOT NULL,
      user_id VARCHAR(90) NOT NULL,
      user_name VARCHAR(255) NOT NULL DEFAULT '',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      pinned TINYINT(1) NOT NULL DEFAULT 0,
      hidden TINYINT(1) NOT NULL DEFAULT 0,
      reply_count INT NOT NULL DEFAULT 0,
      last_activity_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_forum_topics_event (event_id),
      INDEX idx_forum_topics_activity (event_id, last_activity_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_forum_replies (
      id VARCHAR(90) PRIMARY KEY,
      topic_id VARCHAR(90) NOT NULL,
      event_id VARCHAR(90) NOT NULL,
      user_id VARCHAR(90) NOT NULL,
      user_name VARCHAR(255) NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      hidden TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_forum_replies_topic (topic_id),
      INDEX idx_forum_replies_event (event_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_coupons (
      id VARCHAR(90) PRIMARY KEY,
      event_id VARCHAR(90) NOT NULL,
      code VARCHAR(64) NOT NULL,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
      discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
      max_redemptions INT NULL,
      redemptions_count INT NOT NULL DEFAULT 0,
      max_per_user INT NOT NULL DEFAULT 1,
      valid_from DATE NULL,
      valid_until DATE NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      label VARCHAR(120) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_event_coupons_event_code (event_id, code),
      INDEX idx_event_coupons_event (event_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_certificates (
      id VARCHAR(90) PRIMARY KEY,
      certificate_code VARCHAR(64) NOT NULL UNIQUE,
      event_id VARCHAR(90) NOT NULL,
      registration_id VARCHAR(90) NOT NULL,
      user_id VARCHAR(90) NOT NULL,
      attendee_name VARCHAR(255) NOT NULL,
      attendee_email VARCHAR(255),
      event_title VARCHAR(255) NOT NULL,
      event_end_date DATE NULL,
      pdf_path VARCHAR(500) NOT NULL,
      issued_at DATETIME NOT NULL,
      email_status VARCHAR(40) DEFAULT 'pending',
      email_sent_at DATETIME NULL,
      email_error TEXT NULL,
      revoked TINYINT(1) NOT NULL DEFAULT 0,
      certificate_template_id VARCHAR(90) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_event_certificates_registration (registration_id),
      INDEX idx_event_certificates_event_id (event_id),
      INDEX idx_event_certificates_user_id (user_id),
      INDEX idx_event_certificates_issued_at (issued_at),
      INDEX idx_event_certificates_email_status (email_status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS certificate_templates (
      id VARCHAR(90) PRIMARY KEY,
      event_id VARCHAR(90) NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT 'Certificate of Attendance',
      design_json LONGTEXT NOT NULL,
      background_image VARCHAR(500) NULL,
      orientation ENUM('portrait','landscape') NOT NULL DEFAULT 'landscape',
      paper_size VARCHAR(20) NOT NULL DEFAULT 'A4',
      is_active TINYINT(1) NOT NULL DEFAULT 0,
      created_by VARCHAR(90) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_certificate_templates_event (event_id),
      INDEX idx_certificate_templates_active (is_active)
    )
  `);

  try {
    await pool.query('ALTER TABLE event_certificates ADD COLUMN certificate_template_id VARCHAR(90) NULL');
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME') throw e;
  }

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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_books_category (category),
      INDEX idx_books_featured (featured),
      INDEX idx_books_is_published (is_published),
      INDEX idx_books_product_type (product_type),
      INDEX idx_books_event_id (event_id)
    )
  `);

  // Idempotent column migrations for existing deployments
  // (MySQL has no IF NOT EXISTS for ADD COLUMN — swallow ER_DUP_FIELDNAME.)
  const bookColumnsToAdd = [
    ['product_type', "VARCHAR(40) NOT NULL DEFAULT 'book'"],
    ['event_id', 'VARCHAR(90) NULL'],
    ['tagline', 'VARCHAR(255) NULL'],
    ['variants', 'JSON NULL'],
    ['gallery', 'JSON NULL'],
  ];
  for (const [name, sqlType] of bookColumnsToAdd) {
    try {
      await pool.query(`ALTER TABLE books ADD COLUMN ${name} ${sqlType}`);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  // Idempotent index adds (swallow ER_DUP_KEYNAME)
  const bookIndexesToAdd = [
    ['idx_books_product_type', '(product_type)'],
    ['idx_books_event_id', '(event_id)'],
  ];
  for (const [name, cols] of bookIndexesToAdd) {
    try {
      await pool.query(`ALTER TABLE books ADD INDEX ${name} ${cols}`);
    } catch (error) {
      if (error?.code !== 'ER_DUP_KEYNAME') throw error;
    }
  }

  // ─── product_types catalogue ────────────────────────────────────────
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_product_types_active (is_active),
      INDEX idx_product_types_sort (sort_order)
    )
  `);

  // Seed the default catalogue idempotently (keyed by value, which is UNIQUE).
  const defaultProductTypes = [
    { value: 'book',       label: 'Book',         icon: 'book',     default_category: 'Laboratory Science', sort_order: 10 },
    { value: 'tshirt',     label: 'T-Shirt',      icon: 'shirt',    default_category: 'Apparel',            sort_order: 20 },
    { value: 'sweatshirt', label: 'Sweatshirt',   icon: 'shirt',    default_category: 'Apparel',            sort_order: 30 },
    { value: 'cap',        label: 'Cap / Hat',    icon: 'shirt',    default_category: 'Apparel',            sort_order: 40 },
    { value: 'mug',        label: 'Mug',          icon: 'coffee',   default_category: 'Drinkware',          sort_order: 50 },
    { value: 'keyholder',  label: 'Key Holder',   icon: 'tag',      default_category: 'Accessories',        sort_order: 60 },
    { value: 'wristwatch', label: 'Wrist Watch',  icon: 'watch',    default_category: 'Accessories',        sort_order: 70 },
    { value: 'bag',        label: 'Bag / Tote',   icon: 'shopping-bag', default_category: 'Accessories',    sort_order: 80 },
    { value: 'sticker',    label: 'Sticker',      icon: 'sticker',  default_category: 'Stickers',           sort_order: 90 },
    { value: 'other',      label: 'Other',        icon: 'box',      default_category: 'Other',              sort_order: 999 },
  ];
  for (const pt of defaultProductTypes) {
    try {
      await pool.query(
        `INSERT INTO product_types (id, value, label, icon, default_category, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
           label = IF(label = VALUES(label) OR label = '', VALUES(label), label),
           icon = IF(icon = VALUES(icon) OR icon = '' OR icon = 'box', VALUES(icon), icon)`,
        [
          `pt_${pt.value}`,
          pt.value,
          pt.label,
          pt.icon,
          pt.default_category,
          pt.sort_order,
        ],
      );
    } catch (error) {
      console.warn(`[product_types seed] failed for ${pt.value}: ${error.message}`);
    }
  }

  // ─── partner_logos (home page trusted-by) ─────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_logos (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      logo_url TEXT NULL,
      website_url VARCHAR(500) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_partner_logos_active (is_active),
      INDEX idx_partner_logos_sort (sort_order)
    )
  `);

  for (const partner of DEFAULT_PARTNER_LOGOS) {
    try {
      await pool.query(
        `INSERT INTO partner_logos (id, name, logo_url, website_url, is_active, sort_order)
         VALUES (?, ?, NULL, NULL, 1, ?)
         ON DUPLICATE KEY UPDATE
           name = IF(name = VALUES(name) OR name = '', VALUES(name), name)`,
        [partner.id, partner.name, partner.sort_order],
      );
    } catch (error) {
      console.warn(`[partner_logos seed] failed for ${partner.id}: ${error.message}`);
    }
  }

  // ─── menu_items (main nav + footer) ───────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id VARCHAR(80) PRIMARY KEY,
      location VARCHAR(20) NOT NULL,
      label VARCHAR(120) NOT NULL,
      url VARCHAR(500) NOT NULL,
      parent_id VARCHAR(80) NULL,
      sort_order INT NOT NULL DEFAULT 100,
      is_visible TINYINT(1) NOT NULL DEFAULT 1,
      badge TINYINT(1) NOT NULL DEFAULT 0,
      open_in_new_tab TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_menu_items_location (location),
      INDEX idx_menu_items_visible (is_visible),
      INDEX idx_menu_items_sort (sort_order),
      INDEX idx_menu_items_parent (parent_id)
    )
  `);

  for (const item of DEFAULT_MENU_ITEMS) {
    try {
      await pool.query(
        `INSERT INTO menu_items (id, location, label, url, parent_id, sort_order, is_visible, badge, open_in_new_tab)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0)
         ON DUPLICATE KEY UPDATE
           label = IF(label = VALUES(label) OR label = '', VALUES(label), label),
           url = IF(url = VALUES(url) OR url = '', VALUES(url), url)`,
        [
          item.id,
          item.location,
          item.label,
          item.url,
          item.parent_id,
          item.sort_order,
          item.badge ? 1 : 0,
        ],
      );
    } catch (error) {
      console.warn(`[menu_items seed] failed for ${item.id}: ${error.message}`);
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS book_orders (
      id VARCHAR(90) PRIMARY KEY,
      user_id VARCHAR(90),
      user_name VARCHAR(180),
      user_email VARCHAR(255),
      items JSON NOT NULL,
      subtotal DECIMAL(12,2) DEFAULT 0,
      shipping_cost DECIMAL(10,2) DEFAULT 0,
      shipping_method VARCHAR(60),
      shipping_label VARCHAR(120),
      total DECIMAL(12,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'ZMW',
      shipping_address JSON,
      shipping_zone VARCHAR(60) DEFAULT 'domestic',
      payment_method VARCHAR(60),
      payment_reference VARCHAR(120),
      payment_status VARCHAR(40) DEFAULT 'unpaid',
      status VARCHAR(40) DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_book_orders_user_id (user_id),
      INDEX idx_book_orders_status (status),
      INDEX idx_book_orders_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(90) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(60),
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(30) DEFAULT 'user',
      email_verified TINYINT(1) DEFAULT 0,
      verification_token VARCHAR(128),
      verification_token_expires DATETIME,
      password_reset_token_hash VARCHAR(128),
      password_reset_expires DATETIME,
      password_reset_used_at DATETIME,
      profession VARCHAR(255),
      organization VARCHAR(255),
      about TEXT,
      specialties TEXT,
      portfolio_url VARCHAR(500),
      linkedin_url VARCHAR(500),
      linkedin_handle VARCHAR(255),
      occupation VARCHAR(255),
      nrc_id VARCHAR(100),
      whatsapp VARCHAR(60),
      user_type VARCHAR(30) DEFAULT 'local',
      address VARCHAR(500),
      interests TEXT,
      kyc_completed TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_email (email),
      INDEX idx_users_verification_token (verification_token),
      INDEX idx_users_password_reset_token_hash (password_reset_token_hash)
    )
  `);

  // Backward-compatible migration: ensure every column this app expects exists
  // on the users table, even if the table was created by another project on the
  // same database with a different schema. ER_DUP_FIELDNAME = already exists, safe to ignore.
  for (const [col, def] of [
    ['name', 'VARCHAR(255) NOT NULL DEFAULT \'\''],
    ['email', 'VARCHAR(255) NOT NULL DEFAULT \'\''],
    ['phone', 'VARCHAR(60) NULL'],
    ['password_hash', 'VARCHAR(255) NOT NULL DEFAULT \'\''],
    ['role', "VARCHAR(30) DEFAULT 'user'"],
    ['email_verified', 'TINYINT(1) DEFAULT 0'],
    ['verification_token', 'VARCHAR(128) NULL'],
    ['verification_token_expires', 'DATETIME NULL'],
    ['profession', 'VARCHAR(255) NULL'],
    ['organization', 'VARCHAR(255) NULL'],
    ['about', 'TEXT NULL'],
    ['specialties', 'TEXT NULL'],
    ['portfolio_url', 'VARCHAR(500) NULL'],
    ['linkedin_url', 'VARCHAR(500) NULL'],
    ['linkedin_handle', 'VARCHAR(255) NULL'],
    ['occupation', 'VARCHAR(255) NULL'],
    ['nrc_id', 'VARCHAR(100) NULL'],
    ['whatsapp', 'VARCHAR(60) NULL'],
    ['user_type', "VARCHAR(30) DEFAULT 'local'"],
    ['address', 'VARCHAR(500) NULL'],
    ['interests', 'TEXT NULL'],
    ['kyc_completed', 'TINYINT(1) DEFAULT 0'],
    ['profile_photo', 'VARCHAR(500) NULL'],
    ['password_reset_token_hash', 'VARCHAR(128) NULL'],
    ['password_reset_expires', 'DATETIME NULL'],
    ['password_reset_used_at', 'DATETIME NULL'],
    ['cv_unlocked_at', 'DATETIME NULL'],
    ['cv_sections', 'JSON NULL'],
    ['created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
  ]) {
    try { await pool.query(`ALTER TABLE users ADD COLUMN ${col} ${def}`); } catch (e) { if (e?.code !== 'ER_DUP_FIELDNAME') throw e; }
  }

  // Backward-compatible migration: add index for password reset lookups.
  try { await pool.query('ALTER TABLE users ADD INDEX idx_users_password_reset_token_hash (password_reset_token_hash)'); } catch (e) {
    if (e?.code !== 'ER_DUP_KEYNAME') throw e;
  }

  for (const table of ['event_registrations', 'book_orders', 'payment_collections']) {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN receipt_email_sent_at DATETIME NULL`);
    } catch (e) {
      if (e?.code !== 'ER_DUP_FIELDNAME') throw e;
    }
  }
}

// ─── Seed default admin user if none exists ────────────────────────────────
async function seedDefaultAdmin() {
  const ADMIN_EMAIL = String(process.env.DEFAULT_ADMIN_EMAIL || 'admin@mutale.dev').trim().toLowerCase();
  const ADMIN_PASSWORD = String(process.env.DEFAULT_ADMIN_PASSWORD || 'admin123').trim();
  const ADMIN_NAME = String(process.env.DEFAULT_ADMIN_NAME || 'Mutale Mubanga').trim();

  const [[existing]] = await pool.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
  if (existing) {
    console.log('[auth] Admin user already exists, skipping seed.');
    return;
  }

  if (IS_PRODUCTION && (!process.env.DEFAULT_ADMIN_EMAIL || !process.env.DEFAULT_ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin123')) {
    throw new Error('DEFAULT_ADMIN_EMAIL and a non-default DEFAULT_ADMIN_PASSWORD are required before seeding the first production admin.');
  }

  const id = `usr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = hashPassword(ADMIN_PASSWORD);

  await pool.query(
    `INSERT INTO users (id, name, email, phone, password_hash, role, email_verified)
     VALUES (?, ?, ?, '', ?, 'admin', 1)`,
    [id, ADMIN_NAME, ADMIN_EMAIL, passwordHash]
  );
  console.log(`[auth] Default admin user seeded: ${ADMIN_EMAIL}`);
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'mutale-api',
    deploymentTag: API_DEPLOYMENT_TAG,
    features: { authForgotPassword: true, adminUsersMysql: true, cvGenerator: true },
  });
});

// ─── User Auth ───────────────────────────────────────────────────────────────

function hashPasswordLegacy(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const value = String(storedHash || '');
  if (!value) return { valid: false, needsUpgrade: false };

  if (value.startsWith('pbkdf2$')) {
    const [, iterationsRaw, salt, expectedHash] = value.split('$');
    const iterations = Number(iterationsRaw);
    if (!iterations || !salt || !expectedHash) return { valid: false, needsUpgrade: false };
    const computed = crypto.pbkdf2Sync(String(password), salt, iterations, 64, 'sha512').toString('hex');
    return { valid: timingSafeCompare(computed, expectedHash), needsUpgrade: false };
  }

  const validLegacy = timingSafeCompare(hashPasswordLegacy(password), value);
  return { valid: validLegacy, needsUpgrade: validLegacy };
}

function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generatePasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getSmartDataConfig(settings = {}) {
  const integrations = settings?.integrations || {};
  return {
    enabled: integrations.nrcVerificationEnabled !== false && integrations.nrcVerificationEnabled !== 0,
    apiKey: String(integrations.smartdataApiKey || process.env.SMARTDATA_API_KEY || '').trim(),
    baseUrl: String(integrations.smartdataBaseUrl || process.env.SMARTDATA_BASE_URL || 'https://mysmartdata.tech/api/v1').trim().replace(/\/$/, ''),
  };
}

async function verifyNrcWithSmartData({ apiKey, baseUrl, nrcNumber }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${baseUrl}/nrc/verify`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nrc_number: nrcNumber, country: 'ZM' }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'SmartData rejected the API key. Check Admin Settings → NRC Verification.' };
    }

    if (data.success && data.data) {
      return {
        ok: true,
        data: {
          fullName: data.data.full_name || '',
          firstName: data.data.first_name || '',
          lastName: data.data.last_name || '',
          dateOfBirth: data.data.date_of_birth || '',
          gender: data.data.gender || '',
          nrcNumber,
        },
      };
    }

    return { ok: false, message: 'NRC verification failed. Check the number and try again.' };
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/nrc/verify — Proxy NRC verification via SmartData API
app.post('/api/nrc/verify', rateLimitNrcVerify, async (req, res) => {
  try {
    const nrcNumber = String(req.body?.nrc_number || '').trim();
    if (!nrcNumber) {
      return res.status(400).json({ ok: false, message: 'NRC number is required.' });
    }

    const settings = await getSystemSettings();
    const smartData = getSmartDataConfig(settings);

    if (!smartData.enabled) {
      return res.status(503).json({ ok: false, message: 'NRC verification is currently disabled.' });
    }

    if (!smartData.apiKey) {
      return res.status(500).json({ ok: false, message: 'NRC verification service is not configured. Contact the administrator.' });
    }

    const result = await verifyNrcWithSmartData({
      apiKey: smartData.apiKey,
      baseUrl: smartData.baseUrl,
      nrcNumber,
    });

    if (result.ok) {
      return res.json({ ok: true, data: result.data });
    }

    return res.status(400).json({ ok: false, message: result.message });
  } catch (error) {
    console.error('[nrc/verify]', error.message);
    return res.status(500).json(apiErrorPayload(IS_PRODUCTION, error, 'NRC verification service unavailable. Please try again.'));
  }
});

// POST /api/auth/register
app.post('/api/auth/register', rateLimitAuth({ windowMs: 60 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { name, email, phone, password, whatsapp, user_type, nrc_id } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Name, email and password are required.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(String(email).trim())) {
      return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, message: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ ok: false, message: 'An account with this email already exists.' });
    }

    const userId = generateEntityId('user');
    const passwordHash = hashPassword(password);
    const verificationToken = generateVerificationToken();
    const verificationTokenHash = sha256Hex(verificationToken);
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const userType = (user_type === 'international') ? 'international' : 'local';

    await pool.query(
      `INSERT INTO users (id, name, email, phone, whatsapp, user_type, nrc_id, password_hash, email_verified, verification_token, verification_token_expires)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [userId, String(name).trim(), normalizedEmail, String(phone || '').trim(), String(whatsapp || '').trim(), userType, String(nrc_id || '').trim(), passwordHash, verificationTokenHash, tokenExpires],
    );

    // Send verification email (best-effort — don't fail registration if email fails)
    try {
      const settings = await getSystemSettings();
      const appUrl = resolvePublicAppUrl(req);
      const verifyUrl = `${appUrl}/verify-email?token=${verificationToken}`;
      const displayName = String(name).trim() || 'there';
      await sendEmailNotification({
        settings,
        to: normalizedEmail,
        subject: 'Confirm your email address',
        text: `Hi ${displayName},\n\nThank you for signing up! Please confirm your email address by clicking the link below:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, please ignore this email.\n\nBest regards,\nMutale Mubanga`,
        html: buildBrandedEmailHtml({
          title: 'Confirm your email address',
          previewText: 'Confirm your email to finish creating your account.',
          greeting: `Hi ${displayName},`,
          bodyLines: [
            'Thank you for signing up! Please confirm your email address by clicking the button below.',
            'This link expires in 24 hours.',
            'If you did not create an account, you can safely ignore this email.',
          ],
          buttonText: 'Confirm email',
          buttonUrl: verifyUrl,
          footerLines: ['Best regards,', 'Mutale Mubanga'],
        }),
      });
    } catch (emailErr) {
      console.warn('[auth/register] Verification email failed to send:', emailErr.message);
    }

    return res.status(201).json({
      ok: true,
      message: 'Account created! Please check your email to confirm your address before logging in.',
    });
  } catch (error) {
    console.error('[auth/register]', error.message);
    return res.status(500).json({ ok: false, message: 'Registration failed. Please try again.' });
  }
});

// GET /api/auth/verify-email?token=xxx
app.get('/api/auth/verify-email', rateLimitAuth({ windowMs: 60 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).json({ ok: false, message: 'Verification token is missing.' });

    const tokenHash = sha256Hex(token);
    let [[user]] = await pool.query(
      'SELECT id, email_verified, verification_token_expires FROM users WHERE verification_token = ?',
      [tokenHash],
    );
    if (!user) {
      [[user]] = await pool.query(
        'SELECT id, email_verified, verification_token_expires FROM users WHERE verification_token = ?',
        [token],
      );
    }

    if (!user) return res.status(400).json({ ok: false, message: 'Invalid or expired verification link.' });
    if (user.email_verified) return res.json({ ok: true, message: 'Your email is already verified. You can log in.' });

    const expires = new Date(user.verification_token_expires);
    if (Date.now() > expires.getTime()) {
      return res.status(400).json({ ok: false, message: 'This verification link has expired. Please register again or request a new link.' });
    }

    await pool.query(
      'UPDATE users SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = ?',
      [user.id],
    );

    return res.json({ ok: true, message: 'Email confirmed! You can now log in.' });
  } catch (error) {
    console.error('[auth/verify-email]', error.message);
    return res.status(500).json({ ok: false, message: 'Verification failed. Please try again.' });
  }
});

// POST /api/auth/resend-verification
app.post('/api/auth/resend-verification', rateLimitAuth({ windowMs: 60 * 60 * 1000, max: 5 }), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, message: 'Email is required.' });

    const [[user]] = await pool.query('SELECT id, name, email_verified FROM users WHERE email = ?', [email]);
    // Always respond OK to avoid email enumeration
    if (!user || user.email_verified) {
      return res.json({ ok: true, message: 'If that email exists and is unverified, a new link has been sent.' });
    }

    const verificationToken = generateVerificationToken();
    const verificationTokenHash = sha256Hex(verificationToken);
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?',
      [verificationTokenHash, tokenExpires, user.id],
    );

    try {
      const settings = await getSystemSettings();
      const appUrl = resolvePublicAppUrl(req);
      const verifyUrl = `${appUrl}/verify-email?token=${verificationToken}`;
      await sendEmailNotification({
        settings,
        to: email,
        subject: 'Confirm your email address',
        text: `Hi ${user.name},\n\nHere is your new email confirmation link:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nBest regards,\nMutale Mubanga`,
        html: buildBrandedEmailHtml({
          title: 'Confirm your email address',
          previewText: 'Here is your new email confirmation link.',
          greeting: `Hi ${user.name},`,
          bodyLines: [
            'Here is your new email confirmation link. Click the button below to confirm your email.',
            'This link expires in 24 hours.',
          ],
          buttonText: 'Confirm email',
          buttonUrl: verifyUrl,
          footerLines: ['Best regards,', 'Mutale Mubanga'],
        }),
      });
    } catch (emailErr) {
      console.warn('[auth/resend-verification] Email failed:', emailErr.message);
    }

    return res.json({ ok: true, message: 'If that email exists and is unverified, a new link has been sent.' });
  } catch (error) {
    console.error('[auth/resend-verification]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to resend verification email.' });
  }
});

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', rateLimitAuth({ windowMs: 60 * 60 * 1000, max: 5 }), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, message: 'Email is required.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    }

    const [[user]] = await pool.query('SELECT id, name, email_verified FROM users WHERE email = ?', [email]);

    // Always respond OK to avoid email enumeration
    if (!user || !user.email_verified) {
      return res.json({ ok: true, message: 'If that email exists, we sent a password reset link.' });
    }

    const rawToken = generatePasswordResetToken();
    const tokenHash = sha256Hex(rawToken);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE users SET password_reset_token_hash = ?, password_reset_expires = ?, password_reset_used_at = NULL WHERE id = ?',
      [tokenHash, expires, user.id],
    );

    try {
      const settings = await getSystemSettings();
      const appUrl = resolvePublicAppUrl(req);
      const resetUrl = `${appUrl}/account/reset-password?token=${rawToken}`;
      await sendEmailNotification({
        settings,
        to: email,
        subject: 'Reset your password',
        text: `Hi ${user.name},\n\nWe received a request to reset your password.\n\nReset your password using this link:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.\n\nBest regards,\nMutale Mubanga`,
        html: buildBrandedEmailHtml({
          title: 'Reset your password',
          previewText: 'Use this link to reset your password.',
          greeting: `Hi ${user.name},`,
          bodyLines: [
            'We received a request to reset your password.',
            'Click the button below to choose a new password.',
            'This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.',
          ],
          buttonText: 'Reset password',
          buttonUrl: resetUrl,
          footerLines: ['Best regards,', 'Mutale Mubanga'],
        }),
      });
    } catch (emailErr) {
      console.warn('[auth/forgot-password] Email failed:', emailErr.message);
    }

    return res.json({ ok: true, message: 'If that email exists, we sent a password reset link.' });
  } catch (error) {
    console.error('[auth/forgot-password]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to request password reset. Please try again.' });
  }
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', rateLimitAuth({ windowMs: 60 * 60 * 1000, max: 5 }), async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token) return res.status(400).json({ ok: false, message: 'Reset token is required.' });
    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, message: 'Password must be at least 8 characters.' });
    }

    const tokenHash = sha256Hex(token);
    const [[user]] = await pool.query(
      `SELECT id, password_reset_expires, password_reset_used_at
       FROM users
       WHERE password_reset_token_hash = ?`,
      [tokenHash],
    );

    if (!user) return res.status(400).json({ ok: false, message: 'Invalid or expired reset link.' });
    if (user.password_reset_used_at) return res.status(400).json({ ok: false, message: 'This reset link has already been used.' });

    const expires = user.password_reset_expires ? new Date(user.password_reset_expires) : null;
    if (!expires || Date.now() > expires.getTime()) {
      return res.status(400).json({ ok: false, message: 'Invalid or expired reset link.' });
    }

    const newHash = hashPassword(password);
    await pool.query(
      `UPDATE users
       SET password_hash = ?, password_reset_used_at = NOW(), password_reset_token_hash = NULL, password_reset_expires = NULL
       WHERE id = ?`,
      [newHash, user.id],
    );

    return res.json({ ok: true, message: 'Password updated. You can now log in.' });
  } catch (error) {
    console.error('[auth/reset-password]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to reset password. Please try again.' });
  }
});

// POST /api/auth/login
const _authRateBuckets = new Map();
function rateLimitAuth({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${req.path}::${ip}`;
    const now = Date.now();
    let bucket = _authRateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      _authRateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ ok: false, message: 'Too many attempts. Please try again later.' });
    }
    next();
  };
}

app.post('/api/auth/login', rateLimitAuth({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

    const verification = user ? verifyPassword(password, user.password_hash) : { valid: false, needsUpgrade: false };
    if (!user || !verification.valid) {
      return res.status(401).json({ ok: false, message: 'Invalid email or password.' });
    }

    if (verification.needsUpgrade) {
      try {
        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
      } catch (upgradeErr) {
        console.warn('[auth/login] Could not upgrade legacy password hash:', upgradeErr.message);
      }
    }

    if (!user.email_verified) {
      return res.status(403).json({
        ok: false,
        message: 'Please verify your email address before logging in. Check your inbox for the confirmation link.',
        unverified: true,
      });
    }

    const adminPermissions = await loadUserAdminPermissions(pool, user.id, { legacyRole: user.role });
    const canAccessAdmin = userCanAccessAdmin(user.role, adminPermissions);
    const sessionUser = {
      ...mapAuthSessionUser(user, req),
      admin_permissions: canAccessAdmin ? adminPermissions : [],
      admin_access: canAccessAdmin,
    };

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 7 * 24 * 60 * 60;
    const tokenPayload = { sub: user.id, role: user.role || 'user', iat, exp };
    if (canAccessAdmin) {
      tokenPayload.admin = true;
      tokenPayload.permissions = adminPermissions;
    }
    const token = signJwtHmacSha256(tokenPayload, AUTH_TOKEN_SECRET);

    return res.json({ ok: true, data: sessionUser, token });
  } catch (error) {
    console.error('[auth/login]', error.message);
    return res.status(500).json({ ok: false, message: 'Login failed. Please try again.' });
  }
});

// PUT /api/auth/profile  (update user profile)
app.put('/api/auth/profile', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, message: 'User id is required.' });
    if (String(id) !== String(auth.claims.sub)) {
      return res.status(403).json({ ok: false, message: 'Forbidden: cannot update another user profile.' });
    }

    await ensureCvSectionsColumn();

    const allowed = ['name','phone','profession','organization','about','specialties','portfolio_url',
      'linkedin_url','linkedin_handle','occupation','nrc_id','address','interests','kyc_completed','cv_sections'];
    const updates = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        if (key === 'specialties' || key === 'interests') {
          updates[key] = Array.isArray(fields[key]) ? fields[key].join(',') : String(fields[key] || '');
        } else if (key === 'kyc_completed') {
          updates[key] = fields[key] ? 1 : 0;
        } else if (key === 'cv_sections') {
          updates[key] = JSON.stringify(normalizeCvSections(fields[key]));
        } else {
          updates[key] = fields[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, message: 'No fields to update.' });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE users SET ${setClauses} WHERE id = ?`, [...Object.values(updates), id]);

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found.' });

    invalidateCvSuggestionsCache(id);

    return res.json({ ok: true, data: mapAuthSessionUser(user, req) });
  } catch (error) {
    console.error('[auth/profile]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to update profile.' });
  }
});

// POST /api/auth/profile-photo — upload or replace profile photo (JPEG/PNG/WebP, max 2 MB)
app.post('/api/auth/profile-photo', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const image = req.body?.image;
    if (!image) {
      return res.status(400).json({ ok: false, message: 'Image data is required.' });
    }

    const userId = auth.claims.sub;
    const [[existing]] = await pool.query('SELECT profile_photo FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    const relativePath = await persistProfilePhotoFromDataUrl(image, req, userId);
    await pool.query('UPDATE users SET profile_photo = ? WHERE id = ?', [relativePath, userId]);
    await deleteProfilePhotoFile(existing.profile_photo);

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    return res.json({ ok: true, data: mapAuthSessionUser(user, req) });
  } catch (error) {
    console.error('[auth/profile-photo]', error.message);
    const message = error?.message || 'Failed to upload profile photo.';
    const status = /too large|only jpeg|invalid image/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
});

// DELETE /api/auth/profile-photo — remove profile photo
app.delete('/api/auth/profile-photo', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const userId = auth.claims.sub;
    const [[existing]] = await pool.query('SELECT profile_photo FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    await deleteProfilePhotoFile(existing.profile_photo);
    await pool.query('UPDATE users SET profile_photo = NULL WHERE id = ?', [userId]);

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    return res.json({ ok: true, data: mapAuthSessionUser(user, req) });
  } catch (error) {
    console.error('[auth/profile-photo:delete]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to remove profile photo.' });
  }
});



app.get('/api/db-test', async (_req, res) => {
  try {
    const result = await testConnection();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Database connection failed',
      error: error.message,
    });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events ORDER BY start_date ASC');
    const adminAuth = getAdminAuth(req);
    const mapper = adminAuth.ok ? mapDbEvent : mapPublicEvent;
    res.json({ ok: true, data: rows.map(mapper) });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Failed to fetch events',
      error: error.message,
    });
  }
});

app.post('/api/events/:eventId/coupon-preview', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const eventId = String(req.params.eventId || '').trim();
    if (!eventId) return res.status(400).json({ ok: false, message: 'eventId is required.' });

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const couponRes = await resolveEventCouponForBooking(
      pool,
      event,
      req.body?.coupon_code ?? req.body?.code ?? '',
      auth.claims.sub,
      { lockRow: false },
    );
    if (!couponRes.ok) {
      return res.status(400).json({ ok: false, message: couponRes.error });
    }

    return res.json({
      ok: true,
      data: {
        list_zmw: couponRes.list_zmw,
        discount_zmw: couponRes.discount_zmw,
        final_zmw: couponRes.final_zmw,
        coupon: mapPublicCouponPreviewCoupon(couponRes.coupon),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Coupon preview failed', error: error.message });
  }
});

app.get('/api/admin/events/:eventId/coupons', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const [[evt]] = await pool.query('SELECT id FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!evt) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const [rows] = await pool.query(
      'SELECT * FROM event_coupons WHERE event_id = ? ORDER BY created_at DESC',
      [eventId],
    );

    return res.json({ ok: true, data: rows.map(mapAdminEventCouponRow) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch coupons', error: error.message });
  }
});

app.post('/api/admin/events/:eventId/coupons', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const [[evt]] = await pool.query('SELECT id FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!evt) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const payload = normalizeAdminCouponCreate(req.body || {}, eventId);
    if (!payload.code) {
      return res.status(400).json({ ok: false, message: 'Coupon code is required.' });
    }
    const discountOk = payload.discount_type === 'percent'
      ? payload.discount_value > 0 && payload.discount_value <= 100
      : payload.discount_value > 0;

    if (!discountOk) {
      return res.status(400).json({
        ok: false,
        message: payload.discount_type === 'percent'
          ? 'Percent coupons must use a discount between 1 and 100.'
          : 'Fixed coupons must use a discount amount greater than 0.',
      });
    }

    await pool.query(
      `INSERT INTO event_coupons (
        id, event_id, code, discount_type, discount_value, max_redemptions, redemptions_count,
        max_per_user, valid_from, valid_until, active, label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.id,
        payload.event_id,
        payload.code,
        payload.discount_type,
        payload.discount_value,
        payload.max_redemptions,
        payload.redemptions_count,
        payload.max_per_user,
        payload.valid_from,
        payload.valid_until,
        payload.active ? 1 : 0,
        payload.label,
      ],
    );

    const [[row]] = await pool.query('SELECT * FROM event_coupons WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: mapAdminEventCouponRow(row) });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'A coupon with this code already exists for this event.' });
    }
    return res.status(500).json({ ok: false, message: 'Failed to create coupon', error: error.message });
  }
});

app.patch('/api/admin/events/:eventId/coupons/:couponId', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const couponId = String(req.params.couponId || '').trim();
    const [[existing]] = await pool.query(
      'SELECT * FROM event_coupons WHERE id = ? AND event_id = ? LIMIT 1',
      [couponId, eventId],
    );
    if (!existing) return res.status(404).json({ ok: false, message: 'Coupon not found.' });

    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(incoming, 'code') || Object.prototype.hasOwnProperty.call(incoming, 'coupon_code')) {
      const code = normalizeEventCouponCode(incoming.code ?? incoming.coupon_code ?? '');
      if (!code) return res.status(400).json({ ok: false, message: 'Coupon code cannot be empty.' });
      updates.push('code = ?');
      values.push(code);
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'discount_type')) {
      let dt = String(incoming.discount_type || '').trim().toLowerCase();
      if (dt === 'amount') dt = 'fixed';
      if (dt !== 'percent' && dt !== 'fixed') {
        return res.status(400).json({ ok: false, message: 'discount_type must be percent or fixed.' });
      }
      updates.push('discount_type = ?');
      values.push(dt);
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'discount_value')) {
      updates.push('discount_value = ?');
      values.push(roundMoney2(toNumber(incoming.discount_value, 0)));
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'max_redemptions')) {
      const raw = incoming.max_redemptions;
      const maxR = raw == null || raw === ''
        ? null
        : Math.max(0, Math.floor(Number(raw)));
      updates.push('max_redemptions = ?');
      values.push(maxR);
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'max_per_user')) {
      updates.push('max_per_user = ?');
      values.push(Math.max(1, Math.floor(toNumber(incoming.max_per_user, 1))));
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'valid_from')) {
      updates.push('valid_from = ?');
      values.push(parseOptionalDateSql(incoming.valid_from));
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'valid_until')) {
      updates.push('valid_until = ?');
      values.push(parseOptionalDateSql(incoming.valid_until));
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'active')) {
      updates.push('active = ?');
      values.push(parseBoolean(incoming.active, true) ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'label')) {
      updates.push('label = ?');
      values.push(String(incoming.label || '').trim() || null);
    }

    if (updates.length === 0) {
      return res.json({ ok: true, data: mapAdminEventCouponRow(existing) });
    }

    values.push(couponId, eventId);

    await pool.query(
      `UPDATE event_coupons SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`,
      values,
    );

    const [[updated]] = await pool.query(
      'SELECT * FROM event_coupons WHERE id = ? AND event_id = ? LIMIT 1',
      [couponId, eventId],
    );

    const row = mapAdminEventCouponRow(updated);
    let discountOk = row.discount_type === 'percent'
      ? row.discount_value > 0 && row.discount_value <= 100
      : row.discount_value > 0;
    if (!discountOk) {
      return res.json({
        ok: true,
        data: row,
        warning: 'Coupon values may be invalid for checkout until corrected.',
      });
    }

    return res.json({ ok: true, data: row });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'A coupon with this code already exists for this event.' });
    }
    return res.status(500).json({ ok: false, message: 'Failed to update coupon', error: error.message });
  }
});

app.delete('/api/admin/events/:eventId/coupons/:couponId', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const couponId = String(req.params.couponId || '').trim();
    const [result] = await pool.query(
      'DELETE FROM event_coupons WHERE id = ? AND event_id = ?',
      [couponId, eventId],
    );
    if (!result?.affectedRows) {
      return res.status(404).json({ ok: false, message: 'Coupon not found.' });
    }
    return res.json({ ok: true, message: 'Coupon deleted.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete coupon', error: error.message });
  }
});

// ─── Event forum ─────────────────────────────────────────────────────────────

app.get('/api/events/:eventId/forum/topics', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const event = await loadEventForForum(eventId);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });
    if (!isForumVisibleEvent(event)) {
      return res.status(403).json({ ok: false, message: 'Forum is not enabled for this event.' });
    }

    const adminAuth = getAdminAuth(req);
    const includeHidden = adminAuth.ok;

    const [rows] = await pool.query(
      `SELECT * FROM event_forum_topics
       WHERE event_id = ? ${includeHidden ? '' : 'AND hidden = 0'}
       ORDER BY pinned DESC, last_activity_at DESC`,
      [eventId],
    );

    return res.json({ ok: true, data: rows.map(mapDbForumTopic) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load forum topics.', error: error.message });
  }
});

app.get('/api/events/:eventId/forum/topics/:topicId', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const topicId = String(req.params.topicId || '').trim();
    const event = await loadEventForForum(eventId);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });
    if (!isForumVisibleEvent(event)) {
      return res.status(403).json({ ok: false, message: 'Forum is not enabled for this event.' });
    }

    const adminAuth = getAdminAuth(req);
    const includeHidden = adminAuth.ok;

    const [[topicRow]] = await pool.query(
      `SELECT * FROM event_forum_topics WHERE id = ? AND event_id = ? LIMIT 1`,
      [topicId, eventId],
    );
    if (!topicRow || (!includeHidden && topicRow.hidden)) {
      return res.status(404).json({ ok: false, message: 'Topic not found.' });
    }

    const [replyRows] = await pool.query(
      `SELECT * FROM event_forum_replies
       WHERE topic_id = ? AND event_id = ? ${includeHidden ? '' : 'AND hidden = 0'}
       ORDER BY created_at ASC`,
      [topicId, eventId],
    );

    return res.json({
      ok: true,
      data: {
        topic: mapDbForumTopic(topicRow),
        replies: replyRows.map(mapDbForumReply),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load forum topic.', error: error.message });
  }
});

app.post('/api/events/:eventId/forum/topics', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });

    const access = await assertForumWriteAccess(eventId, authUser);
    if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

    const title = sanitizeForumText(req.body?.title, 200);
    const body = sanitizeForumText(req.body?.body, 5000);
    if (!title) return res.status(400).json({ ok: false, message: 'Topic title is required.' });
    if (!body) return res.status(400).json({ ok: false, message: 'Topic message is required.' });

    const topicId = generateEntityId('eft');
    const now = new Date();
    await pool.query(
      `INSERT INTO event_forum_topics (
        id, event_id, user_id, user_name, title, body, reply_count, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [topicId, eventId, access.userId, access.userName, title, body, now],
    );

    const [[row]] = await pool.query('SELECT * FROM event_forum_topics WHERE id = ?', [topicId]);
    return res.status(201).json({ ok: true, data: mapDbForumTopic(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to create forum topic.', error: error.message });
  }
});

app.post('/api/events/:eventId/forum/topics/:topicId/replies', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const topicId = String(req.params.topicId || '').trim();
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });

    const access = await assertForumWriteAccess(eventId, authUser);
    if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

    const [[topicRow]] = await pool.query(
      'SELECT * FROM event_forum_topics WHERE id = ? AND event_id = ? AND hidden = 0 LIMIT 1',
      [topicId, eventId],
    );
    if (!topicRow) return res.status(404).json({ ok: false, message: 'Topic not found.' });

    const body = sanitizeForumText(req.body?.body, 3000);
    if (!body) return res.status(400).json({ ok: false, message: 'Reply message is required.' });

    const replyId = generateEntityId('efr');
    await pool.query(
      `INSERT INTO event_forum_replies (id, topic_id, event_id, user_id, user_name, body)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [replyId, topicId, eventId, access.userId, access.userName, body],
    );
    await pool.query(
      `UPDATE event_forum_topics
       SET reply_count = reply_count + 1, last_activity_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [topicId],
    );

    const [[row]] = await pool.query('SELECT * FROM event_forum_replies WHERE id = ?', [replyId]);
    return res.status(201).json({ ok: true, data: mapDbForumReply(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to post reply.', error: error.message });
  }
});

app.patch('/api/events/:eventId/forum/topics/:topicId', async (req, res) => {
  try {
    const adminAuth = getAdminAuth(req);
    if (!adminAuth.ok) return sendAuthFailure(res, adminAuth);

    const eventId = String(req.params.eventId || '').trim();
    const topicId = String(req.params.topicId || '').trim();
    const updates = [];
    const values = [];

    if (req.body?.pinned !== undefined) {
      updates.push('pinned = ?');
      values.push(parseBoolean(req.body.pinned, false) ? 1 : 0);
    }
    if (req.body?.hidden !== undefined) {
      updates.push('hidden = ?');
      values.push(parseBoolean(req.body.hidden, false) ? 1 : 0);
    }
    if (!updates.length) {
      return res.status(400).json({ ok: false, message: 'No valid fields to update.' });
    }

    values.push(topicId, eventId);
    await pool.query(
      `UPDATE event_forum_topics SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ? AND event_id = ?`,
      values,
    );

    const [[row]] = await pool.query(
      'SELECT * FROM event_forum_topics WHERE id = ? AND event_id = ? LIMIT 1',
      [topicId, eventId],
    );
    if (!row) return res.status(404).json({ ok: false, message: 'Topic not found.' });
    return res.json({ ok: true, data: mapDbForumTopic(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update forum topic.', error: error.message });
  }
});

app.delete('/api/events/:eventId/forum/topics/:topicId', async (req, res) => {
  try {
    const adminAuth = getAdminAuth(req);
    if (!adminAuth.ok) return sendAuthFailure(res, adminAuth);

    const eventId = String(req.params.eventId || '').trim();
    const topicId = String(req.params.topicId || '').trim();

    await pool.query('DELETE FROM event_forum_replies WHERE topic_id = ? AND event_id = ?', [topicId, eventId]);
    const [result] = await pool.query(
      'DELETE FROM event_forum_topics WHERE id = ? AND event_id = ?',
      [topicId, eventId],
    );
    if (!result?.affectedRows) {
      return res.status(404).json({ ok: false, message: 'Topic not found.' });
    }
    return res.json({ ok: true, message: 'Topic deleted.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete forum topic.', error: error.message });
  }
});

app.patch('/api/events/:eventId/forum/replies/:replyId', async (req, res) => {
  try {
    const adminAuth = getAdminAuth(req);
    if (!adminAuth.ok) return sendAuthFailure(res, adminAuth);

    const eventId = String(req.params.eventId || '').trim();
    const replyId = String(req.params.replyId || '').trim();

    if (req.body?.hidden === undefined) {
      return res.status(400).json({ ok: false, message: 'hidden field is required.' });
    }

    await pool.query(
      'UPDATE event_forum_replies SET hidden = ?, updated_at = NOW() WHERE id = ? AND event_id = ?',
      [parseBoolean(req.body.hidden, false) ? 1 : 0, replyId, eventId],
    );

    const [[row]] = await pool.query(
      'SELECT * FROM event_forum_replies WHERE id = ? AND event_id = ? LIMIT 1',
      [replyId, eventId],
    );
    if (!row) return res.status(404).json({ ok: false, message: 'Reply not found.' });
    return res.json({ ok: true, data: mapDbForumReply(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update forum reply.', error: error.message });
  }
});

app.delete('/api/events/:eventId/forum/replies/:replyId', async (req, res) => {
  try {
    const adminAuth = getAdminAuth(req);
    if (!adminAuth.ok) return sendAuthFailure(res, adminAuth);

    const eventId = String(req.params.eventId || '').trim();
    const replyId = String(req.params.replyId || '').trim();

    const [[reply]] = await pool.query(
      'SELECT * FROM event_forum_replies WHERE id = ? AND event_id = ? LIMIT 1',
      [replyId, eventId],
    );
    if (!reply) return res.status(404).json({ ok: false, message: 'Reply not found.' });

    await pool.query('DELETE FROM event_forum_replies WHERE id = ? AND event_id = ?', [replyId, eventId]);
    await pool.query(
      `UPDATE event_forum_topics
       SET reply_count = GREATEST(0, reply_count - 1), updated_at = NOW()
       WHERE id = ? AND event_id = ?`,
      [reply.topic_id, eventId],
    );

    return res.json({ ok: true, message: 'Reply deleted.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete forum reply.', error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const incoming = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    if (incoming.cover_image) {
      incoming.cover_image = await persistCoverImageIfNeeded(incoming.cover_image, req);
    }
    await persistEventPeopleImages(incoming, req);

    const payload = normalizeEventPayload(incoming);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ ok: false, message: 'Title and slug are required.' });
    }

    const temporalError = validateEventTemporalRules(payload);
    if (temporalError) {
      return res.status(400).json({ ok: false, message: temporalError });
    }

    const placeholders = EVENT_FIELDS.map(() => '?').join(', ');
    const values = EVENT_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO events (${EVENT_FIELDS.join(', ')}) VALUES (${placeholders})`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM events WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: mapDbEvent(row) });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      if (String(error.message || '').includes('slug')) {
        return res.status(409).json({ ok: false, message: 'Slug already exists. Please choose a different title/slug.' });
      }
      return res.status(409).json({ ok: false, message: 'Event id already exists. Please retry create.' });
    }
    return res.status(500).json({ ok: false, message: 'Failed to save event', error: error.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const [[existingRow]] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (!existingRow) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    if (hasEventEnded(existingRow)) {
      return res.status(403).json({ ok: false, message: 'Past events are locked and cannot be edited.' });
    }

    const incoming = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    if (incoming.cover_image) {
      incoming.cover_image = await persistCoverImageIfNeeded(incoming.cover_image, req);
    }
    await persistEventPeopleImages(incoming, req);

    const payload = normalizeEventPayload({ ...existingRow, ...incoming }, req.params.id);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ ok: false, message: 'Title and slug are required.' });
    }

    const temporalError = validateEventTemporalRules(payload);
    if (temporalError) {
      return res.status(400).json({ ok: false, message: temporalError });
    }

    const providedFields = EVENT_FIELDS.filter((f) => (
      f !== 'id' && Object.prototype.hasOwnProperty.call(incoming, f)
    ));

    // Nothing to update: return current row as success.
    if (providedFields.length === 0) {
      return res.json({ ok: true, data: mapDbEvent(existingRow) });
    }

    const updates = providedFields.map((f) => `${f} = ?`).join(', ');
    const values = providedFields.map((f) => payload[f]);

    await pool.query(`UPDATE events SET ${updates} WHERE id = ?`, [...values, req.params.id]);
    const [[row]] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, data: mapDbEvent(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update event', error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'Event not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete event', error: error.message });
  }
});

app.post('/api/admin/events/:eventId/zoom/create', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    if (!eventId) return res.status(400).json({ ok: false, message: 'eventId is required.' });

    const videoSettings = await getVideoSettings();
    if (!isVideoProviderEnabled('zoom', videoSettings)) {
      return res.status(400).json({ ok: false, message: 'Zoom is disabled in Settings → Video Meetings.' });
    }

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });

    if (String(event.status || '').toLowerCase() === 'cancelled') {
      return res.status(400).json({ ok: false, message: 'Cannot create a Zoom meeting for a cancelled event.' });
    }

    const zoomConfig = await getZoomConfig();
    const hostEmail = String(req.body?.hostEmail || event.zoom_host_email || event.organizer_email || zoomConfig.defaultHostEmail || '').trim();
    if (!hostEmail) {
      return res.status(400).json({ ok: false, message: 'Host email is required. Set organizer email or ZOOM_DEFAULT_HOST_EMAIL.' });
    }

    const startTime = toZoomDateTime(event);
    if (!startTime) {
      return res.status(400).json({ ok: false, message: 'Event start date/time is required before scheduling Zoom.' });
    }

    const duration = toZoomDurationMinutes(event);
    const meetingPayload = {
      topic: String(event.title || 'Mutale Event').trim(),
      type: 2,
      agenda: String(event.short_description || event.description || '').slice(0, 1500),
      start_time: startTime.toISOString(),
      duration,
      timezone: String(event.timezone || 'Africa/Lusaka'),
      password: String(req.body?.password || '').trim() || undefined,
      settings: {
        waiting_room: parseBoolean(req.body?.waitingRoom, true),
        join_before_host: parseBoolean(req.body?.joinBeforeHost, false),
      },
    };

    const zoomMeeting = await zoomRequest({
      zoomConfig,
      method: 'POST',
      path: `/users/${encodeURIComponent(hostEmail)}/meetings`,
      body: meetingPayload,
    });

    const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      `UPDATE events SET
        delivery_mode = ?,
        provider = ?,
        meeting_platform = ?,
        meeting_link = ?,
        zoom_meeting_id = ?,
        zoom_uuid = ?,
        zoom_join_url = ?,
        zoom_start_url = ?,
        zoom_password = ?,
        zoom_host_email = ?,
        zoom_status = ?,
        zoom_created_at = ?,
        zoom_synced_at = ?
      WHERE id = ?`,
      [
        String(event.delivery_mode || (event.event_mode === 'in_person' ? 'physical' : 'virtual')),
        'zoom',
        'zoom',
        zoomMeeting.join_url || event.meeting_link || '',
        String(zoomMeeting.id || ''),
        zoomMeeting.uuid || null,
        zoomMeeting.join_url || null,
        zoomMeeting.start_url || null,
        zoomMeeting.password || null,
        hostEmail,
        zoomMeeting.status || 'scheduled',
        nowSql,
        nowSql,
        eventId,
      ],
    );

    const [[updatedEvent]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    await createIntegrationLog({
      provider: 'zoom',
      action: 'meeting_create',
      relatedType: 'event',
      relatedId: eventId,
      status: 'success',
      requestPayload: meetingPayload,
      responsePayload: {
        zoom_meeting_id: zoomMeeting?.id,
        status: zoomMeeting?.status,
      },
    });

    return res.status(201).json({
      ok: true,
      message: 'Zoom meeting created and linked to event.',
      event: updatedEvent,
      zoom: zoomMeeting,
    });
  } catch (error) {
    await createIntegrationLog({
      provider: 'zoom',
      action: 'meeting_create',
      relatedType: 'event',
      relatedId: String(req.params.eventId || '').trim() || null,
      status: 'failed',
      requestPayload: req.body || null,
      errorMessage: error.message,
    });
    return res.status(502).json({ ok: false, message: 'Failed to create Zoom meeting', error: error.message });
  }
});

app.post('/api/admin/events/:eventId/daily/create', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    if (!eventId) return res.status(400).json({ ok: false, message: 'eventId is required.' });

    const videoSettings = await getVideoSettings();
    if (!isVideoProviderEnabled('daily', videoSettings)) {
      return res.status(400).json({ ok: false, message: 'Daily.co is disabled in Settings → Video Meetings.' });
    }

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });

    if (String(event.status || '').toLowerCase() === 'cancelled') {
      return res.status(400).json({ ok: false, message: 'Cannot create a Daily room for a cancelled event.' });
    }

    const dailyConfig = await getDailyConfig();
    if (!dailyConfig.apiKey || !dailyConfig.domain) {
      return res.status(400).json({ ok: false, message: 'Daily API key and domain are required in Settings → Video Meetings.' });
    }

    const roomName = buildDailyRoomNameForEvent(event);
    const { nbf, exp } = getDailyRoomWindowForEvent(event);
    const maxParticipants = Math.min(
      200,
      Math.max(2, Number(event.capacity || dailyConfig.maxParticipantsDefault) || dailyConfig.maxParticipantsDefault),
    );

    const roomPayload = {
      name: roomName,
      privacy: dailyConfig.defaultRoomPrivacy,
      properties: {
        max_participants: maxParticipants,
        enable_knocking: parseBoolean(req.body?.waitingRoom, true),
        ...(nbf ? { nbf } : {}),
        ...(exp ? { exp } : {}),
      },
    };

    let dailyRoom;
    try {
      dailyRoom = await dailyRequest({
        dailyConfig,
        method: 'POST',
        path: '/rooms',
        body: roomPayload,
      });
    } catch (createError) {
      const message = String(createError?.message || '');
      if (!message.toLowerCase().includes('already exists')) throw createError;
      dailyRoom = await dailyRequest({
        dailyConfig,
        method: 'GET',
        path: `/rooms/${encodeURIComponent(roomName)}`,
      });
    }

    const roomUrl = String(dailyRoom?.url || `https://${dailyConfig.domain}/${roomName}`).trim();
    const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `UPDATE events SET
        delivery_mode = ?,
        provider = ?,
        meeting_platform = ?,
        meeting_link = ?,
        daily_room_name = ?,
        daily_room_url = ?,
        daily_status = ?,
        daily_created_at = ?,
        daily_synced_at = ?
      WHERE id = ?`,
      [
        String(event.delivery_mode || (event.event_mode === 'in_person' ? 'physical' : 'virtual')),
        'daily',
        'daily',
        roomUrl,
        roomName,
        roomUrl,
        'scheduled',
        nowSql,
        nowSql,
        eventId,
      ],
    );

    const [[updatedEvent]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    await createIntegrationLog({
      provider: 'daily',
      action: 'room_create',
      relatedType: 'event',
      relatedId: eventId,
      status: 'success',
      requestPayload: roomPayload,
      responsePayload: { daily_room_name: roomName, url: roomUrl },
    });

    return res.status(201).json({
      ok: true,
      message: 'Daily room created and linked to event.',
      event: updatedEvent,
      daily: dailyRoom,
    });
  } catch (error) {
    await createIntegrationLog({
      provider: 'daily',
      action: 'room_create',
      relatedType: 'event',
      relatedId: String(req.params.eventId || '').trim() || null,
      status: 'failed',
      requestPayload: req.body || null,
      errorMessage: error.message,
    });
    return res.status(502).json({ ok: false, message: 'Failed to create Daily room', error: error.message });
  }
});

app.get('/api/events/:eventId/zoom/meta', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    if (!eventId) return res.status(400).json({ ok: false, message: 'eventId is required.' });

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });

    return res.json({
      ok: true,
      data: {
        event_id: event.id,
        provider: event.provider || 'internal',
        meeting_platform: event.meeting_platform || '',
        delivery_mode: event.delivery_mode || (event.event_mode === 'in_person' ? 'physical' : 'virtual'),
        zoom_meeting_id: event.zoom_meeting_id || null,
        zoom_join_url: event.zoom_join_url || event.meeting_link || null,
        zoom_password: event.zoom_password || null,
        zoom_status: event.zoom_status || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load Zoom metadata', error: error.message });
  }
});

app.post('/api/events/:eventId/zoom/join-auth', async (req, res) => {
  let logUserId = '';
  let logUserEmail = '';
  try {
    const eventId = String(req.params.eventId || '').trim();
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });

    const userId = String(authUser.id || '').trim();
    const userEmail = String(authUser.email || '').trim().toLowerCase();
    const userName = String(authUser.name || '').trim() || 'Attendee';
    const role = auth.claims.role === 'admin' && Number(req.body?.role || 0) === 1 ? 1 : 0;
    logUserId = userId;
    logUserEmail = userEmail;

    if (!eventId) return res.status(400).json({ ok: false, message: 'eventId is required.' });
    if (!userId || !userEmail) {
      return res.status(401).json({ ok: false, message: 'Authenticated user context is required.' });
    }

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const provider = String(event.provider || '').toLowerCase();
    const platform = String(event.meeting_platform || '').toLowerCase();
    if (provider !== 'zoom' && platform !== 'zoom') {
      await createIntegrationLog({
        provider: 'zoom',
        action: 'join_auth',
        relatedType: 'event',
        relatedId: eventId,
        status: 'denied',
        requestPayload: { userId, userEmail },
        errorMessage: 'Event not configured as Zoom.',
      });
      return res.status(400).json({ ok: false, message: 'This event is not configured as a Zoom event.' });
    }

    const status = String(event.status || '').toLowerCase();
    if (status === 'cancelled') {
      await createIntegrationLog({
        provider: 'zoom',
        action: 'join_auth',
        relatedType: 'event',
        relatedId: eventId,
        status: 'denied',
        requestPayload: { userId, userEmail },
        errorMessage: 'Event cancelled.',
      });
      return res.status(403).json({ ok: false, message: 'This event has been cancelled.' });
    }

    const windowState = getJoinWindowForEvent(event);
    if (!windowState.allowed) {
      await createIntegrationLog({
        provider: 'zoom',
        action: 'join_auth',
        relatedType: 'event',
        relatedId: eventId,
        status: 'denied',
        requestPayload: { userId, userEmail },
        errorMessage: windowState.reason,
      });
      return res.status(403).json({ ok: false, message: windowState.reason, joinWindow: windowState });
    }

    const [rows] = await pool.query(
      `SELECT * FROM event_registrations
       WHERE event_id = ? AND user_id = ? AND user_email = ? AND status <> ?
       ORDER BY CASE WHEN COALESCE(attendee_slot_key, '__self__') = '__self__' THEN 0 ELSE 1 END,
                registered_at DESC
       LIMIT 1`,
      [eventId, userId, userEmail, 'cancelled'],
    );

    const registration = rows?.[0] || null;
    if (!registration) {
      await createIntegrationLog({
        provider: 'zoom',
        action: 'join_auth',
        relatedType: 'event',
        relatedId: eventId,
        status: 'denied',
        requestPayload: { userId, userEmail },
        errorMessage: 'Registration not found.',
      });
      return res.status(403).json({ ok: false, message: 'You must register for this event before joining Zoom.' });
    }

    const paymentStatus = String(registration.payment_status || '').toLowerCase();
    const allowedPaymentStatuses = ['paid', 'not_required', 'waived'];
    if (!allowedPaymentStatuses.includes(paymentStatus)) {
      await createIntegrationLog({
        provider: 'zoom',
        action: 'join_auth',
        relatedType: 'event',
        relatedId: eventId,
        status: 'denied',
        requestPayload: { userId, userEmail, paymentStatus },
        errorMessage: 'Payment status not approved.',
      });
      return res.status(403).json({ ok: false, message: 'Registration payment is not approved for joining yet.' });
    }

    const rawJoinUrl = event.zoom_join_url || event.meeting_link || null;
    const joinUrl = sanitizeMeetingJoinUrl(rawJoinUrl);
    const meetingNumber = extractZoomMeetingNumber(event.zoom_meeting_id || '')
      || extractZoomMeetingNumber(joinUrl || rawJoinUrl || '');
    if (!meetingNumber && !joinUrl) {
      await createIntegrationLog({
        provider: 'zoom',
        action: 'join_auth',
        relatedType: 'event',
        relatedId: eventId,
        status: 'failed',
        requestPayload: { userId, userEmail },
        errorMessage: 'No meeting number or join URL configured.',
      });
      return res.status(400).json({ ok: false, message: 'Zoom meeting link is not available for this event.' });
    }

    const zoomConfig = await getZoomConfig();
    let signature = null;
    if (zoomConfig.sdkKey && zoomConfig.sdkSecret && meetingNumber) {
      const iat = Math.floor(Date.now() / 1000) - 30;
      const exp = iat + (2 * 60 * 60);
      const tokenExp = exp;
      signature = signJwtHmacSha256({
        sdkKey: zoomConfig.sdkKey,
        appKey: zoomConfig.sdkKey,
        mn: meetingNumber,
        role,
        iat,
        exp,
        tokenExp,
      }, zoomConfig.sdkSecret);
    }

    // ── Mark attendance on the registration row ──────────────────────────────
    // Records that this attendee actually clicked "Join Meeting Now":
    //   - attended_at:    first-ever join (preserved on subsequent clicks)
    //   - last_joined_at: most recent join (updated every click)
    //   - join_count:     incremented every click
    //   - join_source:    'zoom' for this handler
    //   - status:         confirmed → attended (cancelled/refunded preserved)
    let attendanceUpdated = null;
    try {
      await pool.query(
        `UPDATE event_registrations
         SET attended_at = COALESCE(attended_at, NOW()),
             last_joined_at = NOW(),
             join_count = join_count + 1,
             join_source = 'zoom',
             status = CASE WHEN status = 'confirmed' THEN 'attended' ELSE status END
         WHERE id = ?`,
        [registration.id],
      );
      const [[refreshed]] = await pool.query(
        'SELECT * FROM event_registrations WHERE id = ?',
        [registration.id],
      );
      if (refreshed) attendanceUpdated = refreshed;
    } catch (attendanceError) {
      // Attendance tracking is best-effort: never block the user from joining.
      await createIntegrationLog({
        provider: 'zoom',
        action: 'join_attendance',
        relatedType: 'event_registration',
        relatedId: registration.id,
        status: 'failed',
        requestPayload: { userId, userEmail },
        errorMessage: attendanceError?.message || 'Unable to mark attendance.',
      });
    }

    const finalRegistration = attendanceUpdated || registration;

    await createIntegrationLog({
      provider: 'zoom',
      action: 'join_auth',
      relatedType: 'event',
      relatedId: eventId,
      status: 'success',
      requestPayload: { userId, userEmail },
      responsePayload: {
        meetingNumber: meetingNumber || null,
        hasSignature: Boolean(signature),
        hasJoinUrl: Boolean(joinUrl),
        attendedAt: finalRegistration.attended_at || null,
        joinCount: finalRegistration.join_count || null,
      },
    });

    return res.json({
      ok: true,
      auth: {
        sdkKey: zoomConfig.sdkKey || null,
        signature,
        meetingNumber: meetingNumber || null,
        password: event.zoom_password || null,
        userName,
        userEmail,
        joinUrl,
      },
      registration: mapDbRegistration(finalRegistration),
      joinWindow: windowState,
    });
  } catch (error) {
    await createIntegrationLog({
      provider: 'zoom',
      action: 'join_auth',
      relatedType: 'event',
      relatedId: String(req.params.eventId || '').trim() || null,
      status: 'failed',
      requestPayload: { userId: logUserId, userEmail: logUserEmail },
      errorMessage: error.message,
    });
    return res.status(500).json({ ok: false, message: 'Failed to generate Zoom join authorization', error: error.message });
  }
});

app.get('/api/events/:eventId/daily/meta', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    if (!eventId) return res.status(400).json({ ok: false, message: 'eventId is required.' });

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });

    return res.json({
      ok: true,
      data: {
        event_id: event.id,
        provider: event.provider || 'internal',
        meeting_platform: event.meeting_platform || '',
        delivery_mode: event.delivery_mode || (event.event_mode === 'in_person' ? 'physical' : 'virtual'),
        daily_room_name: event.daily_room_name || null,
        daily_room_url: event.daily_room_url || event.meeting_link || null,
        daily_status: event.daily_status || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load Daily metadata', error: error.message });
  }
});

app.post('/api/events/:eventId/daily/join-auth', async (req, res) => {
  let logUserId = '';
  let logUserEmail = '';
  try {
    const eventId = String(req.params.eventId || '').trim();
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });

    logUserId = String(authUser.id || '').trim();
    logUserEmail = String(authUser.email || '').trim().toLowerCase();

    const joinCheck = await assertCanJoinEvent({
      eventId,
      authUser,
      reqBody: req.body || {},
      providerLabel: 'the meeting',
    });
    if (!joinCheck.ok) {
      await createIntegrationLog({
        provider: 'daily',
        action: 'join_auth',
        relatedType: 'event',
        relatedId: eventId,
        status: 'denied',
        requestPayload: { userId: logUserId, userEmail: logUserEmail },
        errorMessage: joinCheck.message,
      });
      return res.status(joinCheck.status).json({
        ok: false,
        message: joinCheck.message,
        joinWindow: joinCheck.joinWindow || undefined,
      });
    }

    const { event, registration, windowState, userId, userEmail, userName, role } = joinCheck;
    const provider = String(event.provider || '').toLowerCase();
    const platform = String(event.meeting_platform || '').toLowerCase();
    const videoSettings = await getVideoSettings();
    const resolved = resolveEventVideoProvider(event, videoSettings);
    if (resolved !== 'daily' && provider !== 'daily' && platform !== 'daily') {
      return res.status(400).json({ ok: false, message: 'This event is not configured for Daily.co.' });
    }

    const roomName = String(event.daily_room_name || '').trim();
    const dailyConfig = await getDailyConfig();
    const roomUrl = sanitizeMeetingJoinUrl(
      String(event.daily_room_url || '').trim()
        || (roomName && dailyConfig.domain ? `https://${dailyConfig.domain}/${roomName}` : ''),
    );
    if (!roomName || !roomUrl) {
      return res.status(400).json({ ok: false, message: 'Daily room is not available for this event. Please contact the organizer.' });
    }

    const { nbf, exp } = getDailyRoomWindowForEvent(event);
    const tokenBody = {
      properties: {
        room_name: roomName,
        user_id: userId.slice(0, 36),
        user_name: userName,
        is_owner: role === 1,
        ...(nbf ? { nbf } : {}),
        ...(exp ? { exp } : {}),
      },
    };
    const tokenResponse = await dailyRequest({
      dailyConfig,
      method: 'POST',
      path: '/meeting-tokens',
      body: tokenBody,
    });
    const meetingToken = String(tokenResponse?.token || '').trim();
    if (!meetingToken) {
      return res.status(502).json({ ok: false, message: 'Daily did not return a meeting token.' });
    }

    let attendanceUpdated = null;
    try {
      attendanceUpdated = await markEventRegistrationAttendance(registration.id, 'daily');
    } catch (attendanceError) {
      await createIntegrationLog({
        provider: 'daily',
        action: 'join_attendance',
        relatedType: 'event_registration',
        relatedId: registration.id,
        status: 'failed',
        requestPayload: { userId, userEmail },
        errorMessage: attendanceError?.message || 'Unable to mark attendance.',
      });
    }

    const finalRegistration = attendanceUpdated || registration;

    await createIntegrationLog({
      provider: 'daily',
      action: 'join_auth',
      relatedType: 'event',
      relatedId: eventId,
      status: 'success',
      requestPayload: { userId, userEmail },
      responsePayload: { roomName, hasToken: true },
    });

    return res.json({
      ok: true,
      provider: 'daily',
      auth: {
        roomUrl,
        roomName,
        token: meetingToken,
        userName,
        userEmail,
        isOwner: role === 1,
      },
      registration: mapDbRegistration(finalRegistration),
      joinWindow: windowState,
      joinMode: 'embed',
    });
  } catch (error) {
    await createIntegrationLog({
      provider: 'daily',
      action: 'join_auth',
      relatedType: 'event',
      relatedId: String(req.params.eventId || '').trim() || null,
      status: 'failed',
      requestPayload: { userId: logUserId, userEmail: logUserEmail },
      errorMessage: error.message,
    });
    return res.status(500).json({ ok: false, message: 'Failed to generate Daily join authorization', error: error.message });
  }
});

app.post('/api/events/:eventId/video/join-auth', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const videoSettings = await getVideoSettings();
    const provider = resolveEventVideoProvider(event, videoSettings);

    if (!isVideoProviderEnabled(provider, videoSettings)) {
      return res.status(400).json({
        ok: false,
        message: `${provider === 'daily' ? 'Daily.co' : 'Zoom'} is disabled in site settings.`,
      });
    }

    if (provider === 'daily') {
      const joinCheckDaily = await assertCanJoinEvent({
        eventId,
        authUser,
        reqBody: req.body || {},
        providerLabel: 'the meeting',
      });
      if (!joinCheckDaily.ok) {
        return res.status(joinCheckDaily.status).json({
          ok: false,
          message: joinCheckDaily.message,
          joinWindow: joinCheckDaily.joinWindow || undefined,
        });
      }
      const {
        event: evtDaily,
        registration: regDaily,
        windowState: winDaily,
        userId: uidDaily,
        userEmail: emailDaily,
        userName: nameDaily,
        role: roleDaily,
      } = joinCheckDaily;

      const roomNameDaily = String(evtDaily.daily_room_name || '').trim();
      const dailyConfigJoin = await getDailyConfig();
      const roomUrlDaily = sanitizeMeetingJoinUrl(
        String(evtDaily.daily_room_url || '').trim()
          || (roomNameDaily && dailyConfigJoin.domain ? `https://${dailyConfigJoin.domain}/${roomNameDaily}` : ''),
      );
      if (!roomNameDaily || !roomUrlDaily) {
        return res.status(400).json({ ok: false, message: 'Daily room is not available for this event.' });
      }

      const { nbf: nbfD, exp: expD } = getDailyRoomWindowForEvent(evtDaily);
      const tokenResponseDaily = await dailyRequest({
        dailyConfig: dailyConfigJoin,
        method: 'POST',
        path: '/meeting-tokens',
        body: {
          properties: {
            room_name: roomNameDaily,
            user_id: uidDaily.slice(0, 36),
            user_name: nameDaily,
            is_owner: roleDaily === 1,
            ...(nbfD ? { nbf: nbfD } : {}),
            ...(expD ? { exp: expD } : {}),
          },
        },
      });
      const meetingTokenDaily = String(tokenResponseDaily?.token || '').trim();
      if (!meetingTokenDaily) {
        return res.status(502).json({ ok: false, message: 'Daily did not return a meeting token.' });
      }

      let regFinalDaily = regDaily;
      try {
        regFinalDaily = await markEventRegistrationAttendance(regDaily.id, 'daily') || regDaily;
      } catch { /* best-effort */ }

      return res.json({
        ok: true,
        provider: 'daily',
        auth: {
          roomUrl: roomUrlDaily,
          roomName: roomNameDaily,
          token: meetingTokenDaily,
          userName: nameDaily,
          userEmail: emailDaily,
          isOwner: roleDaily === 1,
        },
        registration: mapDbRegistration(regFinalDaily),
        joinWindow: winDaily,
        joinMode: 'embed',
      });
    }

    if (provider === 'zoom') {
      const joinCheck = await assertCanJoinEvent({
        eventId,
        authUser,
        reqBody: req.body || {},
        providerLabel: 'Zoom',
      });
      if (!joinCheck.ok) {
        return res.status(joinCheck.status).json({
          ok: false,
          message: joinCheck.message,
          joinWindow: joinCheck.joinWindow || undefined,
        });
      }
      const {
        event: evt,
        registration,
        windowState,
        userEmail,
        userName,
        role,
      } = joinCheck;

      const rawJoinUrl = evt.zoom_join_url || evt.meeting_link || null;
      const joinUrl = sanitizeMeetingJoinUrl(rawJoinUrl);
      const meetingNumber = extractZoomMeetingNumber(evt.zoom_meeting_id || '')
        || extractZoomMeetingNumber(joinUrl || rawJoinUrl || '');
      if (!meetingNumber && !joinUrl) {
        return res.status(400).json({ ok: false, message: 'Zoom meeting link is not available for this event.' });
      }

      const zoomConfig = await getZoomConfig();
      let signature = null;
      if (zoomConfig.sdkKey && zoomConfig.sdkSecret && meetingNumber) {
        const iat = Math.floor(Date.now() / 1000) - 30;
        const exp = iat + (2 * 60 * 60);
        signature = signJwtHmacSha256({
          sdkKey: zoomConfig.sdkKey,
          appKey: zoomConfig.sdkKey,
          mn: meetingNumber,
          role,
          iat,
          exp,
          tokenExp: exp,
        }, zoomConfig.sdkSecret);
      }

      let attendanceUpdated = null;
      try {
        attendanceUpdated = await markEventRegistrationAttendance(registration.id, 'zoom');
      } catch { /* best-effort */ }

      const finalRegistration = attendanceUpdated || registration;
      const videoSettingsResolved = await getVideoSettings();
      const wantsEmbed = videoSettingsResolved.joinMode === 'embed';
      const canEmbed = Boolean(
        zoomConfig.sdkKey && zoomConfig.sdkSecret && meetingNumber && signature,
      );
      let embedReason = null;
      if (wantsEmbed && !canEmbed) {
        if (!zoomConfig.sdkKey || !zoomConfig.sdkSecret) {
          embedReason = 'Meeting SDK credentials are not configured in Admin Settings.';
        } else if (!meetingNumber) {
          embedReason = 'Could not resolve the Zoom meeting number for this event.';
        } else if (!signature) {
          embedReason = 'Could not generate a Meeting SDK signature.';
        }
      }

      return res.json({
        ok: true,
        provider: 'zoom',
        auth: {
          sdkKey: zoomConfig.sdkKey || null,
          signature,
          meetingNumber: meetingNumber || null,
          password: evt.zoom_password || null,
          userName,
          userEmail,
          joinUrl,
        },
        registration: mapDbRegistration(finalRegistration),
        joinWindow: windowState,
        joinMode: videoSettingsResolved.joinMode,
        embedAvailable: wantsEmbed && canEmbed,
        embedReason,
      });
    }

    return res.status(400).json({
      ok: false,
      message: 'This event does not use an integrated video provider. Open the meeting link from the event page.',
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to generate video join authorization', error: error.message });
  }
});

app.post('/api/webhooks/daily', async (req, res) => {
  try {
    const dailyConfig = await getDailyConfig();
    const verification = verifyDailyWebhookRequest(req, dailyConfig);
    if (!verification.ok) {
      await createIntegrationLog({
        provider: 'daily',
        action: 'webhook_receive',
        relatedType: 'webhook',
        relatedId: 'daily',
        status: 'failed',
        requestPayload: { type: req.body?.type || req.body?.event || '' },
        errorMessage: verification.reason,
      });
      return res.status(401).json({ ok: false, message: verification.reason || 'Invalid Daily webhook signature.' });
    }

    const webhookType = String(req.body?.type || req.body?.event || '').trim().toLowerCase();
    const payload = req.body?.payload || req.body?.data || {};
    const roomName = String(payload?.room || payload?.room_name || '').trim();
    const dailyStatus = mapDailyWebhookEventToStatus(webhookType);
    const syncedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (roomName && (webhookType === 'meeting.started' || webhookType === 'meeting.ended')) {
      await pool.query(
        'UPDATE events SET daily_status = ?, daily_synced_at = ? WHERE daily_room_name = ?',
        [dailyStatus, syncedAt, roomName],
      );
    }

    if (webhookType === 'participant.joined' && roomName) {
      const userId = String(payload?.user_id || '').trim();
      if (userId) {
        const [events] = await pool.query(
          'SELECT id FROM events WHERE daily_room_name = ? LIMIT 1',
          [roomName],
        );
        const eventId = events?.[0]?.id;
        if (eventId) {
          await pool.query(
            `UPDATE event_registrations
             SET attended_at = COALESCE(attended_at, NOW()),
                 last_joined_at = NOW(),
                 join_count = join_count + 1,
                 join_source = 'daily',
                 status = CASE WHEN status = 'confirmed' THEN 'attended' ELSE status END
             WHERE event_id = ? AND user_id = ? AND status <> 'cancelled'`,
            [eventId, userId],
          );
        }
      }
    }

    await createIntegrationLog({
      provider: 'daily',
      action: 'webhook_receive',
      relatedType: 'webhook',
      relatedId: roomName || 'daily',
      status: 'success',
      requestPayload: { type: webhookType, roomName },
      responsePayload: { dailyStatus },
    });

    return res.json({ ok: true, message: 'Daily webhook processed.' });
  } catch (error) {
    await createIntegrationLog({
      provider: 'daily',
      action: 'webhook_receive',
      relatedType: 'webhook',
      relatedId: 'daily',
      status: 'failed',
      requestPayload: { type: req.body?.type || '' },
      errorMessage: error.message,
    });
    return res.status(500).json({ ok: false, message: 'Failed to process Daily webhook', error: error.message });
  }
});

app.post('/api/webhooks/zoom', async (req, res) => {
  try {
    const zoomConfig = await getZoomConfig();
    const webhookEvent = String(req.body?.event || '').trim().toLowerCase();

    if (webhookEvent === 'endpoint.url_validation') {
      const plainToken = String(req.body?.payload?.plainToken || '').trim();
      const secret = String(zoomConfig.webhookSecretToken || '').trim();

      if (!plainToken || !secret) {
        await createIntegrationLog({
          provider: 'zoom',
          action: 'webhook_url_validation',
          relatedType: 'webhook',
          relatedId: 'zoom',
          status: 'failed',
          requestPayload: req.body || null,
          errorMessage: 'Missing plain token or webhook secret.',
        });
        return res.status(400).json({ ok: false, message: 'Unable to complete Zoom endpoint validation.' });
      }

      const encryptedToken = crypto.createHmac('sha256', secret).update(plainToken).digest('hex');
      await createIntegrationLog({
        provider: 'zoom',
        action: 'webhook_url_validation',
        relatedType: 'webhook',
        relatedId: 'zoom',
        status: 'success',
        requestPayload: { plainToken },
      });
      return res.json({ plainToken, encryptedToken });
    }

    const verification = verifyZoomWebhookRequest(req, zoomConfig);
    if (!verification.ok) {
      await createIntegrationLog({
        provider: 'zoom',
        action: 'webhook_receive',
        relatedType: 'webhook',
        relatedId: 'zoom',
        status: 'failed',
        requestPayload: {
          event: webhookEvent,
          headers: {
            timestamp: req.headers['x-zm-request-timestamp'] || null,
            signature: req.headers['x-zm-signature'] ? 'provided' : 'missing',
          },
        },
        errorMessage: verification.reason,
      });
      return res.status(401).json({ ok: false, message: verification.reason || 'Invalid Zoom webhook signature.' });
    }

    const objectPayload = req.body?.payload?.object || {};
    const meetingId = String(objectPayload.id || objectPayload.meeting_id || '').trim();
    const meetingUuid = String(objectPayload.uuid || '').trim();
    const zoomStatus = mapZoomWebhookEventToStatus(webhookEvent);
    const syncedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (!meetingId && !meetingUuid) {
      await createIntegrationLog({
        provider: 'zoom',
        action: 'webhook_receive',
        relatedType: 'webhook',
        relatedId: 'zoom',
        status: 'skipped',
        requestPayload: { event: webhookEvent },
        errorMessage: 'No meeting id/uuid found in payload.',
      });
      return res.json({ ok: true, message: 'Zoom webhook received (no meeting identifier).' });
    }

    const whereClauses = [];
    const whereValues = [];
    if (meetingId) {
      whereClauses.push('zoom_meeting_id = ?');
      whereValues.push(meetingId);
    }
    if (meetingUuid) {
      whereClauses.push('zoom_uuid = ?');
      whereValues.push(meetingUuid);
    }

    const [result] = await pool.query(
      `UPDATE events
       SET zoom_status = ?, zoom_synced_at = ?
       WHERE ${whereClauses.join(' OR ')}`,
      [zoomStatus, syncedAt, ...whereValues],
    );

    await createIntegrationLog({
      provider: 'zoom',
      action: 'webhook_receive',
      relatedType: 'event',
      relatedId: meetingId || meetingUuid,
      status: 'success',
      requestPayload: { event: webhookEvent, meetingId, meetingUuid },
      responsePayload: { zoomStatus, affectedEvents: Number(result?.affectedRows || 0) },
    });

    return res.json({
      ok: true,
      message: 'Zoom webhook processed.',
      data: {
        event: webhookEvent,
        meetingId: meetingId || null,
        meetingUuid: meetingUuid || null,
        zoomStatus,
        affectedEvents: Number(result?.affectedRows || 0),
      },
    });
  } catch (error) {
    await createIntegrationLog({
      provider: 'zoom',
      action: 'webhook_receive',
      relatedType: 'webhook',
      relatedId: 'zoom',
      status: 'failed',
      requestPayload: { event: req.body?.event || '' },
      errorMessage: error.message,
    });
    return res.status(500).json({ ok: false, message: 'Failed to process Zoom webhook', error: error.message });
  }
});

app.get('/api/admin/integrations/logs', async (req, res) => {
  try {
    const provider = String(req.query?.provider || '').trim();
    const action = String(req.query?.action || '').trim();
    const relatedType = String(req.query?.related_type || '').trim();
    const relatedId = String(req.query?.related_id || '').trim();
    const status = String(req.query?.status || '').trim();
    const limitRaw = Number(req.query?.limit || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const clauses = [];
    const values = [];

    if (provider) {
      clauses.push('provider = ?');
      values.push(provider);
    }
    if (action) {
      clauses.push('action = ?');
      values.push(action);
    }
    if (relatedType) {
      clauses.push('related_type = ?');
      values.push(relatedType);
    }
    if (relatedId) {
      clauses.push('related_id = ?');
      values.push(relatedId);
    }
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT * FROM integration_logs ${whereClause} ORDER BY created_at DESC LIMIT ?`,
      [...values, limit],
    );

    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch integration logs', error: error.message });
  }
});

// ─── RBAC (roles & permissions) ───────────────────────────────────────────

app.get('/api/admin/rbac/permissions', async (_req, res) => {
  return res.json({ ok: true, data: ADMIN_PERMISSIONS });
});

app.get('/api/admin/rbac/me', async (req, res) => {
  try {
    const auth = getAdminAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);
    const userId = String(auth.claims.sub || '');
    if (!userId) return res.status(401).json({ ok: false, message: 'Invalid session.' });

    const [[user]] = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);
    const permissions = await loadUserAdminPermissions(pool, userId, { legacyRole: user?.role });
    const roles = await loadUserAdminRoles(pool, userId);
    return res.json({
      ok: true,
      data: {
        permissions,
        roles,
        admin_access: userCanAccessAdmin(user?.role, permissions),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load access profile', error: error.message });
  }
});

app.get('/api/admin/rbac/roles', async (_req, res) => {
  try {
    const data = await listRolesWithPermissions(pool);
    return res.json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load roles', error: error.message });
  }
});

app.post('/api/admin/rbac/roles', async (req, res) => {
  try {
    const slug = String(req.body?.slug || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];

    if (!slug || !name) {
      return res.status(400).json({ ok: false, message: 'slug and name are required.' });
    }

    const id = generateEntityId('role');
    await pool.query(
      'INSERT INTO admin_roles (id, slug, name, description, is_system) VALUES (?, ?, ?, ?, 0)',
      [id, slug, name, description, 0],
    );
    await setRolePermissions(pool, id, permissions);
    const role = await getRoleById(pool, id);
    return res.status(201).json({ ok: true, data: role });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'A role with this slug already exists.' });
    }
    return res.status(500).json({ ok: false, message: 'Failed to create role', error: error.message });
  }
});

app.put('/api/admin/rbac/roles/:id', async (req, res) => {
  try {
    const roleId = String(req.params.id || '').trim();
    const existing = await getRoleById(pool, roleId);
    if (!existing) return res.status(404).json({ ok: false, message: 'Role not found.' });

    const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
    const description = req.body?.description != null ? String(req.body.description).trim() : (existing.description || '');
    const slug = existing.is_system
      ? existing.slug
      : String(req.body?.slug || existing.slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    await pool.query(
      'UPDATE admin_roles SET slug = ?, name = ?, description = ? WHERE id = ?',
      [slug, name, description, roleId],
    );

    if (Array.isArray(req.body?.permissions)) {
      await setRolePermissions(pool, roleId, req.body.permissions);
    }

    const role = await getRoleById(pool, roleId);
    return res.json({ ok: true, data: role });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update role', error: error.message });
  }
});

app.delete('/api/admin/rbac/roles/:id', async (req, res) => {
  try {
    const roleId = String(req.params.id || '').trim();
    const existing = await getRoleById(pool, roleId);
    if (!existing) return res.status(404).json({ ok: false, message: 'Role not found.' });
    if (existing.is_system) {
      return res.status(403).json({ ok: false, message: 'System roles cannot be deleted.' });
    }

    await pool.query('DELETE FROM user_admin_roles WHERE role_id = ?', [roleId]);
    await pool.query('DELETE FROM admin_role_permissions WHERE role_id = ?', [roleId]);
    await pool.query('DELETE FROM admin_roles WHERE id = ?', [roleId]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete role', error: error.message });
  }
});

app.put('/api/admin/rbac/users/:userId/roles', async (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    const roleIds = Array.isArray(req.body?.role_ids) ? req.body.role_ids : [];
    const [[user]] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found.' });

    await setUserAdminRoles(pool, userId, roleIds);
    const roles = await loadUserAdminRoles(pool, userId);
    const permissions = await loadUserAdminPermissions(pool, userId);
    return res.json({ ok: true, data: { roles, permissions } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to assign roles', error: error.message });
  }
});

app.post('/api/admin/rbac/seed', async (_req, res) => {
  try {
    await seedRbac(pool, { forcePermissions: true });
    const data = await listRolesWithPermissions(pool);
    return res.json({ ok: true, message: 'RBAC roles and permissions seeded.', data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to seed RBAC', error: error.message });
  }
});

const ADMIN_USER_SAFE_COLUMNS = `
  id, name, email, phone, whatsapp, role, email_verified, user_type, nrc_id,
  profession, organization, about, specialties, occupation, address, interests,
  portfolio_url, linkedin_url, linkedin_handle, kyc_completed, cv_unlocked_at,
  created_at, updated_at
`.replace(/\s+/g, ' ').trim();

function mapAdminUserRow(row) {
  if (!row) return null;
  const specialties = row.specialties
    ? (typeof row.specialties === 'string' ? row.specialties.split(',').map((s) => s.trim()).filter(Boolean) : row.specialties)
    : [];
  const interests = row.interests
    ? (typeof row.interests === 'string' ? row.interests.split(',').map((s) => s.trim()).filter(Boolean) : row.interests)
    : [];
  return {
    ...row,
    specialties,
    interests,
    kyc_completed: Boolean(row.kyc_completed),
    email_verified: Boolean(row.email_verified),
  };
}

// GET /api/admin/users/count — dashboard stats (admin auth required)
app.get('/api/admin/users/count', async (_req, res) => {
  try {
    const [[row]] = await pool.query('SELECT COUNT(*) AS c FROM users');
    return res.json({ ok: true, count: Number(row?.c || 0) });
  } catch (error) {
    console.error('[admin/users/count]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to count users.' });
  }
});

// GET /api/admin/users — list registered users from MySQL (admin auth required)
app.get('/api/admin/users', async (_req, res) => {
  try {
    await ensureCvUnlockColumn();
    const [rows] = await pool.query(
      `SELECT ${ADMIN_USER_SAFE_COLUMNS} FROM users ORDER BY created_at DESC`,
    );
    const mapped = rows.map(mapAdminUserRow);
    const rolesByUser = await loadAdminRolesByUserIds(pool, mapped.map((u) => u.id));
    const data = mapped.map((u) => ({
      ...u,
      admin_roles: rolesByUser.get(String(u.id)) || [],
    }));
    return res.json({ ok: true, data });
  } catch (error) {
    console.error('[admin/users]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to fetch users.' });
  }
});

// GET /api/admin/users/:id — single user (admin auth required)
app.get('/api/admin/users/:id', async (req, res) => {
  try {
    await ensureCvUnlockColumn();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, message: 'User id is required.' });

    const [[row]] = await pool.query(
      `SELECT ${ADMIN_USER_SAFE_COLUMNS} FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!row) return res.status(404).json({ ok: false, message: 'User not found.' });

    const adminRoles = await loadUserAdminRoles(pool, id);
    const adminPermissions = await loadUserAdminPermissions(pool, id, { legacyRole: row.role });
    return res.json({
      ok: true,
      data: {
        ...mapAdminUserRow(row),
        admin_roles: adminRoles,
        admin_permissions: adminPermissions,
      },
    });
  } catch (error) {
    console.error('[admin/users/:id]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to fetch user.' });
  }
});

// Allowed columns admins may write through the user CRUD endpoints.
const ADMIN_USER_WRITABLE_FIELDS = [
  'name', 'email', 'phone', 'whatsapp', 'role', 'user_type', 'nrc_id',
  'profession', 'organization', 'about', 'occupation', 'address',
  'portfolio_url', 'linkedin_url', 'linkedin_handle',
];

function normalizeAdminUserPayload(payload = {}) {
  const out = {};
  for (const field of ADMIN_USER_WRITABLE_FIELDS) {
    if (payload[field] !== undefined) {
      out[field] = payload[field] == null ? '' : String(payload[field]).trim();
    }
  }
  if (payload.specialties !== undefined) {
    out.specialties = Array.isArray(payload.specialties)
      ? payload.specialties.join(',')
      : String(payload.specialties || '').trim();
  }
  if (payload.interests !== undefined) {
    out.interests = Array.isArray(payload.interests)
      ? payload.interests.join(',')
      : String(payload.interests || '').trim();
  }
  if (payload.email_verified !== undefined) {
    out.email_verified = payload.email_verified ? 1 : 0;
  }
  if (payload.kyc_completed !== undefined) {
    out.kyc_completed = payload.kyc_completed ? 1 : 0;
  }
  if (out.email) out.email = out.email.toLowerCase();
  if (out.role && !['user', 'admin'].includes(out.role)) {
    out.role = 'user';
  }
  if (out.user_type && !['local', 'international'].includes(out.user_type)) {
    out.user_type = 'local';
  }
  return out;
}

// POST /api/admin/users — create a new user (admin auth required)
app.post('/api/admin/users', async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Name, email and password are required.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: 'Password must be at least 8 characters.' });
    }

    const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ ok: false, message: 'A user with this email already exists.' });
    }

    const userId = generateEntityId('user');
    const passwordHash = hashPassword(password);
    const fields = normalizeAdminUserPayload({ ...body, name, email });

    // Default email_verified to 1 when admin creates the account directly
    if (fields.email_verified === undefined) fields.email_verified = 1;
    if (!fields.role) fields.role = 'user';
    if (!fields.user_type) fields.user_type = 'local';

    const columns = ['id', 'password_hash', ...Object.keys(fields)];
    const placeholders = columns.map(() => '?').join(', ');
    const values = [userId, passwordHash, ...Object.values(fields)];

    await pool.query(
      `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders})`,
      values,
    );

    const [[row]] = await pool.query(
      `SELECT ${ADMIN_USER_SAFE_COLUMNS} FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    return res.status(201).json({ ok: true, data: mapAdminUserRow(row) });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'A user with this email already exists.' });
    }
    console.error('[admin/users POST]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to create user.' });
  }
});

// PUT /api/admin/users/:id — update user (admin auth required)
app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, message: 'User id is required.' });

    const [[existing]] = await pool.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'User not found.' });

    const body = req.body || {};
    const fields = normalizeAdminUserPayload(body);

    // Optional password change — only if explicitly provided and non-empty
    const newPassword = body.password ? String(body.password) : '';
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ ok: false, message: 'Password must be at least 8 characters.' });
      }
      fields.password_hash = hashPassword(newPassword);
    }

    if (fields.email && /^\S+@\S+\.\S+$/.test(fields.email) === false) {
      return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    }

    // If demoting the last admin, refuse.
    if (fields.role && fields.role !== 'admin' && existing.role === 'admin') {
      const [[adminCount]] = await pool.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
      if (Number(adminCount?.c || 0) <= 1) {
        return res.status(409).json({ ok: false, message: 'Cannot demote the last admin account.' });
      }
    }

    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return res.status(400).json({ ok: false, message: 'No fields to update.' });
    }

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    await pool.query(
      `UPDATE users SET ${setClause} WHERE id = ?`,
      [...Object.values(fields), id],
    );

    const [[row]] = await pool.query(
      `SELECT ${ADMIN_USER_SAFE_COLUMNS} FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    return res.json({ ok: true, data: mapAdminUserRow(row) });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'Another user already uses this email address.' });
    }
    console.error('[admin/users PUT]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to update user.' });
  }
});

// DELETE /api/admin/users/:id — delete user (admin auth required)
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, message: 'User id is required.' });

    // Prevent admins from deleting themselves
    const adminAuth = getAdminAuth(req);
    if (adminAuth.ok && String(adminAuth.claims?.sub || '') === id) {
      return res.status(409).json({ ok: false, message: 'You cannot delete your own admin account.' });
    }

    const [[target]] = await pool.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [id]);
    if (!target) return res.status(404).json({ ok: false, message: 'User not found.' });

    // Prevent deleting the last admin
    if (target.role === 'admin') {
      const [[adminCount]] = await pool.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
      if (Number(adminCount?.c || 0) <= 1) {
        return res.status(409).json({ ok: false, message: 'Cannot delete the last admin account.' });
      }
    }

    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('[admin/users DELETE]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to delete user.' });
  }
});

// Public receipt logo (used by server PDF rendering via absolute URL)
app.get('/api/receipts/logo.png', (req, res) => {
  res.sendFile(getBundledReceiptLogoPath(), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// GET /api/receipts/:source/:id/pdf — download receipt PDF (admin or owner)
app.get('/api/receipts/:source/:id/pdf', async (req, res) => {
  try {
    const adminAuth = getAdminAuth(req);
    const jwtAuth = getJwtAuth(req);
    const hasBearerToken = Boolean(getBearerToken(req));

    if (!adminAuth.ok && !jwtAuth.ok) {
      if (hasBearerToken) return sendAuthFailure(res, jwtAuth);
      return res.status(401).json({ ok: false, message: 'Authentication required to download receipts.' });
    }

    const resolved = await resolveReceiptRecordForDownload({
      pool,
      source: req.params.source,
      id: req.params.id,
      mapDbRegistration,
    });
    if (!resolved.ok) {
      return res.status(resolved.status).json({ ok: false, message: resolved.message });
    }

    const { registration, ownerUserId } = resolved;

    if (!isReceiptEligible(registration.payment_status)) {
      return res.status(403).json({ ok: false, message: 'Payment status not eligible for receipt.' });
    }

    if (!adminAuth.ok) {
      const allowed = assertReceiptDownloadAllowedForUser({
        jwtAuth,
        ownerUserId,
        ownerEmail: resolved.ownerEmail,
      });
      if (!allowed.ok) {
        return res.status(allowed.status).json({ ok: false, message: allowed.message });
      }
    }

    const pdfBuffer = await generateRegistrationReceiptBuffer({
      registration,
      user: {
        name: registration.user_name || registration.booked_for_name,
        email: registration.user_email,
        phone: registration.user_phone,
      },
      appRoot: __appRoot,
      appOrigin: resolvePublicAppUrl(req),
    });

    if (!isValidPdfBuffer(pdfBuffer)) {
      throw new Error('Generated receipt PDF was empty or invalid.');
    }

    const filename = buildReceiptFilename(registration);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('[receipt/download]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to generate receipt PDF.', error: error.message });
  }
});

app.get('/api/registrations', async (req, res) => {
  try {
    const adminAuth = getAdminAuth(req);
    const jwtAuth = getJwtAuth(req);
    const hasBearerToken = Boolean(getBearerToken(req));
    const clauses = [];
    const values = [];

    const eventId = String(req.query?.event_id || '').trim();
    const userId = String(req.query?.user_id || '').trim();
    const status = String(req.query?.status || '').trim();
    const paymentStatus = String(req.query?.payment_status || '').trim();
    const registrationType = String(req.query?.registration_type || '').trim();

    if (eventId) {
      clauses.push('event_id = ?');
      values.push(eventId);
    }

    if (adminAuth.ok) {
      if (userId) {
        clauses.push('user_id = ?');
        values.push(userId);
      }
    } else if (jwtAuth.ok) {
      if (userId && userId !== String(jwtAuth.claims.sub)) {
        return res.status(403).json({ ok: false, message: 'Cannot fetch another user’s registrations.' });
      }
      clauses.push('user_id = ?');
      values.push(String(jwtAuth.claims.sub));
    } else if (hasBearerToken) {
      return sendAuthFailure(res, jwtAuth);
    } else if (userId) {
      return res.status(401).json({ ok: false, message: 'Please log in to fetch user registrations.' });
    } else {
      // No auth and no user_id — deny unauthenticated bulk access
      return res.status(401).json({ ok: false, message: 'Authentication required to list registrations.' });
    }

    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }
    if (paymentStatus) {
      clauses.push('payment_status = ?');
      values.push(paymentStatus);
    }
    if (registrationType) {
      clauses.push('registration_type = ?');
      values.push(registrationType);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const selectedColumns = adminAuth.ok || jwtAuth.ok
      ? '*'
      : 'event_id, registration_type, status';
    const [rows] = await pool.query(
      `SELECT ${selectedColumns} FROM event_registrations ${whereClause} ORDER BY registered_at DESC, created_at DESC`,
      values,
    );

    return res.json({
      ok: true,
      data: adminAuth.ok || jwtAuth.ok ? rows.map(mapDbRegistration) : rows.map(mapPublicRegistration),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch registrations', error: error.message });
  }
});

app.post('/api/registrations', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });
    if (!authUser.email_verified) return res.status(403).json({ ok: false, message: 'Please verify your email before registering.' });

    const incoming = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    const payload = normalizeRegistrationPayload({
      ...incoming,
      user_id: authUser.id,
      user_name: authUser.name,
      user_email: authUser.email,
    });

    if (!payload.user_id || !payload.user_name || !payload.user_email || !payload.event_id) {
      return res.status(400).json({ ok: false, message: 'user_id, user_name, user_email, and event_id are required.' });
    }

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [payload.event_id]);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found.' });
    }

    const gateReason = getEventRegistrationGateReason(event);
    if (gateReason) {
      return res.status(400).json({ ok: false, message: gateReason });
    }

    const bookingType = String(event.booking_type || 'subscription').toLowerCase();
    const allowedTypes = bookingType === 'both' ? ['booking', 'subscription'] : [bookingType];
    if (!allowedTypes.includes(payload.registration_type)) {
      return res.status(400).json({ ok: false, message: `This event does not support "${payload.registration_type}" registration.` });
    }

    const [[existingActive]] = await pool.query(
      'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND registration_type = ? AND attendee_slot_key = ? AND status <> ? LIMIT 1',
      [payload.event_id, payload.user_id, payload.registration_type, payload.attendee_slot_key, 'cancelled'],
    );
    if (existingActive) {
      const forOther = payload.attendee_slot_key && payload.attendee_slot_key !== '__self__';
      return res.status(409).json({
        ok: false,
        message: forOther
          ? 'You already have an active registration for this attendee for this event.'
          : 'You are already registered for this event.',
      });
    }

    const capacity = Number(event.capacity || 0);
    if (capacity > 0) {
      const [[countRow]] = await pool.query(
        'SELECT COUNT(*) AS total FROM event_registrations WHERE event_id = ? AND status <> ?',
        [payload.event_id, 'cancelled'],
      );
      const activeCount = Number(countRow?.total || 0);
      if (activeCount >= capacity) {
        return res.status(409).json({ ok: false, message: 'This event has reached full capacity.' });
      }
    }

    const payCurrency = String(incoming.currency || payload.currency || 'ZMW').trim().toUpperCase();
    const payAmountIncoming = incoming.amount == null || incoming.amount === ''
      ? null
      : toNumber(incoming.amount, 0);

    const needsCouponLock = Boolean(normalizeEventCouponCode(incoming.coupon_code || incoming.code || ''));

    let enriched;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const couponResolved = await resolveEventCouponForBooking(
        conn,
        event,
        incoming.coupon_code ?? incoming.code ?? '',
        payload.user_id,
        { lockRow: needsCouponLock },
      );
      if (!couponResolved.ok) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ ok: false, message: couponResolved.error });
      }

      const amountForRow = payCurrency === 'ZMW'
        ? couponResolved.final_zmw
        : (payAmountIncoming != null ? payAmountIncoming : couponResolved.final_zmw);

      const mergedForNorm = normalizeRegistrationPayload({
        ...payload,
        event_title: event.title,
        event_slug: event.slug,
        event_price: event.price,
        is_free_event: parseBoolean(event.is_free, false),
        currency: payCurrency,
        amount: amountForRow,
        amount_zmw: couponResolved.final_zmw,
        coupon_id: couponResolved.coupon?.id || null,
        coupon_code: couponResolved.coupon ? normalizeEventCouponCode(incoming.coupon_code ?? incoming.code ?? '') : null,
        list_price_zmw: couponResolved.list_zmw,
        discount_zmw: couponResolved.discount_zmw,
      }, payload.id);

      enriched = await applyTrustedRegistrationPaymentState(mergedForNorm, event);

      const placeholders = EVENT_REGISTRATION_FIELDS.map(() => '?').join(', ');
      const regValues = EVENT_REGISTRATION_FIELDS.map((field) => enriched[field]);

      await conn.query(
        `INSERT INTO event_registrations (${EVENT_REGISTRATION_FIELDS.join(', ')}) VALUES (${placeholders})`,
        regValues,
      );

      if (couponResolved.coupon) {
        await conn.query(
          'UPDATE event_coupons SET redemptions_count = redemptions_count + 1 WHERE id = ?',
          [couponResolved.coupon.id],
        );
      }

      await conn.commit();
    } catch (err) {
      try {
        await conn.rollback();
      } catch {
        //
      }
      conn.release();

      if (err?.code === 'ER_DUP_ENTRY') {
        if (
          String(err.message || '').includes('uq_event_user_type_slot')
          || String(err.message || '').includes('uq_event_user_type')
        ) {
          return res.status(409).json({ ok: false, message: 'You are already registered for this event or this attendee slot.' });
        }
        if (String(err.message || '').includes('uq_event_reference_code')) {
          return res.status(409).json({ ok: false, message: 'Duplicate reference code. Please retry.' });
        }
      }

      return res.status(500).json({ ok: false, message: 'Failed to create registration', error: err.message });
    }

    conn.release();

    const [[row]] = await pool.query('SELECT * FROM event_registrations WHERE id = ?', [enriched.id]);

    // Send confirmation email/WhatsApp (best-effort — don't fail registration if delivery fails)
    try {
      const recipientEmail = String(enriched.user_email || '').trim();
      const recipientName = String(enriched.user_name || '').trim() || 'there';
      const settings = await getSystemSettings();
      const appUrl = resolvePublicAppUrl(req);
      const eventUrl = `${appUrl}/events/${event.slug || event.id}`;
      if (recipientEmail) {
        const eventDate = event.start_date || event.date
          ? new Date(event.start_date || event.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : 'TBA';
        const eventTime = event.start_time || event.time || '';
        const eventLocation = event.location || event.venue || 'Online';
        const isFreeCatalog = parseBoolean(event.is_free, false);
        const refCode = enriched.reference_code || '';
        const listZmwStored = enriched.list_price_zmw != null
          ? roundMoney2(toNumber(enriched.list_price_zmw, Number(event.price || 0)))
          : roundMoney2(toNumber(event.price, 0));
        const discountZmwStored = roundMoney2(toNumber(enriched.discount_zmw, 0));
        const dueZmw = roundMoney2(toNumber(enriched.amount_zmw, 0));
        const hasDiscount = discountZmwStored > 0.005;

        let priceLinesPlain = [];
        if (isFreeCatalog) priceLinesPlain.push('🎟  Price: Free');
        else if (hasDiscount) {
          priceLinesPlain = [
            `🎟  List price: ZMW ${listZmwStored.toFixed(2)}`,
            `🎟  Discount: -ZMW ${discountZmwStored.toFixed(2)}${String(enriched.coupon_code || '').trim() ? ` (code ${String(enriched.coupon_code).trim()})` : ''}`,
            dueZmw > 0.005 ? `🎟  Amount due (ZMW): ZMW ${dueZmw.toFixed(2)}` : '🎟  Amount due (ZMW): ZMW 0.00 — covered by coupon',
          ];
        } else {
          priceLinesPlain.push(`🎟  Price: ZMW ${listZmwStored.toFixed(2)}`);
        }

        let priceLinesHtml = [];
        if (isFreeCatalog) priceLinesHtml.push('Price: Free');
        else if (hasDiscount) {
          priceLinesHtml = [
            `List price: ZMW ${listZmwStored.toFixed(2)}`,
            `Discount: -ZMW ${discountZmwStored.toFixed(2)}${String(enriched.coupon_code || '').trim() ? ` (code ${String(enriched.coupon_code).trim()})` : ''}`,
            dueZmw > 0.005 ? `Amount due (ZMW): ZMW ${dueZmw.toFixed(2)}` : 'Amount due (ZMW): ZMW 0.00 — covered by coupon',
          ];
        } else {
          priceLinesHtml.push(`Price: ZMW ${listZmwStored.toFixed(2)}`);
        }

        const emailBody = [
          `Hi ${recipientName},`,
          '',
          `Thank you for registering for "${event.title}"! Your registration is confirmed.`,
          '',
          '── Event Details ──────────────────',
          `📅  Date: ${eventDate}`,
          eventTime ? `🕐  Time: ${eventTime}` : '',
          `📍  Location: ${eventLocation}`,
          ...priceLinesPlain,
          refCode ? `🔖  Reference: ${refCode}` : '',
          '',
          `View event: ${eventUrl}`,
          '',
          'If you did not register for this event, please ignore this email or contact us.',
          '',
          'We look forward to seeing you!',
          '',
          'Best regards,',
          'Mutale Mubanga',
        ].filter(Boolean).join('\n');

        const receiptAttachments = await buildReceiptAttachmentIfEligible({
          registration: enriched,
          appRoot: __appRoot,
          appOrigin: appUrl,
        });
        const receiptAttached = receiptAttachments.length > 0;

        const registrationTypeLabel = (isFreeCatalog || dueZmw <= 0.005)
          ? 'Complimentary'
          : `Paid — ZMW ${dueZmw.toFixed(2)}`;
        const addToCalendarUrl = buildGoogleCalendarLink(event, eventUrl);
        const emailCfg = settings?.email || {};
        const brandFooter = {
          name: 'Mutale Mubanga',
          tagline: 'Growing People.',
          supportEmail: String(emailCfg.replyTo || emailCfg.fromEmail || 'info@mutalemubanga.org').trim(),
          websiteUrl: appUrl,
          linkedinUrl: 'https://www.linkedin.com/in/mutale-mubanga',
        };

        const confirmResult = await sendEmailNotification({
          settings,
          to: recipientEmail,
          subject: `Registration Confirmed: ${event.title}`,
          text: receiptAttached
            ? `${emailBody}\n\nYour receipt is attached to this email.`
            : emailBody,
          html: buildRegistrationEmailHtml({
            recipientName,
            recipientEmail,
            eventTitle: event.title,
            eventDate,
            eventTime,
            eventLocation,
            registrationTypeLabel,
            referenceCode: refCode,
            accessPassUrl: eventUrl,
            addToCalendarUrl,
            statusNote: receiptAttached
              ? 'Your registration is confirmed and your receipt is attached. No further action is required.'
              : 'Your registration is confirmed. No further action is required.',
            brand: brandFooter,
          }),
          attachments: receiptAttachments,
        });
        if (confirmResult?.status === 'sent') {
          console.log(`[registration] ✓ Confirmation email sent to ${recipientEmail}`);
        }
        if (receiptAttached && confirmResult?.status === 'sent' && enriched.id) {
          await markReceiptEmailSent({
            receiptSource: 'registration',
            receiptSourceId: enriched.id,
            pool,
          });
        } else if (isReceiptEligible(enriched.payment_status) && !receiptAttached) {
          await maybeSendReceiptOnSettlement({
            previousRegistration: { payment_status: 'pending' },
            currentRegistration: {
              ...mapDbRegistration(row),
              receipt_source: 'registration',
              receipt_source_id: enriched.id,
            },
            event,
            settings,
            sendEmailNotification,
            buildBrandedEmailHtml,
            appRoot: __appRoot,
            appOrigin: appUrl,
            pool,
          });
        }
      }

      const whatsappRecipient = String(authUser.whatsapp || authUser.phone || '').trim();
      if (whatsappRecipient) {
        const result = await sendRegistrationWhatsAppConfirmation({
          settings,
          to: whatsappRecipient,
          recipientName,
          event,
          registration: enriched,
          eventUrl,
        });
        if (result.status === 'sent') {
          console.log(`[registration] ✓ Confirmation WhatsApp sent to ${result.recipient}`);
        } else if (result.status === 'failed') {
          console.warn(`[registration] Confirmation WhatsApp failed: ${result.reason}`);
        }
      }
    } catch (notifyErr) {
      console.warn('[registration] Confirmation notification failed:', notifyErr.message);
    }

    return res.status(201).json({ ok: true, data: mapDbRegistration(row) });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      if (
        String(error.message || '').includes('uq_event_user_type_slot')
        || String(error.message || '').includes('uq_event_user_type')
      ) {
        return res.status(409).json({ ok: false, message: 'You are already registered for this event or this attendee slot.' });
      }
      if (String(error.message || '').includes('uq_event_reference_code')) {
        return res.status(409).json({ ok: false, message: 'Duplicate reference code. Please retry.' });
      }
    }

    return res.status(500).json({ ok: false, message: 'Failed to create registration', error: error.message });
  }
});

app.patch('/api/registrations/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, message: 'Registration id is required.' });

    const [[existing]] = await pool.query('SELECT * FROM event_registrations WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'Registration not found.' });

    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const adminAuth = getAdminAuth(req);

    if (!adminAuth.ok) {
      const auth = getJwtAuth(req);
      if (!auth.ok) return sendAuthFailure(res, auth);
      if (String(auth.claims.sub) !== String(existing.user_id)) {
        return res.status(403).json({ ok: false, message: 'Cannot update another user’s registration.' });
      }

      const requestedStatus = String(incoming.status || '').trim().toLowerCase();
      const requestedPaymentStatus = String(incoming.payment_status || '').trim().toLowerCase();

      if (requestedStatus === 'cancelled' && !requestedPaymentStatus) {
        await pool.query('UPDATE event_registrations SET status = ? WHERE id = ?', ['cancelled', id]);
        const [[row]] = await pool.query('SELECT * FROM event_registrations WHERE id = ?', [id]);
        return res.json({ ok: true, data: mapDbRegistration(row) });
      }

      if (requestedPaymentStatus === 'paid' || requestedStatus === 'confirmed') {
        const paymentStatus = await getVerifiedPaymentStatus(
          existing.payment_reference || existing.reference_code,
          existing.event_id || null,
        );
        if (paymentStatus !== 'successful') {
          return res.status(403).json({ ok: false, message: 'Payment has not been confirmed by the payment provider yet.' });
        }

        await pool.query(
          'UPDATE event_registrations SET payment_status = ?, status = ? WHERE id = ?',
          ['paid', 'confirmed', id],
        );
        const [[row]] = await pool.query('SELECT * FROM event_registrations WHERE id = ?', [id]);
        const mapped = mapDbRegistration(row);
        try {
          const [[eventRow]] = await pool.query('SELECT * FROM events WHERE id = ?', [existing.event_id]);
          const settings = await getSystemSettings();
          await maybeSendReceiptOnSettlement({
            previousRegistration: existing,
            currentRegistration: { ...mapped, receipt_source: 'registration', receipt_source_id: mapped.id },
            event: eventRow || {},
            settings,
            sendEmailNotification,
            buildBrandedEmailHtml,
            appRoot: __appRoot,
            appOrigin: resolvePublicAppUrl(req),
            pool,
          });
        } catch (receiptErr) {
          console.warn('[registration] Receipt email failed:', receiptErr.message);
        }
        return res.json({ ok: true, data: mapped });
      }

      return res.status(403).json({ ok: false, message: 'This registration update is restricted.' });
    }

    const allowedFields = [
      'status',
      'payment_status',
      'payment_method',
      'payment_reference',
      'amount',
      'currency',
      'amount_zmw',
      'notes',
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;

      let value = incoming[field];
      if (field === 'status' || field === 'payment_status' || field === 'payment_method') {
        value = String(value || '').trim().toLowerCase();
      } else if (field === 'currency') {
        value = String(value || 'ZMW').trim().toUpperCase();
      } else if (field === 'amount' || field === 'amount_zmw') {
        value = toNumber(value, 0);
      } else {
        value = String(value || '').trim();
      }

      updates.push(`${field} = ?`);
      values.push(value);
    }

    if (updates.length === 0) {
      return res.json({ ok: true, data: mapDbRegistration(existing) });
    }

    await pool.query(`UPDATE event_registrations SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);

    const [[row]] = await pool.query('SELECT * FROM event_registrations WHERE id = ?', [id]);
    const mapped = mapDbRegistration(row);
    if (Object.prototype.hasOwnProperty.call(incoming, 'payment_status')) {
      try {
        const [[eventRow]] = await pool.query('SELECT * FROM events WHERE id = ?', [existing.event_id]);
        const settings = await getSystemSettings();
        await maybeSendReceiptOnSettlement({
          previousRegistration: existing,
          currentRegistration: { ...mapped, receipt_source: 'registration', receipt_source_id: mapped.id },
          event: eventRow || {},
          settings,
          sendEmailNotification,
          buildBrandedEmailHtml,
          appRoot: __appRoot,
          appOrigin: resolvePublicAppUrl(req),
          pool,
        });
      } catch (receiptErr) {
        console.warn('[registration] Receipt email failed:', receiptErr.message);
      }
    }
    return res.json({ ok: true, data: mapped });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update registration', error: error.message });
  }
});

app.get('/api/blog', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blog_posts ORDER BY date DESC, created_at DESC');
    return res.json({ ok: true, data: rows.map(mapDbBlogPost) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch blog posts', error: error.message });
  }
});

app.post('/api/blog/upload-image', async (req, res) => {
  try {
    const image = req.body?.image;
    if (!image) {
      return res.status(400).json({ ok: false, message: 'Image data is required.' });
    }
    const url = await persistImageIfNeeded(image, req, { folder: 'blog', prefix: 'blog-inline' });
    if (!url || String(url).startsWith('data:')) {
      return res.status(400).json({ ok: false, message: 'Invalid image payload.' });
    }
    const relative = String(url).includes('/uploads/')
      ? `/uploads/${String(url).split('/uploads/')[1]}`
      : url;
    return res.json({ ok: true, url: relative });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to upload image', error: error.message });
  }
});

app.post('/api/blog', async (req, res) => {
  try {
    const incoming = { ...(req.body || {}) };
    if (Object.prototype.hasOwnProperty.call(incoming, 'image')) {
      incoming.image = await persistBlogImageIfNeeded(incoming.image, req);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'content')) {
      incoming.content = await persistBlogContentImages(incoming.content, req);
    }

    const payload = normalizeBlogPayload(incoming);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ ok: false, message: 'Title and slug are required.' });
    }

    const placeholders = BLOG_FIELDS.map(() => '?').join(', ');
    const updates = BLOG_FIELDS.filter((f) => f !== 'id').map((f) => `${f}=VALUES(${f})`).join(', ');
    const values = BLOG_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO blog_posts (${BLOG_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM blog_posts WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: mapDbBlogPost(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to save blog post', error: error.message });
  }
});

app.put('/api/blog/:id', async (req, res) => {
  try {
    const incoming = { ...(req.body || {}) };
    if (Object.prototype.hasOwnProperty.call(incoming, 'image')) {
      incoming.image = await persistBlogImageIfNeeded(incoming.image, req);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'content')) {
      incoming.content = await persistBlogContentImages(incoming.content, req);
    }

    const payload = normalizeBlogPayload(incoming, req.params.id);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ ok: false, message: 'Title and slug are required.' });
    }

    const placeholders = BLOG_FIELDS.map(() => '?').join(', ');
    const updates = BLOG_FIELDS.filter((f) => f !== 'id').map((f) => `${f}=VALUES(${f})`).join(', ');
    const values = BLOG_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO blog_posts (${BLOG_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM blog_posts WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, data: mapDbBlogPost(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update blog post', error: error.message });
  }
});

app.delete('/api/blog/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Blog post not found.' });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete blog post', error: error.message });
  }
});

app.get('/api/publications', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM publications ORDER BY year DESC, created_at DESC');
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch publications', error: error.message });
  }
});

app.post('/api/publications', async (req, res) => {
  try {
    const payload = normalizePublicationPayload(req.body);
    if (!payload.title || !payload.authors) {
      return res.status(400).json({ ok: false, message: 'Title and authors are required.' });
    }

    const placeholders = PUBLICATION_FIELDS.map(() => '?').join(', ');
    const updates = PUBLICATION_FIELDS.filter((f) => f !== 'id').map((f) => `${f}=VALUES(${f})`).join(', ');
    const values = PUBLICATION_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO publications (${PUBLICATION_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM publications WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to save publication', error: error.message });
  }
});

app.put('/api/publications/:id', async (req, res) => {
  try {
    const payload = normalizePublicationPayload(req.body, req.params.id);
    if (!payload.title || !payload.authors) {
      return res.status(400).json({ ok: false, message: 'Title and authors are required.' });
    }

    const updates = PUBLICATION_FIELDS.filter((f) => f !== 'id').map((f) => `${f} = ?`).join(', ');
    const values = PUBLICATION_FIELDS.filter((f) => f !== 'id').map((f) => payload[f]);

    await pool.query(`UPDATE publications SET ${updates} WHERE id = ?`, [...values, req.params.id]);
    const [[row]] = await pool.query('SELECT * FROM publications WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update publication', error: error.message });
  }
});

app.delete('/api/publications/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM publications WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Publication not found.' });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete publication', error: error.message });
  }
});

app.post('/api/contact-messages', rateLimitContactMessages, async (req, res) => {
  try {
    const payload = normalizeContactMessagePayload(req.body);
    if (!payload.name || !payload.email || !payload.phone || !payload.subject || !payload.message) {
      return res.status(400).json({ ok: false, message: 'Name, email, phone, subject, and message are required.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
      return res.status(400).json({ ok: false, message: 'Please provide a valid email address.' });
    }

    const placeholders = CONTACT_MESSAGE_FIELDS.map(() => '?').join(', ');
    const values = CONTACT_MESSAGE_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO contact_messages (${CONTACT_MESSAGE_FIELDS.join(', ')}) VALUES (${placeholders})`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM contact_messages WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to send message', error: error.message });
  }
});

app.get('/api/contact-messages', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch contact messages', error: error.message });
  }
});

app.put('/api/contact-messages/:id/read', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, message: 'Message id is required.' });

    await pool.query('UPDATE contact_messages SET is_read = TRUE WHERE id = ?', [id]);
    const [[row]] = await pool.query('SELECT * FROM contact_messages WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ ok: false, message: 'Message not found.' });
    return res.json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update message status', error: error.message });
  }
});

app.post('/api/contact-messages/:id/reply', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!id) return res.status(400).json({ ok: false, message: 'Message id is required.' });
    if (!subject || !message) {
      return res.status(400).json({ ok: false, message: 'Reply subject and message are required.' });
    }

    const [[contactMessage]] = await pool.query('SELECT * FROM contact_messages WHERE id = ?', [id]);
    if (!contactMessage) {
      return res.status(404).json({ ok: false, message: 'Message not found.' });
    }

    const settings = await getSystemSettings();
    const emailCfg = settings?.email || {};
    const fromName = String(emailCfg.fromName || 'Mutale Admin').trim();
    const fromEmail = String(emailCfg.fromEmail || '').trim();
    const replyTo = String(emailCfg.replyTo || fromEmail).trim();

    if (!fromEmail) {
      return res.status(400).json({ ok: false, message: 'From Email is not configured in Admin Settings → Email Configuration.' });
    }

    const transport = buildSmtpTransport(emailCfg);

    await transport.sendMail({
  from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: String(contactMessage.email || '').trim(),
      replyTo: replyTo || undefined,
      subject,
      text: message,
    });

    await pool.query('UPDATE contact_messages SET is_read = TRUE WHERE id = ?', [id]);

    return res.json({ ok: true, message: 'Reply sent successfully.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to send reply email', error: error.message });
  }
});

app.get('/api/profile', async (_req, res) => {
  try {
    const [[row]] = await pool.query('SELECT data FROM site_profile WHERE id = 1');
    return res.json({ ok: true, data: parseJsonColumn(row?.data, null) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch profile', error: error.message });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    const payload = req.body || {};
    const [[row]] = await pool.query({
      sql: 'SELECT data FROM site_profile WHERE id = 1',
      timeout: 15000,
    });
    const existing = parseJsonColumn(row?.data, {});
    const nextProfile = {
      ...existing,
      ...payload,
      ...(payload.websitePages
        ? { websitePages: mergeWebsitePagesProfile(existing.websitePages, payload.websitePages) }
        : {}),
    };
    const json = JSON.stringify(nextProfile);
    await pool.query({
      sql: 'INSERT INTO site_profile (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      values: [json],
      timeout: 15000,
    });
    return res.json({ ok: true, data: nextProfile });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to save profile', error: error.message });
  }
});

app.get('/api/settings/system', async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    return res.json({ ok: true, data: maskSystemSettingsSecrets(settings) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch system settings', error: error.message });
  }
});

app.put('/api/settings/system', async (req, res) => {
  try {
    const payload = req.body || {};
    const settings = await saveSystemSettings(payload);
    return res.json({ ok: true, data: settings });
  } catch (error) {
    const message = error?.message || 'Failed to save system settings';
    const status = message.includes('must be') ? 400 : 500;
    return res.status(status).json({ ok: false, message, error: message });
  }
});

/**
 * Simple in-memory rate limiter for notification endpoints.
 * Limits each route+IP to `max` requests per `windowMs`.
 */
const _rateBuckets = new Map();

function rateLimitNotifications({ windowMs = 60_000, max = 10 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${req.path}::${ip}`;
    const now = Date.now();

    let bucket = _rateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      _rateBuckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ ok: false, message: 'Too many notification requests. Please try again shortly.' });
    }

    next();
  };
}

app.post('/api/notifications/registration', rateLimitNotifications({ windowMs: 60_000, max: 15 }), async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const payload = req.body || {};
    const reg = payload.registration || {};
    const registrationId = String(reg.id || payload.registration_id || '').trim();
    const referenceCode = String(reg.reference_code || payload.reference_code || '').trim();

    if (!registrationId && !referenceCode) {
      return res.status(400).json({ ok: false, message: 'registration id or reference code is required.' });
    }

    let registrationRow = null;
    if (registrationId) {
      const [[row]] = await pool.query('SELECT * FROM event_registrations WHERE id = ? LIMIT 1', [registrationId]);
      registrationRow = row;
    } else {
      const [[row]] = await pool.query('SELECT * FROM event_registrations WHERE reference_code = ? LIMIT 1', [referenceCode]);
      registrationRow = row;
    }

    if (!registrationRow) {
      return res.status(404).json({ ok: false, message: 'Registration not found.' });
    }

    const isAdmin = String(auth.claims.role || '').toLowerCase() === 'admin';
    if (!isAdmin && String(registrationRow.user_id) !== String(auth.claims.sub)) {
      return res.status(403).json({ ok: false, message: 'You can only send notifications for your own registration.' });
    }

    const settings = await getSystemSettings();
    const notificationResult = await dispatchRegistrationNotifications({
      settings,
      payload: { ...payload, registration: registrationRow },
    });

    return res.json({
      ok: true,
      message: 'Registration notifications processed.',
      data: notificationResult,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to process registration notifications', error: error.message });
  }
});

app.post('/api/notifications/test', rateLimitNotifications({ windowMs: 60_000, max: 5 }), async (req, res) => {
  try {
    const payload = req.body || {};
    const settings = await getSystemSettings();

    const result = await dispatchTestNotification({
      settings,
      channel: payload.channel,
      recipient: payload.recipient,
      message: payload.message,
    });

    return res.json({
      ok: true,
      message: 'Test notification processed.',
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ ok: false, message: 'Failed to process test notification', error: error.message });
  }
});

app.get('/api/settings/payment/public', async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    return res.json({
      ok: true,
      data: {
        provider: lencoConfig.provider,
        publicKey: lencoConfig.publicKey,
        accountId: lencoConfig.accountId,
        currency: lencoConfig.currency,
        sandboxMode: lencoConfig.sandboxMode,
        baseUrl: lencoConfig.baseUrl,
        widgetUrl: lencoConfig.widgetUrl,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch payment settings', error: error.message });
  }
});

app.post('/api/settings/payment/lenco/test', async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    if (!lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Lenco secret key is missing in settings.' });
    }

    const response = await lencoRequest({
      method: 'GET',
      path: '/accounts',
      secretKey: lencoConfig.secretKey,
      baseUrl: lencoConfig.baseUrl,
    });

    return res.json({ ok: true, message: 'Lenco credentials are valid.', data: response });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Lenco credential test failed', error: error.message });
  }
});

app.post('/api/settings/zoom/test', async (_req, res) => {
  try {
    const zoomConfig = await getZoomConfig();

    if (!zoomConfig.accountId || !zoomConfig.clientId || !zoomConfig.clientSecret) {
      return res.status(400).json({
        ok: false,
        message: 'Zoom credentials incomplete. Provide Account ID, Client ID, and Client Secret.',
      });
    }

    // Attempt to get an access token — this validates all 3 credentials at once
    const token = await getZoomAccessToken(zoomConfig);
    if (!token) {
      return res.status(502).json({ ok: false, message: 'Zoom returned no access token. Verify your credentials.' });
    }

    // Optional: verify the host email exists as a Zoom user
    let hostMessage = '';
    const hostEmail = String(zoomConfig.defaultHostEmail || '').trim();
    if (hostEmail) {
      try {
        const userInfo = await zoomRequest({ zoomConfig, method: 'GET', path: `/users/${encodeURIComponent(hostEmail)}` });
        hostMessage = ` Host user "${userInfo?.email || hostEmail}" found (${userInfo?.type === 2 ? 'Licensed' : userInfo?.type === 1 ? 'Basic' : 'type=' + userInfo?.type}).`;
      } catch (err) {
        hostMessage = ` Warning: could not verify host email "${hostEmail}" — ${err.message}`;
      }
    }

    return res.json({
      ok: true,
      message: `Zoom credentials are valid. Access token obtained successfully.${hostMessage}`,
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Zoom credential test failed', error: error.message });
  }
});

app.post('/api/settings/zoom/sdk-test', async (req, res) => {
  try {
    const zoomConfig = await getZoomConfig();

    if (!zoomConfig.sdkKey || !zoomConfig.sdkSecret) {
      return res.status(400).json({
        ok: false,
        message: 'Meeting SDK credentials are incomplete. Provide SDK Key and SDK Secret in Settings → Zoom → Meeting SDK.',
      });
    }

    const warnings = [];
    if (zoomConfig.sdkKey === zoomConfig.accountId) {
      warnings.push('SDK Key appears to match Account ID. This is usually incorrect.');
    }
    if (zoomConfig.sdkSecret === zoomConfig.clientId) {
      warnings.push('SDK Secret appears to match Client ID. This is usually incorrect.');
    }

    const requestedMeetingNumber = extractZoomMeetingNumber(String(req.body?.meetingNumber || '').trim());
    let meetingNumber = requestedMeetingNumber;

    if (!meetingNumber) {
      const [rows] = await pool.query(
        `SELECT zoom_meeting_id, zoom_join_url, meeting_link
         FROM events
         WHERE (provider = 'zoom' OR meeting_platform = 'zoom')
           AND (
             (zoom_meeting_id IS NOT NULL AND zoom_meeting_id <> '')
             OR (zoom_join_url IS NOT NULL AND zoom_join_url <> '')
             OR (meeting_link IS NOT NULL AND meeting_link <> '')
           )
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
      );

      const sample = rows?.[0] || null;
      meetingNumber = extractZoomMeetingNumber(sample?.zoom_meeting_id || '')
        || extractZoomMeetingNumber(sample?.zoom_join_url || '')
        || extractZoomMeetingNumber(sample?.meeting_link || '');
    }

    if (!meetingNumber) {
      return res.status(400).json({
        ok: false,
        message: 'No Zoom meeting number found for SDK preflight. Provide a Meeting Number to test.',
      });
    }

    const iat = Math.floor(Date.now() / 1000) - 30;
    const exp = iat + (2 * 60 * 60);
    const signature = signJwtHmacSha256({
      sdkKey: zoomConfig.sdkKey,
      appKey: zoomConfig.sdkKey,
      mn: meetingNumber,
      role: 0,
      iat,
      exp,
      tokenExp: exp,
    }, zoomConfig.sdkSecret);

    const meetingLookup = {
      attempted: false,
      exists: null,
      message: '',
    };

    if (zoomConfig.accountId && zoomConfig.clientId && zoomConfig.clientSecret) {
      meetingLookup.attempted = true;
      try {
        const meeting = await zoomRequest({
          zoomConfig,
          method: 'GET',
          path: `/meetings/${encodeURIComponent(meetingNumber)}`,
        });
        meetingLookup.exists = true;
        meetingLookup.message = `Meeting found (${meeting?.topic || 'topic unavailable'}).`;
      } catch (error) {
        meetingLookup.exists = false;
        meetingLookup.message = error.message;
      }
    }

    return res.json({
      ok: true,
      message: 'SDK signature preflight generated successfully.',
      diagnostics: {
        meetingNumber,
        signatureParts: String(signature || '').split('.').length,
        signatureLength: String(signature || '').length,
        claims: {
          sdkKeyLength: String(zoomConfig.sdkKey || '').length,
          meetingNumber,
          role: 0,
          iat,
          exp,
          tokenExp: exp,
        },
        meetingLookup,
        warnings,
        note: 'This preflight validates local signature construction and optional meeting lookup. Zoom client runtime acceptance still depends on using a valid Meeting SDK app/key pair.',
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Zoom SDK preflight failed', error: error.message });
  }
});

// ── Zoom status check (lightweight, returns booleans only — no secrets) ──
app.get('/api/settings/zoom/status', async (_req, res) => {
  try {
    const zoom = await getZoomProviderStatus();
    return res.json({ ok: true, ...zoom });
  } catch {
    return res.json({ ok: false, configured: false, oauth: false, hostEmail: false, sdk: false, webhook: false });
  }
});

app.get('/api/settings/video/status', async (_req, res) => {
  try {
    const video = await getVideoSettings();
    const zoom = await getZoomProviderStatus();
    const daily = await getDailyProviderStatus();
    return res.json({
      ok: true,
      defaultProvider: video.defaultProvider,
      enabledProviders: video.enabledProviders,
      joinMode: video.joinMode,
      sdkReady: Boolean(zoom.sdk),
      providers: { zoom, daily },
    });
  } catch {
    return res.json({
      ok: false,
      defaultProvider: 'zoom',
      enabledProviders: ['zoom'],
      joinMode: 'embed',
      sdkReady: false,
      providers: {
        zoom: { configured: false, oauth: false, hostEmail: false, sdk: false, webhook: false },
        daily: { configured: false, apiKey: false, domain: false, webhook: false },
      },
    });
  }
});

app.post('/api/settings/daily/test', async (_req, res) => {
  try {
    const dailyConfig = await getDailyConfig();
    if (!dailyConfig.apiKey) {
      return res.status(400).json({ ok: false, message: 'Daily API key is missing in settings.' });
    }
    if (!dailyConfig.domain) {
      return res.status(400).json({ ok: false, message: 'Daily domain is missing in settings (e.g. yoursubdomain.daily.co).' });
    }

    await dailyRequest({ dailyConfig, method: 'GET', path: '/' });
    return res.json({
      ok: true,
      message: `Daily.co credentials are valid for domain ${dailyConfig.domain}.`,
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Daily credential test failed', error: error.message });
  }
});

app.post('/api/settings/smartdata/test', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    const smartData = getSmartDataConfig(settings);
    const testNrc = String(req.body?.nrc_number || '').trim();

    if (!smartData.apiKey) {
      return res.status(400).json({ ok: false, message: 'SmartData API key is missing. Save your key first.' });
    }

    if (!testNrc) {
      return res.status(400).json({
        ok: false,
        message: 'Enter a test NRC number (e.g. 123456/78/1) to verify the SmartData connection.',
      });
    }

    const result = await verifyNrcWithSmartData({
      apiKey: smartData.apiKey,
      baseUrl: smartData.baseUrl,
      nrcNumber: testNrc,
    });

    if (!result.ok) {
      return res.status(502).json({ ok: false, message: result.message });
    }

    const fullName = result.data?.fullName || '';
    return res.json({
      ok: true,
      message: fullName
        ? `SmartData connection successful. Verified: ${fullName}.`
        : 'SmartData connection successful.',
      data: result.data,
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'SmartData test failed', error: error.message });
  }
});

app.get('/api/payments/lenco/dashboard', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payment_collections ORDER BY created_at DESC LIMIT 200');

    const collections = rows.map((item) => ({
      id: String(item?.id || item?.reference || ''),
      reference: String(item?.reference || ''),
      amount: toNumber(item?.amount, 0),
      currency: String(item?.currency || 'ZMW'),
      status: normalizeCollectionStatus(item?.status || ''),
      channel: String(item?.channel || 'unknown'),
      customer: String(item?.customer_name || item?.customer_email || item?.customer_phone || ''),
      createdAt: item?.created_at || null,
    }));

    const currency = collections[0]?.currency || 'ZMW';

    const summary = collections.reduce((acc, tx) => {
      acc.totalVolume += tx.amount;
      if (tx.status === 'successful') {
        acc.successfulCount += 1;
        acc.totalCollected += tx.amount;
      } else if (tx.status === 'pending') {
        acc.pendingCount += 1;
        acc.pendingVolume += tx.amount;
      } else if (tx.status === 'failed') {
        acc.failedCount += 1;
        acc.failedVolume += tx.amount;
      }
      return acc;
    }, {
      totalCollected: 0,
      totalVolume: 0,
      successfulCount: 0,
      pendingCount: 0,
      failedCount: 0,
      pendingVolume: 0,
      failedVolume: 0,
    });

    const availableBalance = Math.max(0, summary.totalCollected);
    const ledgerBalance = summary.totalVolume;

    return res.json({
      ok: true,
      data: {
        provider: 'system-db',
        mode: 'local',
        currency,
        accountId: 'internal-ledger',
        balances: {
          available: availableBalance,
          ledger: ledgerBalance,
        },
        summary,
        collections,
        warnings: {},
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch internal transaction dashboard data', error: error.message });
  }
});

app.get('/api/payments/lenco/banks', async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    if (lencoConfig.provider !== 'lenco') {
      return res.status(400).json({ ok: false, message: 'Payment provider is not set to Lenco.' });
    }
    if (!lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Lenco secret key is missing in settings.' });
    }

    const result = await lencoRequestAny({
      secretKey: lencoConfig.secretKey,
      baseUrl: lencoConfig.baseUrl,
      candidates: [
        { method: 'GET', path: '/banks' },
        { method: 'GET', path: '/banks/list' },
        { method: 'GET', path: '/transfers/banks' },
      ],
    });

    const normalized = toArrayLike(result.response)
      .map(normalizeBank)
      .filter((bank) => bank.code && bank.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json({ ok: true, data: normalized, source: result.path });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Failed to fetch Lenco banks', error: error.message });
  }
});

app.post('/api/payments/lenco/bank-lookup', async (req, res) => {
  try {
    const bankCode = String(req.body?.bankCode || '').trim();
    const accountNumber = String(req.body?.accountNumber || '').replace(/\s+/g, '');

    if (!bankCode) return res.status(400).json({ ok: false, message: 'bankCode is required' });
    if (!accountNumber || accountNumber.length < 6) {
      return res.status(400).json({ ok: false, message: 'accountNumber is required and must be valid' });
    }

    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    if (lencoConfig.provider !== 'lenco') {
      return res.status(400).json({ ok: false, message: 'Payment provider is not set to Lenco.' });
    }
    if (!lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Lenco secret key is missing in settings.' });
    }

    const query = `bankCode=${encodeURIComponent(bankCode)}&accountNumber=${encodeURIComponent(accountNumber)}`;
    const queryAlt = `bank=${encodeURIComponent(bankCode)}&number=${encodeURIComponent(accountNumber)}`;
    const result = await lencoRequestAny({
      secretKey: lencoConfig.secretKey,
      baseUrl: lencoConfig.baseUrl,
      candidates: [
        { method: 'GET', path: `/accounts/resolve?${query}` },
        { method: 'GET', path: `/accounts/resolve?${queryAlt}` },
        { method: 'GET', path: `/transfers/resolve-bank-account?${query}` },
        { method: 'GET', path: `/transfers/lookup?${query}` },
        { method: 'GET', path: `/banks/lookup?${query}` },
        { method: 'GET', path: `/bank-lookup?${query}` },
        { method: 'POST', path: '/accounts/resolve', body: { bankCode, accountNumber } },
        { method: 'POST', path: '/transfers/resolve-bank-account', body: { bankCode, accountNumber } },
        { method: 'POST', path: '/banks/lookup', body: { bankCode, accountNumber } },
        { method: 'POST', path: '/bank-lookup', body: { bankCode, accountNumber } },
      ],
    });

    const lookup = extractLookupPayload(result.response);
    if (!lookup.accountName) {
      return res.status(422).json({ ok: false, message: 'Account lookup did not return an account name.', data: lookup.raw });
    }

    return res.json({
      ok: true,
      data: {
        accountName: lookup.accountName,
        accountNumber: lookup.accountNumber || accountNumber,
        bankCode: lookup.bankCode || bankCode,
        bankName: lookup.bankName || '',
      },
      source: result.path,
    });
  } catch (error) {
    const details = String(error?.message || '');

    if (/account was not found|api key does not have access/i.test(details)) {
      return res.status(422).json({
        ok: false,
        message: 'Bank lookup failed: account not found, or this Lenco key does not have account-resolution access.',
        error: details,
      });
    }

    if (/not found|id is not valid/i.test(details)) {
      return res.status(502).json({
        ok: false,
        message: 'Bank lookup endpoint is unavailable for the current Lenco key/environment.',
        error: details,
      });
    }

    return res.status(502).json({ ok: false, message: 'Failed to verify bank account', error: details });
  }
});

app.post('/api/payments/lenco/mobile-money-lookup', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    if (!phone) {
      return res.status(400).json({ ok: false, message: 'phone is required' });
    }

    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    if (lencoConfig.provider !== 'lenco') {
      return res.status(400).json({ ok: false, message: 'Payment provider is not set to Lenco.' });
    }
    if (!lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Lenco secret key is missing in settings.' });
    }

    const normalizedPhone = normalizePhone(phone);
    const operator = detectMobileOperator(phone);

    const result = await lencoRequestAny({
      secretKey: lencoConfig.secretKey,
      baseUrl: lencoConfig.baseUrl,
      candidates: [
        { method: 'POST', path: '/resolve/mobile-money', body: { phone: normalizedPhone, ...(operator ? { operator } : {}) } },
        { method: 'POST', path: '/transfers/resolve-mobile-money', body: { phone: normalizedPhone, ...(operator ? { operator } : {}) } },
        { method: 'POST', path: '/mobile-money/resolve', body: { phone: normalizedPhone, ...(operator ? { operator } : {}) } },
        {
          method: 'GET',
          path: `/resolve/mobile-money?phone=${encodeURIComponent(normalizedPhone)}${operator ? `&operator=${encodeURIComponent(operator)}` : ''}`,
        },
      ],
    });

    const lookup = extractMobileMoneyLookupPayload(result.response);
    if (!lookup.fullName) {
      return res.status(422).json({ ok: false, message: 'Phone lookup did not return an account name.', data: lookup.raw });
    }

    return res.json({
      ok: true,
      data: {
        fullName: lookup.fullName,
        phone: lookup.phone || normalizedPhone,
        operator: operator || '',
      },
      source: result.path,
    });
  } catch (error) {
    const details = String(error?.message || '');

    if (/not found|does not have access|invalid/i.test(details)) {
      return res.status(422).json({
        ok: false,
        message: 'Phone lookup failed: account not found, or this Lenco key has no lookup access.',
        error: details,
      });
    }

    return res.status(502).json({ ok: false, message: 'Failed to verify mobile money number', error: details });
  }
});

app.get('/api/finance/settlement-accounts', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settlement_accounts ORDER BY is_default DESC, created_at DESC');
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch settlement accounts', error: error.message });
  }
});

app.post('/api/finance/settlement-accounts', async (req, res) => {
  try {
    const alias = String(req.body?.alias || '').trim();
    const bankCode = String(req.body?.bankCode || '').trim();
    const bankName = String(req.body?.bankName || '').trim();
    const accountNumber = String(req.body?.accountNumber || '').replace(/\s+/g, '');
    const accountName = String(req.body?.accountName || '').trim();
    const currency = String(req.body?.currency || 'ZMW').trim() || 'ZMW';
    const isDefault = Boolean(req.body?.isDefault);

    if (!alias || !bankCode || !bankName || !accountNumber || !accountName) {
      return res.status(400).json({ ok: false, message: 'alias, bankCode, bankName, accountNumber and accountName are required' });
    }

    const id = generateEntityId('setacc');

    if (isDefault) {
      await pool.query('UPDATE settlement_accounts SET is_default = FALSE');
    }

    await pool.query(
      `INSERT INTO settlement_accounts
      (id, alias, bank_code, bank_name, account_number, account_name, currency, is_default, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, alias, bankCode, bankName, accountNumber, accountName, currency, isDefault, JSON.stringify(req.body?.metadata || {})],
    );

    const [[row]] = await pool.query('SELECT * FROM settlement_accounts WHERE id = ?', [id]);
    return res.status(201).json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to save settlement account', error: error.message });
  }
});

app.put('/api/finance/settlement-accounts/:id/default', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, message: 'Account id is required' });

    await pool.query('UPDATE settlement_accounts SET is_default = FALSE');
    const [result] = await pool.query('UPDATE settlement_accounts SET is_default = TRUE WHERE id = ?', [id]);

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, message: 'Settlement account not found' });
    }

    const [[row]] = await pool.query('SELECT * FROM settlement_accounts WHERE id = ?', [id]);
    return res.json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update default settlement account', error: error.message });
  }
});

app.get('/api/finance/settlements', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        st.*,
        sa.alias AS settlement_account_alias,
        sa.bank_name,
        sa.account_number,
        sa.account_name
      FROM settlement_transactions st
      JOIN settlement_accounts sa ON sa.id = st.settlement_account_id
      ORDER BY st.created_at DESC
      LIMIT 100
    `);

    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch settlements', error: error.message });
  }
});

app.post('/api/finance/settlements', async (req, res) => {
  try {
    const settlementAccountId = String(req.body?.settlementAccountId || '').trim();
    const narration = String(req.body?.narration || 'Collection settlement').trim();
    const amount = toNumber(req.body?.amount, NaN);

    if (!settlementAccountId) {
      return res.status(400).json({ ok: false, message: 'settlementAccountId is required' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'amount must be a positive number' });
    }

    const [[account]] = await pool.query('SELECT * FROM settlement_accounts WHERE id = ?', [settlementAccountId]);
    if (!account) {
      return res.status(404).json({ ok: false, message: 'Settlement account not found' });
    }

    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    if (lencoConfig.provider !== 'lenco') {
      return res.status(400).json({ ok: false, message: 'Payment provider is not set to Lenco.' });
    }
    if (!lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Lenco secret key is missing in settings.' });
    }

    const settlementId = generateEntityId('settle');
    const reference = generatePaymentReference('SET');
  let transferResponse = null;
    let transferError = null;
  let usedManualQueue = false;

    try {
      const transfer = await lencoRequestAny({
        secretKey: lencoConfig.secretKey,
        baseUrl: lencoConfig.baseUrl,
        candidates: [
          {
            method: 'POST',
            path: '/transfers',
            body: {
              amount,
              currency: account.currency || lencoConfig.currency,
              reference,
              narration,
              bankCode: account.bank_code,
              accountNumber: account.account_number,
              accountName: account.account_name,
            },
          },
          {
            method: 'POST',
            path: '/payouts',
            body: {
              amount,
              currency: account.currency || lencoConfig.currency,
              reference,
              narration,
              bankCode: account.bank_code,
              accountNumber: account.account_number,
              beneficiaryName: account.account_name,
            },
          },
          {
            method: 'POST',
            path: '/disbursements',
            body: {
              amount,
              currency: account.currency || lencoConfig.currency,
              reference,
              narration,
              bankCode: account.bank_code,
              accountNumber: account.account_number,
              beneficiaryName: account.account_name,
            },
          },
        ],
      });

      transferResponse = transfer.response;
    } catch (error) {
      transferError = error.message;
    }

    if (transferError && /not found|404/i.test(transferError)) {
      usedManualQueue = true;
    }

    const providerStatus = normalizePayoutStatus(
      transferResponse?.status
      || transferResponse?.data?.status
      || transferResponse?.state
      || (usedManualQueue ? 'pending' : (transferError ? 'failed' : 'pending')),
    );

    await pool.query(
      `INSERT INTO settlement_transactions
      (id, settlement_account_id, reference, amount, currency, narration, status, provider, provider_response, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'lenco', ?, ?)`,
      [
        settlementId,
        settlementAccountId,
        reference,
        amount,
        account.currency || lencoConfig.currency,
        narration,
        providerStatus,
        JSON.stringify(transferResponse || {}),
        usedManualQueue ? `Manual settlement queued: ${transferError}` : transferError,
      ],
    );

    const [[row]] = await pool.query('SELECT * FROM settlement_transactions WHERE id = ?', [settlementId]);

    if (usedManualQueue) {
      return res.status(202).json({
        ok: true,
        message: 'Settlement queued. Provider transfer API is unavailable for this credential; proceed manually from provider dashboard.',
        data: row,
      });
    }

    if (transferError) {
      return res.status(502).json({
        ok: false,
        message: 'Settlement request created but provider transfer failed.',
        error: transferError,
        data: row,
      });
    }

    return res.status(201).json({
      ok: true,
      message: 'Settlement initiated successfully.',
      data: row,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to initiate settlement', error: error.message });
  }
});

app.post('/api/payments/lenco/verify', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found.' });

    const reference = String(req.body?.reference || '').trim();
    if (!reference) {
      return res.status(400).json({ ok: false, message: 'reference is required' });
    }

    const [[existingCollection]] = await pool.query(
      'SELECT customer_email FROM payment_collections WHERE reference = ? LIMIT 1',
      [reference],
    );
    if (existingCollection?.customer_email
      && String(existingCollection.customer_email).toLowerCase() !== String(authUser.email || '').toLowerCase()) {
      return res.status(403).json({ ok: false, message: 'This payment reference does not belong to your account.' });
    }

    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    if (lencoConfig.provider !== 'lenco') {
      return res.status(400).json({ ok: false, message: 'Payment provider is not set to Lenco.' });
    }

    if (!lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Lenco secret key is missing in settings.' });
    }

    const result = await lencoRequest({
      method: 'GET',
      path: `/collections/status/${encodeURIComponent(reference)}`,
      secretKey: lencoConfig.secretKey,
      baseUrl: lencoConfig.baseUrl,
    });

    const status = normalizeCollectionStatus(
      result?.data?.data?.status
      || result?.data?.status
      || result?.status
      || 'pending',
    );

    await upsertPaymentCollection({
      reference,
      status,
      amount: toNumber(result?.data?.data?.amount ?? result?.data?.amount ?? result?.amount, 0),
      currency: String(result?.data?.data?.currency || result?.data?.currency || result?.currency || 'ZMW'),
      channel: String(result?.data?.data?.channel || result?.data?.channel || result?.channel || 'unknown'),
      provider: 'lenco',
      provider_response: result,
    });

    return res.json({ ok: true, data: result });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Failed to verify Lenco payment', error: error.message });
  }
});

app.post('/api/payments/lenco/mobile-money/checkout', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });

    const amount = Number(req.body?.amount || 0);
    const currency = String(req.body?.currency || 'ZMW');
    const phone = String(req.body?.phone || '');
    const eventId = String(req.body?.eventId || '').trim();
    const couponCode = String(req.body?.coupon_code || req.body?.code || '').trim();

    if (!eventId) {
      return res.status(400).json({ ok: false, message: 'eventId is required' });
    }
    if (!phone) {
      return res.status(400).json({ ok: false, message: 'phone is required for mobile money checkout' });
    }

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });
    if (parseBoolean(event.is_free, false)) {
      return res.status(400).json({ ok: false, message: 'This event does not require payment.' });
    }

    const couponRes = await resolveEventCouponForBooking(pool, event, couponCode, authUser.id, { lockRow: false });
    if (!couponRes.ok) {
      return res.status(400).json({ ok: false, message: couponRes.error });
    }

    const expectedZmw = couponRes.final_zmw;
    if (expectedZmw <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'No payment is due for this checkout. Complete registration without mobile money.',
      });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'amount must be a positive number' });
    }

    const eventTitle = String(event.title || '').trim();
    const customerEmail = String(authUser.email || '').trim();
    const customerName = String(authUser.name || '').trim();
    if (currency.toUpperCase() === 'ZMW' && Math.abs(amount - expectedZmw) > 0.01) {
      return res.status(400).json({ ok: false, message: 'Payment amount does not match the event price (after any coupon).' });
    }

    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    if (lencoConfig.provider !== 'lenco') {
      return res.status(400).json({ ok: false, message: 'Payment provider is not set to Lenco.' });
    }
    if (!lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Lenco secret key is missing in settings.' });
    }

    const normalizedPhone = normalizePhone(phone);
    const operator = detectMobileOperator(phone);
    const reference = generatePaymentReference('MM-EVT');

    const payload = {
      amount,
      phone: normalizedPhone,
      reference,
      currency,
      metadata: {
        eventId,
        eventTitle,
        customerEmail,
        customerName,
        couponCode: normalizeEventCouponCode(couponCode) || undefined,
      },
    };

    if (operator) payload.operator = operator;

    const result = await lencoRequest({
      method: 'POST',
      path: '/collections/mobile-money',
      secretKey: lencoConfig.secretKey,
      baseUrl: lencoConfig.baseUrl,
      body: payload,
    });

    await upsertPaymentCollection({
      reference,
      event_id: eventId,
      event_title: eventTitle,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: normalizedPhone,
      amount,
      currency,
      status: normalizeCollectionStatus(result?.status || result?.data?.status || 'pending'),
      channel: 'mobile_money',
      provider: 'lenco',
      provider_response: result,
    });

    return res.status(201).json({
      ok: true,
      message: 'Mobile money checkout initiated. Prompt sent to customer phone.',
      data: {
        reference,
        provider: 'lenco',
        channel: 'mobile_money',
        status: result?.status || 'pending',
        lenco: result,
      },
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Failed to initiate mobile money checkout', error: error.message });
  }
});

app.post('/api/payments/lenco/card/checkout-session', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });

    const amount = Number(req.body?.amount || 0);
    const currency = String(req.body?.currency || 'ZMW');
    const eventId = String(req.body?.eventId || '').trim();
    const couponCode = String(req.body?.coupon_code || req.body?.code || '').trim();
    const billingAmountZmwRaw = req.body?.billingAmountZmw;

    if (!eventId) {
      return res.status(400).json({ ok: false, message: 'eventId is required' });
    }
    if (!authUser.email) {
      return res.status(400).json({ ok: false, message: 'customerEmail is required for card checkout' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'amount must be a positive number' });
    }

    const [[event]] = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found.' });
    if (parseBoolean(event.is_free, false)) {
      return res.status(400).json({ ok: false, message: 'This event does not require payment.' });
    }

    const couponRes = await resolveEventCouponForBooking(pool, event, couponCode, authUser.id, { lockRow: false });
    if (!couponRes.ok) {
      return res.status(400).json({ ok: false, message: couponRes.error });
    }

    const expectedZmw = couponRes.final_zmw;
    if (expectedZmw <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'No payment is due for this checkout. Complete registration without card payment.',
      });
    }

    const curUpper = currency.toUpperCase();
    if (curUpper === 'ZMW' && Math.abs(amount - expectedZmw) > 0.01) {
      return res.status(400).json({ ok: false, message: 'Payment amount does not match the event price (after any coupon).' });
    }

    if (curUpper !== 'ZMW') {
      const billingAmountZmw = toNumber(billingAmountZmwRaw, NaN);
      if (!Number.isFinite(billingAmountZmw)) {
        return res.status(400).json({
          ok: false,
          message: 'billingAmountZmw is required when paying in a non-ZMW currency so the server can verify the ZMW-equivalent discounted price.',
        });
      }
      if (Math.abs(billingAmountZmw - expectedZmw) > 0.01) {
        return res.status(400).json({
          ok: false,
          message: 'billingAmountZmw must match the discounted event price (ZMW) for this checkout.',
        });
      }
    }

    const eventTitle = String(event.title || '').trim();
    const customerEmail = String(authUser.email || '').trim();
    const customerName = String(authUser.name || '').trim();
    const customerPhoneNormalized = normalizePhone(authUser.phone || '');
    let customerPhoneWidget = String(authUser.phone || '').trim();
    if (customerPhoneNormalized.startsWith('260') && customerPhoneNormalized.length >= 12) {
      customerPhoneWidget = `0${customerPhoneNormalized.slice(3)}`;
    }

    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);

    if (lencoConfig.provider !== 'lenco') {
      return res.status(400).json({ ok: false, message: 'Payment provider is not set to Lenco.' });
    }
    if (!lencoConfig.publicKey) {
      return res.status(400).json({ ok: false, message: 'Lenco public key is missing in settings.' });
    }

    const reference = generatePaymentReference('CARD-EVT');

    await upsertPaymentCollection({
      reference,
      event_id: eventId,
      event_title: eventTitle,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhoneNormalized,
      amount,
      currency,
      status: 'pending',
      channel: 'card',
      provider: 'lenco',
      provider_response: {
        source: 'card-checkout-session',
      },
    });

    return res.status(201).json({
      ok: true,
      message: 'Card checkout session ready.',
      data: {
        provider: 'lenco',
        channel: 'card',
        reference,
        amount,
        currency,
        publicKey: lencoConfig.publicKey,
        widgetUrl: lencoConfig.widgetUrl,
        sandboxMode: lencoConfig.sandboxMode,
        customer: {
          email: customerEmail,
          name: customerName,
          phone: customerPhoneWidget,
        },
        metadata: {
          eventId,
          eventTitle,
          billingAmountZmw: expectedZmw,
          couponCode: normalizeEventCouponCode(couponCode) || undefined,
        },
      },
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Failed to prepare card checkout session', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── CV GENERATOR (paywall + suggestions) ─────────────────
// ═══════════════════════════════════════════════════════════

app.get('/api/cv/access', rateLimitCvAccess, async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const [[user]] = await pool.query('SELECT cv_unlocked_at FROM users WHERE id = ?', [auth.claims.sub]);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found.' });

    const settings = await getSystemSettings();
    const cvConfig = getCvGeneratorConfig(settings);

    const downloadsUnlocked = Boolean(user.cv_unlocked_at);
    return res.json({
      ok: true,
      data: {
        enabled: cvConfig.enabled,
        priceZmw: cvConfig.priceZmw,
        unlocked: downloadsUnlocked,
        downloadsUnlocked,
        unlockedAt: user.cv_unlocked_at || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load CV access.', error: error.message });
  }
});

app.get('/api/cv/suggestions', rateLimitCvSuggestions, async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const result = await getCachedCvSuggestions(auth.claims.sub, async () => {
      const ctx = await loadCvSuggestionContext(auth.claims.sub);
      if (!ctx) return null;
      return buildCvStrengthSuggestions(ctx);
    });
    if (!result) return res.status(404).json({ ok: false, message: 'User not found.' });

    return res.json({ ok: true, data: result });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load CV suggestions.', error: error.message });
  }
});

app.post('/api/cv/checkout/mobile-money', rateLimitCvCheckout, async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found.' });

    if (authUser.cv_unlocked_at) {
      return res.status(400).json({ ok: false, message: 'CV downloads are already unlocked for your account.' });
    }

    const settings = await getSystemSettings();
    const cvConfig = getCvGeneratorConfig(settings);
    if (!cvConfig.enabled) {
      return res.status(400).json({ ok: false, message: 'CV generator is not available.' });
    }
    if (cvConfig.priceZmw <= 0) {
      return res.status(400).json({ ok: false, message: 'No payment required. Downloads are free for your account.' });
    }

    const amount = Number(req.body?.amount || 0);
    const currency = String(req.body?.currency || 'ZMW');
    const phone = String(req.body?.phone || '');
    if (!phone) {
      return res.status(400).json({ ok: false, message: 'phone is required for mobile money checkout' });
    }
    if (!Number.isFinite(amount) || Math.abs(amount - cvConfig.priceZmw) > 0.01) {
      return res.status(400).json({ ok: false, message: 'Payment amount does not match the CV download price.' });
    }

    const lencoConfig = getLencoConfig(settings);
    if (lencoConfig.provider !== 'lenco' || !lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Payment provider is not configured.' });
    }

    const normalizedPhone = normalizePhone(phone);
    const operator = detectMobileOperator(phone);
    const reference = generatePaymentReference('MM-CV');
    const customerEmail = String(authUser.email || '').trim();
    const customerName = String(authUser.name || '').trim();

    const payload = {
      amount,
      phone: normalizedPhone,
      reference,
      currency,
      metadata: {
        product: 'cv_download_bundle',
        userId: authUser.id,
        customerEmail,
        customerName,
      },
    };
    if (operator) payload.operator = operator;

    const result = await lencoRequest({
      method: 'POST',
      path: '/collections/mobile-money',
      secretKey: lencoConfig.secretKey,
      baseUrl: lencoConfig.baseUrl,
      body: payload,
    });

    await upsertPaymentCollection({
      reference,
      event_id: CV_PRODUCT_EVENT_ID,
      event_title: 'CV download (PDF + Word)',
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: normalizedPhone,
      amount,
      currency,
      status: normalizeCollectionStatus(result?.status || result?.data?.status || 'pending'),
      channel: 'mobile_money',
      provider: 'lenco',
      provider_response: result,
    });

    return res.status(201).json({
      ok: true,
      message: 'Mobile money checkout initiated.',
      data: { reference, status: result?.status || 'pending' },
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Failed to initiate checkout', error: error.message });
  }
});

app.post('/api/cv/checkout/card-session', rateLimitCvCheckout, async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found.' });

    if (authUser.cv_unlocked_at) {
      return res.status(400).json({ ok: false, message: 'CV downloads are already unlocked for your account.' });
    }

    const settings = await getSystemSettings();
    const cvConfig = getCvGeneratorConfig(settings);
    if (!cvConfig.enabled) {
      return res.status(400).json({ ok: false, message: 'CV generator is not available.' });
    }
    if (cvConfig.priceZmw <= 0) {
      return res.status(400).json({ ok: false, message: 'No payment required. Downloads are free for your account.' });
    }

    const amount = Number(req.body?.amount || 0);
    const currency = String(req.body?.currency || 'ZMW');
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'amount must be a positive number' });
    }
    if (currency.toUpperCase() === 'ZMW' && Math.abs(amount - cvConfig.priceZmw) > 0.01) {
      return res.status(400).json({ ok: false, message: 'Payment amount does not match the CV download price.' });
    }

    const lencoConfig = getLencoConfig(settings);
    if (lencoConfig.provider !== 'lenco' || !lencoConfig.publicKey) {
      return res.status(400).json({ ok: false, message: 'Payment provider is not configured.' });
    }

    const reference = generatePaymentReference('CARD-CV');
    const customerEmail = String(authUser.email || '').trim();
    const customerName = String(authUser.name || '').trim();
    const customerPhoneNormalized = normalizePhone(authUser.phone || '');
    const customerPhoneWidget = customerPhoneNormalized.startsWith('260')
      ? `0${customerPhoneNormalized.slice(3)}`
      : String(authUser.phone || '').replace(/\s+/g, '').trim();

    await upsertPaymentCollection({
      reference,
      event_id: CV_PRODUCT_EVENT_ID,
      event_title: 'CV download (PDF + Word)',
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhoneNormalized,
      amount,
      currency,
      status: 'pending',
      channel: 'card',
      provider: 'lenco',
      provider_response: { source: 'cv-card-checkout-session' },
    });

    return res.status(201).json({
      ok: true,
      data: {
        provider: 'lenco',
        channel: 'card',
        reference,
        amount,
        currency,
        publicKey: lencoConfig.publicKey,
        widgetUrl: lencoConfig.widgetUrl,
        sandboxMode: lencoConfig.sandboxMode,
        customer: {
          email: customerEmail,
          name: customerName,
          phone: customerPhoneWidget,
        },
        metadata: { product: 'cv_download_bundle', userId: authUser.id },
      },
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Failed to prepare card checkout', error: error.message });
  }
});

app.post('/api/cv/checkout/complete', rateLimitCvCheckout, async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found.' });

    const settings = await getSystemSettings();
    const cvConfig = getCvGeneratorConfig(settings);

    if (authUser.cv_unlocked_at) {
      const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [authUser.id]);
      return res.json({
        ok: true,
        data: { user: mapAuthSessionUser(user || authUser, req), alreadyUnlocked: true },
      });
    }

    if (cvConfig.priceZmw <= 0) {
      await grantCvUnlock(authUser.id);
      const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [authUser.id]);
      return res.json({ ok: true, data: { user: mapAuthSessionUser(user, req) } });
    }

    const reference = String(req.body?.reference || '').trim();
    if (!reference) {
      return res.status(400).json({ ok: false, message: 'reference is required' });
    }

    const [[collection]] = await pool.query(
      'SELECT * FROM payment_collections WHERE reference = ? AND event_id = ? LIMIT 1',
      [reference, CV_PRODUCT_EVENT_ID],
    );
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'CV payment not found.' });
    }
    if (String(collection.customer_email || '').toLowerCase() !== String(authUser.email || '').toLowerCase()) {
      return res.status(403).json({ ok: false, message: 'Payment does not match your account.' });
    }

    let status = normalizeCollectionStatus(collection.status);
    if (!isPaidCollectionStatus(status)) {
      const lencoConfig = getLencoConfig(settings);
      if (lencoConfig.secretKey) {
        const result = await lencoRequest({
          method: 'GET',
          path: `/collections/status/${encodeURIComponent(reference)}`,
          secretKey: lencoConfig.secretKey,
          baseUrl: lencoConfig.baseUrl,
        });
        status = normalizeCollectionStatus(
          result?.data?.data?.status
          || result?.data?.status
          || result?.status
          || status,
        );
        await upsertPaymentCollection({
          reference,
          status,
          provider_response: result,
        });
      }
    }

    if (!isPaidCollectionStatus(status)) {
      return res.status(402).json({ ok: false, message: 'Payment not completed yet.' });
    }

    await grantCvUnlock(authUser.id);

    try {
      const [[freshCollection]] = await pool.query(
        'SELECT * FROM payment_collections WHERE reference = ? AND event_id = ? LIMIT 1',
        [reference, CV_PRODUCT_EVENT_ID],
      );
      const receiptRecord = mapToReceiptRecord('cv', freshCollection || collection, { user: authUser });
      await maybeSendReceiptOnSettlement({
        previousRegistration: { payment_status: 'pending' },
        currentRegistration: {
          ...receiptRecord,
          receipt_source: 'cv',
          receipt_source_id: reference,
        },
        settings,
        sendEmailNotification,
        buildBrandedEmailHtml,
        appRoot: __appRoot,
        appOrigin: resolvePublicAppUrl(req),
        pool,
      });
    } catch (receiptErr) {
      console.warn('[cv/checkout] Receipt email failed:', receiptErr.message);
    }

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [authUser.id]);
    return res.json({ ok: true, data: { user: mapAuthSessionUser(user, req) } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to complete CV download unlock.', error: error.message });
  }
});

// ─── ADMIN CV GENERATOR ─────────────────────────────────────

app.get('/api/admin/cv', rateLimitAdminCvList, async (_req, res) => {
  try {
    await ensureCvUnlockColumn();
    const cvEventId = CV_PRODUCT_EVENT_ID;
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.profession, u.organization, u.cv_unlocked_at,
        lp.reference AS payment_reference,
        lp.amount AS payment_amount,
        lp.currency AS payment_currency,
        lp.status AS payment_status
       FROM users u
       LEFT JOIN (
         SELECT pc.customer_email, pc.reference, pc.amount, pc.currency, pc.status
         FROM payment_collections pc
         INNER JOIN (
           SELECT customer_email, MAX(created_at) AS max_created
           FROM payment_collections
           WHERE event_id = ?
           GROUP BY customer_email
         ) latest ON latest.customer_email = pc.customer_email
           AND latest.max_created = pc.created_at
         WHERE pc.event_id = ?
       ) lp ON LOWER(lp.customer_email) = LOWER(u.email)
       WHERE u.cv_unlocked_at IS NOT NULL
       ORDER BY u.cv_unlocked_at DESC`,
      [cvEventId, cvEventId],
    );

    const data = rows.map((row) => ({
      id: row.id,
      user_name: row.name,
      user_email: row.email,
      user_phone: row.phone || '',
      profession: row.profession || row.occupation || row.organization || '',
      unlocked_at: row.cv_unlocked_at,
      payment_reference: row.payment_reference || null,
      payment_amount: row.payment_amount != null ? Number(row.payment_amount) : null,
      payment_currency: row.payment_currency || 'ZMW',
      payment_status: row.payment_status || null,
    }));

    return res.json({ ok: true, data });
  } catch (error) {
    console.error('[admin/cv]', error.message);
    const msg = error?.code === 'ER_BAD_FIELD_ERROR'
      ? 'Database is missing CV columns. Restart the API after deploying the latest server code.'
      : 'Failed to fetch CV records.';
    return res.status(500).json({ ok: false, message: msg, error: error.message });
  }
});

app.get('/api/admin/cv/:userId', async (req, res) => {
  try {
    await ensureCvUnlockColumn();
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, message: 'User id is required.' });

    const [[row]] = await pool.query(
      'SELECT cv_unlocked_at FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!row?.cv_unlocked_at) {
      return res.status(404).json({ ok: false, message: 'CV not unlocked for this user.' });
    }

    const ctx = await loadCvSuggestionContext(userId);
    if (!ctx) return res.status(404).json({ ok: false, message: 'User not found.' });

    const developmentEvents = (ctx.registrations || []).filter(
      (r) => String(r.status || '').toLowerCase() === 'attended',
    );

    return res.json({
      ok: true,
      data: {
        user: ctx.user,
        certificates: ctx.certificates,
        developmentEvents,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load CV document.', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── BOOKS CRUD ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

app.get('/api/books', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM books ORDER BY featured DESC, created_at DESC');
    return res.json({ ok: true, data: rows.map(parseProductJsonFields) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch books', error: error.message });
  }
});

async function persistProductGalleryIfNeeded(incoming, req) {
  if (!Array.isArray(incoming.gallery)) return;
  const persisted = [];
  for (const url of incoming.gallery) {
    if (!url) continue;
    persisted.push(await persistBookImageIfNeeded(url, req));
  }
  incoming.gallery = persisted;
}

app.post('/api/books', async (req, res) => {
  try {
    const incoming = { ...(req.body || {}) };
    if (Object.prototype.hasOwnProperty.call(incoming, 'cover_image')) {
      incoming.cover_image = await persistBookImageIfNeeded(incoming.cover_image, req);
    }
    await persistProductGalleryIfNeeded(incoming, req);

    const payload = normalizeBookPayload(incoming);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ ok: false, message: 'Title and slug are required.' });
    }

    const placeholders = BOOK_FIELDS.map(() => '?').join(', ');
    const updates = BOOK_FIELDS.filter((f) => f !== 'id').map((f) => `${f}=VALUES(${f})`).join(', ');
    const values = BOOK_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO books (${BOOK_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM books WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to save book', error: error.message });
  }
});

app.put('/api/books/:id', async (req, res) => {
  try {
    const incoming = { ...(req.body || {}) };
    if (Object.prototype.hasOwnProperty.call(incoming, 'cover_image')) {
      incoming.cover_image = await persistBookImageIfNeeded(incoming.cover_image, req);
    }
    await persistProductGalleryIfNeeded(incoming, req);

    const payload = normalizeBookPayload(incoming, req.params.id);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ ok: false, message: 'Title and slug are required.' });
    }

    const placeholders = BOOK_FIELDS.map(() => '?').join(', ');
    const updates = BOOK_FIELDS.filter((f) => f !== 'id').map((f) => `${f}=VALUES(${f})`).join(', ');
    const values = BOOK_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO books (${BOOK_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update book', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── PRODUCTS (generalised shop) ──────────────────────────
// Books + merch (t-shirts, mugs, key-holders, etc.) share the
// same `books` table. The /api/products endpoints expose the
// generalised shop API with filter support.
// ═══════════════════════════════════════════════════════════

function parseProductJsonFields(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of ['variants', 'gallery']) {
    const value = out[key];
    if (typeof value === 'string' && value.trim()) {
      try { out[key] = JSON.parse(value); } catch { out[key] = []; }
    } else if (value == null) {
      out[key] = [];
    }
  }
  return out;
}

app.get('/api/products', async (req, res) => {
  try {
    const { type, event_id: eventId, published } = req.query || {};
    const clauses = [];
    const params = [];
    if (type) { clauses.push('product_type = ?'); params.push(String(type)); }
    if (eventId) { clauses.push('event_id = ?'); params.push(String(eventId)); }
    if (String(published) === '1' || String(published).toLowerCase() === 'true') {
      clauses.push('is_published = 1');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT * FROM books ${where} ORDER BY featured DESC, created_at DESC`,
      params,
    );
    return res.json({ ok: true, data: rows.map(parseProductJsonFields) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch products', error: error.message });
  }
});

app.get('/api/products/:slug', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM books WHERE slug = ? OR id = ?', [
      req.params.slug,
      req.params.slug,
    ]);
    if (!row) return res.status(404).json({ ok: false, message: 'Product not found.' });
    return res.json({ ok: true, data: parseProductJsonFields(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch product', error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const incoming = { ...(req.body || {}) };
    if (Object.prototype.hasOwnProperty.call(incoming, 'cover_image')) {
      incoming.cover_image = await persistBookImageIfNeeded(incoming.cover_image, req);
    }
    await persistProductGalleryIfNeeded(incoming, req);

    const payload = normalizeBookPayload(incoming);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ ok: false, message: 'Title and slug are required.' });
    }

    const placeholders = BOOK_FIELDS.map(() => '?').join(', ');
    const updates = BOOK_FIELDS.filter((f) => f !== 'id').map((f) => `${f}=VALUES(${f})`).join(', ');
    const values = BOOK_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO books (${BOOK_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM books WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: parseProductJsonFields(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to save product', error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const incoming = { ...(req.body || {}) };
    if (Object.prototype.hasOwnProperty.call(incoming, 'cover_image')) {
      incoming.cover_image = await persistBookImageIfNeeded(incoming.cover_image, req);
    }
    await persistProductGalleryIfNeeded(incoming, req);

    const payload = normalizeBookPayload(incoming, req.params.id);
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ ok: false, message: 'Title and slug are required.' });
    }

    const placeholders = BOOK_FIELDS.map(() => '?').join(', ');
    const updates = BOOK_FIELDS.filter((f) => f !== 'id').map((f) => `${f}=VALUES(${f})`).join(', ');
    const values = BOOK_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO books (${BOOK_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, data: parseProductJsonFields(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update product', error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM books WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Product not found.' });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete product', error: error.message });
  }
});

app.get('/api/events/:eventId/products', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM books WHERE event_id = ? AND is_published = 1 ORDER BY featured DESC, created_at DESC',
      [req.params.eventId],
    );
    return res.json({ ok: true, data: rows.map(parseProductJsonFields) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch event products', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── PRODUCT TYPES (catalogue) ────────────────────────────
// Dynamic registry of product types (book, t-shirt, mug, etc.)
// Admins manage these from /admin/shop/product-types.
// ═══════════════════════════════════════════════════════════

function normalizeProductTypePayload(payload = {}, fallbackId = null) {
  const slugify = (raw) => String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\- ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const value = slugify(payload.value || payload.label);
  return {
    id: String(payload.id || fallbackId || `pt_${value || Date.now().toString(36)}`),
    value,
    label: String(payload.label || '').trim(),
    icon: String(payload.icon || 'box').trim().toLowerCase() || 'box',
    default_category: payload.default_category ? String(payload.default_category).trim() : null,
    is_active: payload.is_active === false || payload.is_active === 0 || payload.is_active === '0' ? 0 : 1,
    sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 100,
  };
}

function mapProductTypeRow(row) {
  if (!row) return row;
  return {
    ...row,
    is_active: Boolean(Number(row.is_active)),
    sort_order: Number(row.sort_order ?? 100),
  };
}

app.get('/api/product-types', async (req, res) => {
  try {
    const includeInactive = String(req.query?.all || '').toLowerCase() === '1'
      || String(req.query?.all || '').toLowerCase() === 'true';
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    const [rows] = await pool.query(
      `SELECT * FROM product_types ${where} ORDER BY sort_order ASC, label ASC`,
    );
    return res.json({ ok: true, data: rows.map(mapProductTypeRow) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch product types', error: error.message });
  }
});

app.post('/api/product-types', async (req, res) => {
  try {
    const payload = normalizeProductTypePayload(req.body || {});
    if (!payload.label) {
      return res.status(400).json({ ok: false, message: 'Label is required.' });
    }
    if (!payload.value) {
      return res.status(400).json({ ok: false, message: 'Value is required (or provide a Label to auto-derive it).' });
    }
    try {
      await pool.query(
        `INSERT INTO product_types (id, value, label, icon, default_category, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [payload.id, payload.value, payload.label, payload.icon, payload.default_category, payload.is_active, payload.sort_order],
      );
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ ok: false, message: 'A product type with that value already exists.' });
      }
      throw err;
    }
    const [[row]] = await pool.query('SELECT * FROM product_types WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: mapProductTypeRow(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to create product type', error: error.message });
  }
});

app.put('/api/product-types/:id', async (req, res) => {
  try {
    const payload = normalizeProductTypePayload({ ...(req.body || {}), id: req.params.id }, req.params.id);
    if (!payload.label) {
      return res.status(400).json({ ok: false, message: 'Label is required.' });
    }
    if (!payload.value) {
      return res.status(400).json({ ok: false, message: 'Value is required.' });
    }
    try {
      await pool.query(
        `UPDATE product_types SET value=?, label=?, icon=?, default_category=?, is_active=?, sort_order=?
         WHERE id=?`,
        [payload.value, payload.label, payload.icon, payload.default_category, payload.is_active, payload.sort_order, payload.id],
      );
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ ok: false, message: 'Another product type already uses that value.' });
      }
      throw err;
    }
    const [[row]] = await pool.query('SELECT * FROM product_types WHERE id = ?', [payload.id]);
    if (!row) return res.status(404).json({ ok: false, message: 'Product type not found.' });
    return res.json({ ok: true, data: mapProductTypeRow(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update product type', error: error.message });
  }
});

app.delete('/api/product-types/:id', async (req, res) => {
  try {
    const [[type]] = await pool.query('SELECT * FROM product_types WHERE id = ?', [req.params.id]);
    if (!type) return res.status(404).json({ ok: false, message: 'Product type not found.' });

    // Block delete when products reference this type.
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM books WHERE product_type = ?',
      [type.value],
    );
    if (Number(count) > 0) {
      return res.status(409).json({
        ok: false,
        message: `${count} product${Number(count) === 1 ? '' : 's'} use this type. Reassign them first.`,
        in_use: Number(count),
      });
    }

    await pool.query('DELETE FROM product_types WHERE id = ?', [req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete product type', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── PARTNER LOGOS (home page trusted-by) ─────────────────
// Admins manage these from /admin/partner-logos.
// ═══════════════════════════════════════════════════════════

function normalizePartnerLogoPayload(payload = {}, fallbackId = null) {
  const slugify = (raw) => String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 60);
  const name = String(payload.name || '').trim();
  const derivedId = slugify(name);
  return {
    id: String(payload.id || fallbackId || `pl_${derivedId || Date.now().toString(36)}`),
    name,
    logo_url: payload.logo_url ? String(payload.logo_url).trim() : null,
    website_url: payload.website_url ? String(payload.website_url).trim() : null,
    is_active: payload.is_active === false || payload.is_active === 0 || payload.is_active === '0' ? 0 : 1,
    sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 100,
  };
}

function mapPartnerLogoRow(row) {
  if (!row) return row;
  return {
    ...row,
    is_active: Boolean(Number(row.is_active)),
    sort_order: Number(row.sort_order ?? 100),
  };
}

app.get('/api/partner-logos', async (req, res) => {
  try {
    const includeInactive = String(req.query?.all || '').toLowerCase() === '1'
      || String(req.query?.all || '').toLowerCase() === 'true';
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    const [rows] = await pool.query(
      `SELECT * FROM partner_logos ${where} ORDER BY sort_order ASC, name ASC`,
    );
    return res.json({ ok: true, data: rows.map(mapPartnerLogoRow) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch partner logos', error: error.message });
  }
});

app.post('/api/partner-logos/upload', async (req, res) => {
  try {
    const image = req.body?.image;
    if (!image) {
      return res.status(400).json({ ok: false, message: 'Image data is required.' });
    }
    const url = await persistImageIfNeeded(image, req, { folder: 'partner-logos', prefix: 'partner-logo' });
    if (!url || String(url).startsWith('data:')) {
      return res.status(400).json({ ok: false, message: 'Invalid image payload.' });
    }
    const relative = String(url).includes('/uploads/')
      ? `/uploads/${String(url).split('/uploads/')[1]}`
      : url;
    return res.json({ ok: true, url: relative });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to upload logo', error: error.message });
  }
});

// Site section images (hero, about, CTA, etc.) edited from /admin/sections.
app.post('/api/site-images/upload', async (req, res) => {
  try {
    const image = req.body?.image;
    if (!image) {
      return res.status(400).json({ ok: false, message: 'Image data is required.' });
    }
    const url = await persistImageIfNeeded(image, req, { folder: 'site', prefix: 'site' });
    if (!url || String(url).startsWith('data:')) {
      return res.status(400).json({ ok: false, message: 'Invalid image payload.' });
    }
    const relative = String(url).includes('/uploads/')
      ? `/uploads/${String(url).split('/uploads/')[1]}`
      : url;
    return res.json({ ok: true, url: relative });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to upload image', error: error.message });
  }
});

app.post('/api/partner-logos', async (req, res) => {
  try {
    const payload = normalizePartnerLogoPayload(req.body || {});
    if (!payload.name) {
      return res.status(400).json({ ok: false, message: 'Organization name is required.' });
    }
    await pool.query(
      `INSERT INTO partner_logos (id, name, logo_url, website_url, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payload.id, payload.name, payload.logo_url, payload.website_url, payload.is_active, payload.sort_order],
    );
    const [[row]] = await pool.query('SELECT * FROM partner_logos WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: mapPartnerLogoRow(row) });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'A partner with that id already exists.' });
    }
    return res.status(500).json({ ok: false, message: 'Failed to create partner logo', error: error.message });
  }
});

app.put('/api/partner-logos/:id', async (req, res) => {
  try {
    const payload = normalizePartnerLogoPayload({ ...(req.body || {}), id: req.params.id }, req.params.id);
    if (!payload.name) {
      return res.status(400).json({ ok: false, message: 'Organization name is required.' });
    }
    const [result] = await pool.query(
      `UPDATE partner_logos SET name=?, logo_url=?, website_url=?, is_active=?, sort_order=?
       WHERE id=?`,
      [payload.name, payload.logo_url, payload.website_url, payload.is_active, payload.sort_order, payload.id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'Partner logo not found.' });
    }
    const [[row]] = await pool.query('SELECT * FROM partner_logos WHERE id = ?', [payload.id]);
    return res.json({ ok: true, data: mapPartnerLogoRow(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update partner logo', error: error.message });
  }
});

app.delete('/api/partner-logos/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM partner_logos WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'Partner logo not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete partner logo', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── MENU ITEMS (main nav + footer) ───────────────────────
// Admins manage these from /admin/menu.
// ═══════════════════════════════════════════════════════════

function normalizeMenuItemPayload(payload = {}, fallbackId = null) {
  const slugify = (raw) => String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 50);
  const label = String(payload.label || '').trim();
  const location = String(payload.location || 'main').trim().toLowerCase();
  const derivedId = slugify(label);
  return {
    id: String(payload.id || fallbackId || `mi_${location}_${derivedId || Date.now().toString(36)}`),
    location: MENU_LOCATIONS.includes(location) ? location : 'main',
    label,
    url: String(payload.url || '/').trim() || '/',
    parent_id: payload.parent_id ? String(payload.parent_id).trim() : null,
    sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 100,
    is_visible: payload.is_visible === false || payload.is_visible === 0 || payload.is_visible === '0' ? 0 : 1,
    badge: payload.badge === true || payload.badge === 1 || payload.badge === '1' ? 1 : 0,
    open_in_new_tab: payload.open_in_new_tab === true || payload.open_in_new_tab === 1 || payload.open_in_new_tab === '1' ? 1 : 0,
  };
}

function mapMenuItemRow(row) {
  if (!row) return row;
  return {
    ...row,
    sort_order: Number(row.sort_order ?? 100),
    is_visible: Boolean(Number(row.is_visible)),
    badge: Boolean(Number(row.badge)),
    open_in_new_tab: Boolean(Number(row.open_in_new_tab)),
  };
}

app.get('/api/menu-items', async (req, res) => {
  try {
    const includeHidden = String(req.query?.all || '').toLowerCase() === '1'
      || String(req.query?.all || '').toLowerCase() === 'true';
    const location = String(req.query?.location || '').trim().toLowerCase();
    const clauses = [];
    const params = [];
    if (!includeHidden) {
      clauses.push('is_visible = 1');
    }
    if (location && MENU_LOCATIONS.includes(location)) {
      clauses.push('location = ?');
      params.push(location);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT * FROM menu_items ${where} ORDER BY location ASC, sort_order ASC, label ASC`,
      params,
    );
    return res.json({ ok: true, data: rows.map(mapMenuItemRow) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch menu items', error: error.message });
  }
});

app.put('/api/menu-items/reorder', async (req, res) => {
  try {
    const location = String(req.body?.location || '').trim().toLowerCase();
    const orderedIds = Array.isArray(req.body?.ordered_ids) ? req.body.ordered_ids : [];
    if (!MENU_LOCATIONS.includes(location)) {
      return res.status(400).json({ ok: false, message: 'Valid location is required (main or footer).' });
    }
    if (orderedIds.length === 0) {
      return res.status(400).json({ ok: false, message: 'ordered_ids array is required.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (let index = 0; index < orderedIds.length; index += 1) {
        const id = String(orderedIds[index] || '').trim();
        if (!id) continue;
        await connection.query(
          'UPDATE menu_items SET sort_order = ? WHERE id = ? AND location = ?',
          [(index + 1) * 10, id, location],
        );
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    const [rows] = await pool.query(
      'SELECT * FROM menu_items WHERE location = ? ORDER BY sort_order ASC, label ASC',
      [location],
    );
    return res.json({ ok: true, data: rows.map(mapMenuItemRow) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to reorder menu items', error: error.message });
  }
});

app.post('/api/menu-items', async (req, res) => {
  try {
    const payload = normalizeMenuItemPayload(req.body || {});
    if (!payload.label) {
      return res.status(400).json({ ok: false, message: 'Label is required.' });
    }
    if (payload.parent_id) {
      const [[parent]] = await pool.query('SELECT id, location FROM menu_items WHERE id = ?', [payload.parent_id]);
      if (!parent) {
        return res.status(400).json({ ok: false, message: 'Parent menu item not found.' });
      }
      if (parent.location !== payload.location) {
        return res.status(400).json({ ok: false, message: 'Parent must belong to the same menu.' });
      }
      if (payload.location !== 'main') {
        return res.status(400).json({ ok: false, message: 'Only main menu items can have sub-items.' });
      }
    }
    await pool.query(
      `INSERT INTO menu_items (id, location, label, url, parent_id, sort_order, is_visible, badge, open_in_new_tab)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.id,
        payload.location,
        payload.label,
        payload.url,
        payload.parent_id,
        payload.sort_order,
        payload.is_visible,
        payload.badge,
        payload.open_in_new_tab,
      ],
    );
    const [[row]] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [payload.id]);
    return res.status(201).json({ ok: true, data: mapMenuItemRow(row) });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'A menu item with that id already exists.' });
    }
    return res.status(500).json({ ok: false, message: 'Failed to create menu item', error: error.message });
  }
});

app.put('/api/menu-items/:id', async (req, res) => {
  try {
    if (req.params.id === 'reorder') {
      return res.status(404).json({ ok: false, message: 'Not found.' });
    }
    // Partial update: merge incoming fields over the existing row so that
    // single-field updates (e.g. toggling visibility) don't reset other columns.
    const [[existing]] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ ok: false, message: 'Menu item not found.' });
    }
    const merged = { ...mapMenuItemRow(existing), ...(req.body || {}), id: req.params.id };
    const payload = normalizeMenuItemPayload(merged, req.params.id);
    if (!payload.label) {
      return res.status(400).json({ ok: false, message: 'Label is required.' });
    }
    if (payload.parent_id === payload.id) {
      return res.status(400).json({ ok: false, message: 'An item cannot be its own parent.' });
    }
    if (payload.parent_id) {
      const [[parent]] = await pool.query('SELECT id, location FROM menu_items WHERE id = ?', [payload.parent_id]);
      if (!parent) {
        return res.status(400).json({ ok: false, message: 'Parent menu item not found.' });
      }
      if (parent.location !== payload.location) {
        return res.status(400).json({ ok: false, message: 'Parent must belong to the same menu.' });
      }
    }
    const [result] = await pool.query(
      `UPDATE menu_items SET location=?, label=?, url=?, parent_id=?, sort_order=?, is_visible=?, badge=?, open_in_new_tab=?
       WHERE id=?`,
      [
        payload.location,
        payload.label,
        payload.url,
        payload.parent_id,
        payload.sort_order,
        payload.is_visible,
        payload.badge,
        payload.open_in_new_tab,
        payload.id,
      ],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'Menu item not found.' });
    }
    const [[row]] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [payload.id]);
    return res.json({ ok: true, data: mapMenuItemRow(row) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update menu item', error: error.message });
  }
});

app.delete('/api/menu-items/:id', async (req, res) => {
  try {
    const [[item]] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ ok: false, message: 'Menu item not found.' });

    await pool.query('UPDATE menu_items SET parent_id = NULL WHERE parent_id = ?', [req.params.id]);
    await pool.query('DELETE FROM menu_items WHERE id = ?', [req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete menu item', error: error.message });
  }
});

app.delete('/api/books/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM books WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Book not found.' });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to delete book', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── BOOK ORDERS ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

app.get('/api/books/orders', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM book_orders ORDER BY created_at DESC');
    const parsed = rows.map(row => ({
      ...row,
      items: (() => { try { return typeof row.items === 'string' ? JSON.parse(row.items) : row.items; } catch { return row.items; } })(),
      shipping_address: (() => { try { return typeof row.shipping_address === 'string' ? JSON.parse(row.shipping_address) : row.shipping_address; } catch { return row.shipping_address; } })(),
    }));
    return res.json({ ok: true, data: parsed });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch book orders', error: error.message });
  }
});

app.post('/api/books/orders', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found. Please log in again.' });

    const payload = normalizeBookOrderPayload({
      ...(req.body || {}),
      user_id: authUser.id,
      user_name: authUser.name,
      user_email: authUser.email,
    });
    if (!payload.user_id || !payload.items) {
      return res.status(400).json({ ok: false, message: 'user_id and items are required.' });
    }

    // Recompute subtotal and total from authoritative book prices in the DB
    const items = typeof payload.items === 'string' ? JSON.parse(payload.items) : (payload.items || []);
    if (items.length > 0) {
      const bookIds = [...new Set(items.map((i) => i.bookId).filter(Boolean))];
      if (bookIds.length > 0) {
        const [bookRows] = await pool.query(
          `SELECT id, price FROM books WHERE id IN (${bookIds.map(() => '?').join(', ')})`,
          bookIds,
        );
        const priceMap = Object.fromEntries(bookRows.map((b) => [b.id, Number(b.price || 0)]));
        const computedSubtotal = items.reduce((sum, item) => {
          const unitPrice = priceMap[item.bookId] ?? 0;
          return sum + unitPrice * (Number(item.quantity) || 1);
        }, 0);
        payload.subtotal = computedSubtotal;
        payload.total = computedSubtotal + Number(payload.shipping_cost || 0);
      }
    }

    const placeholders = BOOK_ORDER_FIELDS.map(() => '?').join(', ');
    const updates = BOOK_ORDER_FIELDS.filter((f) => f !== 'id').map((f) => `${f}=VALUES(${f})`).join(', ');
    const values = BOOK_ORDER_FIELDS.map((f) => payload[f]);

    await pool.query(
      `INSERT INTO book_orders (${BOOK_ORDER_FIELDS.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    );

    const [[row]] = await pool.query('SELECT * FROM book_orders WHERE id = ?', [payload.id]);
    const parsed = {
      ...row,
      items: parseBookOrderItems(row),
    };

    if (isReceiptEligible(parsed.payment_status)) {
      try {
        await sendBookOrderReceiptIfNeeded({
          previousOrder: { payment_status: 'unpaid' },
          currentOrder: parsed,
          req,
        });
      } catch (receiptErr) {
        console.warn('[shop/order] Complimentary receipt email failed:', receiptErr.message);
      }
      try {
        await decrementBookOrderStock(parsed.items);
      } catch (stockErr) {
        console.warn('[shop/order] Stock decrement failed:', stockErr.message);
      }
    }

    return res.status(201).json({ ok: true, data: row });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to save book order', error: error.message });
  }
});

async function handleAdminReceiptsList(req, res) {
  try {
    const adminAuth = getAdminAuth(req);
    if (!adminAuth.ok) {
      return res.status(401).json({ ok: false, message: 'Admin authentication required.' });
    }

    const [regRows] = await pool.query(
      'SELECT * FROM event_registrations ORDER BY registered_at DESC LIMIT 500',
    );
    const [orderRows] = await pool.query(
      'SELECT * FROM book_orders ORDER BY created_at DESC LIMIT 500',
    );
    const [cvRows] = await pool.query(
      `SELECT * FROM payment_collections WHERE event_id = ? ORDER BY created_at DESC LIMIT 200`,
      [CV_PRODUCT_EVENT_ID],
    );

    const registrations = regRows
      .map(mapDbRegistration)
      .filter((r) => isReceiptEligible(r.payment_status));
    const orders = orderRows
      .map((row) => ({
        ...row,
        items: parseBookOrderItems(row),
      }))
      .filter((o) => isReceiptEligible(o.payment_status));
    const cvPayments = cvRows
      .filter((c) => isPaidCollectionStatus(c.status))
      .map((collection) => ({
        collection,
        user: {
          name: collection.customer_name,
          email: collection.customer_email,
          phone: collection.customer_phone,
        },
      }));

    return res.json({
      ok: true,
      data: mergeReceiptRecords(registrations, orders, cvPayments),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load receipts', error: error.message });
  }
}

// Backward-compatible alias for older frontend bundles that still call /api/receipts.
app.get('/api/receipts', handleAdminReceiptsList);
app.get('/api/admin/receipts', handleAdminReceiptsList);

app.put('/api/books/orders/:id/status', async (req, res) => {
  try {
    const adminAuth = getAdminAuth(req);
    if (!adminAuth.ok) {
      return res.status(401).json({ ok: false, message: 'Admin authentication required.' });
    }

    const orderId = String(req.params.id || '').trim();
    const { status, payment_status: paymentStatus, payment_reference: paymentReference, payment_method: paymentMethod } = req.body || {};
    if (!status && !paymentStatus) {
      return res.status(400).json({ ok: false, message: 'status or payment_status is required.' });
    }

    const [[existing]] = await pool.query('SELECT * FROM book_orders WHERE id = ?', [orderId]);
    if (!existing) return res.status(404).json({ ok: false, message: 'Order not found.' });

    const updates = [];
    const values = [];
    if (status) {
      updates.push('status = ?');
      values.push(String(status).trim());
    }
    if (paymentStatus) {
      updates.push('payment_status = ?');
      values.push(String(paymentStatus).trim().toLowerCase());
    }
    if (paymentReference != null) {
      updates.push('payment_reference = ?');
      values.push(String(paymentReference).trim());
    }
    if (paymentMethod != null) {
      updates.push('payment_method = ?');
      values.push(String(paymentMethod).trim());
    }

    await pool.query(`UPDATE book_orders SET ${updates.join(', ')} WHERE id = ?`, [...values, orderId]);

    const paidNow = paymentStatus && isReceiptEligible(String(paymentStatus).toLowerCase());
    const wasPaid = isReceiptEligible(existing.payment_status);

    const [[row]] = await pool.query('SELECT * FROM book_orders WHERE id = ?', [orderId]);
    const parsed = {
      ...row,
      items: parseBookOrderItems(row),
      shipping_address: (() => {
        try {
          return typeof row.shipping_address === 'string' ? JSON.parse(row.shipping_address) : row.shipping_address;
        } catch {
          return row.shipping_address;
        }
      })(),
    };

    if (paidNow && !wasPaid) {
      try {
        await decrementBookOrderStock(parsed.items);
      } catch (stockErr) {
        console.warn('[shop/order] Stock decrement failed:', stockErr.message);
      }
      try {
        await sendBookOrderReceiptIfNeeded({
          previousOrder: existing,
          currentOrder: parsed,
          req,
        });
      } catch (receiptErr) {
        console.warn('[shop/order] Receipt email failed:', receiptErr.message);
      }
    }

    return res.json({ ok: true, data: parsed });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update order status', error: error.message });
  }
});

app.get('/api/account/receipts', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found.' });

    const [regRows] = await pool.query(
      'SELECT * FROM event_registrations WHERE user_id = ? ORDER BY registered_at DESC',
      [authUser.id],
    );
    const [orderRows] = await pool.query(
      'SELECT * FROM book_orders WHERE user_id = ? ORDER BY created_at DESC',
      [authUser.id],
    );
    const [cvRows] = await pool.query(
      `SELECT * FROM payment_collections
       WHERE event_id = ? AND LOWER(customer_email) = LOWER(?)
       ORDER BY created_at DESC`,
      [CV_PRODUCT_EVENT_ID, authUser.email],
    );

    const registrations = regRows
      .map(mapDbRegistration)
      .filter((r) => isReceiptEligible(r.payment_status));
    const orders = orderRows
      .map((row) => ({
        ...row,
        items: parseBookOrderItems(row),
        shipping_address: (() => {
          try {
            return typeof row.shipping_address === 'string' ? JSON.parse(row.shipping_address) : row.shipping_address;
          } catch {
            return row.shipping_address;
          }
        })(),
      }))
      .filter((o) => isReceiptEligible(o.payment_status));
    const cvPayments = cvRows
      .filter((c) => isPaidCollectionStatus(c.status))
      .map((collection) => ({ collection, user: authUser }));

    return res.json({
      ok: true,
      data: mergeReceiptRecords(registrations, orders, cvPayments),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load receipts', error: error.message });
  }
});

app.post('/api/books/orders/checkout/mobile-money', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found.' });

    const orderId = String(req.body?.orderId || '').trim();
    const phone = String(req.body?.phone || authUser.phone || '').trim();
    if (!orderId) return res.status(400).json({ ok: false, message: 'orderId is required' });
    if (!phone) return res.status(400).json({ ok: false, message: 'phone is required for mobile money checkout' });

    const [[order]] = await pool.query(
      'SELECT * FROM book_orders WHERE id = ? AND user_id = ? LIMIT 1',
      [orderId, authUser.id],
    );
    if (!order) return res.status(404).json({ ok: false, message: 'Order not found.' });
    if (isReceiptEligible(order.payment_status)) {
      return res.status(400).json({ ok: false, message: 'This order is already paid.' });
    }

    const items = parseBookOrderItems(order);
    const { total: expectedTotal } = await computeBookOrderTotalsFromDb(items, order.shipping_cost);
    if (expectedTotal <= 0) {
      return res.status(400).json({ ok: false, message: 'No payment is due for this order.' });
    }

    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);
    if (lencoConfig.provider !== 'lenco' || !lencoConfig.secretKey) {
      return res.status(400).json({ ok: false, message: 'Payment provider is not configured.' });
    }

    const normalizedPhone = normalizePhone(phone);
    const operator = detectMobileOperator(phone);
    const reference = generatePaymentReference('MM-SHP');
    const customerEmail = String(authUser.email || '').trim();
    const customerName = String(authUser.name || '').trim();

    const payload = {
      amount: expectedTotal,
      phone: normalizedPhone,
      reference,
      currency: String(order.currency || 'ZMW'),
      metadata: {
        orderId,
        product: 'shop_order',
        customerEmail,
        customerName,
      },
    };
    if (operator) payload.operator = operator;

    const result = await lencoRequest({
      method: 'POST',
      path: '/collections/mobile-money',
      secretKey: lencoConfig.secretKey,
      baseUrl: lencoConfig.baseUrl,
      body: payload,
    });

    await upsertPaymentCollection({
      reference,
      event_id: SHOP_ORDER_EVENT_ID,
      event_title: `Shop order ${orderId}`,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: normalizedPhone,
      amount: expectedTotal,
      currency: String(order.currency || 'ZMW'),
      status: normalizeCollectionStatus(result?.status || result?.data?.status || 'pending'),
      channel: 'mobile_money',
      provider: 'lenco',
      provider_response: { ...result, metadata: { orderId } },
    });

    return res.status(201).json({
      ok: true,
      message: 'Mobile money checkout initiated.',
      data: { reference, orderId, status: result?.status || 'pending' },
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Failed to initiate shop checkout', error: error.message });
  }
});

app.post('/api/books/orders/checkout/card-session', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found.' });

    const orderId = String(req.body?.orderId || '').trim();
    if (!orderId) return res.status(400).json({ ok: false, message: 'orderId is required' });

    const [[order]] = await pool.query(
      'SELECT * FROM book_orders WHERE id = ? AND user_id = ? LIMIT 1',
      [orderId, authUser.id],
    );
    if (!order) return res.status(404).json({ ok: false, message: 'Order not found.' });
    if (isReceiptEligible(order.payment_status)) {
      return res.status(400).json({ ok: false, message: 'This order is already paid.' });
    }

    const items = parseBookOrderItems(order);
    const { total: expectedTotal } = await computeBookOrderTotalsFromDb(items, order.shipping_cost);
    if (expectedTotal <= 0) {
      return res.status(400).json({ ok: false, message: 'No payment is due for this order.' });
    }

    const settings = await getSystemSettings();
    const lencoConfig = getLencoConfig(settings);
    if (lencoConfig.provider !== 'lenco' || !lencoConfig.publicKey) {
      return res.status(400).json({ ok: false, message: 'Payment provider is not configured.' });
    }

    const reference = generatePaymentReference('CARD-SHP');
    const customerEmail = String(authUser.email || '').trim();
    const customerName = String(authUser.name || '').trim();
    const customerPhoneNormalized = normalizePhone(authUser.phone || '');
    let customerPhoneWidget = String(authUser.phone || '').trim();
    if (customerPhoneNormalized.startsWith('260') && customerPhoneNormalized.length >= 12) {
      customerPhoneWidget = `0${customerPhoneNormalized.slice(3)}`;
    }

    await upsertPaymentCollection({
      reference,
      event_id: SHOP_ORDER_EVENT_ID,
      event_title: `Shop order ${orderId}`,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhoneNormalized,
      amount: expectedTotal,
      currency: String(order.currency || 'ZMW'),
      status: 'pending',
      channel: 'card',
      provider: 'lenco',
      provider_response: { source: 'card-checkout-session', metadata: { orderId } },
    });

    return res.status(201).json({
      ok: true,
      data: {
        reference,
        orderId,
        amount: expectedTotal,
        currency: String(order.currency || 'ZMW'),
        publicKey: lencoConfig.publicKey,
        widgetUrl: lencoConfig.widgetUrl,
        sandboxMode: lencoConfig.sandboxMode,
        customer: {
          email: customerEmail,
          name: customerName,
          phone: customerPhoneWidget,
        },
        metadata: { orderId, product: 'shop_order' },
      },
    });
  } catch (error) {
    return res.status(502).json({ ok: false, message: 'Failed to prepare card checkout', error: error.message });
  }
});

app.post('/api/books/orders/checkout/complete', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const authUser = await getUserByClaims(auth.claims);
    if (!authUser) return res.status(401).json({ ok: false, message: 'User account not found.' });

    const orderId = String(req.body?.orderId || '').trim();
    const reference = String(req.body?.reference || '').trim();
    if (!orderId || !reference) {
      return res.status(400).json({ ok: false, message: 'orderId and reference are required' });
    }

    const [[order]] = await pool.query(
      'SELECT * FROM book_orders WHERE id = ? AND user_id = ? LIMIT 1',
      [orderId, authUser.id],
    );
    if (!order) return res.status(404).json({ ok: false, message: 'Order not found.' });

    const [[collection]] = await pool.query(
      'SELECT * FROM payment_collections WHERE reference = ? AND event_id = ? LIMIT 1',
      [reference, SHOP_ORDER_EVENT_ID],
    );
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'Shop payment not found.' });
    }
    if (String(collection.customer_email || '').toLowerCase() !== String(authUser.email || '').toLowerCase()) {
      return res.status(403).json({ ok: false, message: 'Payment does not match your account.' });
    }

    let metaOrderId = '';
    try {
      const pr = typeof collection.provider_response === 'string'
        ? JSON.parse(collection.provider_response)
        : collection.provider_response;
      metaOrderId = String(pr?.metadata?.orderId || pr?.data?.metadata?.orderId || '').trim();
    } catch {
      metaOrderId = '';
    }
    if (metaOrderId && metaOrderId !== orderId) {
      return res.status(403).json({ ok: false, message: 'Payment reference does not match this order.' });
    }

    const settings = await getSystemSettings();
    let status = normalizeCollectionStatus(collection.status);
    if (!isPaidCollectionStatus(status)) {
      const lencoConfig = getLencoConfig(settings);
      if (lencoConfig.secretKey) {
        const result = await lencoRequest({
          method: 'GET',
          path: `/collections/status/${encodeURIComponent(reference)}`,
          secretKey: lencoConfig.secretKey,
          baseUrl: lencoConfig.baseUrl,
        });
        status = normalizeCollectionStatus(
          result?.data?.data?.status
          || result?.data?.status
          || result?.status
          || status,
        );
        await upsertPaymentCollection({
          reference,
          status,
          provider_response: result,
        });
      }
    }

    if (!isPaidCollectionStatus(status)) {
      return res.status(402).json({ ok: false, message: 'Payment not completed yet.' });
    }

    const paymentMethod = String(collection.channel || '') === 'mobile_money'
      ? 'mobile_money'
      : String(collection.channel || '') === 'card'
        ? 'card'
        : 'online';

    const finalized = await finalizePaidBookOrder({
      orderId,
      reference,
      paymentMethod,
      req,
      decrementStock: true,
    });
    if (!finalized.ok) {
      return res.status(finalized.status || 500).json({ ok: false, message: finalized.message });
    }

    return res.json({ ok: true, data: { order: finalized.order } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to complete shop checkout.', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── EVENT CERTIFICATES ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

let isProcessingCertificates = false;

function getCertificateDeps() {
  return {
    getSystemSettings,
    sendEmailWithAttachments: (opts) => sendEmailNotification(opts),
  };
}

async function runCertificateJob() {
  if (isProcessingCertificates) return;
  isProcessingCertificates = true;
  try {
    const summary = await processEndedEventCertificates(pool, __appRoot, getCertificateDeps());
    console.log('[certificates] scheduled job:', summary);
  } catch (error) {
    console.error('[certificates] scheduled job failed:', error.message);
  } finally {
    isProcessingCertificates = false;
  }
}

function canAccessCertificate(req, cert) {
  const adminAuth = getAdminAuth(req);
  if (adminAuth.ok) return true;
  const jwtAuth = getJwtAuth(req);
  if (jwtAuth.ok && String(jwtAuth.claims.sub) === String(cert.user_id)) return true;
  return false;
}

app.get('/api/certificates/verify/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code || !/^MM-CERT-[A-Z0-9]+$/.test(code)) {
      return res.status(400).json({ ok: false, message: 'Invalid certificate code.' });
    }
    const [[row]] = await pool.query(
      'SELECT certificate_code, attendee_name, event_title, issued_at, revoked FROM event_certificates WHERE certificate_code = ? LIMIT 1',
      [code],
    );
    if (!row || row.revoked) {
      return res.json({ ok: true, valid: false });
    }
    return res.json({
      ok: true,
      valid: true,
      data: {
        certificateCode: row.certificate_code,
        attendeeName: row.attendee_name,
        eventTitle: row.event_title,
        issuedAt: row.issued_at,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Verification failed.', error: error.message });
  }
});

app.get('/api/certificates/me', async (req, res) => {
  try {
    const auth = getJwtAuth(req);
    if (!auth.ok) return sendAuthFailure(res, auth);

    const [rows] = await pool.query(
      `SELECT * FROM event_certificates
       WHERE user_id = ? AND revoked = 0
       ORDER BY issued_at DESC`,
      [auth.claims.sub],
    );
    return res.json({ ok: true, data: rows.map(mapDbCertificate) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load certificates.', error: error.message });
  }
});

async function findCertificateForDownload(key) {
  const lookup = String(key || '').trim();
  if (!lookup) return null;

  let [[row]] = await pool.query('SELECT * FROM event_certificates WHERE id = ? LIMIT 1', [lookup]);
  if (!row && /^MM-CERT-[A-Z0-9]+$/i.test(lookup)) {
    [[row]] = await pool.query(
      'SELECT * FROM event_certificates WHERE certificate_code = ? LIMIT 1',
      [lookup.toUpperCase()],
    );
  }
  return row || null;
}

app.get('/api/certificates/:id/download', async (req, res) => {
  try {
    const row = await findCertificateForDownload(req.params.id);
    if (!row || row.revoked) {
      return res.status(404).json({ ok: false, message: 'Certificate not found.' });
    }
    if (!canAccessCertificate(req, row)) {
      return res.status(403).json({ ok: false, message: 'Forbidden.' });
    }

    let absolutePath;
    try {
      absolutePath = await ensureCertificatePdfOnDisk(row, __appRoot, pool);
    } catch (fileError) {
      console.error('[certificates/download] PDF ensure failed:', fileError.message);
      return res.status(500).json({ ok: false, message: 'Could not load certificate PDF.' });
    }

    const pdfBuffer = await fs.readFile(absolutePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Certificate-${row.certificate_code}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('[certificates/download]', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to download certificate.', error: error.message });
  }
});

app.get('/api/admin/certificates/stats', async (_req, res) => {
  try {
    const [[stats]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(email_status = 'sent') AS emailed,
        SUM(email_status = 'pending') AS pending_email,
        COUNT(DISTINCT event_id) AS events_covered
      FROM event_certificates
      WHERE revoked = 0
    `);
    return res.json({
      ok: true,
      data: {
        total: Number(stats?.total || 0),
        emailed: Number(stats?.emailed || 0),
        pendingEmail: Number(stats?.pending_email || 0),
        eventsCovered: Number(stats?.events_covered || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load certificate stats.', error: error.message });
  }
});

app.get('/api/admin/certificates', async (req, res) => {
  try {
    const { event_id: eventId, user_id: userId, email_status: emailStatus, q = '' } = req.query;
    const clauses = ['c.revoked = 0'];
    const params = [];

    if (eventId) {
      clauses.push('c.event_id = ?');
      params.push(eventId);
    }
    if (userId) {
      clauses.push('c.user_id = ?');
      params.push(userId);
    }
    if (emailStatus && emailStatus !== 'all') {
      clauses.push('c.email_status = ?');
      params.push(emailStatus);
    }
    const term = String(q || '').trim();
    if (term) {
      clauses.push(`(
        c.certificate_code LIKE ? OR c.attendee_name LIKE ? OR c.attendee_email LIKE ?
        OR c.event_title LIKE ?
      )`);
      const like = `%${term}%`;
      params.push(like, like, like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT c.* FROM event_certificates c ${where} ORDER BY c.issued_at DESC LIMIT 500`,
      params,
    );
    return res.json({ ok: true, data: rows.map(mapDbCertificate) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load certificates.', error: error.message });
  }
});

app.get('/api/admin/users/:id/certificates', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM event_certificates
       WHERE user_id = ? AND revoked = 0
       ORDER BY issued_at DESC`,
      [req.params.id],
    );
    return res.json({ ok: true, data: rows.map(mapDbCertificate) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load user certificates.', error: error.message });
  }
});

app.post('/api/admin/certificates/:id/resend-email', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM event_certificates WHERE id = ?', [req.params.id]);
    if (!row || row.revoked) {
      return res.status(404).json({ ok: false, message: 'Certificate not found.' });
    }
    const outcome = await sendCertificateEmailForRow(
      pool,
      mapDbCertificate(row),
      __appRoot,
      (opts) => sendEmailNotification(opts),
      getSystemSettings,
    );
    return res.json({ ok: true, data: outcome });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to resend certificate email.', error: error.message });
  }
});

app.post('/api/admin/events/:eventId/certificates/generate', async (req, res) => {
  try {
    const result = await processEventCertificates(
      pool,
      req.params.eventId,
      __appRoot,
      getCertificateDeps(),
    );
    if (!result.ok) {
      return res.status(400).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true, data: result });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to generate certificates.', error: error.message });
  }
});

// ─── Certificate templates (per-event designer) ─────────────────────────────

function getAppOriginFromRequest(req) {
  const configured = String(process.env.APP_ORIGIN || process.env.VITE_APP_ORIGIN || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

async function persistCertificateImage(value, req) {
  return persistImageIfNeeded(value, req, { folder: 'certificates', prefix: 'cert' });
}

app.get('/api/admin/events/:eventId/certificate-template', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const [[evt]] = await pool.query('SELECT id, title FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!evt) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const template = await getTemplateForEvent(pool, eventId);
    return res.json({
      ok: true,
      data: {
        configured: Boolean(template),
        template,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to load certificate template.', error: error.message });
  }
});

app.post('/api/admin/events/:eventId/certificate-template/activate', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const [[evt]] = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!evt) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const adminUserId = req.adminUser?.sub || req.adminUser?.id || null;
    const outcome = await activateOrCreateTemplate(pool, eventId, adminUserId, evt);

    return res.json({
      ok: true,
      data: {
        template: outcome.template,
        created: outcome.created,
        redirectPath: `/admin/events/${eventId}/certificate-designer`,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to activate certificate template.', error: error.message });
  }
});

app.put('/api/admin/events/:eventId/certificate-template', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const [[evt]] = await pool.query('SELECT id FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!evt) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const result = await saveTemplateDraft(pool, eventId, req.body || {}, {
      persistImage: (value) => persistCertificateImage(value, req),
    });
    if (!result.ok) {
      return res.status(400).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true, data: result.template });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to save certificate template.', error: error.message });
  }
});

app.post('/api/admin/events/:eventId/certificate-template/preview', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const [[evt]] = await pool.query('SELECT id FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!evt) return res.status(404).json({ ok: false, message: 'Event not found.' });

    if (req.body?.design_json) {
      await saveTemplateDraft(pool, eventId, req.body, {
        persistImage: (value) => persistCertificateImage(value, req),
      });
    }

    const preview = await generateTemplatePreviewPdf(
      pool,
      eventId,
      __appRoot,
      getAppOriginFromRequest(req),
    );
    if (!preview.ok) {
      return res.status(400).json({ ok: false, message: preview.message });
    }
    if (!isValidCertificatePdfBuffer(preview.buffer)) {
      return res.status(500).json({ ok: false, message: 'Preview PDF generation failed.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${preview.filename}"`);
    return res.send(preview.buffer);
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to generate certificate preview.', error: error.message });
  }
});

app.post('/api/admin/events/:eventId/certificate-template/publish', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const [[evt]] = await pool.query('SELECT id FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!evt) return res.status(404).json({ ok: false, message: 'Event not found.' });

    if (req.body?.design_json) {
      await saveTemplateDraft(pool, eventId, req.body, {
        persistImage: (value) => persistCertificateImage(value, req),
      });
    }

    const result = await publishTemplate(pool, eventId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, message: result.message, errors: result.errors || [] });
    }
    return res.json({ ok: true, data: result.template });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to publish certificate template.', error: error.message });
  }
});

app.post('/api/admin/events/:eventId/certificate-template/deactivate', async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    const [[evt]] = await pool.query('SELECT id FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (!evt) return res.status(404).json({ ok: false, message: 'Event not found.' });

    const result = await deactivateTemplate(pool, eventId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, message: result.message });
    }
    return res.json({ ok: true, data: result.template });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to deactivate certificate template.', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── SHIPPING CONFIG ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════

app.get('/api/shipping/config', async (_req, res) => {
  try {
    const [[row]] = await pool.query('SELECT data FROM system_settings WHERE id = 1');
    let stored = {};
    if (row) {
      try { stored = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}); } catch { stored = {}; }
    }
    const merged = mergeSystemSettings(stored);
    return res.json({ ok: true, data: merged.shipping || SYSTEM_SETTINGS_DEFAULTS.shipping });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to fetch shipping config', error: error.message });
  }
});

app.put('/api/shipping/config', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT data FROM system_settings WHERE id = 1');
    let stored = {};
    if (row) {
      try { stored = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}); } catch { stored = {}; }
    }
    stored.shipping = { ...SYSTEM_SETTINGS_DEFAULTS.shipping, ...(req.body || {}) };
    await pool.query(
      'INSERT INTO system_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [JSON.stringify(stored)],
    );
    return res.json({ ok: true, data: stored.shipping });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Failed to update shipping config', error: error.message });
  }
});

// ─── Serve frontend in production ────────────────────────────────────────────
const DIST_DIR = path.resolve(__serverDirname, '..', 'dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(DIST_DIR));

  // SPA catch-all: serve index.html for any non-API route
  app.get(/^(?!\/api\/)(?!\/uploads\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

function isPassengerRuntime() {
  return (
    typeof PhusionPassenger !== 'undefined'
    || Boolean(process.env.PASSENGER_APP_ENV)
    || Boolean(process.env.PHUSION_PASSENGER)
  );
}

app.use((err, req, res, next) => {
  if (err?.message?.includes('CORS not allowed')) {
    return res.status(403).json({ ok: false, message: 'Cross-origin request not allowed.' });
  }
  console.error('[api] Unhandled error:', err?.message || err);
  if (res.headersSent) return next(err);
  return res.status(500).json(apiErrorPayload(IS_PRODUCTION, err, 'An unexpected error occurred.'));
});

function startHttpServer() {
  if (isPassengerRuntime()) {
    // cPanel LiteSpeed Passenger — bind to Passenger socket, not a TCP port.
    if (typeof PhusionPassenger !== 'undefined') {
      PhusionPassenger.configure({ autoInstall: false });
    }
    app.listen('passenger', () => {
      console.log('[mutale-api] Listening via Passenger');
    });
    return;
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

ensureSchema()
  .then(() => seedDefaultAdmin())
  .then(() => seedRbac(pool))
  .then(() => {
    setTimeout(() => { void runCertificateJob(); }, 30_000);
    setInterval(() => { void runCertificateJob(); }, 60 * 60 * 1000);
    startHttpServer();
  })
  .catch((error) => {
    console.error('Failed to initialize database schema:', error.message);
    if (error?.stack) console.error(error.stack);
    process.exit(1);
  });
