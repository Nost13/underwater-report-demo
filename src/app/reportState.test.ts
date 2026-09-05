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
  captionText: '',
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
      patch: { fouling: { type: 'Medium Macro Fouling', coverage: 20, slimeOnly: false } },
    });
    expect(next.sections[0].conditions.BEFORE).toMatchObject({
      fouling: { type: 'Medium Macro Fouling', coverage: 20, slimeOnly: false },
    });
    expect(next.sections[0].conditions.AFTER).toMatchObject({
      fouling: { type: 'Clean / No Fouling', coverage: 0, slimeOnly: false },
    });
  });

  it('moves a manually assigned photo out of UNMATCHED without copying its File', () => {
    const unmatched = { ...photo(1), sectionId: null, phase: null, order: 99 };
    const existing = { ...photo(2), order: 7 };
    const seeded = { ...initialReportState, sections: [section], photos: [unmatched, existing] };
    const next = reportReducer(seeded, {
      type: 'ASSIGN_PHOTO',
      photoId: unmatched.id,
      sectionId: section.id,
      phase: 'BEFORE',
    });
    expect(next.photos[0]).toMatchObject({ sectionId: section.id, phase: 'BEFORE', order: 8 });
    expect(next.photos[0].file).toBe(unmatched.file);
  });

  it('returns an assigned photo to UNMATCHED without losing imported or editing data', () => {
    const assigned = { ...photo(1), captionText: 'Port inlet', reportUse: false };
    const seeded = { ...initialReportState, sections: [section], photos: [assigned] };
    const next = reportReducer(seeded, { type: 'UNASSIGN_PHOTO', photoId: assigned.id });
    expect(next.photos[0]).toMatchObject({
      sectionId: null,
      phase: null,
      relativePath: assigned.relativePath,
      captionText: 'Port inlet',
      reportUse: false,
      order: assigned.order,
    });
    expect(next.photos[0].file).toBe(assigned.file);
  });

  it('updates one photo caption immutably', () => {
    const first = photo(1);
    const second = photo(2);
    const seeded = { ...initialReportState, sections: [section], photos: [first, second] };

    const next = reportReducer(seeded, {
      type: 'UPDATE_PHOTO_CAPTION',
      photoId: first.id,
      value: 'Port inlet',
    });

    expect(next).not.toBe(seeded);
    expect(next.photos[0]).not.toBe(first);
    expect(next.photos[0].captionText).toBe('Port inlet');
    expect(next.photos[1]).toBe(second);
  });

  it('reorders only inside one section and phase and normalizes that group order', () => {
    const sameGroup = (item: PhotoData) => item.sectionId === section.id && item.phase === 'BEFORE';
    const byOrder = (left: PhotoData, right: PhotoData) => left.order - right.order;
    const first = { ...photo(1), id: 'p1', order: 10 };
    const second = { ...photo(2), id: 'p2', order: 30 };
    const third = { ...photo(3), id: 'p3', order: 20 };
    const after = { ...photo(4), id: 'after', order: 50 };
    const seeded = { ...initialReportState, sections: [section], photos: [first, second, third, after] };

    const next = reportReducer(seeded, {
      type: 'REORDER_PHOTO',
      photoId: 'p3',
      beforePhotoId: 'p1',
    });

    expect(next.photos.filter(sameGroup).sort(byOrder).map((item) => item.id)).toEqual(['p3', 'p1', 'p2']);
    expect(next.photos.filter(sameGroup).sort(byOrder).map((item) => item.order)).toEqual([0, 1, 2]);
    expect(next.photos.find((item) => item.id === 'after')).toBe(after);
  });

  it('appends a reordered photo within its group when there is no drop target', () => {
    const first = { ...photo(1), id: 'p1', order: 10 };
    const second = { ...photo(2), id: 'p2', order: 30 };
    const third = { ...photo(3), id: 'p3', order: 20 };
    const seeded = { ...initialReportState, sections: [section], photos: [first, second, third] };

    const next = reportReducer(seeded, {
      type: 'REORDER_PHOTO',
      photoId: 'p1',
      beforePhotoId: null,
    });

    expect([...next.photos].sort((left, right) => left.order - right.order).map((item) => item.id))
      .toEqual(['p3', 'p2', 'p1']);
  });

  it('rejects a reorder drop target in another phase', () => {
    const before = { ...photo(1), id: 'before' };
    const after = { ...photo(4), id: 'after' };
    const seeded = { ...initialReportState, sections: [section], photos: [before, after] };

    expect(reportReducer(seeded, {
      type: 'REORDER_PHOTO',
      photoId: 'before',
      beforePhotoId: 'after',
    })).toBe(seeded);
  });

  it('removes a deleted photo from the current report without changing other photos', () => {
    const first = photo(1);
    const second = photo(2);
    const seeded = { ...initialReportState, sections: [section], photos: [first, second] };

    const next = reportReducer(seeded, { type: 'DELETE_PHOTO', photoId: first.id });

    expect(next.photos).toEqual([second]);
  });

  it('applies a phase default to matching children while preserving overrides', () => {
    const blades = createNicheSections({
      component: 'Propeller Blade',
      type: 'QUANTITY',
      quantity: 2,
      service: 'POLISHING',
    });
    let state = reportReducer(initialReportState, { type: 'SET_SCOPE', sections: blades });

    state = reportReducer(state, {
      type: 'APPLY_GROUP_CONDITION',
      sectionId: blades[0].id,
      phase: 'BEFORE',
      condition: {
        fouling: { type: 'Medium Macro Fouling', coverage: 20, slimeOnly: false },
        observed: { type: '', level: 'Normal / Trace' },
      },
    });
    expect(state.sections.map((item) => item.conditions.BEFORE?.fouling.coverage))
      .toEqual([20, 20]);

    state = reportReducer(state, {
      type: 'UPDATE_CONDITION',
      sectionId: blades[1].id,
      phase: 'BEFORE',
      patch: { fouling: { coverage: 40 } },
    });
    expect(state.conditionSources[blades[1].id].BEFORE).toBe('OVERRIDE');

    state = reportReducer(state, {
      type: 'APPLY_GROUP_CONDITION',
      sectionId: blades[0].id,
      phase: 'BEFORE',
      condition: {
        fouling: { type: 'Light Macro fouling', coverage: 5, slimeOnly: false },
        observed: { type: '', level: 'Normal / Trace' },
      },
    });
    expect(state.sections.map((item) => item.conditions.BEFORE?.fouling.coverage))
      .toEqual([5, 40]);

    state = reportReducer(state, {
      type: 'REVERT_CONDITION_TO_GROUP',
      sectionId: blades[1].id,
      phase: 'BEFORE',
    });
    expect(state.sections[1].conditions.BEFORE?.fouling.coverage).toBe(5);
    expect(state.conditionSources[blades[1].id].BEFORE).toBe('GROUP');
  });

  it('rebuilds condition inheritance when Scope is replaced', () => {
    const first = createNicheSections({
      component: 'Boss Cap',
      type: 'SINGLE',
      quantity: 1,
      service: 'CLEANING',
    });
    const second = createNicheSections({
      component: 'Rope Guard',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    });
    const seeded = reportReducer(initialReportState, { type: 'SET_SCOPE', sections: first });
    const reset = reportReducer(seeded, { type: 'SET_SCOPE', sections: second });

    expect(Object.keys(reset.conditionDefaults)).toHaveLength(1);
    expect(reset.conditionSources).toEqual({
      [second[0].id]: { CURRENT: 'GROUP' },
    });
  });

  it('updates one Word label set shared by every Unit of a component', () => {
    const blades = createNicheSections({
      component: 'Propeller Blade',
      type: 'QUANTITY',
      quantity: 2,
      service: 'POLISHING',
    });
    const seeded = reportReducer(initialReportState, { type: 'SET_SCOPE', sections: blades });

    expect(seeded.reportLabels['NICHE/PROPELLER BLADE']).toEqual({
      upperAreaLabel: 'PROPELLER',
      detailTitle: 'PROPELLER BLADE',
      photoCaption: 'Propeller Blade',
    });

    const next = reportReducer(seeded, {
      type: 'UPDATE_REPORT_LABELS',
      groupKey: 'NICHE/PROPELLER BLADE',
      labels: { upperAreaLabel: 'PROPULSION' },
    });
    expect(next.reportLabels['NICHE/PROPELLER BLADE']).toEqual({
      upperAreaLabel: 'PROPULSION',
      detailTitle: 'PROPELLER BLADE',
      photoCaption: 'Propeller Blade',
    });
  });

  it('initializes and edits a separate WORK PERFORM label per Section phase', () => {
    const seeded = reportReducer(initialReportState, { type: 'SET_SCOPE', sections: [section] });

    expect(seeded.workPerformLabels[`${section.id}::BEFORE`]).toBe('Before');
    expect(seeded.workPerformLabels[`${section.id}::AFTER`]).toBe('After');

    const next = reportReducer(seeded, {
      type: 'UPDATE_WORK_PERFORM_LABEL',
      sectionId: section.id,
      phase: 'BEFORE',
      value: 'Arrival',
    });

    expect(next.workPerformLabels[`${section.id}::BEFORE`]).toBe('Arrival');
    expect(next.workPerformLabels[`${section.id}::AFTER`]).toBe('After');
  });
});
