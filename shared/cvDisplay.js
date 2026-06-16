/**
 * Human-readable CV reference for admin lists (not a stored DB id).
 */
export function formatCvDisplayId(userId = '', unlockedAt = '') {
  const suffix = String(userId).replace(/^usr-/, '').slice(-8).toUpperCase() || '00000000';
  const d = unlockedAt ? new Date(unlockedAt) : new Date();
  if (Number.isNaN(d.getTime())) return `CV-${suffix}`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `CV-${y}${m}-${suffix}`;
}
