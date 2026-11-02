/**
 * Counts for the Speaking page (brief §9): daily totals only. Nothing that
 * identifies a visitor is stored (no IP address, cookie or user id), and the
 * browser sends a count only after the visitor has accepted analytics cookies.
 * Enquiry submissions are counted from speaking_enquiries itself.
 */
const TABLE = 'speaking_metrics';

export const SPEAKING_METRICS = ['event_website_click', 'calendar_add', 'media_click', 'profile_download'];
const PER_ENGAGEMENT = new Set(['event_website_click', 'calendar_add', 'media_click']);
export const METRICS_RECENT_DAYS = 30;

/** @returns {{ metric: string, engagementId: string } | { error: string }} */
export function normalizeMetric(input = {}) {
  const metric = String(input.metric || '').trim();
  if (!SPEAKING_METRICS.includes(metric)) return { error: 'Unknown metric.' };
  if (!PER_ENGAGEMENT.has(metric)) return { metric, engagementId: '' };
  const engagementId = String(input.engagement_id || '').trim();
  if (!engagementId || engagementId.length > 90) return { error: 'An engagement is required.' };
  return { metric, engagementId };
}

export function isEngagementMetric(metric) {
  return PER_ENGAGEMENT.has(metric);
}

export async function recordMetric(pool, { metric, engagementId }) {
  await pool.query(
    `INSERT INTO ${TABLE} (metric, engagement_id, day, total) VALUES (?, ?, CURDATE(), 1)
     ON DUPLICATE KEY UPDATE total = total + 1`,
    [metric, engagementId],
  );
}

const emptyCount = () => ({ total: 0, recent: 0 });

/**
 * Totals for the admin, all time and over the last METRICS_RECENT_DAYS days:
 * { days, page: { profile_download, enquiries }, engagements: { [id]: { [metric]: count } } }
 */
export async function summarizeMetrics(pool) {
  const days = METRICS_RECENT_DAYS;
  const [rows] = await pool.query(
    `SELECT metric, engagement_id, SUM(total) AS total,
       SUM(CASE WHEN day >= DATE_SUB(CURDATE(), INTERVAL ? DAY) THEN total ELSE 0 END) AS recent
     FROM ${TABLE} GROUP BY metric, engagement_id`,
    [days],
  );
  const [[enquiries]] = await pool.query(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 ELSE 0 END) AS recent
     FROM speaking_enquiries`,
    [days],
  );

  const summary = {
    days,
    page: { profile_download: emptyCount(), enquiries: emptyCount() },
    engagements: {},
  };
  summary.page.enquiries = { total: Number(enquiries?.total || 0), recent: Number(enquiries?.recent || 0) };
  for (const row of rows) {
    const count = { total: Number(row.total || 0), recent: Number(row.recent || 0) };
    if (!PER_ENGAGEMENT.has(row.metric)) {
      if (row.metric in summary.page) summary.page[row.metric] = count;
      continue;
    }
    const target = summary.engagements[row.engagement_id] || (summary.engagements[row.engagement_id] = {});
    target[row.metric] = count;
  }
  return summary;
}
