import { describe, expect, it } from 'vitest';
import { createGeneralSections, createNicheSections } from '../domain/structure';
import { conciseSectionLabel, defaultReportLabels, reportLabelKey } from './reportLabels';

describe('report input labels', () => {
  it('formats GENERAL as zone and side', () => {
    const section = createGeneralSections('CLEANING')[0];
    expect(conciseSectionLabel(section)).toBe('FWD · PORT');
    expect(defaultReportLabels(section).photoCaption).toBe('FWD');
  });

  it('shortens blade units while retaining other component names', () => {
    const blade = createNicheSections({
      component: 'Propeller Blade',
      type: 'QUANTITY',
      quantity: 1,
      service: 'POLISHING',
    })[0];
    const seaChest = createNicheSections({
      component: 'Sea Chest',
      type: 'SIDE_QUANTITY',
      quantity: 1,
      service: 'INSPECTION',
    })[0];

    expect(conciseSectionLabel(blade)).toBe('PROPELLER 01');
    expect(conciseSectionLabel(seaChest)).toBe('SEA CHEST · PORT · 01');
  });

  it('derives shared Word labels from the physical component hierarchy', () => {
    const blades = createNicheSections({
      component: 'Propeller Blade',
      type: 'QUANTITY',
      quantity: 2,
      service: 'POLISHING',
    });
    const ropeGuard = createNicheSections({
      component: 'Rope Guard',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    })[0];

    expect(defaultReportLabels(blades[0])).toEqual({
      upperAreaLabel: 'PROPELLER',
      detailTitle: 'PROPELLER BLADE',
      photoCaption: 'Propeller Blade',
    });
    expect(reportLabelKey(blades[0])).toBe('NICHE/PROPELLER BLADE');
    expect(reportLabelKey(blades[1])).toBe('NICHE/PROPELLER BLADE');
    expect(defaultReportLabels(ropeGuard)).toEqual({
      upperAreaLabel: 'ROPE GUARD',
      detailTitle: 'ROPE GUARD',
      photoCaption: 'Rope Guard',
    });
  });
});
