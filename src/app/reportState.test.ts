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
