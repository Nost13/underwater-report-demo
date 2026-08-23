import { describe, expect, it } from 'vitest';
import { pageCount, paginateSection } from './pagination';
import type { Phase, PhotoData } from './types';

const makePhoto = (id: string, phase: Phase, reportUse = true): PhotoData => ({
  id,
  sectionId: 'S1',
  phase,
  file: new File(['x'], `${id}.jpg`, { type: 'image/jpeg' }),
  reportUse,
  order: Number(id.slice(1)),
  relativePath: `${id}.jpg`,
});

describe('automatic pagination', () => {
  it.each([
    [0, 0],
    [1, 1],
    [4, 1],
    [5, 2],
    [10, 2],
    [11, 3],
    [16, 3],
    [17, 4],
    [22, 4],
    [23, 5],
  ])('%i photos create %i pages', (count, pages) => {
    expect(pageCount(count)).toBe(pages);
  });

  it('keeps BEFORE pages ahead of AFTER pages, excludes Report Use off, and fills 4 then 6', () => {
    const photos = [
      makePhoto('P1', 'BEFORE'),
      makePhoto('P2', 'BEFORE'),
      makePhoto('P3', 'BEFORE'),
      makePhoto('P4', 'AFTER'),
      makePhoto('P5', 'AFTER'),
      makePhoto('P6', 'AFTER', false),
    ];
    expect(paginateSection('S1', photos).map((page) => page.photos.map((photo) => photo.id))).toEqual([
      ['P1', 'P2', 'P3'],
      ['P4', 'P5'],
    ]);
  });

  it('finishes overflow BEFORE pages before starting AFTER pages', () => {
    const photos = [
      makePhoto('P1', 'BEFORE'),
      makePhoto('P2', 'AFTER'),
      makePhoto('P3', 'BEFORE'),
      makePhoto('P4', 'AFTER'),
      makePhoto('P5', 'BEFORE'),
      makePhoto('P6', 'BEFORE'),
      makePhoto('P7', 'BEFORE'),
    ];

    expect(paginateSection('S1', photos).map((page) => page.photos.map((photo) => photo.id))).toEqual([
      ['P1', 'P3', 'P5', 'P6'],
      ['P7'],
      ['P2', 'P4'],
    ]);
  });
});
