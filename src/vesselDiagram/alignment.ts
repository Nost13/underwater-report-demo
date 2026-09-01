import type { NormalizedRect, ZoneMarker } from './types';

export type MarkerAlignment =
  | 'LEFT'
  | 'CENTER_X'
  | 'RIGHT'
  | 'TOP'
  | 'MIDDLE_Y'
  | 'BOTTOM';

export type MarkerDistribution = 'HORIZONTAL' | 'VERTICAL';

function boundsOf(markers: ZoneMarker[]): NormalizedRect {
  const x = Math.min(...markers.map(({ rect }) => rect.x));
  const y = Math.min(...markers.map(({ rect }) => rect.y));
  const right = Math.max(...markers.map(({ rect }) => rect.x + rect.width));
  const bottom = Math.max(...markers.map(({ rect }) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

const clampOrigin = (origin: number, size: number) => Math.min(1 - size, Math.max(0, origin));

export function translateMarkerSelection(
  markers: ZoneMarker[],
  selectedIds: readonly string[],
  delta: { x: number; y: number },
): ZoneMarker[] {
  const ids = new Set(selectedIds);
  const selected = markers.filter(({ id }) => ids.has(id));
  if (!selected.length) return markers;
  const bounds = boundsOf(selected);
  const x = Math.min(1 - bounds.x - bounds.width, Math.max(-bounds.x, delta.x));
  const y = Math.min(1 - bounds.y - bounds.height, Math.max(-bounds.y, delta.y));

  return markers.map((marker) => ids.has(marker.id)
    ? {
      ...marker,
      rect: {
        ...marker.rect,
        x: marker.rect.x + x,
        y: marker.rect.y + y,
      },
    }
    : marker);
}

export function alignMarkerSelection(
  markers: ZoneMarker[],
  selectedIds: readonly string[],
  mode: MarkerAlignment,
): ZoneMarker[] {
  const ids = new Set(selectedIds);
  const selected = markers.filter(({ id }) => ids.has(id));
  if (selected.length < 2) return markers;
  const bounds = boundsOf(selected);
  const centerX = bounds.x + bounds.width / 2;
  const middleY = bounds.y + bounds.height / 2;

  return markers.map((marker) => {
    if (!ids.has(marker.id)) return marker;
    const rect = { ...marker.rect };
    if (mode === 'LEFT') rect.x = bounds.x;
    if (mode === 'CENTER_X') rect.x = centerX - rect.width / 2;
    if (mode === 'RIGHT') rect.x = bounds.x + bounds.width - rect.width;
    if (mode === 'TOP') rect.y = bounds.y;
    if (mode === 'MIDDLE_Y') rect.y = middleY - rect.height / 2;
    if (mode === 'BOTTOM') rect.y = bounds.y + bounds.height - rect.height;
    rect.x = clampOrigin(rect.x, rect.width);
    rect.y = clampOrigin(rect.y, rect.height);
    return { ...marker, rect };
  });
}

export function distributeMarkerSelection(
  markers: ZoneMarker[],
  selectedIds: readonly string[],
  axis: MarkerDistribution,
): ZoneMarker[] {
  const ids = new Set(selectedIds);
  const selected = markers
    .filter(({ id }) => ids.has(id))
    .sort((a, b) => {
      const aCenter = axis === 'HORIZONTAL'
        ? a.rect.x + a.rect.width / 2
        : a.rect.y + a.rect.height / 2;
      const bCenter = axis === 'HORIZONTAL'
        ? b.rect.x + b.rect.width / 2
        : b.rect.y + b.rect.height / 2;
      return aCenter - bCenter || a.id.localeCompare(b.id);
    });
  if (selected.length < 3) return markers;

  const center = (marker: ZoneMarker) => axis === 'HORIZONTAL'
    ? marker.rect.x + marker.rect.width / 2
    : marker.rect.y + marker.rect.height / 2;
  const first = center(selected[0]);
  const step = (center(selected.at(-1)!) - first) / (selected.length - 1);
  const targetById = new Map(selected.map((marker, index) => [marker.id, first + step * index]));

  return markers.map((marker) => {
    const target = targetById.get(marker.id);
    if (target === undefined) return marker;
    const rect = { ...marker.rect };
    if (axis === 'HORIZONTAL') rect.x = clampOrigin(target - rect.width / 2, rect.width);
    else rect.y = clampOrigin(target - rect.height / 2, rect.height);
    return { ...marker, rect };
  });
}

export function matchCircleSelectionSize(
  markers: ZoneMarker[],
  selectedIds: readonly string[],
): ZoneMarker[] {
  const ids = new Set(selectedIds);
  const reference = selectedIds
    .map((id) => markers.find((marker) => marker.id === id))
    .find((marker) => marker?.shape === 'CIRCLE');
  const selectedCircleCount = markers.filter((marker) => ids.has(marker.id) && marker.shape === 'CIRCLE').length;
  if (!reference || selectedCircleCount < 2) return markers;

  return markers.map((marker) => {
    if (!ids.has(marker.id) || marker.shape !== 'CIRCLE' || marker.id === reference.id) return marker;
    const centerX = marker.rect.x + marker.rect.width / 2;
    const centerY = marker.rect.y + marker.rect.height / 2;
    return {
      ...marker,
      rect: {
        x: clampOrigin(centerX - reference.rect.width / 2, reference.rect.width),
        y: clampOrigin(centerY - reference.rect.height / 2, reference.rect.height),
        width: reference.rect.width,
        height: reference.rect.height,
      },
    };
  });
}
