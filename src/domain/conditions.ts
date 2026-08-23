import type { Condition, FoulingCoverage, ObservedLevel } from './types';

const foulingRatings: Record<Exclude<FoulingCoverage, ''>, string> = {
  '0%': '0',
  '1-100% / Slime Only': '1',
  '1-5%': '2',
  '6-25%': '3',
  '26-50%': '4',
  '51-100%': '5',
};

const observedRatings: Record<Exclude<ObservedLevel, ''>, string> = {
  'Normal / Trace': '1',
  'Minor Observation': '2',
  'Notable Observation': '3',
  'Significant Observation': '4',
  'Critical Observation': '5',
};

export const emptyCondition = (): Condition => ({
  fouling: { type: '', coverage: '' },
  observed: { type: '', level: '' },
});

export const cleanCondition = (): Condition => ({
  fouling: { type: 'Clean / No Fouling', coverage: '0%' },
  observed: { type: '', level: '' },
});

export const deriveFoulingRating = (coverage: FoulingCoverage): string =>
  coverage ? foulingRatings[coverage] : '';

export const deriveObservedRating = (level: ObservedLevel): string =>
  level ? observedRatings[level] : '';

export function formatConditionSummary(condition?: Condition): string {
  if (!condition) return '—';
  const foulingRating = deriveFoulingRating(condition.fouling.coverage);
  const fouling = foulingRating
    ? `Fouling R${foulingRating} ${condition.fouling.type || '—'} ${condition.fouling.coverage}`
    : 'Fouling —';
  const observedRating = deriveObservedRating(condition.observed.level);
  return observedRating
    ? `${fouling} · Observed R${observedRating} ${condition.observed.type || '—'}`
    : fouling;
}
