import { describe, expect, it } from 'vitest';
import { cleanCondition } from '../domain/conditions';
import { createNicheSections } from '../domain/structure';
import type { PhotoData } from '../domain/types';
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
});

describe('Word report phase model', () => {
  it('maps a niche Before phase to the approved template placeholders', () => {
    section.conditions.BEFORE = {
      fouling: { coverage: 70, slimeOnly: true, type: 'Micro fouling' },
      observed: { level: 'Normal / Trace', type: '' },
    };

    expect(templateValues(section, 'BEFORE')).toEqual({
      bc: 'NICHE AREAS & COMPONENTS / PROPELLER BLADE',
      sideLabel: '',
      title: 'PROPELLER BLADE 1 (Before)',
      work: 'Propeller Polishing',
      fr: '1',
      ft: 'Micro fouling',
      fc: '70%',
      or: '1',
      ol: 'Normal / Trace',
      ot: '-',
    });
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
});
