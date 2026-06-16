import { getApiBase, getAppOrigin } from './apiBase';
import { getAdminAuthHeaders, getSessionAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

export async function fetchMyCertificates() {
  const res = await fetch(`${API_BASE}/certificates/me`, {
    headers: getSessionAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load certificates.');
  }
  return json.data || [];
}

function resolveCertificateKey(certificateRef) {
  if (!certificateRef) return '';
  if (typeof certificateRef === 'string') return certificateRef.trim();
  return String(certificateRef.id || certificateRef.certificate_code || '').trim();
}

export function getCertificateDownloadUrl(certificateRef) {
  const key = resolveCertificateKey(certificateRef);
  return `${API_BASE}/certificates/${encodeURIComponent(key)}/download`;
}

/** Public PDF URL from stored path (served under /uploads). */
export function getCertificatePdfAssetUrl(certificate) {
  const raw = String(certificate?.pdf_path || '').trim();
  if (!raw) return '';
  const relative = raw.replace(/^\/+/, '').replace(/^uploads\//, '');
  const origin = getAppOrigin();
  return `${origin}/uploads/${relative}`;
}

export function getCertificateVerifyUrl(certificateCode) {
  return `${API_BASE}/certificates/verify/${encodeURIComponent(certificateCode)}`;
}

export async function fetchAdminCertificates(params = {}) {
  const qs = new URLSearchParams();
  if (params.event_id) qs.set('event_id', params.event_id);
  if (params.user_id) qs.set('user_id', params.user_id);
  if (params.email_status) qs.set('email_status', params.email_status);
  if (params.q) qs.set('q', params.q);

  const res = await fetch(`${API_BASE}/admin/certificates?${qs.toString()}`, {
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load certificates.');
  }
  return json.data || [];
}

export async function fetchAdminCertificateStats() {
  const res = await fetch(`${API_BASE}/admin/certificates/stats`, {
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load certificate stats.');
  }
  return json.data || {};
}

export async function fetchAdminUserCertificates(userId) {
  const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}/certificates`, {
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load user certificates.');
  }
  return json.data || [];
}

export async function resendCertificateEmail(certificateId) {
  const res = await fetch(`${API_BASE}/admin/certificates/${encodeURIComponent(certificateId)}/resend-email`, {
    method: 'POST',
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to resend email.');
  }
  return json.data;
}

// ─── Certificate templates (per-event) ───────────────────────────────────────

export async function fetchEventCertificateTemplate(eventId) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/certificate-template`, {
    headers: getAdminAuthHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to load certificate template.');
  }
  return json.data || { configured: false, template: null };
}

export async function activateEventCertificateTemplate(eventId) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/certificate-template/activate`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to activate certificate.');
  }
  return json.data;
}

export async function saveEventCertificateTemplate(eventId, payload) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/certificate-template`, {
    method: 'PUT',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to save certificate template.');
  }
  return json.data;
}

export async function publishEventCertificateTemplate(eventId, payload = {}) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/certificate-template/publish`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const err = new Error(json?.message || 'Failed to publish certificate template.');
    err.errors = json?.errors || [];
    throw err;
  }
  return json.data;
}

export async function deactivateEventCertificateTemplate(eventId) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/certificate-template/deactivate`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to deactivate certificate template.');
  }
  return json.data;
}

export async function previewEventCertificateTemplate(eventId, payload = {}) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/certificate-template/preview`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/pdf' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || `Preview failed (${res.status}).`);
  }
  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength) throw new Error('Preview PDF is empty.');
  return new Blob([buffer], { type: 'application/pdf' });
}

export async function generateEventCertificates(eventId) {
  const res = await fetch(`${API_BASE}/admin/events/${encodeURIComponent(eventId)}/certificates/generate`, {
    method: 'POST',
    headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Failed to generate certificates.');
  }
  return json.data;
}

export function getPublicCertificateVerifyPageUrl(certificateCode) {
  const origin = getAppOrigin();
  return `${origin}/certificates/verify/${encodeURIComponent(certificateCode)}`;
}

function isPdfBytes(buffer) {
  if (!buffer || buffer.byteLength < 5) return false;
  const bytes = new Uint8Array(buffer.slice(0, 5));
  return (
    bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d
  );
}

async function readDownloadErrorMessage(res) {
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const json = await res.json().catch(() => ({}));
    return json?.message || `Download failed (${res.status}).`;
  }
  const text = await res.text().catch(() => '');
  if (text) return text.slice(0, 240);
  return `Download failed (${res.status}).`;
}

export async function downloadCertificateBlob(certificateRef, headers = null) {
  const authHeaders = headers || getSessionAuthHeaders();
  const url = getCertificateDownloadUrl(certificateRef);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/pdf',
      ...authHeaders,
    },
  });

  if (!res.ok) {
    throw new Error(await readDownloadErrorMessage(res));
  }

  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error('Certificate file is empty.');
  }

  if (!isPdfBytes(buffer)) {
    throw new Error('The server did not return a valid PDF. Please sign in again and retry.');
  }

  return new Blob([buffer], { type: 'application/pdf' });
}

function openPdfBlobInNewTab(blob, filename = 'certificate.pdf') {
  const url = URL.createObjectURL(blob);
  const popup = window.open('', '_blank');
  if (popup) {
    popup.document.title = filename;
    popup.document.body.style.margin = '0';
    const embed = popup.document.createElement('embed');
    embed.setAttribute('type', 'application/pdf');
    embed.setAttribute('src', url);
    embed.style.width = '100%';
    embed.style.height = '100vh';
    popup.document.body.appendChild(embed);
    popup.addEventListener('beforeunload', () => URL.revokeObjectURL(url));
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return true;
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return false;
}

function openPdfAssetUrl(assetUrl) {
  const opened = window.open(assetUrl, '_blank', 'noopener,noreferrer');
  return Boolean(opened);
}

export async function openCertificatePdf(certificateRef, headers, filename = 'certificate.pdf') {
  const cert = typeof certificateRef === 'object' ? certificateRef : null;

  try {
    const blob = await downloadCertificateBlob(certificateRef, headers);
    const opened = openPdfBlobInNewTab(blob, filename);
    if (!opened) {
      await saveCertificatePdf(certificateRef, headers, filename);
    }
    return;
  } catch (apiError) {
    const assetUrl = cert ? getCertificatePdfAssetUrl(cert) : '';
    if (assetUrl) {
      const probe = await fetch(assetUrl, { method: 'HEAD' }).catch(() => null);
      if (probe?.ok) {
        openPdfAssetUrl(assetUrl);
        return;
      }
    }
    throw apiError;
  }
}

export async function saveCertificatePdf(certificateRef, headers, filename = 'certificate.pdf') {
  const cert = typeof certificateRef === 'object' ? certificateRef : null;

  try {
    const blob = await downloadCertificateBlob(certificateRef, headers);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  } catch (apiError) {
    const assetUrl = cert ? getCertificatePdfAssetUrl(cert) : '';
    if (assetUrl) {
      const probe = await fetch(assetUrl, { method: 'HEAD' }).catch(() => null);
      if (probe?.ok) {
        const anchor = document.createElement('a');
        anchor.href = assetUrl;
        anchor.download = filename;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.click();
        return;
      }
    }
    throw apiError;
  }
}
