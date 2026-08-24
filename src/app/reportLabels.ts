import type { ReportLabelMap, ReportLabels, ReportSection } from '../domain/types';

const shortComponent = (component: string): string => {
  if (component === 'PROPELLER BLADE') return 'PROPELLER';
  if (component === 'FIN BLADE') return 'FIN';
  return component;
};

export function conciseSectionLabel(section: ReportSection): string {
  if (section.area === 'GENERAL') return `${section.component} · ${section.side}`;

  const component = shortComponent(section.component);
  const unit = section.unit ? String(section.unit).padStart(2, '0') : null;
  if ((component === 'PROPELLER' || component === 'FIN') && !section.side && unit) {
    return `${component} ${unit}`;
  }
  return [component, section.side, unit].filter(Boolean).join(' · ');
}

const titleCase = (value: string): string => value
  .toLowerCase()
  .split(' ')
  .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
  .join(' ');

export function reportLabelKey(section: ReportSection): string {
  return `${section.area}/${section.component}`;
}

export function defaultReportLabels(section: ReportSection): ReportLabels {
  const propellerPart = ['PROPELLER BLADE', 'FIN BLADE'].includes(section.component);
  return {
    upperAreaLabel: propellerPart ? 'PROPELLER' : section.component,
    detailTitle: section.component,
    photoCaption: section.area === 'GENERAL' ? section.component : titleCase(section.component),
  };
}

export function initializeReportLabels(sections: ReportSection[]): ReportLabelMap {
  return sections.reduce<ReportLabelMap>((labels, section) => {
    const key = reportLabelKey(section);
    if (!labels[key]) labels[key] = defaultReportLabels(section);
    return labels;
  }, {});
}
