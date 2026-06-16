import { describe, it, expect } from 'vitest';
import { buildCvStrengthSuggestions } from './cvStrengthSuggestions.js';

describe('buildCvStrengthSuggestions', () => {
  it('flags missing headline and summary', () => {
    const { suggestions } = buildCvStrengthSuggestions({
      user: { name: 'Test User' },
      certificates: [],
      registrations: [],
    });
    expect(suggestions.some((s) => s.id === 'profession')).toBe(true);
    expect(suggestions.some((s) => s.id === 'about')).toBe(true);
  });

  it('returns fewer high-priority gaps for a complete profile', () => {
    const weak = buildCvStrengthSuggestions({ user: {}, certificates: [], registrations: [] });
    const strong = buildCvStrengthSuggestions({
      user: {
        profession: 'QA Specialist',
        about: 'Over ten years of laboratory quality systems experience across public health networks with ISO 15189 implementation and audit support.',
        organization: 'MOH',
        phone: '+260977000000',
        linkedin_url: 'https://linkedin.com/in/test',
        specialties: ['ISO 15189', 'IQC', 'CAPA'],
      },
      certificates: [{ event_title: 'Workshop', issued_at: '2026-01-01' }],
      registrations: [{ status: 'attended', event_title: 'Workshop', registered_at: '2026-01-01' }],
    });
    const weakHigh = weak.suggestions.filter((s) => s.priority === 'high').length;
    const strongHigh = strong.suggestions.filter((s) => s.priority === 'high').length;
    expect(strongHigh).toBeLessThan(weakHigh);
  });
});
