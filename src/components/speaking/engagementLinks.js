/** The engagement's own page on this site. */
export function engagementPath(engagement) {
  return `/speaking/${encodeURIComponent(engagement.id)}`;
}
