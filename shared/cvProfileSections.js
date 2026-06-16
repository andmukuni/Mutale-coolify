function newId() {
  return `cv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cleanStr(v, max = 500) {
  return String(v ?? '').trim().slice(0, max);
}

export function emptyEducationEntry() {
  return {
    id: newId(),
    institution: '',
    degree: '',
    field: '',
    startYear: '',
    endYear: '',
    description: '',
  };
}

export function emptyExperienceEntry() {
  return {
    id: newId(),
    company: '',
    title: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    description: '',
  };
}

export function emptyReferenceEntry() {
  return {
    id: newId(),
    name: '',
    title: '',
    organization: '',
    email: '',
    phone: '',
    relationship: '',
  };
}

function normalizeEducationEntry(row = {}) {
  return {
    id: cleanStr(row.id, 64) || newId(),
    institution: cleanStr(row.institution, 255),
    degree: cleanStr(row.degree, 255),
    field: cleanStr(row.field, 255),
    startYear: cleanStr(row.startYear, 32),
    endYear: cleanStr(row.endYear, 32),
    description: cleanStr(row.description, 2000),
  };
}

function normalizeExperienceEntry(row = {}) {
  return {
    id: cleanStr(row.id, 64) || newId(),
    company: cleanStr(row.company, 255),
    title: cleanStr(row.title, 255),
    location: cleanStr(row.location, 255),
    startDate: cleanStr(row.startDate, 32),
    endDate: cleanStr(row.endDate, 32),
    current: Boolean(row.current),
    description: cleanStr(row.description, 3000),
  };
}

function normalizeReferenceEntry(row = {}) {
  return {
    id: cleanStr(row.id, 64) || newId(),
    name: cleanStr(row.name, 255),
    title: cleanStr(row.title, 255),
    organization: cleanStr(row.organization, 255),
    email: cleanStr(row.email, 255),
    phone: cleanStr(row.phone, 64),
    relationship: cleanStr(row.relationship, 255),
  };
}

function normalizeList(list, normalizer, max = 20) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max).map(normalizer).filter((row) => {
    const values = Object.entries(row).filter(([k]) => k !== 'id' && k !== 'current');
    return values.some(([, v]) => String(v).trim());
  });
}

/**
 * @param {unknown} raw
 * @returns {{ education: object[], experience: object[], references: object[] }}
 */
export function normalizeCvSections(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    education: normalizeList(src.education, normalizeEducationEntry, 15),
    experience: normalizeList(src.experience, normalizeExperienceEntry, 20),
    references: normalizeList(src.references, normalizeReferenceEntry, 10),
  };
}

export function parseCvSectionsFromDb(stored) {
  if (!stored) return normalizeCvSections({});
  if (typeof stored === 'object' && !Array.isArray(stored)) {
    return normalizeCvSections(stored);
  }
  if (typeof stored === 'string' && stored.trim()) {
    try {
      return normalizeCvSections(JSON.parse(stored));
    } catch {
      return normalizeCvSections({});
    }
  }
  return normalizeCvSections({});
}

export function formatEducationDates(entry) {
  const start = entry.startYear || '';
  const end = entry.endYear || '';
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

export function formatExperienceDates(entry) {
  if (entry.current) {
    const start = entry.startDate || '';
    return start ? `${start} – Present` : 'Present';
  }
  const start = entry.startDate || '';
  const end = entry.endDate || '';
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

export function experienceDescriptionLines(description = '') {
  return String(description)
    .split(/\n+/)
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}
