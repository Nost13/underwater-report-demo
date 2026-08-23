import { describe, expect, it } from 'vitest';
import {
  appendTargetService,
  applyServicePreset,
  createGeneralTargets,
  createGeneralSections,
  createNicheSections,
  createNicheTargets,
  createReportSections,
  defaultConditions,
  phasesFor,
  replaceTargetService,
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
      'CLEANING/GENERAL/FWD/PORT',
      'CLEANING/GENERAL/FWD/STBD',
      'CLEANING/GENERAL/FWD/BOTTOM',
      'CLEANING/GENERAL/FWD-MID/PORT',
      'CLEANING/GENERAL/FWD-MID/STBD',
      'CLEANING/GENERAL/FWD-MID/BOTTOM',
      'CLEANING/GENERAL/MID/PORT',
      'CLEANING/GENERAL/MID/STBD',
      'CLEANING/GENERAL/MID/BOTTOM',
      'CLEANING/GENERAL/MID-AFT/PORT',
      'CLEANING/GENERAL/MID-AFT/STBD',
      'CLEANING/GENERAL/MID-AFT/BOTTOM',
      'CLEANING/GENERAL/AFT/PORT',
      'CLEANING/GENERAL/AFT/STBD',
      'CLEANING/GENERAL/AFT/BOTTOM',
    ]);
  });

  it('keeps the fixed 15 GENERAL positions unassigned until work is selected', () => {
    const targets = createGeneralTargets();
    expect(targets).toHaveLength(15);
    expect(targets.every((target) => target.services.length === 0)).toBe(true);
    expect(createReportSections(targets)).toEqual([]);
  });

  it('fills only unassigned GENERAL targets and preserves a service exception', () => {
    const targets = createGeneralTargets().map((target) =>
      target.id === 'GENERAL/AFT/STBD'
        ? replaceTargetService(target, 'INSPECTION')
        : target,
    );
    const next = applyServicePreset(targets, 'POLISHING', () => true);
    expect(next.find((target) => target.id === 'GENERAL/AFT/STBD')?.services).toEqual([
      'INSPECTION',
    ]);
    expect(next.filter((target) => target.services[0] === 'POLISHING')).toHaveLength(14);
  });

  it('expands replacement and appended services into unique phase-aware sections', () => {
    const target = createGeneralTargets().find((item) => item.id === 'GENERAL/MID/PORT')!;
    const inspection = replaceTargetService(target, 'INSPECTION');
    const mixed = appendTargetService(inspection, 'POLISHING');
    const sections = createReportSections([mixed]);
    expect(sections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'INSPECTION/GENERAL/MID/PORT',
        targetId: 'GENERAL/MID/PORT',
        phases: ['CURRENT'],
      }),
      expect.objectContaining({
        id: 'POLISHING/GENERAL/MID/PORT',
        targetId: 'GENERAL/MID/PORT',
        phases: ['BEFORE', 'AFTER'],
      }),
    ]));
    expect(sections.find((section) => section.service === 'POLISHING')?.conditions.AFTER)
      .toEqual({ class: 'CLEAN', rating: 'R0', detail: '' });
  });

  it('creates NICHE targets with the active service ready for per-target exceptions', () => {
    const targets = createNicheTargets({
      component: 'Propeller Blade',
      type: 'QUANTITY',
      quantity: 3,
      service: 'POLISHING',
    });
    expect(targets.map((target) => [target.id, target.services])).toEqual([
      ['NICHE/PROPELLER BLADE/01', ['POLISHING']],
      ['NICHE/PROPELLER BLADE/02', ['POLISHING']],
      ['NICHE/PROPELLER BLADE/03', ['POLISHING']],
    ]);
    const exception = replaceTargetService(targets[2], 'INSPECTION');
    expect(createReportSections([exception])[0]).toMatchObject({
      id: 'INSPECTION/NICHE/PROPELLER BLADE/03',
      phases: ['CURRENT'],
    });
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
