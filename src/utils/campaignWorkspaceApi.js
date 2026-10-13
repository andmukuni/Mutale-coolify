import { getApiBase } from "./apiBase";
import { getAdminAuthHeaders } from "./authHeaders";

export async function campaignRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${getApiBase()}/admin/campaigns${path}`, {
    method,
    headers: getAdminAuthHeaders(
      body ? { "Content-Type": "application/json" } : {},
    ),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false)
    throw new Error(result.message || "Unable to complete campaign request.");
  return result.data;
}

export const campaignDirectory = () => campaignRequest("/directory");
export const campaignPreview = (id) =>
  campaignRequest(`/${encodeURIComponent(id)}/preview`);
export const campaignReview = (id) =>
  campaignRequest(`/${encodeURIComponent(id)}/review`);
export const campaignAction = (id, action, body = {}) =>
  campaignRequest(`/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body,
  });
export const campaignDashboard = (period) =>
  campaignRequest(`/dashboard?period=${encodeURIComponent(period)}`);

export async function downloadCampaignReport(id, outcome = "") {
  const response = await fetch(
    `${getApiBase()}/admin/campaigns/${encodeURIComponent(id)}/report/export?outcome=${encodeURIComponent(outcome)}`,
    { headers: getAdminAuthHeaders() },
  );
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || "Unable to export report.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `campaign-${id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename, headers, rows) {
  const escape = (value) =>
    `"${String(value ?? "")
      .replace(/^(\s*[=+@-])/, "'$1")
      .replaceAll('"', '""')}"`;
  const blob = new Blob(
    [
      "\ufeff" +
        [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseContactCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  const headers = (rows.shift() || []).map((value) =>
    value
      .replace(/^\ufeff/, "")
      .trim()
      .toLowerCase()
      .replaceAll(" ", "_"),
  );
  if (!headers.includes("email") && !headers.includes("email_normalized"))
    throw new Error("CSV needs an email column.");
  return rows.map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        header === "marketing_opt_in"
          ? ["true", "1", "yes"].includes(String(row[index]).toLowerCase())
          : row[index] || "",
      ]),
    ),
  );
}
