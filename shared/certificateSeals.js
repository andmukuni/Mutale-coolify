import { CERTIFICATE_BUNDLED_LOGO_SRC } from './certificateBundledAssets.js';
import { getCertificateSealSvg, encodeSvgDataUrl } from './certificateSealArt.js';

export const CERTIFICATE_SEAL_MUTALE_LOGO = CERTIFICATE_BUNDLED_LOGO_SRC;
export const CERTIFICATE_SEAL_GOLD_ROUND = 'bundled:seal-gold-round';
export const CERTIFICATE_SEAL_NAVY_STAR = 'bundled:seal-navy-star';
export const CERTIFICATE_SEAL_TEAL_LAUREL = 'bundled:seal-teal-laurel';
export const CERTIFICATE_SEAL_WAX = 'bundled:seal-classic-wax';

export const DEFAULT_CERTIFICATE_SEAL_ID = 'mutale-logo';

export const CERTIFICATE_SEALS = [
  {
    id: 'mutale-logo',
    name: 'Mutale Logo',
    description: 'Official brand mark',
    src: CERTIFICATE_BUNDLED_LOGO_SRC,
    previewType: 'logo',
  },
  {
    id: 'gold-round',
    name: 'Gold Round',
    description: 'Classic official gold seal',
    src: CERTIFICATE_SEAL_GOLD_ROUND,
    previewType: 'svg',
  },
  {
    id: 'navy-star',
    name: 'Navy Star',
    description: 'Verified navy & gold badge',
    src: CERTIFICATE_SEAL_NAVY_STAR,
    previewType: 'svg',
  },
  {
    id: 'teal-laurel',
    name: 'Teal Laurel',
    description: 'Laurel wreath excellence seal',
    src: CERTIFICATE_SEAL_TEAL_LAUREL,
    previewType: 'svg',
  },
  {
    id: 'classic-wax',
    name: 'Classic Wax',
    description: 'Traditional wax stamp look',
    src: CERTIFICATE_SEAL_WAX,
    previewType: 'svg',
  },
];

const SEAL_BY_ID = new Map(CERTIFICATE_SEALS.map((seal) => [seal.id, seal]));
const SEAL_BY_SRC = new Map(CERTIFICATE_SEALS.map((seal) => [seal.src, seal]));

const SEAL_SRC_TO_ID = {
  [CERTIFICATE_SEAL_GOLD_ROUND]: 'gold-round',
  [CERTIFICATE_SEAL_NAVY_STAR]: 'navy-star',
  [CERTIFICATE_SEAL_TEAL_LAUREL]: 'teal-laurel',
  [CERTIFICATE_SEAL_WAX]: 'classic-wax',
};

export function getCertificateSeal(sealId) {
  return SEAL_BY_ID.get(String(sealId || DEFAULT_CERTIFICATE_SEAL_ID)) || CERTIFICATE_SEALS[0];
}

export function getCertificateSealBySrc(src) {
  if (!src) return null;
  if (src === CERTIFICATE_BUNDLED_LOGO_SRC) return getCertificateSeal('mutale-logo');
  return SEAL_BY_SRC.get(src) || null;
}

export function getCertificateSealPreviewUrl(sealId) {
  const seal = getCertificateSeal(sealId);
  if (seal.previewType === 'logo') return '';
  const artId = SEAL_SRC_TO_ID[seal.src] || seal.id;
  return encodeSvgDataUrl(getCertificateSealSvg(artId));
}

export function getCertificateSealPreviewUrlBySrc(src) {
  const seal = getCertificateSealBySrc(src);
  if (!seal) return '';
  return getCertificateSealPreviewUrl(seal.id);
}

export function isCertificateSealSrc(src) {
  return Boolean(getCertificateSealBySrc(src));
}

export function inferCertificateSealId(design) {
  if (design?.sealId) return design.sealId;
  const sealEl = findCertificateSealElement(design);
  if (sealEl?.src) {
    const match = getCertificateSealBySrc(sealEl.src);
    if (match) return match.id;
  }
  return DEFAULT_CERTIFICATE_SEAL_ID;
}

export function findCertificateSealElement(design) {
  const elements = design?.elements || [];
  return elements.find((el) => el.id === 'el_seal_logo' || el.seal === true) || null;
}

function inferPresetIdFromDesign(design) {
  if (design?.presetId) return design.presetId;
  const elements = design?.elements || [];
  if (elements.some((el) => el.id === 'el_presented' || el.id === 'el_title')) {
    return 'achievement';
  }
  return 'attendance';
}

function defaultSealGeometry(presetId) {
  if (presetId === 'achievement') {
    return { x: 0.5, y: 0.84, width: 0.09, height: 0.09 };
  }
  return { x: 0.68, y: 0.74, width: 0.1, height: 0.1 };
}

/**
 * Apply or update the certificate seal on a design.
 * @param {object} design
 * @param {string} sealId
 */
export function applyCertificateSeal(design, sealId) {
  const seal = getCertificateSeal(sealId);
  const presetId = inferPresetIdFromDesign(design);
  const geometry = defaultSealGeometry(presetId);
  const elements = [...(design?.elements || [])];
  const idx = elements.findIndex((el) => el.id === 'el_seal_logo' || el.seal === true);

  if (idx >= 0) {
    elements[idx] = {
      ...elements[idx],
      type: 'image',
      id: 'el_seal_logo',
      src: seal.src,
      seal: true,
    };
  } else {
    elements.push({
      type: 'image',
      id: 'el_seal_logo',
      seal: true,
      src: seal.src,
      ...geometry,
    });
  }

  return {
    ...design,
    sealId: seal.id,
    elements,
  };
}
