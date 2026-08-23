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
      fouling: { type: 'Medium Macro Fouling', coverage: '' },
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

  it('accepts a Fouling Condition when type and coverage are present without an Observed Condition', () => {
    const [section] = createNicheSections({
      component: 'Rudder',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    });
    section.conditions.CURRENT = {
      fouling: { type: 'Light Macro fouling', coverage: '1-5%' },
      observed: { type: '', level: '' },
    };

    const issues = checkReport([section], []);

    expect(issues.some((issue) => issue.kind === 'MISSING_CONDITION')).toBe(false);
  });

  it('requires a manual percentage when Slime Only is selected', () => {
    const [section] = createNicheSections({
      component: 'Rudder',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    });
    section.conditions.CURRENT = {
      fouling: { type: 'Micro fouling', coverage: '1-100% / Slime Only' },
      observed: { type: '', level: 'Normal / Trace' },
    };

    const issues = checkReport([section], []);

    expect(issues.some((issue) => issue.kind === 'MISSING_CONDITION')).toBe(true);
  });
});
