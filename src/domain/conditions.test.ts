import { describe, expect, it } from 'vitest';
import {
  deriveFoulingRating,
  deriveObservedRating,
  formatConditionSummary,
} from './conditions';

describe('report conditions', () => {
  it('derives the fouling rating from surface coverage', () => {
    expect(deriveFoulingRating('0%')).toBe('0');
    expect(deriveFoulingRating('1-5%')).toBe('2');
    expect(deriveFoulingRating('6-25%')).toBe('3');
    expect(deriveFoulingRating('51-100%')).toBe('5');
  });

  it('derives the observed rating from the selected level', () => {
    expect(deriveObservedRating('Normal / Trace')).toBe('1');
    expect(deriveObservedRating('Significant Observation')).toBe('4');
    expect(deriveObservedRating('Critical Observation')).toBe('5');
  });

  it('formats fouling and optional observed conditions for report summaries', () => {
    expect(formatConditionSummary({
      fouling: { type: 'Medium Macro Fouling', coverage: '6-25%' },
      observed: { type: 'Scratch', level: 'Minor Observation' },
    })).toBe('Fouling R3 Medium Macro Fouling 6-25% · Observed R2 Scratch');
  });
});
