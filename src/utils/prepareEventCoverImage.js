import { compressImageFile } from './compressImageFile';
import { readFileAsDataUrl } from './uploadBlogImage';

/** Recommended event cover dimensions (16:9). */
export const EVENT_COVER_MAX_WIDTH = 1200;
export const EVENT_COVER_MAX_HEIGHT = 630;
/** Target binary size so base64 stays well under the JSON body limit. */
export const EVENT_COVER_MAX_BYTES = 600 * 1024;

export const PERSON_PHOTO_MAX_DIM = 512;
export const PERSON_PHOTO_MAX_BYTES = 220 * 1024;

export const PARTNER_LOGO_MAX_DIM = 800;
export const PARTNER_LOGO_MAX_BYTES = 220 * 1024;

export function isInlineImageDataUrl(value) {
  return /^data:image\/[\w.+-]+;base64,/i.test(String(value || '').trim());
}

export function isHostedImageSrc(value) {
  const raw = String(value || '').trim();
  if (!raw || isInlineImageDataUrl(raw)) return false;
  return /^(https?:\/\/|\/)/i.test(raw);
}

export async function dataUrlToFile(dataUrl, filename = 'image.jpg') {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type = blob.type || 'image/jpeg';
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
  const base = String(filename || 'image').replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}${ext}`, { type });
}

/**
 * Resize/compress any cover image to recommended event dimensions in the browser.
 * @param {File} file
 * @param {{ onProgress?: (percent: number) => void }} [opts]
 * @returns {Promise<{ dataUrl: string, file: File }>}
 */
export async function prepareEventCoverImage(file, opts = {}) {
  const onProgress = opts.onProgress;

  onProgress?.(0);

  const compressed = await compressImageFile(file, {
    maxWidth: EVENT_COVER_MAX_WIDTH,
    maxHeight: EVENT_COVER_MAX_HEIGHT,
    maxBytes: EVENT_COVER_MAX_BYTES,
    quality: 0.84,
    force: true,
    onProgress: (value) => {
      onProgress?.(Math.min(92, Math.round(value * 0.92)));
    },
  });

  onProgress?.(94);
  const dataUrl = await readFileAsDataUrl(compressed);
  onProgress?.(100);

  return { dataUrl, file: compressed };
}

export async function prepareEventCoverSource(source, opts = {}) {
  if (source instanceof File) {
    const { dataUrl } = await prepareEventCoverImage(source, opts);
    return dataUrl;
  }
  const raw = String(source || '').trim();
  if (!raw) return '';
  if (isHostedImageSrc(raw)) return raw;
  if (!isInlineImageDataUrl(raw)) return raw;
  const file = await dataUrlToFile(raw, 'event-cover.jpg');
  const { dataUrl } = await prepareEventCoverImage(file, opts);
  return dataUrl;
}

async function prepareBoundedImageSource(source, bounds, filename) {
  if (source instanceof File) {
    const compressed = await compressImageFile(source, { ...bounds, force: true, quality: 0.82 });
    return readFileAsDataUrl(compressed);
  }
  const raw = String(source || '').trim();
  if (!raw) return '';
  if (isHostedImageSrc(raw)) return raw;
  if (!isInlineImageDataUrl(raw)) return raw;
  const file = await dataUrlToFile(raw, filename);
  const compressed = await compressImageFile(file, { ...bounds, force: true, quality: 0.82 });
  return readFileAsDataUrl(compressed);
}

export async function preparePersonPhotoSource(source) {
  return prepareBoundedImageSource(source, {
    maxWidth: PERSON_PHOTO_MAX_DIM,
    maxHeight: PERSON_PHOTO_MAX_DIM,
    maxBytes: PERSON_PHOTO_MAX_BYTES,
  }, 'person.jpg');
}

export async function preparePartnerLogoSource(source) {
  return prepareBoundedImageSource(source, {
    maxWidth: PARTNER_LOGO_MAX_DIM,
    maxHeight: PARTNER_LOGO_MAX_DIM,
    maxBytes: PARTNER_LOGO_MAX_BYTES,
  }, 'partner-logo.jpg');
}

export async function compactEventFormImages(payload = {}, opts = {}) {
  const onProgress = opts.onProgress;
  const next = { ...payload };
  next.cover_image = await prepareEventCoverSource(next.cover_image, {
    onProgress: (value) => onProgress?.(Math.min(70, Math.round(value * 0.7))),
  });

  const speakers = Array.isArray(next.featured_speakers) ? next.featured_speakers : [];
  const guests = Array.isArray(next.featured_guests) ? next.featured_guests : [];
  const partners = Array.isArray(next.partners) ? next.partners : [];
  const total = speakers.length + guests.length + partners.length;
  let done = 0;
  const bump = () => {
    done += 1;
    onProgress?.(70 + Math.round((done / Math.max(total, 1)) * 30));
  };

  next.featured_speakers = await Promise.all(speakers.map(async (person) => {
    const photo = await preparePersonPhotoSource(person?.photo);
    bump();
    return { ...person, photo };
  }));
  next.featured_guests = await Promise.all(guests.map(async (person) => {
    const photo = await preparePersonPhotoSource(person?.photo);
    bump();
    return { ...person, photo };
  }));
  next.partners = await Promise.all(partners.map(async (partner) => {
    const logo = await preparePartnerLogoSource(partner?.logo);
    bump();
    return { ...partner, logo };
  }));

  onProgress?.(100);
  return next;
}
