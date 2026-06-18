import { useState } from 'react';
import { resolveMediaUrl } from '../utils/mediaUrl';

export default function TrustedBySection({ label, partners = [], legacyNames = [] }) {
  const items = partners.length > 0
    ? partners
    : legacyNames.map((name, index) => ({ id: `legacy-${index}`, name, logo_url: '' }));

  if (items.length === 0) return null;

  return (
    <section className="relative py-14 bg-gradient-to-b from-white to-navy-50/40 border-b border-navy-100 overflow-hidden">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-[28rem] rounded-full bg-[#E76869]/10 blur-3xl"
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {label && (() => {
          const trimmed = String(label).trim();
          const spaceIdx = trimmed.indexOf(' ');
          const firstWord = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
          const restWords = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
          return (
            <div className="flex flex-col items-center mb-10">
              <p className="text-center text-3xl sm:text-4xl font-bold">
                <span className="text-[#141D45]">{firstWord}</span>
                {restWords && <span className="text-[#00A79D]"> {restWords}</span>}
              </p>
              <span className="mt-3 h-1 w-12 rounded-full bg-[#E76869]" />
            </div>
          );
        })()}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
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
  const wrapperClass = 'group relative flex items-center justify-center h-28 sm:h-32 px-5 py-4 rounded-2xl border border-[#00A79D]/20 bg-white/80 backdrop-blur-sm shadow-sm ring-1 ring-[#00A79D]/5 overflow-hidden hover:border-[#E76869]/50 hover:ring-[#E76869]/30 hover:shadow-xl hover:shadow-[#E76869]/15 hover:-translate-y-1 transition-all duration-300 ease-out';

  const media = showImage ? (
    <img
      src={logoSrc}
      alt={partner.name}
      className="max-h-14 sm:max-h-16 w-auto max-w-full object-contain grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-[filter,opacity] duration-300 ease-in-out"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="text-sm font-semibold text-center text-[#00A79D] group-hover:text-[#E76869] transition-colors duration-300">
      {partner.name}
    </span>
  );

  const content = (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#00A79D] transition-colors duration-300 ease-out group-hover:bg-[#E76869]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[#00A79D]/10 blur-2xl transition-colors duration-300 group-hover:bg-[#E76869]/20"
      />
      <span className="relative z-10 flex items-center justify-center">{media}</span>
    </>
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
