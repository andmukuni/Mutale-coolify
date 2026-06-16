import { useState } from 'react';
import { resolveMediaUrl } from '../utils/mediaUrl';

export default function TrustedBySection({ label, partners = [], legacyNames = [] }) {
  const items = partners.length > 0
    ? partners
    : legacyNames.map((name, index) => ({ id: `legacy-${index}`, name, logo_url: '' }));

  if (items.length === 0) return null;

  return (
    <section className="py-10 bg-white border-b border-navy-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {label && (
          <p className="text-center text-xs font-semibold text-navy-400 uppercase tracking-widest mb-6">
            {label}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {items.map((partner) => (
            <PartnerLogoItem key={partner.id} partner={partner} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerLogoItem({ partner }) {
  const [failed, setFailed] = useState(false);
  const logoSrc = resolveMediaUrl(partner.logo_url);
  const showImage = Boolean(logoSrc) && !failed;
  const wrapperClass = 'group inline-flex items-center justify-center min-h-[3rem] px-2';

  const content = showImage ? (
    <img
      src={logoSrc}
      alt={partner.name}
      className="h-10 sm:h-12 w-auto max-w-[160px] object-contain grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-[filter,opacity] duration-300 ease-in-out"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="text-sm font-semibold text-navy-300 group-hover:text-navy-600 transition-colors whitespace-nowrap">
      {partner.name}
    </span>
  );

  if (partner.website_url) {
    return (
      <a
        href={partner.website_url}
        target="_blank"
        rel="noreferrer noopener"
        className={wrapperClass}
        title={partner.name}
      >
        {content}
      </a>
    );
  }

  return (
    <div className={wrapperClass} title={partner.name}>
      {content}
    </div>
  );
}
