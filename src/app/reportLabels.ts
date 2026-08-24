import type { ReportSection } from '../domain/types';

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
