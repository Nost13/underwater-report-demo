import type { Condition, FoulingCoverage, FoulingType, ObservedLevel } from './types';

const observedRatings: Record<Exclude<ObservedLevel, ''>, string> = {
  'Normal / Trace': '1',
  'Minor Observation': '2',
  'Notable Observation': '3',
  'Significant Observation': '4',
  'Critical Observation': '5',
};

export const emptyCondition = (): Condition => ({
  fouling: { type: '', coverage: null, slimeOnly: false },
  observed: { type: '', level: 'Normal / Trace' },
});

export const cleanCondition = (): Condition => ({
  fouling: { type: 'Clean / No Fouling', coverage: 0, slimeOnly: false },
  observed: { type: '', level: 'Normal / Trace' },
});

export function deriveFoulingCondition(
  coverage: FoulingCoverage,
  slimeOnly: boolean,
): { rating: string; type: FoulingType } {
  if (coverage === null) return { rating: '', type: '' };
  if (coverage === 0) return { rating: '0', type: 'Clean / No Fouling' };
  if (slimeOnly) return { rating: '1', type: 'Micro fouling' };
  if (coverage <= 5) return { rating: '2', type: 'Light Macro fouling' };
  if (coverage <= 25) return { rating: '3', type: 'Medium Macro Fouling' };
  if (coverage <= 50) return { rating: '4', type: 'Heavy Macro fouling' };
  return { rating: '5', type: 'Severe Macro Fouling' };
}

export const deriveFoulingRating = (coverage: FoulingCoverage, slimeOnly = false): string =>
  deriveFoulingCondition(coverage, slimeOnly).rating;

export const deriveFoulingType = (coverage: FoulingCoverage, slimeOnly = false): FoulingType =>
  deriveFoulingCondition(coverage, slimeOnly).type;

export const deriveObservedRating = (level: ObservedLevel): string =>
  level ? observedRatings[level] : '';

export function formatConditionSummary(condition?: Condition): string {
  if (!condition) return '—';
  const foulingRating = deriveFoulingRating(condition.fouling.coverage, condition.fouling.slimeOnly);
  const foulingType = deriveFoulingType(condition.fouling.coverage, condition.fouling.slimeOnly);
  const coverage = condition.fouling.coverage === null ? '' : `${condition.fouling.coverage}%`;
  const fouling = foulingRating
    ? `Fouling R${foulingRating} ${foulingType} ${coverage}`
    : 'Fouling —';
  const observedRating = deriveObservedRating(condition.observed.level);
  return observedRating
    ? `${fouling} · Observed R${observedRating} ${condition.observed.type || condition.observed.level}`
    : fouling;
}
