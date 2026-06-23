import { EXPERTISE_ICON_OPTIONS } from '../data/websitePages';

export { EXPERTISE_ICON_OPTIONS };

function clean(value) {
  return String(value ?? '').trim();
}

function ensureId(prefix, raw, index) {
  const id = clean(raw);
  return id || `${prefix}-${Date.now()}-${index}`;
}

export function linesToResponsibilities(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function responsibilitiesToLines(items) {
  return Array.isArray(items) ? items.join('\n') : '';
}

export function normalizeExpertiseArea(item = {}, index = 0) {
  const icon = clean(item.icon) || 'Shield';
  return {
    icon: EXPERTISE_ICON_OPTIONS.includes(icon) ? icon : 'Shield',
    title: clean(item.title) || 'New expertise area',
    description: clean(item.description),
  };
}

export function normalizeTestimonial(item = {}, index = 0) {
  const org = clean(item.org);
  const hasJobTitleField = Object.prototype.hasOwnProperty.call(item, 'jobTitle');
  const jobTitle = clean(item.jobTitle || item.title || item.role);
  const name = clean(item.fullName || item.name);

  // Legacy records stored job title in `name` before `jobTitle` existed.
  if (!hasJobTitleField && name) {
    return {
      id: ensureId('t', item.id, index),
      quote: clean(item.quote),
      name: '',
      jobTitle: name,
      org,
    };
  }

  return {
    id: ensureId('t', item.id, index),
    quote: clean(item.quote),
    name,
    jobTitle,
    org,
  };
}

export function normalizeEducationEntry(item = {}, index = 0) {
  return {
    id: ensureId('edu', item.id, index),
    degree: clean(item.degree) || 'New qualification',
    institution: clean(item.institution),
    location: clean(item.location),
    year: clean(item.year),
    description: clean(item.description),
  };
}

export function normalizeTrainingEntry(item = {}, index = 0) {
  return {
    id: ensureId('training', item.id, index),
    title: clean(item.title) || 'New training',
    organization: clean(item.organization),
    year: clean(item.year),
    description: clean(item.description),
  };
}

export function normalizeExperienceItem(item = {}, index = 0) {
  const responsibilities = Array.isArray(item.responsibilities)
    ? item.responsibilities.map(clean).filter(Boolean)
    : linesToResponsibilities(item.responsibilities);

  return {
    id: ensureId('exp', item.id, index),
    role: clean(item.role) || 'New role',
    organization: clean(item.organization),
    project: clean(item.project),
    location: clean(item.location),
    startDate: clean(item.startDate),
    endDate: clean(item.endDate),
    responsibilities,
  };
}

export function normalizeExpertiseAreas(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => normalizeExpertiseArea(item, index));
}

export function normalizeTestimonials(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => normalizeTestimonial(item, index));
}

export function normalizeEducationEntries(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => normalizeEducationEntry(item, index));
}

export function normalizeTrainingEntries(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => normalizeTrainingEntry(item, index));
}

export function normalizeExperienceItems(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => normalizeExperienceItem(item, index));
}

export function createEmptyExpertiseArea() {
  return normalizeExpertiseArea({ icon: 'Shield', title: '', description: '' });
}

export function createEmptyTestimonial() {
  return normalizeTestimonial({ quote: '', name: '', jobTitle: '', org: '' });
}

export function createEmptyEducationEntry() {
  return normalizeEducationEntry({ degree: '', institution: '', location: '', year: '', description: '' });
}

export function createEmptyTrainingEntry() {
  return normalizeTrainingEntry({ title: '', organization: '', year: '', description: '' });
}

export function createEmptyExperienceItem() {
  return normalizeExperienceItem({
    role: '',
    organization: '',
    project: '',
    location: '',
    startDate: '',
    endDate: '',
    responsibilities: [],
  });
}

export function moveItem(items, index, direction) {
  const next = [...items];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function updateItemAt(items, index, updates) {
  return items.map((item, i) => (i === index ? { ...item, ...updates } : item));
}

export function removeItemAt(items, index) {
  return items.filter((_, i) => i !== index);
}
