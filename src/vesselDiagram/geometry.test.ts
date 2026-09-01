import { describe, expect, it } from 'vitest';
import {
  clampRect,
  createBilgeKeelMarkers,
  createDefaultHullMarkers,
  createDefaultNicheMarkers,
  isValidCalibration,
  projectTemplateRect,
  resetMarker,
} from './geometry';
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from './types';

describe('vessel diagram geometry', () => {
  it.each([1, 3, 5])('centers asymmetric odd Bilge quantity %i on the calibrated midpoint', (quantity) => {
    const markers = createBilgeKeelMarkers({ sternX: .25, bowX: .95, hullTopY: .2, bottomY: .8 }, quantity);
    const middle = markers[Math.floor(quantity / 2)].rect;
    expect(middle.x + middle.width / 2).toBeCloseTo(.6, 8);
  });

  it.each([2, 4, 6])('centers asymmetric even Bilge quantity %i on the calibrated midpoint', (quantity) => {
    const markers = createBilgeKeelMarkers({ sternX: .25, bowX: .95, hullTopY: .2, bottomY: .8 }, quantity);
    const left = markers[quantity / 2 - 1].rect;
    const right = markers[quantity / 2].rect;
    expect((left.x + left.width + right.x) / 2).toBeCloseTo(.6, 8);
  });

  it('resets Bilge markers using the asymmetric calibration', () => {
    const marker = resetMarker('bilge-keel-2', { sternX: .25, bowX: .95, hullTopY: .2, bottomY: .8 }, 3)!;
    expect(marker.rect.x + marker.rect.width / 2).toBeCloseTo(.6, 8);
  });

  it('projects template-relative geometry through calibrated length and height', () => {
    expect(projectTemplateRect({ x: 0.25, y: 0.5, width: 0.2, height: 0.25 }, { sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 })).toEqual({ x: 0.3, y: 0.5, width: 0.16, height: 0.15 });
  });

  it('clamps both origin and extent to the canonical canvas', () => {
    expect(clampRect({ x: -0.1, y: 0.9, width: 1.4, height: 0.4 })).toEqual({ x: 0, y: 0.9, width: 1, height: 0.1 });
  });

  it('rejects crossed Hull guides', () => {
    expect(isValidCalibration({ sternX: 0.8, bowX: 0.2, hullTopY: 0.1, bottomY: 0.9 })).toBe(false);
  });

  it('creates Hull markers in stern-to-bow order', () => {
    expect(createDefaultHullMarkers({ sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 }).map((marker) => marker.id)).toEqual(['hull-aft', 'hull-mid-aft', 'hull-mid', 'hull-fwd-mid', 'hull-fwd']);
  });

  it.each([1, 3, 5])('centers odd Bilge Keel quantity %i on its middle marker', (quantity) => {
    const markers = createBilgeKeelMarkers({ sternX: 0.08, bowX: 0.92, hullTopY: 0.15, bottomY: 0.86 }, quantity);
    const middle = markers[Math.floor(quantity / 2)].rect;
    expect(middle.x + middle.width / 2).toBeCloseTo(0.5, 8);
  });

  it.each([2, 4, 6])('centers even Bilge Keel quantity %i on its middle boundary', (quantity) => {
    const markers = createBilgeKeelMarkers({ sternX: 0.08, bowX: 0.92, hullTopY: 0.15, bottomY: 0.86 }, quantity);
    const left = markers[quantity / 2 - 1].rect;
    const right = markers[quantity / 2].rect;
    expect((left.x + left.width + right.x) / 2).toBeCloseTo(0.5, 8);
  });

  it('numbers Bilge Keel from stern to bow', () => {
    expect(createBilgeKeelMarkers({ sternX: 0.08, bowX: 0.92, hullTopY: 0.15, bottomY: 0.86 }, 3).map(({ id, unit }) => [id, unit])).toEqual([['bilge-keel-1', 1], ['bilge-keel-2', 2], ['bilge-keel-3', 3]]);
  });

  it('creates component point markers as true circles while Bilge Keel stays elliptical', () => {
    const markers = createDefaultNicheMarkers({ sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 }, 3);
    expect(markers).toHaveLength(12);
    const propeller = markers.find((marker) => marker.id === 'propeller-group')!;
    const bilge = markers.find((marker) => marker.id === 'bilge-keel-3')!;
    expect(propeller.shape).toBe('CIRCLE');
    expect(propeller.rect.width * DIAGRAM_WIDTH)
      .toBeCloseTo(propeller.rect.height * DIAGRAM_HEIGHT, 8);
    expect(bilge.shape).toBe('ELLIPSE');
  });

  it('normalizes invalid Bilge Keel quantities to one marker', () => {
    expect(createBilgeKeelMarkers({ sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 }, Number.NaN)).toHaveLength(1);
    expect(createBilgeKeelMarkers({ sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 }, 0)).toHaveLength(1);
  });

  it('resets known markers and returns null for unknown markers', () => {
    const calibration = { sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 };
    expect(resetMarker('hull-mid', calibration, 2)?.shape).toBe('RECTANGLE');
    expect(resetMarker('bilge-keel-2', calibration, 2)?.unit).toBe(2);
    expect(resetMarker('missing', calibration, 2)).toBeNull();
  });
});
