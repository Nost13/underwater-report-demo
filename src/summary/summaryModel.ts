import { deriveFoulingCondition, deriveObservedRating } from '../domain/conditions';
import type { Condition, Phase, ReportSection, Side } from '../domain/types';

export const MAIN_HULL_ORDER = ['FWD', 'FWD-MID', 'MID', 'MID-AFT', 'AFT'] as const;
export const SIDE_ORDER = ['PORT', 'STBD', 'BOTTOM'] as const;
export const SUMMARY_NICHE_ORDER = [
  'BULBOUS BOW',
  'BOW THRUSTER',
  'BILGE KEEL',
  'SEA CHEST',
  'DISCHARGE PIPE',
  'ANODE / ICCP',
  'TRANSDUCER',
  'STERN FRAME',
  'ROPE GUARD',
  'PROPELLER BLADE',
  'BOSS CAP',
  'RUDDER & PINTLE',
] as const;

const DISPLAY_COMPONENT: Record<string, string> = {
  'BULBOUS BOW': 'Bulbous Bow',
  'BOW THRUSTER': 'Bow Thruster',
  'BILGE KEEL': 'Bilge Keel',
  'SEA CHEST': 'Sea Chest',
  'DISCHARGE PIPE': 'Discharge Pipe',
  'ANODE / ICCP': 'Anode / ICCP',
  TRANSDUCER: 'Transducer',
  'STERN FRAME': 'Stern Frame',
  'ROPE GUARD': 'Rope Guard',
  'PROPELLER BLADE': 'Propeller',
  'BOSS CAP': 'Boss Cap',
  'RUDDER & PINTLE': 'Rudder & Pintle',
};

export interface SummaryRow {
  key: string;
  area: 'GENERAL' | 'NICHE';
  component: string;
  sourceComponent: string;
  side?: Side;
  phase: Phase;
  foulingRating: string;
  foulingType: string;
  coverage: string;
  observedRating: string;
  observedLevel: string;
  observedType: string;
}

export interface SummaryModel {
  mainHullRows: SummaryRow[];
  nicheRows: SummaryRow[];
  overviewRows: SummaryRow[];
  headline: string;
  narrative: string;
  pageCount: number;
}

const rank = (values: readonly string[], value?: string) => {
  const index = value ? values.indexOf(value) : -1;
  return index < 0 ? values.length : index;
};

const finalPhase = (section: ReportSection): Phase => {
  if (section.phases.includes('AFTER') && section.conditions.AFTER) return 'AFTER';
  if (section.phases.includes('CURRENT') && section.conditions.CURRENT) return 'CURRENT';
  return section.phases.find((phase) => section.conditions[phase]) ?? section.phases[0];
};

function rowFromCondition(section: ReportSection, phase: Phase, condition: Condition): SummaryRow {
  const fouling = deriveFoulingCondition(condition.fouling.coverage, condition.fouling.slimeOnly);
  const sourceComponent = section.component === 'RUDDER' ? 'RUDDER & PINTLE' : section.component;
  const displayComponent = section.area === 'GENERAL'
    ? section.component
    : DISPLAY_COMPONENT[sourceComponent] ?? sourceComponent;
  return {
    key: [section.area, sourceComponent, section.side].filter(Boolean).join('/'),
    area: section.area,
    component: displayComponent,
    sourceComponent,
    side: section.side,
    phase,
    foulingRating: fouling.rating,
    foulingType: fouling.type,
    coverage: condition.fouling.coverage === null ? '' : `${condition.fouling.coverage}%`,
    observedRating: deriveObservedRating(condition.observed.level),
    observedLevel: condition.observed.level,
    observedType: condition.observed.type,
  };
}

const score = (value: string) => Number.parseInt(value || '-1', 10);
const coverageScore = (value: string) => Number.parseFloat(value.replace('%', '')) || 0;

function aggregateRows(rows: SummaryRow[]): SummaryRow[] {
  const grouped = new Map<string, SummaryRow>();
  for (const row of rows) {
    const current = grouped.get(row.key);
    if (!current) {
      grouped.set(row.key, { ...row });
      continue;
    }
    if (
      score(row.foulingRating) > score(current.foulingRating)
      || (row.foulingRating === current.foulingRating && coverageScore(row.coverage) > coverageScore(current.coverage))
    ) {
      current.foulingRating = row.foulingRating;
      current.foulingType = row.foulingType;
      current.coverage = row.coverage;
    }
    if (score(row.observedRating) > score(current.observedRating)) {
      current.observedRating = row.observedRating;
      current.observedLevel = row.observedLevel;
      current.observedType = row.observedType;
    }
  }
  return [...grouped.values()];
}

function emptyOverviewRow(sourceComponent: string): SummaryRow {
  return {
    key: `NICHE/${sourceComponent}`,
    area: 'NICHE',
    component: DISPLAY_COMPONENT[sourceComponent] ?? sourceComponent,
    sourceComponent,
    phase: 'CURRENT',
    foulingRating: '', foulingType: '', coverage: '',
    observedRating: '', observedLevel: '', observedType: '',
  };
}

function worstForComponent(rows: SummaryRow[], component: string): SummaryRow {
  const matches = rows.filter((row) => row.sourceComponent === component);
  if (!matches.length) return emptyOverviewRow(component);
  const base = { ...matches[0], key: `NICHE/${component}`, side: undefined };
  for (const row of matches.slice(1)) {
    if (
      score(row.foulingRating) > score(base.foulingRating)
      || (row.foulingRating === base.foulingRating && coverageScore(row.coverage) > coverageScore(base.coverage))
    ) {
      base.foulingRating = row.foulingRating;
      base.foulingType = row.foulingType;
      base.coverage = row.coverage;
    }
    if (score(row.observedRating) > score(base.observedRating)) {
      base.observedRating = row.observedRating;
      base.observedLevel = row.observedLevel;
      base.observedType = row.observedType;
    }
  }
  return base;
}

function overallText(rows: SummaryRow[]): Pick<SummaryModel, 'headline' | 'narrative'> {
  const fouling = rows.reduce<SummaryRow | null>((worst, row) => (
    !worst || score(row.foulingRating) > score(worst.foulingRating) ? row : worst
  ), null);
  const observed = rows.reduce<SummaryRow | null>((worst, row) => (
    !worst || score(row.observedRating) > score(worst.observedRating) ? row : worst
  ), null);
  if (!fouling || !fouling.foulingRating) {
    return {
      headline: 'No Biofouling Condition Was Recorded',
      narrative: 'No completed Detail condition is available for the current report scope.',
    };
  }
  const observedPhrase = observed?.observedRating
    ? ` Observed condition reached Rating ${observed.observedRating} (${observed.observedLevel})${observed.observedType ? `, with ${observed.observedType} recorded` : ''}.`
    : '';
  return {
    headline: `${fouling.foulingType} Was Observed`,
    narrative: `The highest final biofouling condition was Rating ${fouling.foulingRating} (${fouling.foulingType}), recorded at ${fouling.component}${fouling.side ? ` ${fouling.side}` : ''} with ${fouling.coverage || 'no coverage value'}.${observedPhrase}`,
  };
}

export function buildSummaryModel(sections: ReportSection[]): SummaryModel {
  const finalRows = sections
    .filter((section) => section.component !== 'FIN BLADE')
    .map((section) => {
      const phase = finalPhase(section);
      const condition = section.conditions[phase];
      return condition ? rowFromCondition(section, phase, condition) : null;
    })
    .filter((row): row is SummaryRow => row !== null);
  const aggregated = aggregateRows(finalRows);
  const mainHullRows = aggregated
    .filter((row) => row.area === 'GENERAL')
    .sort((left, right) => (
      rank(MAIN_HULL_ORDER, left.sourceComponent) - rank(MAIN_HULL_ORDER, right.sourceComponent)
      || rank(SIDE_ORDER, left.side) - rank(SIDE_ORDER, right.side)
    ));
  const nicheRows = aggregated
    .filter((row) => row.area === 'NICHE' && rank(SUMMARY_NICHE_ORDER, row.sourceComponent) < SUMMARY_NICHE_ORDER.length)
    .sort((left, right) => (
      rank(SUMMARY_NICHE_ORDER, left.sourceComponent) - rank(SUMMARY_NICHE_ORDER, right.sourceComponent)
      || rank(SIDE_ORDER, left.side) - rank(SIDE_ORDER, right.side)
    ));
  const overviewRows = SUMMARY_NICHE_ORDER.map((component) => worstForComponent(nicheRows, component));
  const text = overallText([...mainHullRows, ...nicheRows]);
  return {
    mainHullRows,
    nicheRows,
    overviewRows,
    ...text,
    pageCount: 1 + (mainHullRows.length ? 2 : 0) + (nicheRows.length ? 1 : 0),
  };
}
