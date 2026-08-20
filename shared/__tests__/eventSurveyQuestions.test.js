import { describe, expect, it } from 'vitest';
import {
  createSurveyQuestion,
  normalizeSurveyQuestions,
  validateSurveyAnswers,
  validateSurveyQuestionList,
} from '../eventSurveyQuestions.js';

describe('event survey questions', () => {
  it('maps the legacy text type to long answer', () => {
    const [question] = normalizeSurveyQuestions([{ id: 'notes', type: 'text', label: 'Notes' }]);
    expect(question.type).toBe('long_text');
  });

  it('falls back to the starter set when nothing is stored', () => {
    const questions = normalizeSurveyQuestions(null, { fallbackToDefault: true });
    expect(questions).toHaveLength(4);
    expect(questions[0].id).toBe('rating');
  });

  it('rejects a question without a title', () => {
    const result = validateSurveyQuestionList([createSurveyQuestion('short_text')]);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/title/i);
  });

  it('validates a custom checkbox question', () => {
    const questions = [{
      id: 'tracks',
      type: 'multi_choice',
      label: 'Which sessions did you attend?',
      required: true,
      options: ['Morning', 'Afternoon'],
    }];
    expect(validateSurveyAnswers({ tracks: ['Morning'] }, questions).ok).toBe(true);
    expect(validateSurveyAnswers({ tracks: [] }, questions).ok).toBe(false);
  });

  it('validates an NPS score', () => {
    const questions = [{
      id: 'nps',
      type: 'nps',
      label: 'How likely are you to recommend us?',
      required: true,
    }];
    expect(validateSurveyAnswers({ nps: 9 }, questions).ok).toBe(true);
    expect(validateSurveyAnswers({ nps: 12 }, questions).ok).toBe(false);
  });
});
