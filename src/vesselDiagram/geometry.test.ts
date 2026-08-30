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

describe('vessel diagram geometry', () => {
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

  it('creates all niche defaults as ellipse markers', () => {
    const markers = createDefaultNicheMarkers({ sternX: 0.1, bowX: 0.9, hullTopY: 0.2, bottomY: 0.8 }, 3);
    expect(markers).toHaveLength(12);
    expect(markers.every((marker) => marker.shape === 'ELLIPSE')).toBe(true);
    expect(markers.map((marker) => marker.id)).toContain('propeller-group');
    expect(markers.map((marker) => marker.id)).toContain('bilge-keel-3');
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
