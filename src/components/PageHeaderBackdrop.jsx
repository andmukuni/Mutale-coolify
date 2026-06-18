import { resolveMediaUrl } from '../utils/mediaUrl';

/**
 * Optional background image for a dark page-header/hero section.
 * Renders the image plus a navy gradient overlay so the heading text stays
 * readable. When no image is set, renders nothing and the section keeps its
 * default gradient background.
 */
export default function PageHeaderBackdrop({ image }) {
  const src = resolveMediaUrl(image);
  if (!src) return null;
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <img src={src} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-br from-navy-950/95 via-navy-900/90 to-navy-800/90" />
    </div>
  );
}
