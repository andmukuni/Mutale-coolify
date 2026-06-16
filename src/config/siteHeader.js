import { profileData } from '../data/profile.js';

/** Tier 1 — pipe-separated quick links */
export const headerQuickLinks = [
  { to: '/about', label: 'About' },
  { to: '/events', label: 'Events' },
  { to: '/books', label: 'Shop' },
  { to: '/blog', label: 'Blog' },
  { to: '/contact', label: 'Contact' },
];

/** Tier 3 — main navigation */
export const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/experience', label: 'Experience' },
  {
    to: '/events',
    label: 'Events',
    children: [
      { to: '/events?view=upcoming', label: 'Upcoming Events' },
      { to: '/events?view=past', label: 'Past Events' },
    ],
  },
  { to: '/books', label: 'Shop', badge: true },
  { to: '/blog', label: 'Blog' },
  { to: '/publications', label: 'Publications' },
  { to: '/contact', label: 'Contact' },
];

export const headerBrand = {
  name: profileData.name,
  tagline: profileData.tagline,
};

export const headerContact = {
  contactPage: '/contact',
  phone: profileData.phone,
  phoneHref: `tel:${String(profileData.phone || '').replace(/\s/g, '')}`,
  email: profileData.email,
  emailHref: `mailto:${profileData.email}`,
  location: profileData.location,
};

export const headerSocial = {
  linkedin: profileData.linkedin || '',
  emailHref: `mailto:${profileData.email}`,
};
