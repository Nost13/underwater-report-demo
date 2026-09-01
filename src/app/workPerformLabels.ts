import type { Phase, ReportSection, WorkPerformLabelMap } from '../domain/types';

export const workPerformLabelKey = (sectionId: string, phase: Phase): string =>
  `${sectionId}::${phase}`;

export const defaultWorkPerformLabel = (phase: Phase): string =>
  phase[0] + phase.slice(1).toLowerCase();

export function initializeWorkPerformLabels(sections: ReportSection[]): WorkPerformLabelMap {
  return Object.fromEntries(sections.flatMap((section) => section.phases.map((phase) => [
    workPerformLabelKey(section.id, phase),
    defaultWorkPerformLabel(phase),
  ])));
}
