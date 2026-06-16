import {
  CERTIFICATE_BUNDLED_LOGO_SRC,
  CERTIFICATE_ACHIEVEMENT_FRAME_SRC,
} from '../../shared/certificateBundledAssets.js';
import { getCertificateSealPreviewUrlBySrc } from '../../shared/certificateSeals.js';
import certificateLogo from '../../Logo-Website-Mutale_Main - Navy and Teal.png';
import achievementFrame from '../../shared/assets/certificate-achievement-frame.png';

/**
 * Resolve image src for canvas preview (bundled logo token → Vite asset URL).
 * @param {string} src
 */
export function resolveCertificateImageSrc(src) {
  if (src === CERTIFICATE_BUNDLED_LOGO_SRC) return certificateLogo;
  const sealPreview = getCertificateSealPreviewUrlBySrc(src);
  if (sealPreview) return sealPreview;
  return src || '';
}

/**
 * Resolve bundled background frame for canvas preview.
 * @param {string} src
 */
export function resolveCertificateBackgroundPreviewUrl(src) {
  if (src === CERTIFICATE_ACHIEVEMENT_FRAME_SRC) return achievementFrame;
  return '';
}
