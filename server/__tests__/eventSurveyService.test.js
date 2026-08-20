import { describe, expect, it } from 'vitest';
import { validateSurveyAnswers } from '../eventSurveyService.js';

describe('validateSurveyAnswers', () => {
  it('accepts a complete response', () => {
    const result = validateSurveyAnswers({
      rating: 5,
      valuable: 'The case discussion',
      improve: 'More time for Q&A',
      recommend: 'Yes',
    });
    expect(result.ok).toBe(true);
    expect(result.answers.rating).toBe(5);
    expect(result.answers.recommend).toBe('Yes');
  });

  it('rejects a missing rating', () => {
    const result = validateSurveyAnswers({
      valuable: 'Content',
      recommend: 'Yes',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/rate/i);
  });

  it('rejects an invalid recommend choice', () => {
    const result = validateSurveyAnswers({
      rating: 4,
      valuable: 'Content',
      recommend: 'Absolutely',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/valid option/i);
  });
});
