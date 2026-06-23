/**
 * Section registry — drives the admin "Sections" CMS.
 *
 * Each section describes a block on a public page (hero to footer). The admin
 * Sections table and the schema-driven editor are generated entirely from this
 * file. No DB migration is needed: every field maps to a dot-path inside the
 * `profile` object that is loaded via GET /api/profile and saved via
 * PUT /api/profile (through updateProfile()).
 *
 * Field shape:
 *   { key, label, type, path, placeholder?, helpText? }
 *     - type: 'text' | 'textarea' | 'image' | 'lines' | 'link'
 *     - path: dot-path into `profile` (e.g. 'heroIntro' for a root field, or
 *             'websitePages.home.heroEyebrow' for a website-page field).
 *     - 'lines' fields store an array; the editor shows one item per line.
 *     - image fields may set `fallbackPreview` (a ready-to-use URL/asset) so the
 *       editor previews the current live default when no override is set.
 *
 * Section shape:
 *   { id, page, name, type: 'static' | 'dynamic', toggleable, visibilityKey,
 *     fields[], manageLink? }
 *     - visibilityKey: key inside profile.websitePages.sectionVisibility
 *       (defaults to `${id}`). A section is visible unless its value is false.
 *     - manageLink: deep-link to an existing admin for dynamic list items.
 */

import heroPortrait from '../assets/herophoto.JPG';
import { normalizeSectionVisibility } from '../data/websitePages';

// Current hardcoded defaults shown on the public site (used for live previews).
const HOME_HERO_BG_DEFAULT = 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1920&q=80';
const HOME_ABOUT_IMG_DEFAULT = 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=800&q=80';
const HOME_CTA_BG_DEFAULT = 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=1920&q=80';

export const SECTION_REGISTRY = [
  // ─────────────────────────── HOME ───────────────────────────
  {
    id: 'home.hero',
    page: 'Home',
    name: 'Hero',
    type: 'static',
    toggleable: false,
    fields: [
      { key: 'heroEyebrow', label: 'Eyebrow', type: 'text', path: 'websitePages.home.heroEyebrow' },
      { key: 'heroIntro', label: 'Intro paragraph', type: 'textarea', path: 'heroIntro' },
      { key: 'heroBackgroundImage', label: 'Background image', type: 'image', path: 'websitePages.home.heroBackgroundImage', fallbackPreview: HOME_HERO_BG_DEFAULT, helpText: 'Leave empty to use the default lab photo.' },
      { key: 'heroPortraitImage', label: 'Portrait image', type: 'image', path: 'websitePages.home.heroPortraitImage', fallbackPreview: heroPortrait, helpText: 'Leave empty to use the bundled portrait.' },
      { key: 'heroPills', label: 'Quick info pills', type: 'lines', path: 'websitePages.home.heroPills', helpText: 'One pill per line (e.g. Lusaka, Zambia).' },
    ],
  },
  {
    id: 'home.trusted-by',
    page: 'Home',
    name: 'Trusted by / Partners',
    type: 'dynamic',
    toggleable: true,
    fields: [
      { key: 'trustedByLabel', label: 'Heading', type: 'text', path: 'websitePages.home.trustedByLabel' },
    ],
    manageLink: { to: '/admin/partner-logos', label: 'Manage partner logos' },
  },
  {
    id: 'home.about-preview',
    page: 'Home',
    name: 'About preview',
    type: 'static',
    toggleable: true,
    fields: [
      { key: 'aboutEyebrow', label: 'Eyebrow', type: 'text', path: 'websitePages.home.aboutEyebrow' },
      { key: 'aboutTitle', label: 'Title', type: 'text', path: 'websitePages.home.aboutTitle' },
      { key: 'aboutImage', label: 'Image', type: 'image', path: 'websitePages.home.aboutImage', fallbackPreview: HOME_ABOUT_IMG_DEFAULT, helpText: 'Leave empty to use the default image.' },
      { key: 'aboutFloatingTitle', label: 'Floating card title', type: 'text', path: 'websitePages.home.aboutFloatingTitle' },
      { key: 'aboutFloatingSubtitle', label: 'Floating card subtitle', type: 'text', path: 'websitePages.home.aboutFloatingSubtitle' },
      { key: 'aboutTags', label: 'Tags', type: 'lines', path: 'websitePages.home.aboutTags', helpText: 'One tag per line.' },
    ],
  },
  {
    id: 'home.expertise',
    page: 'Home',
    name: 'Expertise / Core competencies',
    type: 'dynamic',
    toggleable: true,
    fields: [
      { key: 'expertiseLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.home.expertiseLabel' },
      { key: 'expertiseTitle', label: 'Title', type: 'text', path: 'websitePages.home.expertiseTitle' },
      { key: 'expertiseDescription', label: 'Description', type: 'textarea', path: 'websitePages.home.expertiseDescription' },
    ],
    manageLink: { to: '/admin/website-pages', label: 'Edit competency cards' },
  },
  {
    id: 'home.featured-events',
    page: 'Home',
    name: 'Featured events',
    type: 'dynamic',
    toggleable: true,
    fields: [
      { key: 'featuredEventsLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.home.featuredEventsLabel' },
      { key: 'featuredEventsTitle', label: 'Title', type: 'text', path: 'websitePages.home.featuredEventsTitle' },
      { key: 'featuredEventsDescription', label: 'Description', type: 'textarea', path: 'websitePages.home.featuredEventsDescription' },
    ],
    manageLink: { to: '/admin/events', label: 'Manage events' },
  },
  {
    id: 'home.featured-blog',
    page: 'Home',
    name: 'Featured blog',
    type: 'dynamic',
    toggleable: true,
    fields: [
      { key: 'featuredBlogLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.home.featuredBlogLabel' },
      { key: 'featuredBlogTitle', label: 'Title', type: 'text', path: 'websitePages.home.featuredBlogTitle' },
      { key: 'featuredBlogDescription', label: 'Description', type: 'textarea', path: 'websitePages.home.featuredBlogDescription' },
    ],
    manageLink: { to: '/admin/blog', label: 'Manage blog posts' },
  },
  {
    id: 'home.testimonials',
    page: 'Home',
    name: 'Testimonials',
    type: 'dynamic',
    toggleable: true,
    fields: [
      { key: 'testimonialsLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.home.testimonialsLabel' },
      { key: 'testimonialsTitle', label: 'Title', type: 'text', path: 'websitePages.home.testimonialsTitle' },
      { key: 'testimonialsDescription', label: 'Description', type: 'textarea', path: 'websitePages.home.testimonialsDescription' },
    ],
    manageLink: { to: '/admin/website-pages', label: 'Edit testimonials' },
  },
  {
    id: 'home.cta',
    page: 'Home',
    name: 'Call to action',
    type: 'static',
    toggleable: true,
    fields: [
      { key: 'ctaTitle', label: 'Title', type: 'text', path: 'websitePages.home.ctaTitle' },
      { key: 'availableFor', label: 'Subtitle', type: 'textarea', path: 'availableFor' },
      { key: 'ctaBackgroundImage', label: 'Background image', type: 'image', path: 'websitePages.home.ctaBackgroundImage', fallbackPreview: HOME_CTA_BG_DEFAULT, helpText: 'Leave empty to use the default image.' },
    ],
  },

  // ─────────────────────────── ABOUT ───────────────────────────
  {
    id: 'about.page-header',
    page: 'About',
    name: 'Page header',
    type: 'static',
    toggleable: false,
    fields: [
      { key: 'headerEyebrow', label: 'Eyebrow', type: 'text', path: 'websitePages.about.headerEyebrow' },
      { key: 'name', label: 'Name (heading)', type: 'text', path: 'name' },
      { key: 'tagline', label: 'Tagline', type: 'textarea', path: 'tagline' },
      { key: 'headerBackgroundImage', label: 'Background image', type: 'image', path: 'websitePages.about.headerBackgroundImage', helpText: 'Optional. Leave empty for the default gradient.' },
    ],
  },
  {
    id: 'about.professional-summary',
    page: 'About',
    name: 'Professional summary',
    type: 'static',
    toggleable: true,
    fields: [
      { key: 'summaryLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.about.summaryLabel' },
      { key: 'summaryTitle', label: 'Title', type: 'text', path: 'websitePages.about.summaryTitle' },
      { key: 'summary', label: 'Paragraphs', type: 'lines', path: 'summary', helpText: 'One paragraph per line.' },
    ],
  },
  {
    id: 'about.relevant-profile',
    page: 'About',
    name: 'Relevant profile',
    type: 'static',
    toggleable: true,
    fields: [
      { key: 'highlightsLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.about.highlightsLabel' },
      { key: 'highlightsTitle', label: 'Title', type: 'text', path: 'websitePages.about.highlightsTitle' },
      { key: 'relevantProfile', label: 'Highlights', type: 'lines', path: 'relevantProfile', helpText: 'One highlight per line.' },
    ],
  },
  {
    id: 'about.standards-tools',
    page: 'About',
    name: 'Standards & tools',
    type: 'static',
    toggleable: true,
    fields: [
      { key: 'standardsLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.about.standardsLabel' },
      { key: 'standardsTitle', label: 'Title', type: 'text', path: 'websitePages.about.standardsTitle' },
      { key: 'standardsDescription', label: 'Description', type: 'textarea', path: 'websitePages.about.standardsDescription' },
      { key: 'standardsAndTools', label: 'Items', type: 'lines', path: 'standardsAndTools', helpText: 'One item per line.' },
    ],
  },
  {
    id: 'about.computer-proficiency',
    page: 'About',
    name: 'Computer proficiency',
    type: 'static',
    toggleable: true,
    fields: [
      { key: 'technologyLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.about.technologyLabel' },
      { key: 'technologyTitle', label: 'Title', type: 'text', path: 'websitePages.about.technologyTitle' },
      { key: 'computerProficiency', label: 'Items', type: 'lines', path: 'computerProficiency', helpText: 'One item per line.' },
    ],
  },
  {
    id: 'about.affiliations',
    page: 'About',
    name: 'Professional affiliations',
    type: 'static',
    toggleable: true,
    fields: [
      { key: 'affiliationsLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.about.affiliationsLabel' },
      { key: 'affiliationsTitle', label: 'Title', type: 'text', path: 'websitePages.about.affiliationsTitle' },
      { key: 'affiliations', label: 'Affiliations', type: 'lines', path: 'affiliations', helpText: 'One affiliation per line.' },
    ],
  },
  {
    id: 'about.education',
    page: 'About',
    name: 'Education',
    type: 'dynamic',
    toggleable: true,
    fields: [
      { key: 'educationLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.about.educationLabel' },
      { key: 'educationTitle', label: 'Title', type: 'text', path: 'websitePages.about.educationTitle' },
    ],
    manageLink: { to: '/admin/website-pages', label: 'Edit education entries' },
  },
  {
    id: 'about.leadership-training',
    page: 'About',
    name: 'Leadership & training',
    type: 'dynamic',
    toggleable: true,
    fields: [
      { key: 'trainingLabel', label: 'Eyebrow', type: 'text', path: 'websitePages.about.trainingLabel' },
      { key: 'trainingTitle', label: 'Title', type: 'text', path: 'websitePages.about.trainingTitle' },
    ],
    manageLink: { to: '/admin/website-pages', label: 'Edit training entries' },
  },

  // ─────────────────────────── EXPERIENCE ───────────────────────────
  {
    id: 'experience.page-header',
    page: 'Experience',
    name: 'Page header',
    type: 'static',
    toggleable: false,
    fields: [
      { key: 'headerEyebrow', label: 'Eyebrow', type: 'text', path: 'websitePages.experience.headerEyebrow' },
      { key: 'title', label: 'Title', type: 'text', path: 'websitePages.experience.title' },
      { key: 'intro', label: 'Intro', type: 'textarea', path: 'websitePages.experience.intro' },
      { key: 'headerBackgroundImage', label: 'Background image', type: 'image', path: 'websitePages.experience.headerBackgroundImage', helpText: 'Optional. Leave empty for the default gradient.' },
    ],
  },
  {
    id: 'experience.timeline',
    page: 'Experience',
    name: 'Career timeline',
    type: 'dynamic',
    toggleable: true,
    fields: [],
    manageLink: { to: '/admin/website-pages', label: 'Edit timeline entries' },
  },

  // ─────────────────────────── BLOG ───────────────────────────
  {
    id: 'blog.page-header',
    page: 'Blog',
    name: 'Page header',
    type: 'static',
    toggleable: false,
    fields: [
      { key: 'headerEyebrow', label: 'Eyebrow', type: 'text', path: 'websitePages.blog.headerEyebrow' },
      { key: 'headerTitle', label: 'Title', type: 'text', path: 'websitePages.blog.headerTitle' },
      { key: 'headerIntro', label: 'Intro', type: 'textarea', path: 'websitePages.blog.headerIntro' },
      { key: 'headerBackgroundImage', label: 'Background image', type: 'image', path: 'websitePages.blog.headerBackgroundImage', helpText: 'Optional. Leave empty for the default gradient.' },
    ],
    manageLink: { to: '/admin/blog', label: 'Manage blog posts' },
  },

  // ─────────────────────────── EVENTS ───────────────────────────
  {
    id: 'events.page-header',
    page: 'Events',
    name: 'Page header',
    type: 'static',
    toggleable: false,
    fields: [
      { key: 'headerEyebrow', label: 'Eyebrow', type: 'text', path: 'websitePages.events.headerEyebrow' },
      { key: 'headerTitle', label: 'Title', type: 'text', path: 'websitePages.events.headerTitle' },
      { key: 'headerIntro', label: 'Intro', type: 'textarea', path: 'websitePages.events.headerIntro' },
      { key: 'headerBackgroundImage', label: 'Background image', type: 'image', path: 'websitePages.events.headerBackgroundImage', helpText: 'Optional. Leave empty for the default gradient.' },
    ],
    manageLink: { to: '/admin/events', label: 'Manage events' },
  },

  // ─────────────────────────── SHOP ───────────────────────────
  {
    id: 'shop.hero',
    page: 'Shop',
    name: 'Hero',
    type: 'static',
    toggleable: false,
    fields: [
      { key: 'headerEyebrow', label: 'Badge label', type: 'text', path: 'websitePages.shop.headerEyebrow' },
      { key: 'headerTitle', label: 'Title', type: 'text', path: 'websitePages.shop.headerTitle' },
      { key: 'headerDescription', label: 'Description', type: 'textarea', path: 'websitePages.shop.headerDescription' },
      { key: 'headerBackgroundImage', label: 'Background image', type: 'image', path: 'websitePages.shop.headerBackgroundImage', helpText: 'Optional. Leave empty for the default gradient.' },
    ],
    manageLink: { to: '/admin/books', label: 'Manage products' },
  },

  // ─────────────────────────── CONTACT ───────────────────────────
  {
    id: 'contact.page-header',
    page: 'Contact',
    name: 'Page header',
    type: 'static',
    toggleable: false,
    fields: [
      { key: 'headerEyebrow', label: 'Eyebrow', type: 'text', path: 'websitePages.contact.headerEyebrow' },
      { key: 'headerTitle', label: 'Title', type: 'text', path: 'websitePages.contact.headerTitle' },
      { key: 'availableFor', label: 'Intro paragraph', type: 'textarea', path: 'availableFor' },
      { key: 'headerBackgroundImage', label: 'Background image', type: 'image', path: 'websitePages.contact.headerBackgroundImage', helpText: 'Optional. Leave empty for the default gradient.' },
    ],
  },
  {
    id: 'contact.available-for',
    page: 'Contact',
    name: 'Available for',
    type: 'static',
    toggleable: true,
    fields: [
      { key: 'availableForTitle', label: 'Title', type: 'text', path: 'websitePages.contact.availableForTitle' },
      { key: 'availableForItems', label: 'Items', type: 'lines', path: 'websitePages.contact.availableForItems', helpText: 'One item per line.' },
    ],
  },

  // ─────────────────────────── GLOBAL ───────────────────────────
  {
    id: 'global.footer',
    page: 'Global',
    name: 'Footer',
    type: 'static',
    toggleable: false,
    fields: [
      { key: 'footerBrandName', label: 'Brand name', type: 'text', path: 'websitePages.global.footerBrandName' },
      { key: 'footerBrandDescription', label: 'Brand description', type: 'textarea', path: 'websitePages.global.footerBrandDescription' },
      { key: 'footerTagline', label: 'Bottom tagline', type: 'text', path: 'websitePages.global.footerTagline' },
    ],
    manageLink: { to: '/admin/menu', label: 'Manage footer links' },
  },
  {
    id: 'global.navigation',
    page: 'Global',
    name: 'Navigation menu',
    type: 'dynamic',
    toggleable: false,
    fields: [],
    manageLink: { to: '/admin/menu', label: 'Manage navigation' },
  },
];

/** Stable page ordering for the grouped table. */
export const SECTION_PAGE_ORDER = ['Home', 'About', 'Experience', 'Blog', 'Events', 'Shop', 'Contact', 'Global'];

/** Visibility key used inside profile.websitePages.sectionVisibility. */
export function sectionVisibilityKey(section) {
  return section.visibilityKey || section.id;
}

export function getSectionVisibility(profile, section) {
  if (!section.toggleable) return true;
  const map = normalizeSectionVisibility(profile?.websitePages?.sectionVisibility || {});
  return map[sectionVisibilityKey(section)] !== false;
}

/** Update visibility using flat section ids (e.g. home.trusted-by). */
export function setSectionVisibility(websitePages, section, visible) {
  const key = sectionVisibilityKey(section);
  const current = normalizeSectionVisibility(websitePages?.sectionVisibility || {});
  return {
    ...(websitePages || {}),
    sectionVisibility: {
      ...current,
      [key]: visible,
    },
  };
}

/** Read a dot-path value from the profile object. */
export function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

/** Immutably set a dot-path value, returning a new cloned object. */
export function setByPath(obj, path, value) {
  const keys = String(path).split('.');
  const root = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
  let cursor = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    const current = cursor[key];
    cursor[key] = Array.isArray(current) ? [...current] : { ...(current || {}) };
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return root;
}
