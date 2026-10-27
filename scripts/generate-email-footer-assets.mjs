/**
 * Generates public/email/*.png — the images used by the shared email footer.
 * Email clients block SVG, so the icons ship as 2x PNGs rendered from the SVG below.
 * Run: node scripts/generate-email-footer-assets.mjs
 * (set PUPPETEER_EXECUTABLE_PATH if Chrome is not at the default macOS path)
 */
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/email');

const NAVY = '#141D45';
const TEAL = '#00A79D';

const circle = (glyph) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="32" fill="${NAVY}"/>${glyph}</svg>`;

// Brand glyphs for X and YouTube follow the CC0 simple-icons paths (24px grid).
const simpleIcon = (d, rule = 'nonzero') =>
  `<g transform="translate(18 18) scale(1.1667)"><path fill="#fff" fill-rule="${rule}" d="${d}"/></g>`;

const ASSETS = {
  'social-linkedin.png': circle(`<g fill="#fff">
    <rect x="19" y="27" width="6" height="18"/>
    <circle cx="22" cy="20.5" r="3.6"/>
    <path d="M30 27h5.7v2.6c.9-1.6 2.9-3.1 6-3.1 5.4 0 6.4 3.5 6.4 8V45h-6v-9.1c0-2.2-.1-4.9-3-4.9s-3.3 2.3-3.3 4.7V45H30z"/>
  </g>`),
  'social-x.png': circle(simpleIcon('M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z')),
  'social-youtube.png': circle(simpleIcon('M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z', 'evenodd')),
  'social-instagram.png': circle(`<g fill="none" stroke="#fff" stroke-width="3.4">
    <rect x="19" y="19" width="26" height="26" rx="7.5"/>
    <circle cx="32" cy="32" r="6.3"/>
  </g><circle cx="39.7" cy="24.3" r="2" fill="#fff"/>`),
  'social-facebook.png': circle('<path fill="#fff" d="M35.4 50V34.6h5.2l.8-6h-6v-3.8c0-1.7.5-2.9 3-2.9h3.2v-5.4c-.6-.1-2.4-.2-4.6-.2-4.6 0-7.7 2.8-7.7 7.9v4.4h-5.2v6h5.2V50z"/>'),
  'globe.png': `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
    <g fill="none" stroke="${TEAL}" stroke-width="3" stroke-linecap="round">
      <circle cx="28" cy="28" r="22.5"/>
      <ellipse cx="28" cy="28" rx="9.5" ry="22.5"/>
      <path d="M5.5 28h45M10 16.5Q28 21 46 16.5M10 39.5Q28 35 46 39.5"/>
    </g></svg>`,
  'footer-leaf.png': `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300">
    <defs>
      <linearGradient id="l" x1="1" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="${TEAL}" stop-opacity=".2"/>
        <stop offset="1" stop-color="${TEAL}" stop-opacity=".07"/>
      </linearGradient>
      <linearGradient id="r" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${TEAL}" stop-opacity=".22"/>
        <stop offset="1" stop-color="${TEAL}" stop-opacity=".1"/>
      </linearGradient>
    </defs>
    <path d="M150 298C108 262 44 176 46 70c66 38 112 120 104 228z" fill="url(#l)"/>
    <path d="M156 298c-6-98 34-196 104-262 10 110-32 210-104 262z" fill="url(#r)"/>
    <path d="M150 294C132 220 96 140 52 80M158 292c4-90 34-170 96-246" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
  </svg>`,
};

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const page = await browser.newPage();
  for (const [name, svg] of Object.entries(ASSETS)) {
    const width = Number(svg.match(/width="(\d+)"/)[1]);
    const height = Number(svg.match(/height="(\d+)"/)[1]);
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.screenshot({
      path: path.join(OUT, name),
      omitBackground: true,
      clip: { x: 0, y: 0, width, height },
    });
    console.log(`wrote public/email/${name}`);
  }
} finally {
  await browser.close();
}
