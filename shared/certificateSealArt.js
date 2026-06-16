/** SVG artwork for bundled certificate seals (preview + server rasterization). */

const SEAL_SIZE = 200;

function svgWrap(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SEAL_SIZE} ${SEAL_SIZE}" width="${SEAL_SIZE}" height="${SEAL_SIZE}">${body}</svg>`;
}

const SEAL_SVG_BY_ID = {
  'gold-round': svgWrap(`
    <defs>
      <radialGradient id="gold" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#F5E6A8"/>
        <stop offset="55%" stop-color="#C9A227"/>
        <stop offset="100%" stop-color="#8B6914"/>
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="92" fill="url(#gold)" stroke="#6B4F0A" stroke-width="3"/>
    <circle cx="100" cy="100" r="78" fill="none" stroke="#FDF6D8" stroke-width="2" opacity="0.85"/>
    <circle cx="100" cy="100" r="68" fill="none" stroke="#6B4F0A" stroke-width="1.5" stroke-dasharray="4 3"/>
    <text x="100" y="52" text-anchor="middle" font-family="Georgia, serif" font-size="11" font-weight="700" fill="#5C4208" letter-spacing="2">OFFICIAL</text>
    <text x="100" y="68" text-anchor="middle" font-family="Georgia, serif" font-size="11" font-weight="700" fill="#5C4208" letter-spacing="2">SEAL</text>
    <polygon points="100,82 107,98 124,98 110,108 115,125 100,115 85,125 90,108 76,98 93,98" fill="#FDF6D8" stroke="#6B4F0A" stroke-width="1"/>
    <text x="100" y="152" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="#5C4208" letter-spacing="1.5">AUTHENTIC</text>
  `),
  'navy-star': svgWrap(`
    <defs>
      <radialGradient id="navy" cx="50%" cy="35%" r="60%">
        <stop offset="0%" stop-color="#1E3A5F"/>
        <stop offset="100%" stop-color="#0B1D36"/>
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="90" fill="url(#navy)" stroke="#C9A227" stroke-width="4"/>
    <circle cx="100" cy="100" r="76" fill="none" stroke="#C9A227" stroke-width="1.5" opacity="0.7"/>
    <polygon points="100,58 110,86 140,86 116,104 124,132 100,116 76,132 84,104 60,86 90,86" fill="#C9A227"/>
    <text x="100" y="158" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#C9A227" letter-spacing="2">VERIFIED</text>
  `),
  'teal-laurel': svgWrap(`
    <defs>
      <radialGradient id="teal" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#5EEAD4"/>
        <stop offset="100%" stop-color="#0D9488"/>
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="90" fill="url(#teal)" stroke="#0F766E" stroke-width="3"/>
    <ellipse cx="58" cy="100" rx="14" ry="28" fill="none" stroke="#ECFDF5" stroke-width="3" opacity="0.85" transform="rotate(-25 58 100)"/>
    <ellipse cx="142" cy="100" rx="14" ry="28" fill="none" stroke="#ECFDF5" stroke-width="3" opacity="0.85" transform="rotate(25 142 100)"/>
    <ellipse cx="72" cy="72" rx="10" ry="22" fill="none" stroke="#ECFDF5" stroke-width="2.5" opacity="0.7" transform="rotate(-10 72 72)"/>
    <ellipse cx="128" cy="72" rx="10" ry="22" fill="none" stroke="#ECFDF5" stroke-width="2.5" opacity="0.7" transform="rotate(10 128 72)"/>
    <circle cx="100" cy="100" r="48" fill="#ECFDF5" opacity="0.15"/>
    <text x="100" y="96" text-anchor="middle" font-family="Georgia, serif" font-size="13" font-weight="700" fill="#FFFFFF">MM</text>
    <text x="100" y="114" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="8" font-weight="600" fill="#ECFDF5" letter-spacing="1">EXCELLENCE</text>
  `),
  'classic-wax': svgWrap(`
    <defs>
      <radialGradient id="wax" cx="45%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#C0392B"/>
        <stop offset="100%" stop-color="#7B241C"/>
      </radialGradient>
    </defs>
    <path d="M100,18 C135,22 168,48 175,85 C182,122 160,158 128,172 C96,186 58,178 38,148 C18,118 28,72 58,42 C72,28 84,16 100,18 Z" fill="url(#wax)" stroke="#5B1A14" stroke-width="2"/>
    <circle cx="100" cy="98" r="52" fill="none" stroke="#F5D0C5" stroke-width="2" opacity="0.5"/>
    <text x="100" y="92" text-anchor="middle" font-family="Georgia, serif" font-size="12" font-weight="700" fill="#FDF2F0" letter-spacing="1">CERTIFIED</text>
    <text x="100" y="112" text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="#FDF2F0" opacity="0.9">★ ★ ★</text>
  `),
};

export function getCertificateSealSvg(sealId) {
  return SEAL_SVG_BY_ID[String(sealId || '')] || '';
}

export function encodeSvgDataUrl(svg) {
  if (!svg) return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
