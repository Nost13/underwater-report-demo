import { describe, expect, it } from 'vitest';
import { createNicheSections } from '../domain/structure';
import type { PhotoData } from '../domain/types';
import { initialReportState, reportReducer, selectedPages } from './reportState';

const section = createNicheSections({
  component: 'Boss Cap',
  type: 'SINGLE',
  quantity: 1,
  service: 'CLEANING',
})[0];

const photo = (number: number): PhotoData => ({
  id: `P${number}`,
  sectionId: section.id,
  phase: number < 4 ? 'BEFORE' : 'AFTER',
  file: new File(['x'], `${number}.jpg`, { type: 'image/jpeg' }),
  reportUse: true,
  order: number,
  relativePath: `${number}.jpg`,
});

describe('report state', () => {
  it('recalculates the affected phase pages immediately when Report Use changes', () => {
    const seeded = {
      ...initialReportState,
      sections: [section],
      photos: [1, 2, 3, 4, 5].map(photo),
      focusedSectionId: section.id,
    };
    expect(selectedPages(seeded)).toHaveLength(2);
    const next = reportReducer(seeded, { type: 'TOGGLE_REPORT_USE', photoId: 'P5' });
    expect(selectedPages(next).map((page) => page.photos.map((photo) => photo.id))).toEqual([
      ['P1', 'P2', 'P3'],
      ['P4'],
    ]);
  });

  it('keeps BEFORE and AFTER conditions independent', () => {
    const seeded = { ...initialReportState, sections: [section] };
    const next = reportReducer(seeded, {
      type: 'UPDATE_CONDITION',
      sectionId: section.id,
      phase: 'BEFORE',
      patch: { fouling: { type: 'Medium Macro Fouling', coverage: '6-25%' } },
    });
    expect(next.sections[0].conditions.BEFORE).toMatchObject({
      fouling: { type: 'Medium Macro Fouling', coverage: '6-25%' },
    });
    expect(next.sections[0].conditions.AFTER).toMatchObject({
      fouling: { type: 'Clean / No Fouling', coverage: '0%' },
    });
  });

  it('moves a manually assigned photo out of UNMATCHED without copying its File', () => {
    const unmatched = { ...photo(1), sectionId: null, phase: null };
    const seeded = { ...initialReportState, sections: [section], photos: [unmatched] };
    const next = reportReducer(seeded, {
      type: 'ASSIGN_PHOTO',
      photoId: unmatched.id,
      sectionId: section.id,
      phase: 'BEFORE',
    });
    expect(next.photos[0]).toMatchObject({ sectionId: section.id, phase: 'BEFORE' });
    expect(next.photos[0].file).toBe(unmatched.file);
  });

  it('returns an assigned photo to UNMATCHED for reassignment', () => {
    const assigned = photo(1);
    const seeded = { ...initialReportState, sections: [section], photos: [assigned] };
    const next = reportReducer(seeded, { type: 'UNASSIGN_PHOTO', photoId: assigned.id });
    expect(next.photos[0]).toMatchObject({ sectionId: null, phase: null });
    expect(next.photos[0].file).toBe(assigned.file);
  });

  it('removes a deleted photo from the current report without changing other photos', () => {
    const first = photo(1);
    const second = photo(2);
    const seeded = { ...initialReportState, sections: [section], photos: [first, second] };

    const next = reportReducer(seeded, { type: 'DELETE_PHOTO', photoId: first.id });

    expect(next.photos).toEqual([second]);
  });
});
