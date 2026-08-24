import { describe, expect, it } from 'vitest';
import { createGeneralTargets, createReportSections } from '../domain/structure';
import { filterSections, groupSections, sectionWindow } from './sectionNavigator';

const sections = createReportSections(createGeneralTargets().map((target) => ({
  ...target,
  services: ['INSPECTION', 'CLEANING', 'POLISHING', 'REPAIR'],
})));

describe('large report section navigation', () => {
  it('keeps at most five neighboring sections visible at every edge', () => {
    expect(sections).toHaveLength(60);
    expect(sectionWindow(sections, sections[0].id).map((section) => section.id)).toEqual(
      sections.slice(0, 5).map((section) => section.id),
    );
    expect(sectionWindow(sections, sections[30].id).map((section) => section.id)).toEqual(
      sections.slice(28, 33).map((section) => section.id),
    );
    expect(sectionWindow(sections, sections[59].id).map((section) => section.id)).toEqual(
      sections.slice(55, 60).map((section) => section.id),
    );
  });

  it('searches Service, component, side, Unit, and full id without case sensitivity', () => {
    expect(filterSections(sections, 'repair aft bottom').map((section) => section.id))
      .toEqual(['REPAIR/GENERAL/MID-AFT/BOTTOM', 'REPAIR/GENERAL/AFT/BOTTOM']);
    expect(filterSections(sections, 'inspection/general/fwd/port').map((section) => section.id))
      .toEqual(['INSPECTION/GENERAL/FWD/PORT']);
  });

  it('groups the complete list by Service and component in source order', () => {
    const groups = groupSections(sections);
    expect(groups[0]).toMatchObject({ key: 'INSPECTION/FWD', service: 'INSPECTION', component: 'FWD' });
    expect(groups[0].sections).toHaveLength(3);
    expect(groups.at(-1)).toMatchObject({ key: 'REPAIR/AFT', service: 'REPAIR', component: 'AFT' });
  });
});
