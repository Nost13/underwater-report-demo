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
    section.conditions.BEFORE = {
      fouling: { type: 'Medium Macro Fouling', coverage: null, slimeOnly: false },
      observed: { type: '', level: '' },
    };
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

  it('accepts zero-percent Clean and a numeric Fouling Condition without an Observed Type', () => {
    const [section] = createNicheSections({
      component: 'Rudder',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    });
    section.conditions.CURRENT = {
      fouling: { type: 'Clean / No Fouling', coverage: 0, slimeOnly: false },
      observed: { type: '', level: '' },
    };

    const issues = checkReport([section], []);

    expect(issues.some((issue) => issue.kind === 'MISSING_CONDITION')).toBe(false);
  });

  it('requires entered coverage before Slime Only can become a valid condition', () => {
    const [section] = createNicheSections({
      component: 'Rudder',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    });
    section.conditions.CURRENT = {
      fouling: { type: 'Micro fouling', coverage: null, slimeOnly: true },
      observed: { type: '', level: 'Normal / Trace' },
    };

    const issues = checkReport([section], []);

    expect(issues.some((issue) => issue.kind === 'MISSING_CONDITION')).toBe(true);
  });
});
