import type { Phase, ReportSection, WorkPerformLabelMap } from '../domain/types';

export const workPerformLabelKey = (sectionId: string, phase: Phase): string =>
  `${sectionId}::${phase}`;

export function defaultWorkPerformed(section: ReportSection): string {
  const component = section.area === 'GENERAL' ? 'HULL' : section.component.trim().toUpperCase();
  // Removal here describes the entangled rope, not removal of the guard itself.
  if (component === 'ROPE GUARD' && section.service === 'REMOVAL') return 'ROPE REMOVAL';
  return `${component} ${section.service}`;
}

export function initializeWorkPerformLabels(sections: ReportSection[]): WorkPerformLabelMap {
  return Object.fromEntries(sections.flatMap((section) => section.phases.map((phase) => [
    workPerformLabelKey(section.id, phase),
    { main: defaultWorkPerformed(section), phase },
  ])));
}
