/** True when the browser is likely a phone (Zoom Web SDK has limited mobile support). */
export function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/** Whether the join-auth payload supports in-page Zoom Component View. */
export function canEmbedZoomJoin({ joinMode, embedAvailable, auth } = {}) {
  if (String(joinMode || '').toLowerCase() === 'redirect') return false;
  if (embedAvailable === false) return false;
  const a = auth || {};
  return Boolean(a.signature && a.sdkKey && a.meetingNumber);
}

export function openZoomJoinUrl(joinUrl) {
  const url = String(joinUrl || '').trim();
  if (!url) return false;
  const newTab = window.open(url, '_blank', 'noopener,noreferrer');
  if (!newTab) {
    window.location.assign(url);
  }
  return true;
}
