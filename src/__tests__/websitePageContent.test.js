import { describe, expect, it } from 'vitest';
import { EXPERTISE_ICON_OPTIONS } from '../data/websitePages';
import {
  createEmptyExpertiseArea,
  createEmptyExperienceItem,
  linesToResponsibilities,
  moveItem,
  normalizeExpertiseArea,
  normalizeExperienceItem,
  normalizeExpertiseAreas,
  normalizeTestimonial,
  responsibilitiesToLines,
} from '../utils/websitePageContent';

describe('websitePageContent', () => {
  it('exports expertise icon options from icon map', () => {
    expect(EXPERTISE_ICON_OPTIONS).toContain('Shield');
    expect(EXPERTISE_ICON_OPTIONS).toContain('GraduationCap');
  });

  it('normalizeExpertiseArea trims and falls back invalid icon', () => {
    expect(
      normalizeExpertiseArea({ icon: 'Invalid', title: '  QA  ', description: '  desc  ' }),
    ).toEqual({
      icon: 'Shield',
      title: 'QA',
      description: 'desc',
    });
  });

  it('normalizeTestimonial ensures id', () => {
    const result = normalizeTestimonial({ quote: 'Great', name: 'Director', org: 'Org' }, 0);
    expect(result.id).toBeTruthy();
    expect(result.quote).toBe('Great');
    expect(result.jobTitle).toBe('Director');
    expect(result.name).toBe('');
    expect(result.org).toBe('Org');
  });

  it('normalizeTestimonial keeps full name and job title separate', () => {
    const result = normalizeTestimonial({
      quote: 'Great',
      name: 'Jane Doe',
      jobTitle: 'Laboratory Director',
      org: 'Regional Programme',
    }, 0);
    expect(result.name).toBe('Jane Doe');
    expect(result.jobTitle).toBe('Laboratory Director');
    expect(result.org).toBe('Regional Programme');
  });

  it('normalizeExperienceItem parses responsibilities from lines', () => {
    const item = normalizeExperienceItem({
      role: 'Manager',
      responsibilities: 'Line one\nLine two\n',
    });
    expect(item.responsibilities).toEqual(['Line one', 'Line two']);
  });

  it('responsibilities round-trip through lines', () => {
    const lines = responsibilitiesToLines(['A', 'B']);
    expect(linesToResponsibilities(lines)).toEqual(['A', 'B']);
  });

  it('moveItem swaps adjacent entries', () => {
    const next = moveItem([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 1, 1);
    expect(next.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('normalizeExpertiseAreas maps array', () => {
    const areas = normalizeExpertiseAreas([createEmptyExpertiseArea()]);
    expect(areas).toHaveLength(1);
    expect(areas[0].icon).toBe('Shield');
  });

  it('createEmptyExperienceItem has empty responsibilities', () => {
    expect(createEmptyExperienceItem().responsibilities).toEqual([]);
  });
});
