import { deriveFoulingCondition, deriveObservedRating } from '../domain/conditions';
import { defaultReportLabels, reportLabelKey } from '../app/reportLabels';
import type { Phase, PhotoData, ReportLabelMap, ReportLabels, ReportSection, ServiceKind } from '../domain/types';

export interface TemplateValues {
  bc: string;
  sideLabel: string;
  title: string;
  photoCaption: string;
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
const generalOrder = ['FWD', 'FWD-MID', 'MID', 'MID-AFT', 'AFT'];
const sideOrder = ['PORT', 'STBD', 'BOTTOM'];
const nicheOrder = [
  'BULBOUS BOW',
  'BOW THRUSTER',
  'THRUSTER GRATING',
  'BILGE KEEL',
  'SEA CHEST',
  'DISCHARGE PIPE',
  'ANODE / ICCP',
  'TRANSDUCER',
  'STERN FRAME',
  'ROPE GUARD',
  'PROPELLER BLADE',
  'FIN BLADE',
  'BOSS CAP',
  'RUDDER',
];

const titleCase = (value: string) => value
  .toLowerCase()
  .split(' ')
  .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
  .join(' ');

const phaseLabel = (phase: Phase) => phase[0] + phase.slice(1).toLowerCase();

const serviceLabel = (service: ServiceKind) => titleCase(service);

const rank = (values: string[], value?: string) => {
  const index = value ? values.indexOf(value) : -1;
  return index < 0 ? values.length : index;
};

function orderSections(sections: ReportSection[]): ReportSection[] {
  return sections
    .map((section, sourceIndex) => ({ section, sourceIndex }))
    .sort((left, right) => {
      if (left.section.area !== right.section.area) return left.section.area === 'GENERAL' ? -1 : 1;
      const componentDifference = left.section.area === 'GENERAL'
        ? rank(generalOrder, left.section.component) - rank(generalOrder, right.section.component)
        : rank(nicheOrder, left.section.component) - rank(nicheOrder, right.section.component);
      if (componentDifference) return componentDifference;
      const sideDifference = rank(sideOrder, left.section.side) - rank(sideOrder, right.section.side);
      if (sideDifference) return sideDifference;
      const unitDifference = (left.section.unit ?? 0) - (right.section.unit ?? 0);
      return unitDifference || left.sourceIndex - right.sourceIndex;
    })
    .map(({ section }) => section);
}

export function templateValues(
  section: ReportSection,
  phase: Phase,
  labels: ReportLabels = defaultReportLabels(section),
): TemplateValues {
  const condition = section.conditions[phase];
  const fouling = deriveFoulingCondition(
    condition?.fouling.coverage ?? null,
    condition?.fouling.slimeOnly ?? false,
  );
  const observedLevel = condition?.observed.level ?? '';
  const label = labels.detailTitle + (section.unit ? ' ' + section.unit : '');
  const phaseSuffix = phase === 'CURRENT' ? '' : ` (${phaseLabel(phase)})`;
  return {
    bc: section.area === 'NICHE'
      ? 'NICHE AREAS & COMPONENTS / ' + labels.upperAreaLabel
      : 'GENERAL AREAS / ' + labels.upperAreaLabel,
    sideLabel: section.side === 'PORT' ? 'PORT SIDE'
      : section.side === 'STBD' ? 'STBD SIDE'
        : section.side === 'BOTTOM' ? 'BOTTOM' : '',
    title: label + phaseSuffix,
    photoCaption: labels.photoCaption,
    work: serviceLabel(section.service),
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
  reportLabels: ReportLabelMap = {},
): WordPhasePage[] {
  const pages: WordPhasePage[] = [];
  for (const section of orderSections(sections)) {
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
          values: templateValues(
            section,
            phase,
            reportLabels[reportLabelKey(section)] ?? defaultReportLabels(section),
          ),
        });
        start += capacity;
      }
    }
  }
  return pages;
}
