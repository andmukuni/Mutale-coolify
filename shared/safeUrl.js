/**
 * @param {unknown} url
 * @returns {string} Safe http(s) URL or empty string
 */
export function safeExternalUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}
