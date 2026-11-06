import { useState } from 'react';
import { safeExternalUrl } from '../../shared/safeUrl.js';
import { resolveMediaUrl } from '../utils/mediaUrl';
import TwoToneTitle from './TwoToneTitle';

// Two a row on phones, three on tablets, four on wide screens (gaps 1rem, then
// 1.25rem). Rows are centred, so a short last row sits in the middle.
const ITEM_WIDTH = 'w-[calc(50%-0.5rem)] sm:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)]';

/**
 * "Mutale has worked with": partner logos from Admin → Partner logos, or the
 * names saved in Sections while none are uploaded. A partner with a website
 * links to it in a new tab.
 */
export default function TrustedBySection({ label, partners = [], legacyNames = [] }) {
  const items = partners.length > 0
    ? partners
    : legacyNames.filter(Boolean).map((name, index) => ({ id: `legacy-${index}`, name, logo_url: '' }));

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby={label ? 'home-trusted-by' : undefined}
      aria-label={label ? undefined : 'Partners'}
      className="relative overflow-hidden border-b border-navy-100 bg-gradient-to-b from-white to-navy-50/40 py-14 sm:py-16"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[28rem] -translate-x-1/2 rounded-full bg-[#E76869]/10 blur-3xl"
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {label && (
          <div className="mb-10 flex flex-col items-center">
            <TwoToneTitle id="home-trusted-by" text={label} className="text-center text-3xl sm:text-4xl font-bold" />
            <span aria-hidden="true" className="mt-3 h-1 w-12 rounded-full bg-[#E76869]" />
          </div>
        )}
        <ul className="flex flex-wrap justify-center gap-4 sm:gap-5">
          {items.map((partner) => (
            <li key={partner.id} className={`flex ${ITEM_WIDTH}`}>
              <PartnerLogoItem partner={partner} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PartnerLogoItem({ partner }) {
  const [failed, setFailed] = useState(false);
  const logoSrc = resolveMediaUrl(partner.logo_url);
  const showImage = Boolean(logoSrc) && !failed;
  // Only http(s) addresses become links.
  const website = safeExternalUrl(partner.website_url);
  const wrapperClass = 'group relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-[#00A79D]/20 bg-white px-5 py-4 shadow-sm ring-1 ring-[#00A79D]/5 transition-all duration-300 ease-out hover:border-[#E76869]/50 hover:shadow-xl hover:shadow-[#E76869]/15 hover:ring-[#E76869]/30 motion-safe:hover:-translate-y-1 '
    + (showImage ? 'h-28 sm:h-32' : 'h-20 sm:h-24');

  const media = showImage ? (
    <img
      src={logoSrc}
      alt={partner.name}
      className="max-h-14 sm:max-h-16 w-auto max-w-full object-contain grayscale opacity-70 transition-[filter,opacity] duration-300 ease-in-out group-hover:grayscale-0 group-hover:opacity-100"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    // Without a logo, the name stands in for one.
    <span className="text-center text-[15px] sm:text-base font-bold leading-snug tracking-tight text-navy-800 transition-colors duration-300 group-hover:text-[#00A79D]">
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

  if (website) {
    return (
      <a
        href={website}
        target="_blank"
        rel="noreferrer noopener"
        className={`${wrapperClass} focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2`}
        title={partner.name}
      >
        {content}
        {/* The space keeps the name from running together: "FIND (opens in a new tab)". */}
        {' '}
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }

  return (
    <div className={wrapperClass} title={partner.name}>
      {content}
    </div>
  );
}
