import { describe, expect, it } from 'vitest';
import {
  createGeneralSections,
  createNicheSections,
  defaultConditions,
  phasesFor,
} from './structure';

describe('report structure rules', () => {
  it('uses CURRENT only for inspection and BEFORE/AFTER for every work service', () => {
    expect(phasesFor('INSPECTION')).toEqual(['CURRENT']);
    for (const service of ['CLEANING', 'POLISHING', 'REPAIR', 'REMOVAL'] as const) {
      expect(phasesFor(service)).toEqual(['BEFORE', 'AFTER']);
    }
  });

  it('starts AFTER at editable CLEAN/R0 while BEFORE remains blank', () => {
    const conditions = defaultConditions('REPAIR');
    expect(conditions.BEFORE).toEqual({ class: '', rating: '', detail: '' });
    expect(conditions.AFTER).toEqual({ class: 'CLEAN', rating: 'R0', detail: '' });
  });

  it('creates the fixed 15 GENERAL sections', () => {
    const sections = createGeneralSections('CLEANING');
    expect(sections).toHaveLength(15);
    expect(sections.map((section) => section.id)).toEqual([
      'GENERAL/FWD/PORT',
      'GENERAL/FWD/STBD',
      'GENERAL/FWD/BOTTOM',
      'GENERAL/FWD-MID/PORT',
      'GENERAL/FWD-MID/STBD',
      'GENERAL/FWD-MID/BOTTOM',
      'GENERAL/MID/PORT',
      'GENERAL/MID/STBD',
      'GENERAL/MID/BOTTOM',
      'GENERAL/MID-AFT/PORT',
      'GENERAL/MID-AFT/STBD',
      'GENERAL/MID-AFT/BOTTOM',
      'GENERAL/AFT/PORT',
      'GENERAL/AFT/STBD',
      'GENERAL/AFT/BOTTOM',
    ]);
  });

  it.each([
    ['SINGLE', 1],
    ['SIDE', 2],
    ['QUANTITY', 3],
    ['SIDE_QUANTITY', 6],
  ] as const)('expands %s into the correct section count', (type, expected) => {
    expect(
      createNicheSections({
        component: 'Sea Chest',
        type,
        quantity: 3,
        service: 'CLEANING',
      }),
    ).toHaveLength(expected);
  });

  it.each(['Propeller Blade', 'Rope Guard', 'Boss Cap', 'Transducer', 'Stern Frame'])(
    '%s never receives PORT or STBD',
    (component) => {
      const sections = createNicheSections({
        component,
        type: 'SIDE_QUANTITY',
        quantity: 2,
        service: 'INSPECTION',
      });
      expect(sections).toHaveLength(2);
      expect(sections.every((section) => section.side === undefined)).toBe(true);
    },
  );
});
