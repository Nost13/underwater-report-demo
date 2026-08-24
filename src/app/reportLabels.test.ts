import { describe, expect, it } from 'vitest';
import { createGeneralSections, createNicheSections } from '../domain/structure';
import { conciseSectionLabel } from './reportLabels';

describe('report input labels', () => {
  it('formats GENERAL as zone and side', () => {
    expect(conciseSectionLabel(createGeneralSections('CLEANING')[0])).toBe('FWD · PORT');
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
});
