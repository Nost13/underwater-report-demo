import { describe, expect, it } from 'vitest';
import { createNicheSections } from './structure';
import { createCaption, matchPhotoPath, phaseIndexForPhoto } from './photos';
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
      sectionId: 'NICHE/SEA CHEST/PORT/01',
      phase: 'BEFORE',
    });
  });

  it('does not guess incomplete, misspelled, or unknown paths', () => {
    expect(matchPhotoPath('NICHE/SEA CHEST/01/BEFORE/a.jpg', sections)).toBeNull();
    expect(matchPhotoPath('NICHE/SEA CHEST/POTR/01/BEFORE/a.jpg', sections)).toBeNull();
    expect(matchPhotoPath('misc/a.jpg', sections)).toBeNull();
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
    })) as PhotoData[];
    expect(phaseIndexForPhoto(values[0], values)).toBe(1);
    expect(phaseIndexForPhoto(values[2], values)).toBe(2);
  });
});
