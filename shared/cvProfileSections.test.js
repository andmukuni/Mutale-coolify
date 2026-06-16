import { describe, it, expect } from 'vitest';
import {
  normalizeCvSections,
  formatExperienceDates,
  emptyExperienceEntry,
} from './cvProfileSections.js';

describe('normalizeCvSections', () => {
  it('normalizes experience entries', () => {
    const out = normalizeCvSections({
      experience: [{
        company: 'MOH',
        title: 'QA Lead',
        startDate: '2020',
        endDate: '2024',
        current: false,
        description: 'Led ISO rollout',
      }],
    });
    expect(out.experience).toHaveLength(1);
    expect(out.experience[0].company).toBe('MOH');
  });

  it('drops empty rows', () => {
    const out = normalizeCvSections({
      education: [{ institution: '', degree: '' }],
      experience: [emptyExperienceEntry()],
    });
    expect(out.education).toHaveLength(0);
    expect(out.experience).toHaveLength(0);
  });
});

describe('formatExperienceDates', () => {
  it('shows present for current roles', () => {
    expect(formatExperienceDates({ current: true, startDate: 'Jan 2024' })).toContain('Present');
  });
});
