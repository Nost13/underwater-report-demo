import { describe, expect, it } from 'vitest';
import { createNicheSections } from './structure';
import { checkReport } from './qa';
import type { PhotoData } from './types';

describe('report check issues', () => {
  it('reports missing photos, missing conditions, unmatched files, and a large phase imbalance', () => {
    const [section] = createNicheSections({
      component: 'Rudder',
      type: 'SINGLE',
      quantity: 1,
      service: 'CLEANING',
    });
    section.conditions.BEFORE = { class: 'BIOFOULING', rating: '', detail: '' };
    const photos: PhotoData[] = [1, 2, 3, 4].map((number) => ({
      id: `P${number}`,
      sectionId: section.id,
      phase: 'BEFORE',
      file: new File(['x'], `${number}.jpg`, { type: 'image/jpeg' }),
      reportUse: true,
      order: number,
      relativePath: `${number}.jpg`,
    }));
    photos.push({
      id: 'PX',
      sectionId: null,
      phase: null,
      file: new File(['x'], 'unknown.jpg', { type: 'image/jpeg' }),
      reportUse: true,
      order: 5,
      relativePath: 'misc/unknown.jpg',
    });

    expect(checkReport([section], photos).map((issue) => issue.kind)).toEqual(
      expect.arrayContaining([
        'MISSING_PHASE_PHOTO',
        'MISSING_CONDITION',
        'PHASE_IMBALANCE',
        'UNMATCHED',
      ]),
    );
  });
});
