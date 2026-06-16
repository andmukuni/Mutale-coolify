/** @typedef {'classic' | 'modern' | 'minimal' | 'executive' | 'creative' | 'sidebarBlue' | 'sidebarDark'} CvTemplateId */

export const DEFAULT_CV_TEMPLATE_ID = 'classic';

export const CV_TEMPLATE_STORAGE_KEY = 'mutale_cv_template_id';

/** @type {Array<{ id: CvTemplateId, label: string, description: string, swatch: { bg: string, accent: string, text?: string } }>} */
export const CV_TEMPLATES = [
  {
    id: 'sidebarBlue',
    label: 'Blue sidebar',
    description: 'Photo sidebar, skills, languages, and timeline — professional two-column layout.',
    swatch: { bg: '#ffffff', accent: '#1a365d', text: '#1e293b' },
  },
  {
    id: 'sidebarDark',
    label: 'Dark sidebar',
    description: 'Charcoal column with photo, contact blocks, and dated experience sections.',
    swatch: { bg: '#ffffff', accent: '#3d4450', text: '#111111' },
  },
  {
    id: 'classic',
    label: 'Classic',
    description: 'Clean Mutale teal accents — ideal for healthcare and training roles.',
    swatch: { bg: '#ffffff', accent: '#00a79d', text: '#141d45' },
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Sidebar layout with bold accent column and structured sections.',
    swatch: { bg: '#f8fafc', accent: '#0e7490', text: '#0f172a' },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Elegant serif typography with understated black-and-white styling.',
    swatch: { bg: '#fafaf9', accent: '#1c1917', text: '#292524' },
  },
  {
    id: 'executive',
    label: 'Executive',
    description: 'Navy header band with gold highlights for senior professional profiles.',
    swatch: { bg: '#ffffff', accent: '#c9a227', text: '#141d45' },
  },
  {
    id: 'creative',
    label: 'Creative',
    description: 'Soft gradient header and rounded cards for a contemporary look.',
    swatch: { bg: '#f0fdfa', accent: '#7c3aed', text: '#1e1b4b' },
  },
];

export function isValidCvTemplateId(id) {
  return CV_TEMPLATES.some((t) => t.id === id);
}

export function resolveCvTemplateId(id) {
  return isValidCvTemplateId(id) ? id : DEFAULT_CV_TEMPLATE_ID;
}

export function readStoredCvTemplateId() {
  if (typeof localStorage === 'undefined') return DEFAULT_CV_TEMPLATE_ID;
  try {
    return resolveCvTemplateId(localStorage.getItem(CV_TEMPLATE_STORAGE_KEY) || '');
  } catch {
    return DEFAULT_CV_TEMPLATE_ID;
  }
}

export function storeCvTemplateId(id) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CV_TEMPLATE_STORAGE_KEY, resolveCvTemplateId(id));
  } catch {
    // ignore quota errors
  }
}
