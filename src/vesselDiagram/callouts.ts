import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, type NormalizedRect } from './types';

export const CALLOUT_BAND_HEIGHT = 100;
export const CALLOUT_STAGE_HEIGHT = DIAGRAM_HEIGHT + CALLOUT_BAND_HEIGHT * 2;
export const CALLOUT_LABEL_WIDTH = 180;
const LABEL_GAP = 12;

export interface CalloutMarker {
  id: string;
  label: string;
  rect: NormalizedRect;
}

export interface CalloutPoint {
  x: number;
  y: number;
}

export interface MarkerCallout {
  id: string;
  label: string;
  lane: 'TOP' | 'BOTTOM';
  anchor: CalloutPoint;
  elbow: CalloutPoint;
  labelCenter: CalloutPoint;
  points: CalloutPoint[];
}

function isValidMarker({ label, rect }: CalloutMarker): boolean {
  return Boolean(label.trim())
    && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.x >= 0
    && rect.y >= 0
    && rect.width > 0
    && rect.height > 0
    && rect.x + rect.width <= 1
    && rect.y + rect.height <= 1;
}

function layoutLane(markers: CalloutMarker[]): Map<string, number> {
  const centers = markers.map(({ rect }) => Math.min(
    DIAGRAM_WIDTH - CALLOUT_LABEL_WIDTH / 2,
    Math.max(
      CALLOUT_LABEL_WIDTH / 2,
      (rect.x + rect.width / 2) * DIAGRAM_WIDTH,
    ),
  ));

  for (let index = 1; index < centers.length; index += 1) {
    centers[index] = Math.max(
      centers[index],
      centers[index - 1] + CALLOUT_LABEL_WIDTH + LABEL_GAP,
    );
  }

  const overflow = Math.max(
    0,
    (centers.at(-1) ?? 0) + CALLOUT_LABEL_WIDTH / 2 - DIAGRAM_WIDTH,
  );
  for (let index = 0; index < centers.length; index += 1) {
    centers[index] -= overflow;
  }

  for (let index = centers.length - 2; index >= 0; index -= 1) {
    centers[index] = Math.min(
      centers[index],
      centers[index + 1] - CALLOUT_LABEL_WIDTH - LABEL_GAP,
    );
  }

  const deficit = Math.max(0, CALLOUT_LABEL_WIDTH / 2 - (centers[0] ?? 0));
  return new Map(markers.map(({ id }, index) => [id, centers[index] + deficit]));
}

export function layoutMarkerCallouts(markers: CalloutMarker[]): MarkerCallout[] {
  const ordered = markers
    .filter(isValidMarker)
    .sort((a, b) => {
      const delta = a.rect.x + a.rect.width / 2 - (b.rect.x + b.rect.width / 2);
      return delta || a.id.localeCompare(b.id);
    });
  const top = ordered.filter((_, index) => index % 2 === 0);
  const bottom = ordered.filter((_, index) => index % 2 === 1);
  const centers = new Map([...layoutLane(top), ...layoutLane(bottom)]);

  return ordered.map((marker, index) => {
    const lane = index % 2 === 0 ? 'TOP' : 'BOTTOM';
    const anchor = {
      x: (marker.rect.x + marker.rect.width / 2) * DIAGRAM_WIDTH,
      y: CALLOUT_BAND_HEIGHT
        + (marker.rect.y + marker.rect.height / 2) * DIAGRAM_HEIGHT,
    };
    const elbowY = lane === 'TOP'
      ? CALLOUT_BAND_HEIGHT - 12
      : CALLOUT_BAND_HEIGHT + DIAGRAM_HEIGHT + 12;
    const labelCenter = {
      x: centers.get(marker.id) ?? anchor.x,
      y: lane === 'TOP' ? 38 : CALLOUT_STAGE_HEIGHT - 38,
    };
    const elbow = { x: anchor.x, y: elbowY };
    return {
      id: marker.id,
      label: marker.label,
      lane,
      anchor,
      elbow,
      labelCenter,
      points: [anchor, elbow, { x: labelCenter.x, y: elbowY }, labelCenter],
    };
  });
}
