import type { Condition, FoulingCoverage, FoulingType, ObservedLevel } from './types';

const foulingRatings: Record<Exclude<FoulingCoverage, ''>, string> = {
  '0%': '0',
  '1-100% / Slime Only': '1',
  '1-5%': '2',
  '6-25%': '3',
  '26-50%': '4',
  '51-100%': '5',
};

const foulingTypes: Record<Exclude<FoulingCoverage, ''>, FoulingType> = {
  '0%': 'Clean / No Fouling',
  '1-100% / Slime Only': 'Micro fouling',
  '1-5%': 'Light Macro fouling',
  '6-25%': 'Medium Macro Fouling',
  '26-50%': 'Heavy Macro fouling',
  '51-100%': 'Severe Macro Fouling',
};

const observedRatings: Record<Exclude<ObservedLevel, ''>, string> = {
  'Normal / Trace': '1',
  'Minor Observation': '2',
  'Notable Observation': '3',
  'Significant Observation': '4',
  'Critical Observation': '5',
};

export const emptyCondition = (): Condition => ({
  fouling: { type: '', coverage: '', slimeCoverage: null },
  observed: { type: '', level: 'Normal / Trace' },
});

export const cleanCondition = (): Condition => ({
  fouling: { type: 'Clean / No Fouling', coverage: '0%', slimeCoverage: null },
  observed: { type: '', level: 'Normal / Trace' },
});

export const deriveFoulingRating = (coverage: FoulingCoverage): string =>
  coverage ? foulingRatings[coverage] : '';

export const deriveFoulingType = (coverage: FoulingCoverage): FoulingType =>
  coverage ? foulingTypes[coverage] : '';

export const deriveObservedRating = (level: ObservedLevel): string =>
  level ? observedRatings[level] : '';

export function formatConditionSummary(condition?: Condition): string {
  if (!condition) return '—';
  const foulingRating = deriveFoulingRating(condition.fouling.coverage);
  const foulingType = deriveFoulingType(condition.fouling.coverage);
  const coverage = condition.fouling.coverage === '1-100% / Slime Only'
    ? `Slime Only ${condition.fouling.slimeCoverage ?? '—'}%`
    : condition.fouling.coverage;
  const fouling = foulingRating
    ? `Fouling R${foulingRating} ${foulingType} ${coverage}`
    : 'Fouling —';
  const observedRating = deriveObservedRating(condition.observed.level);
  return observedRating
    ? `${fouling} · Observed R${observedRating} ${condition.observed.type || condition.observed.level}`
    : fouling;
}
