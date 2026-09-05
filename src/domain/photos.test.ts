import { describe, expect, it } from 'vitest';
import {
  createGeneralTargets,
  createNicheSections,
  createReportSections,
} from './structure';
import {
  composePhotoCaption,
  createCaption,
  matchPhotoPath,
  phaseIndexForPhoto,
  photoFolderContext,
  summarizePhotoImport,
} from './photos';
import type { PhotoData } from './types';

describe('photo matching and captions', () => {
  const sections = createNicheSections({
    component: 'Sea Chest',
    type: 'SIDE_QUANTITY',
    quantity: 2,
    service: 'CLEANING',
  });

  it('matches a complete exact hierarchy without case sensitivity', () => {
    expect(matchPhotoPath('NICHE/sea chest/PORT/01/before/a.jpg', sections)).toEqual({
      sectionId: 'CLEANING/NICHE/SEA CHEST/PORT/01',
      phase: 'BEFORE',
    });
  });

  it('requires a Service segment when the same target and phase are ambiguous', () => {
    const target = { ...createGeneralTargets()[0], services: ['CLEANING', 'POLISHING'] as const };
    const mixedSections = createReportSections([{ ...target, services: [...target.services] }]);
    expect(matchPhotoPath('GENERAL/FWD/PORT/BEFORE/a.jpg', mixedSections)).toBeNull();
    expect(matchPhotoPath('POLISHING/GENERAL/FWD/PORT/BEFORE/a.jpg', mixedSections)).toEqual({
      sectionId: 'POLISHING/GENERAL/FWD/PORT',
      phase: 'BEFORE',
    });
  });

  it('keeps a legacy path exact when phase separates mixed services', () => {
    const target = { ...createGeneralTargets()[0], services: ['INSPECTION', 'POLISHING'] as const };
    const mixedSections = createReportSections([{ ...target, services: [...target.services] }]);
    expect(matchPhotoPath('GENERAL/FWD/PORT/CURRENT/a.jpg', mixedSections)).toEqual({
      sectionId: 'INSPECTION/GENERAL/FWD/PORT',
      phase: 'CURRENT',
    });
  });

  it('does not guess incomplete, misspelled, or unknown paths', () => {
    expect(matchPhotoPath('NICHE/SEA CHEST/01/BEFORE/a.jpg', sections)).toBeNull();
    expect(matchPhotoPath('NICHE/SEA CHEST/POTR/01/BEFORE/a.jpg', sections)).toBeNull();
    expect(matchPhotoPath('misc/a.jpg', sections)).toBeNull();
  });

  it('shows the final two parent folders as imported-photo context', () => {
    expect(photoFolderContext('1/2/3/image.jpg')).toBe('2 > 3');
    expect(photoFolderContext('one/image.jpg')).toBe('one');
    expect(photoFolderContext('image.jpg')).toBe('선택한 폴더 바로 아래');
  });

  it('composes base and title-case phase caption parts without blank supplemental text', () => {
    expect(composePhotoCaption('Sea Chest', 'BEFORE', '')).toEqual(['Sea Chest', 'Before']);
    expect(composePhotoCaption('Sea Chest', 'CURRENT', '   ')).toEqual(['Sea Chest', 'Current']);
  });

  it('appends trimmed supplemental caption text', () => {
    expect(composePhotoCaption('Sea Chest', 'AFTER', '  Port inlet  ')).toEqual([
      'Sea Chest',
      'After',
      'Port inlet',
    ]);
  });

  it('creates a deterministic phase-aware caption', () => {
    const section = sections[0];
    const photo: PhotoData = {
      id: 'P1',
      sectionId: section.id,
      phase: 'BEFORE',
      file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      reportUse: true,
      order: 2,
      relativePath: 'a.jpg',
      captionText: '',
    };
    expect(createCaption(photo, section, 2)).toBe('SEA CHEST · PORT · UNIT 01 · BEFORE · 02');
  });

  it('keeps phase order continuous across combined pages', () => {
    const section = sections[0];
    const values = [
      { id: 'P1', phase: 'BEFORE', order: 1 },
      { id: 'P2', phase: 'AFTER', order: 2 },
      { id: 'P3', phase: 'BEFORE', order: 7 },
    ].map((value) => ({
      ...value,
      sectionId: section.id,
      file: new File(['x'], `${value.id}.jpg`, { type: 'image/jpeg' }),
      reportUse: true,
      relativePath: `${value.id}.jpg`,
      captionText: '',
    })) as PhotoData[];
    expect(phaseIndexForPhoto(values[0], values)).toBe(1);
    expect(phaseIndexForPhoto(values[2], values)).toBe(2);
  });

  it('reports exact standard paths independently of who created the folder tree', () => {
    const exact = {
      id: 'EXACT',
      sectionId: sections[0].id,
      phase: 'BEFORE',
      file: new File(['x'], 'exact.jpg', { type: 'image/jpeg' }),
      reportUse: true,
      order: 1,
      relativePath: 'NICHE/SEA CHEST/PORT/01/BEFORE/exact.jpg',
      captionText: '',
    } as PhotoData;
    const unmatched = {
      ...exact,
      id: 'LOOSE',
      sectionId: null,
      phase: null,
      relativePath: 'loose.jpg',
    };

    expect(summarizePhotoImport([exact, unmatched])).toEqual({
      total: 2,
      matched: 1,
      unmatched: 1,
      standardPathsDetected: true,
    });
    expect(summarizePhotoImport([unmatched])).toEqual({
      total: 1,
      matched: 0,
      unmatched: 1,
      standardPathsDetected: false,
    });
  });
});
