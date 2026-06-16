import { Shield, Microscope, FileCheck, HeartPulse, FileText, GraduationCap } from 'lucide-react';
import { educationData, leadershipTrainingData } from './education';
import { experienceData } from './experience';

export const expertiseIconMap = {
  Shield,
  Microscope,
  FileCheck,
  HeartPulse,
  FileText,
  GraduationCap,
};

export const EXPERTISE_ICON_OPTIONS = Object.keys(expertiseIconMap);

export const defaultWebsitePages = {
  home: {
    heroEyebrow: 'Quality Assurance & Diagnostics',
    trustedByLabel: 'Mutale has worked with',
    trustedBy: [
      'Africa CDC',
      'CIDRZ',
      'FIND',
      'WHO',
      'ASLM',
      'Ministry of Health - Zambia',
      'HPCZ',
    ],
    aboutEyebrow: 'About',
    aboutTitle: 'Driving Quality Excellence in Healthcare Diagnostics',
    aboutTags: ['ISO 15189', 'ISO 9001', 'ISO 17025', 'SLIPTA/SLMTA', 'GLP/GCLP'],
    expertiseLabel: 'Expertise',
    expertiseTitle: 'Core Competencies',
    expertiseDescription: 'Comprehensive expertise spanning quality assurance, diagnostics, ISO standards, and public health programme delivery.',
    expertiseAreas: [
      {
        icon: 'Shield',
        title: 'Quality Assurance & Compliance',
        description: 'ISO-based quality management systems, internal auditing, compliance oversight, and regulatory alignment across clinical and public health laboratory networks.',
      },
      {
        icon: 'Microscope',
        title: 'Diagnostics Systems',
        description: 'Technical support for diagnostic testing services, product quality oversight, and post-market surveillance for in-vitro diagnostics in LMIC settings.',
      },
      {
        icon: 'FileCheck',
        title: 'ISO-Based Quality Systems',
        description: 'Implementation and maintenance of ISO 15189, ISO 9001, ISO 17025, ISO 17043, ISO 19011, and ISO 22367 across laboratory and health programme settings.',
      },
      {
        icon: 'HeartPulse',
        title: 'Public Health Programmes',
        description: 'PEPFAR, Global Fund, and donor-supported programme delivery including HIV, TB, and malaria diagnostic services and quality improvement.',
      },
      {
        icon: 'FileText',
        title: 'Technical Documentation',
        description: 'Document control systems, SOP management, validation protocols, technical reports, quality dashboards, and regulatory submissions.',
      },
      {
        icon: 'GraduationCap',
        title: 'Training & Capacity Building',
        description: 'Design and delivery of training programmes on quality systems, biosafety, equipment management, and competency assessment frameworks.',
      },
    ],
    testimonialsLabel: 'Testimonials',
    testimonialsTitle: 'What Partners Say',
    testimonialsDescription: 'Feedback from colleagues and programme teams across laboratory quality, diagnostics, and systems strengthening work.',
    testimonials: [
      {
        id: 't-1',
        quote: 'Mutale brought structure and clarity to our quality systems, helping our laboratory network move from compliance anxiety to confident, measurable performance.',
        name: 'Laboratory Director',
        org: 'Regional Public Health Programme',
      },
      {
        id: 't-2',
        quote: 'Her mentorship transformed how our team handles CAPA, internal audits, and documentation. We now have stronger accountability and better outcomes.',
        name: 'Quality Officer',
        org: 'Provincial Hospital Laboratory',
      },
      {
        id: 't-3',
        quote: 'From diagnostics quality oversight to practical training delivery, Mutale consistently combines technical depth with hands-on implementation support.',
        name: 'Programme Manager',
        org: 'International Health Partner',
      },
      {
        id: 't-4',
        quote: 'The systems she helped us build are sustainable, not just project-driven. Our staff confidence and routine quality performance improved significantly.',
        name: 'Senior Biomedical Scientist',
        org: 'Teaching Hospital Network',
      },
    ],
    ctaTitle: "Let's Work Together",
  },
  about: {
    headerEyebrow: 'About',
    summaryLabel: 'Profile',
    summaryTitle: 'Professional Summary',
    highlightsLabel: 'Highlights',
    highlightsTitle: 'Relevant Profile',
    standardsLabel: 'Expertise',
    standardsTitle: 'Standards & Tools',
    standardsDescription: 'ISO standards, quality frameworks, and technical tools in my professional toolkit.',
    technologyLabel: 'Technology',
    technologyTitle: 'Computer Proficiency',
    affiliationsLabel: 'Memberships',
    affiliationsTitle: 'Professional Affiliations',
    educationLabel: 'Education',
    educationTitle: 'Education & Qualifications',
    education: educationData,
    trainingLabel: 'Training',
    trainingTitle: 'Leadership & Professional Training',
    leadershipTraining: leadershipTrainingData,
  },
  experience: {
    headerEyebrow: 'Career',
    title: 'Professional Experience',
    intro: 'Over 15 years of progressive experience in laboratory quality systems, diagnostics, and public health programme delivery across sub-Saharan Africa.',
    items: experienceData,
  },
  customPages: [],
};

function mergeSection(defaultSection = {}, savedSection = {}) {
  const source = savedSection && typeof savedSection === 'object' ? savedSection : {};
  const merged = { ...defaultSection, ...source };
  for (const [key, value] of Object.entries(defaultSection)) {
    if (Array.isArray(value) && !Array.isArray(merged[key])) merged[key] = value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeSection(value, merged[key]);
    }
  }
  return merged;
}

export function mergeWebsitePages(savedPages = {}) {
  const source = savedPages && typeof savedPages === 'object' ? savedPages : {};
  return {
    home: mergeSection(defaultWebsitePages.home, source.home),
    about: mergeSection(defaultWebsitePages.about, source.about),
    experience: mergeSection(defaultWebsitePages.experience, source.experience),
    customPages: Array.isArray(source.customPages) ? source.customPages : [],
  };
}
