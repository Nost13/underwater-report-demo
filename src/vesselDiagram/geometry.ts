import {
  DEFAULT_CALIBRATION,
  DIAGRAM_HEIGHT,
  DIAGRAM_WIDTH,
  type HullCalibration,
  type NormalizedRect,
  type ZoneMarker,
} from './types';

export { DEFAULT_CALIBRATION };

const clean = (value: number) => Number(value.toFixed(12));
export function clampRect(rect: NormalizedRect): NormalizedRect {
  const x = Math.min(1, Math.max(0, rect.x));
  const y = Math.min(1, Math.max(0, rect.y));
  return { x: clean(x), y: clean(y), width: clean(Math.min(1 - x, Math.max(0, rect.width))), height: clean(Math.min(1 - y, Math.max(0, rect.height))) };
}

export function translateRect(rect: NormalizedRect, delta: { x: number; y: number }): NormalizedRect {
  return {
    ...rect,
    x: Math.min(1 - rect.width, Math.max(0, rect.x + delta.x)),
    y: Math.min(1 - rect.height, Math.max(0, rect.y + delta.y)),
  };
}

export function isValidRect(rect: NormalizedRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0
    // Existing normalized projection rounds to twelve decimal places.
    && rect.x + rect.width <= 1 + 1e-12 && rect.y + rect.height <= 1 + 1e-12;
}

export function isValidCalibration(calibration: HullCalibration): boolean {
  return [calibration.sternX, calibration.bowX, calibration.hullTopY, calibration.bottomY].every(Number.isFinite)
    && calibration.sternX >= 0 && calibration.bowX <= 1 && calibration.sternX < calibration.bowX
    && calibration.hullTopY >= 0 && calibration.bottomY <= 1 && calibration.hullTopY < calibration.bottomY;
}

export function projectTemplateRect(rect: NormalizedRect, calibration: HullCalibration): NormalizedRect {
  const length = calibration.bowX - calibration.sternX;
  const height = calibration.bottomY - calibration.hullTopY;
  return clampRect({ x: calibration.sternX + rect.x * length, y: calibration.hullTopY + rect.y * height, width: rect.width * length, height: rect.height * height });
}

export function inscribeCircle(rect: NormalizedRect, diameter = Math.min(rect.width * DIAGRAM_WIDTH, rect.height * DIAGRAM_HEIGHT)): NormalizedRect {
  const width = diameter / DIAGRAM_WIDTH;
  const height = diameter / DIAGRAM_HEIGHT;
  return clampRect({
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  });
}

const hullIds = ['hull-aft', 'hull-mid-aft', 'hull-mid', 'hull-fwd-mid', 'hull-fwd'];
export function createDefaultHullMarkers(calibration: HullCalibration): ZoneMarker[] {
  return hullIds.map((id, i) => ({ id, groupId: 'hull', rect: projectTemplateRect({ x: i / 5, y: 0, width: 1 / 5, height: 1 }, calibration), shape: 'RECTANGLE' }));
}

const NICHE_TEMPLATES = {
  'propeller-group': { x: 0.04, y: 0.63, width: 0.08, height: 0.16 }, 'aft-services': { x: 0.12, y: 0.42, width: 0.07, height: 0.14 },
  'rudder-group': { x: 0.11, y: 0.58, width: 0.07, height: 0.14 }, 'fwd-services': { x: 0.81, y: 0.44, width: 0.07, height: 0.14 },
  'bulbous-bow': { x: 0.89, y: 0.63, width: 0.08, height: 0.16 }, 'transducer-aft': { x: 0.18, y: 0.50, width: 0.055, height: 0.12 },
  'transducer-fwd': { x: 0.76, y: 0.50, width: 0.055, height: 0.12 }, 'anode-aft': { x: 0.25, y: 0.61, width: 0.055, height: 0.12 },
  'anode-fwd': { x: 0.69, y: 0.61, width: 0.055, height: 0.12 },
} as const;

export function createDefaultNicheMarkers(calibration: HullCalibration, bilgeQuantity: number): ZoneMarker[] {
  const nicheMarkers = Object.entries(NICHE_TEMPLATES).map(([id, rect]) => ({
    id,
    groupId: id,
    rect: inscribeCircle(projectTemplateRect(rect, calibration), 80),
    shape: 'CIRCLE' as const,
  }));
  return [...nicheMarkers, ...createBilgeKeelMarkers(calibration, bilgeQuantity)];
}

export function createBilgeKeelMarkers(calibration: HullCalibration, quantity: number): ZoneMarker[] {
  const count = Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;
  const length = calibration.bowX - calibration.sternX;
  const span = 0.6 * length;
  const gap = Math.min(0.008 * length, span / (count + 1));
  const width = (span - (count - 1) * gap) / count;
  const start = (calibration.sternX + calibration.bowX) / 2 - span / 2;
  return Array.from({ length: count }, (_, i) => ({ id: `bilge-keel-${i + 1}`, groupId: 'bilge-keel', unit: i + 1, rect: clampRect({ x: start + i * (width + gap), y: calibration.hullTopY + 0.82 * (calibration.bottomY - calibration.hullTopY), width, height: 0.08 * (calibration.bottomY - calibration.hullTopY) }), shape: 'ELLIPSE' }));
}

export function resetMarker(markerId: string, calibration: HullCalibration, bilgeQuantity: number): ZoneMarker | null {
  return [...createDefaultHullMarkers(calibration), ...createDefaultNicheMarkers(calibration, bilgeQuantity)].find((marker) => marker.id === markerId) ?? null;
}
