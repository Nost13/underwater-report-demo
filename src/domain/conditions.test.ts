import { describe, expect, it } from 'vitest';
import {
  deriveFoulingCondition,
  deriveObservedRating,
  emptyCondition,
  formatConditionSummary,
} from './conditions';

describe('report conditions', () => {
  it('derives fouling type and rating from entered coverage boundaries', () => {
    expect(deriveFoulingCondition(0, false)).toEqual({ rating: '0', type: 'Clean / No Fouling' });
    expect(deriveFoulingCondition(1, false)).toEqual({ rating: '2', type: 'Light Macro fouling' });
    expect(deriveFoulingCondition(5, false).rating).toBe('2');
    expect(deriveFoulingCondition(6, false).rating).toBe('3');
    expect(deriveFoulingCondition(25, false).rating).toBe('3');
    expect(deriveFoulingCondition(26, false).rating).toBe('4');
    expect(deriveFoulingCondition(50, false).rating).toBe('4');
    expect(deriveFoulingCondition(51, false)).toEqual({ rating: '5', type: 'Severe Macro Fouling' });
  });

  it('derives Micro fouling whenever Slime Only is checked for nonzero coverage', () => {
    expect(deriveFoulingCondition(1, true)).toEqual({ rating: '1', type: 'Micro fouling' });
    expect(deriveFoulingCondition(70, true)).toEqual({ rating: '1', type: 'Micro fouling' });
  });

  it('starts every phase with a Normal / Trace observed condition', () => {
    expect(emptyCondition().observed).toEqual({ type: '', level: 'Normal / Trace' });
    expect(deriveObservedRating(emptyCondition().observed.level)).toBe('1');
  });

  it('derives the observed rating from the selected level', () => {
    expect(deriveObservedRating('Normal / Trace')).toBe('1');
    expect(deriveObservedRating('Significant Observation')).toBe('4');
    expect(deriveObservedRating('Critical Observation')).toBe('5');
  });

  it('formats fouling and optional observed conditions for report summaries', () => {
    expect(formatConditionSummary({
      fouling: { type: 'Medium Macro Fouling', coverage: 20, slimeOnly: false },
      observed: { type: 'Scratch', level: 'Minor Observation' },
    })).toBe('Fouling R3 Medium Macro Fouling 20% · Observed R2 Scratch');
  });

  it('includes entered numeric surface coverage for Slime Only', () => {
    expect(formatConditionSummary({
      fouling: { type: 'Micro fouling', coverage: 37, slimeOnly: true },
      observed: { type: '', level: 'Normal / Trace' },
    } as unknown as ReturnType<typeof emptyCondition>)).toContain('Micro fouling 37%');
  });
});
