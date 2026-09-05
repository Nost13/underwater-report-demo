import { describe, expect, it } from 'vitest';
import { cleanCondition } from '../domain/conditions';
import { createGeneralSections, createNicheSections } from '../domain/structure';
import type { PhotoData, ReportSection } from '../domain/types';
import { buildWordPhasePages, templateValues } from './reportModel';

const section = createNicheSections({
  component: 'Propeller Blade',
  type: 'QUANTITY',
  quantity: 1,
  service: 'POLISHING',
})[0];

const photo = (id: string, phase: 'BEFORE' | 'AFTER', order: number): PhotoData => ({
  id,
  sectionId: section.id,
  phase,
  file: new File(['image'], id + '.jpg', { type: 'image/jpeg' }),
  reportUse: true,
  order,
  relativePath: id + '.jpg',
  captionText: '',
});

const sectionPhoto = (reportSection: ReportSection, order: number): PhotoData => ({
  id: reportSection.id,
  sectionId: reportSection.id,
  phase: reportSection.phases[0],
  file: new File(['image'], reportSection.id + '.jpg', { type: 'image/jpeg' }),
  reportUse: true,
  order,
  relativePath: reportSection.id + '.jpg',
  captionText: '',
});

describe('Word report phase model', () => {
  it('maps a niche Before phase to the approved template placeholders', () => {
    section.conditions.BEFORE = {
      fouling: { coverage: 70, slimeOnly: true, type: 'Micro fouling' },
      observed: { level: 'Normal / Trace', type: '' },
    };

    expect(templateValues(section, 'BEFORE')).toEqual({
      bc: 'NICHE AREAS & COMPONENTS / PROPELLER',
      sideLabel: '',
      title: 'PROPELLER BLADE 1',
      photoCaption: 'Propeller Blade',
      work: 'PROPELLER BLADE POLISHING',
      workAdditional: 'BEFORE',
      fr: '1',
      ft: 'Micro fouling',
      fc: '70%',
      or: '1',
      ol: 'Normal / Trace',
      ot: '-',
    });
  });

  it('omits Current from a one-phase Inspection title', () => {
    const ropeGuard = createNicheSections({
      component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION',
    })[0];

    expect(templateValues(ropeGuard, 'CURRENT')).toMatchObject({
      bc: 'NICHE AREAS & COMPONENTS / ROPE GUARD',
      title: 'ROPE GUARD',
      photoCaption: 'Rope Guard',
      work: 'ROPE GUARD INSPECTION',
      workAdditional: 'CURRENT',
    });
  });

  it('uses a component-level Word label override without changing the Section identity', () => {
    expect(templateValues(section, 'AFTER', {
      upperAreaLabel: 'PROPULSION',
      detailTitle: 'BLADE',
      photoCaption: 'Propeller Blade Detail',
    })).toMatchObject({
      bc: 'NICHE AREAS & COMPONENTS / PROPULSION',
      title: 'BLADE 1',
      photoCaption: 'Propeller Blade Detail',
      workAdditional: 'AFTER',
    });
  });

  it('orders report pages by the Overall Summary sequence instead of scope input order', () => {
    const general = createGeneralSections('INSPECTION');
    const fwdPort = general.find((item) => item.component === 'FWD' && item.side === 'PORT')!;
    const fwdStbd = general.find((item) => item.component === 'FWD' && item.side === 'STBD')!;
    const aftBottom = general.find((item) => item.component === 'AFT' && item.side === 'BOTTOM')!;
    const niches = [
      'Bulbous Bow', 'Bow Thruster', 'Bilge Keel', 'Sea Chest',
      'Discharge Pipe', 'Anode / ICCP', 'Transducer', 'Stern Frame',
      'Rope Guard', 'Propeller Blade', 'Fin Blade', 'Boss Cap', 'Rudder & Pintle',
    ].map((component) => createNicheSections({
      component, type: 'SINGLE', quantity: 1, service: 'INSPECTION',
    })[0]);
    const shuffled = [...niches].reverse().concat(aftBottom, fwdStbd, fwdPort);

    expect(buildWordPhasePages(
      shuffled,
      shuffled.map((item, index) => sectionPhoto(item, index + 1)),
    ).map((page) => [page.section.component, page.section.side ?? ''])).toEqual([
      ['FWD', 'PORT'],
      ['FWD', 'STBD'],
      ['AFT', 'BOTTOM'],
      ['BULBOUS BOW', ''],
      ['BOW THRUSTER', ''],
      ['BILGE KEEL', ''],
      ['SEA CHEST', ''],
      ['DISCHARGE PIPE', ''],
      ['ANODE / ICCP', ''],
      ['TRANSDUCER', ''],
      ['STERN FRAME', ''],
      ['ROPE GUARD', ''],
      ['PROPELLER BLADE', ''],
      ['FIN BLADE', ''],
      ['BOSS CAP', ''],
      ['RUDDER & PINTLE', ''],
    ]);
  });

  it('groups each phase as four photos then six and places Before before After', () => {
    section.conditions.AFTER = cleanCondition();
    const photos = [
      ...Array.from({ length: 11 }, (_, index) => photo('B' + (index + 1), 'BEFORE', index + 1)),
      ...Array.from({ length: 5 }, (_, index) => photo('A' + (index + 1), 'AFTER', index + 12)),
    ];

    expect(buildWordPhasePages([section], photos).map((page) => ({
      phase: page.phase,
      kind: page.kind,
      count: page.photos.length,
    }))).toEqual([
      { phase: 'BEFORE', kind: 'first', count: 4 },
      { phase: 'BEFORE', kind: 'continuation', count: 6 },
      { phase: 'BEFORE', kind: 'continuation', count: 1 },
      { phase: 'AFTER', kind: 'first', count: 4 },
      { phase: 'AFTER', kind: 'continuation', count: 1 },
    ]);
  });

  it.each([
    [0, []],
    [4, [4]],
    [5, [4, 1]],
    [10, [4, 6]],
  ])('uses template capacities for %i Before photos', (count, expected) => {
    const photos = Array.from({ length: count }, (_, index) => photo('P' + (index + 1), 'BEFORE', index + 1));
    expect(buildWordPhasePages([section], photos).map((page) => page.photos.length)).toEqual(expected);
  });

  it('keeps a Section phase label on every continuation page and permits an explicit blank', () => {
    const photos = Array.from({ length: 5 }, (_, index) => photo('P' + (index + 1), 'BEFORE', index + 1));

    expect(buildWordPhasePages([section], photos, {}, {
      [`${section.id}::BEFORE`]: { main: 'Custom polishing', phase: 'Arrival' },
    }).map((page) => [page.values.work, page.values.workAdditional])).toEqual([['CUSTOM POLISHING', 'ARRIVAL'], ['CUSTOM POLISHING', 'ARRIVAL']]);

    expect(buildWordPhasePages([section], photos.slice(0, 1), {}, {
      [`${section.id}::BEFORE`]: { main: 'Custom polishing', phase: '' },
    })[0].values.workAdditional).toBe('');
  });
});
