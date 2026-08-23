import { deriveFoulingCondition, deriveObservedRating } from '../domain/conditions';
import type { Phase, PhotoData, ReportSection, ServiceKind } from '../domain/types';

export interface TemplateValues {
  bc: string;
  sideLabel: string;
  title: string;
  work: string;
  fr: string;
  ft: string;
  fc: string;
  or: string;
  ol: string;
  ot: string;
}

export interface WordPhasePage {
  section: ReportSection;
  phase: Phase;
  kind: 'first' | 'continuation';
  photos: PhotoData[];
  values: TemplateValues;
}

const phaseOrder: Phase[] = ['BEFORE', 'AFTER', 'CURRENT'];

const titleCase = (value: string) => value
  .toLowerCase()
  .split(' ')
  .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
  .join(' ');

const phaseLabel = (phase: Phase) => phase[0] + phase.slice(1).toLowerCase();

const serviceLabel = (service: ServiceKind) => titleCase(service);

const workComponentLabel = (component: string) => (
  component === 'PROPELLER BLADE' ? 'Propeller' : titleCase(component)
);

export function templateValues(section: ReportSection, phase: Phase): TemplateValues {
  const condition = section.conditions[phase];
  const fouling = deriveFoulingCondition(
    condition?.fouling.coverage ?? null,
    condition?.fouling.slimeOnly ?? false,
  );
  const observedLevel = condition?.observed.level ?? '';
  const label = section.component + (section.unit ? ' ' + section.unit : '');
  return {
    bc: section.area === 'NICHE'
      ? 'NICHE AREAS & COMPONENTS / ' + section.component
      : 'GENERAL AREAS / ' + section.component,
    sideLabel: section.side === 'PORT' ? 'PORT SIDE'
      : section.side === 'STBD' ? 'STBD SIDE'
        : section.side === 'BOTTOM' ? 'BOTTOM' : '',
    title: label + ' (' + phaseLabel(phase) + ')',
    work: workComponentLabel(section.component) + ' ' + serviceLabel(section.service),
    fr: fouling.rating,
    ft: fouling.type,
    fc: condition?.fouling.coverage === null || condition?.fouling.coverage === undefined
      ? ''
      : condition.fouling.coverage + '%',
    or: deriveObservedRating(observedLevel),
    ol: observedLevel,
    ot: condition?.observed.type || '-',
  };
}

export function buildWordPhasePages(
  sections: ReportSection[],
  photos: PhotoData[],
): WordPhasePage[] {
  const pages: WordPhasePage[] = [];
  for (const section of sections) {
    for (const phase of phaseOrder) {
      if (!section.phases.includes(phase)) continue;
      const phasePhotos = photos
        .filter((photo) => photo.reportUse && photo.sectionId === section.id && photo.phase === phase)
        .sort((left, right) => left.order - right.order);
      for (let start = 0; start < phasePhotos.length;) {
        const kind = start === 0 ? 'first' : 'continuation';
        const capacity = kind === 'first' ? 4 : 6;
        pages.push({
          section,
          phase,
          kind,
          photos: phasePhotos.slice(start, start + capacity),
          values: templateValues(section, phase),
        });
        start += capacity;
      }
    }
  }
  return pages;
}
