import { useState } from 'react';
import { ArrowUpRight, Building2 } from 'lucide-react';
import { safeExternalUrl } from '../../shared/safeUrl.js';
import { resolveMediaUrl } from '../utils/mediaUrl';
import TwoToneTitle from './TwoToneTitle';

// Light teal on every other cell, as in a stats panel; a lifted navy in dark mode.
const CELL = 'bg-white even:bg-[#F2FAF9] dark:even:bg-navy-800/70';
const COLUMNS = { base: 2, md: 4 };
// Up to this many partners share one row from 1280 px; more wrap in fours.
const ONE_ROW_MAX = 8;

/** "www.who.int" → "who.int": the address as a short label. */
function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * "Mutale has worked with" as a band of partners across the full width of the
 * page, under the banner. From 1280 px it is a single strip, the heading in the
 * first cell; below that, four a row, and two on phones. Each
 * cell has the website as a small label, the logo (or, without one, the name)
 * and the name beneath. Partners come from Admin → Partner logos, or the names
 * saved in Sections while none are uploaded.
 */
export default function TrustedBySection({ label, partners = [], legacyNames = [] }) {
  const items = partners.length > 0
    ? partners
    : legacyNames.filter(Boolean).map((name, index) => ({ id: `legacy-${index}`, name, logo_url: '' }));

  if (items.length === 0) return null;

  const oneRow = items.length <= ONE_ROW_MAX;
  // Blank cells complete the last row, so the panel stays a clean rectangle.
  const fillBase = (COLUMNS.base - (items.length % COLUMNS.base)) % COLUMNS.base;
  const fillMd = (COLUMNS.md - (items.length % COLUMNS.md)) % COLUMNS.md;
  const fillers = Array.from({ length: Math.max(fillBase, fillMd) }, (_, i) => (
    `${i < fillBase ? 'block' : 'hidden'} ${i < fillMd ? 'md:block' : 'md:hidden'} ${oneRow ? 'xl:hidden' : ''}`
  ));

  return (
    <section
      aria-labelledby={label ? 'home-trusted-by' : undefined}
      aria-label={label ? undefined : 'Partners'}
      className="relative border-b border-navy-100 bg-white xl:flex"
    >
      {label && (
        // In line with the page's left margin at any width (the content is at most 80rem, centred),
        // so the heading sits under the content above it.
        <div className="flex items-center gap-3 border-b border-navy-100 px-4 py-3.5 sm:px-6 lg:px-8 xl:w-[calc(15rem_+_max(0px,_(100vw_-_80rem)_/_2))] xl:shrink-0 xl:pl-[calc(2rem_+_max(0px,_(100vw_-_80rem)_/_2))] xl:flex-col xl:items-start xl:justify-center xl:gap-2.5 xl:border-b-0 xl:border-r xl:py-4">
          <span aria-hidden="true" className="h-6 w-1 rounded-full bg-[#E76869] xl:h-1 xl:w-10" />
          <TwoToneTitle id="home-trusted-by" text={label} className="text-lg sm:text-xl font-bold leading-tight xl:text-[1.35rem]" />
        </div>
      )}
      {/* The 1px gaps show the list's background through, as dividers. */}
      <ul className={`grid grid-cols-2 gap-px bg-navy-100 md:grid-cols-4 xl:min-w-0 xl:flex-1 ${oneRow ? 'xl:flex' : ''}`}>
        {items.map((partner) => (
          <li key={partner.id} className={`flex ${CELL} ${oneRow ? 'xl:min-w-0 xl:flex-1' : ''}`}>
            <PartnerCell partner={partner} />
          </li>
        ))}
        {fillers.map((visibility, i) => (
          <li key={`filler-${i}`} aria-hidden="true" className={`${CELL} ${visibility}`} />
        ))}
      </ul>
    </section>
  );
}

function PartnerCell({ partner }) {
  const [failed, setFailed] = useState(false);
  const logoSrc = resolveMediaUrl(partner.logo_url);
  const showLogo = Boolean(logoSrc) && !failed;
  // Only http(s) addresses become links.
  const website = safeExternalUrl(partner.website_url);
  const domain = website ? domainOf(website) : '';
  const Icon = website ? ArrowUpRight : Building2;

  const iconClass = 'flex shrink-0 items-center justify-center rounded-full bg-[#00A79D]/10 text-cyan-800 transition-colors duration-300 group-hover:bg-[#00A79D] group-hover:text-white dark:text-cyan-300';

  // Phones and tablets: the domain and icon on top. In the single strip from
  // 1280 px, cells are narrow, so the logo takes the full width and the icon
  // moves beside the name.
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 xl:hidden">
        {domain && <span className="min-w-0 truncate text-xs font-medium text-navy-600">{domain}</span>}
        <span className={`ml-auto h-7 w-7 ${iconClass}`}>
          <Icon size={15} aria-hidden="true" />
        </span>
      </span>

      <span className="mt-2 flex flex-1 items-center xl:mt-0 xl:justify-center">
        {showLogo ? (
          // A white plate in both themes: uploaded logos are often drawn for a white page.
          <span className="inline-flex h-12 max-w-full items-center justify-center rounded-lg bg-[#ffffff] px-2.5 py-1.5 ring-1 ring-navy-100 transition duration-300 group-hover:shadow-md group-hover:ring-cyan-300 xl:h-14 xl:w-full xl:px-2">
            <img
              src={logoSrc}
              alt=""
              className="max-h-9 w-auto max-w-full object-contain xl:max-h-10"
              loading="lazy"
              onError={() => setFailed(true)}
            />
          </span>
        ) : (
          <span className="text-base sm:text-lg font-bold leading-snug tracking-tight text-navy-900 transition-colors group-hover:text-cyan-800 dark:group-hover:text-cyan-300 xl:text-center xl:text-base">{partner.name}</span>
        )}
      </span>

      {showLogo && (
        <span className="mt-2 flex items-start justify-between gap-1.5">
          <span className="line-clamp-2 min-w-0 text-xs leading-snug text-navy-500 transition-colors group-hover:text-cyan-800 dark:group-hover:text-cyan-300">{partner.name}</span>
          <span className={`hidden h-5 w-5 xl:flex ${iconClass}`}>
            <Icon size={12} aria-hidden="true" />
          </span>
        </span>
      )}
    </>
  );

  const cellClass = 'flex w-full min-w-0 min-h-[7rem] flex-col p-4 xl:p-3.5 break-words';

  if (website) {
    return (
      <a
        href={website}
        target="_blank"
        rel="noreferrer noopener"
        // The name is what the cell is about; the label and logo only support it.
        aria-label={`${partner.name} (opens in a new tab)`}
        title={partner.name}
        className={`group ${cellClass} transition-colors duration-300 hover:bg-[#00A79D]/[0.07] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-700`}
      >
        {body}
      </a>
    );
  }

  return <div className={cellClass} title={partner.name}>{body}</div>;
}
