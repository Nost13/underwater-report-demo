import { defaultConditions } from '../domain/structure';
import type { Condition, Phase, ReportSection } from '../domain/types';

export type ConditionPatch = {
  fouling?: Partial<Condition['fouling']>;
  observed?: Partial<Condition['observed']>;
};

export type ConditionSource = 'GROUP' | 'OVERRIDE';
export type ConditionDefaults = Record<string, Partial<Record<Phase, Condition>>>;
export type ConditionSources = Record<
  string,
  Partial<Record<Phase, ConditionSource>>
>;

export const conditionGroupKey = (
  section: Pick<ReportSection, 'service' | 'area' | 'component'>,
): string => JSON.stringify([
  section.service,
  section.area,
  section.component.trim().toUpperCase(),
]);

export const cloneCondition = (condition: Condition): Condition => ({
  fouling: { ...condition.fouling },
  observed: { ...condition.observed },
});

export const patchCondition = (base: Condition, patch: ConditionPatch): Condition => ({
  fouling: { ...base.fouling, ...patch.fouling },
  observed: { ...base.observed, ...patch.observed },
});

export function conditionGroupMembers(
  sections: ReportSection[],
  anchor: ReportSection,
): ReportSection[] {
  const key = conditionGroupKey(anchor);
  return sections.filter((section) => conditionGroupKey(section) === key);
}

export function initializeConditionInheritance(sections: ReportSection[]): {
  conditionDefaults: ConditionDefaults;
  conditionSources: ConditionSources;
} {
  const conditionDefaults: ConditionDefaults = {};
  const conditionSources: ConditionSources = {};

  for (const section of sections) {
    const groupKey = conditionGroupKey(section);
    conditionDefaults[groupKey] ??= {};
    conditionSources[section.id] ??= {};
    const serviceDefaults = defaultConditions(section.service);

    for (const phase of section.phases) {
      const effective = section.conditions[phase] ?? serviceDefaults[phase];
      if (effective && !conditionDefaults[groupKey][phase]) {
        conditionDefaults[groupKey][phase] = cloneCondition(effective);
      }
      conditionSources[section.id][phase] = 'GROUP';
    }
  }

  return { conditionDefaults, conditionSources };
}
