import primaryLogo from '../../Logo-Website-Mutale_Main - Navy and Teal.png';
import whiteLogo from '../../Logo-Website-Mutale_White No Bg.png';

const LOGO_SRC = {
  primary: primaryLogo,
  white: whiteLogo,
};

/**
 * @param {{ variant?: 'primary' | 'white', className?: string, alt?: string }} props
 */
export default function SiteLogo({
  variant = 'primary',
  className = 'h-12 w-auto',
  alt = 'Mutale Mubanga',
}) {
  return (
    <img
      src={LOGO_SRC[variant] || LOGO_SRC.primary}
      alt={alt}
      className={`object-contain ${className}`}
      decoding="async"
    />
  );
}
