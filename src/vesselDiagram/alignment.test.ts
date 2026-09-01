import { describe, expect, it } from 'vitest';
import {
  alignMarkerSelection,
  distributeMarkerSelection,
  translateMarkerSelection,
} from './alignment';
import type { ZoneMarker } from './types';

const markers: ZoneMarker[] = [
  { id: 'a', groupId: 'a', shape: 'ELLIPSE', rect: { x: .1, y: .2, width: .1, height: .1 } },
  { id: 'b', groupId: 'b', shape: 'ELLIPSE', rect: { x: .4, y: .5, width: .2, height: .15 } },
  { id: 'c', groupId: 'c', shape: 'ELLIPSE', rect: { x: .8, y: .7, width: .1, height: .1 } },
];

describe('marker alignment', () => {
  it.each([
    ['LEFT', (rect: ZoneMarker['rect']) => rect.x],
    ['CENTER_X', (rect: ZoneMarker['rect']) => rect.x + rect.width / 2],
    ['RIGHT', (rect: ZoneMarker['rect']) => rect.x + rect.width],
    ['TOP', (rect: ZoneMarker['rect']) => rect.y],
    ['MIDDLE_Y', (rect: ZoneMarker['rect']) => rect.y + rect.height / 2],
    ['BOTTOM', (rect: ZoneMarker['rect']) => rect.y + rect.height],
  ] as const)('aligns in %s without resizing', (mode, coordinate) => {
    const result = alignMarkerSelection(markers, ['a', 'b'], mode);

    expect(coordinate(result[0].rect)).toBeCloseTo(coordinate(result[1].rect), 10);
    expect(result.map(({ rect }) => [rect.width, rect.height]))
      .toEqual(markers.map(({ rect }) => [rect.width, rect.height]));
    expect(result[2]).toBe(markers[2]);
  });

  it.each(['HORIZONTAL', 'VERTICAL'] as const)('distributes on %s', (axis) => {
    const result = distributeMarkerSelection(markers, ['a', 'b', 'c'], axis);
    const centers = result.map(({ rect }) => axis === 'HORIZONTAL'
      ? rect.x + rect.width / 2
      : rect.y + rect.height / 2);

    expect(centers[1] - centers[0]).toBeCloseTo(centers[2] - centers[1], 10);
  });

  it('bounds mixed-group translation as one rigid selection', () => {
    const result = translateMarkerSelection(markers, ['a', 'b'], { x: -1, y: 1 });

    expect(result[0].rect.x).toBe(0);
    expect(result[1].rect.x - result[0].rect.x).toBeCloseTo(.3, 10);
    expect(result[1].rect.y - result[0].rect.y).toBeCloseTo(.3, 10);
    expect(result[1].rect.y + result[1].rect.height).toBeLessThanOrEqual(1);
  });

  it('returns the original collection when too few markers are selected', () => {
    expect(alignMarkerSelection(markers, ['a'], 'LEFT')).toBe(markers);
    expect(distributeMarkerSelection(markers, ['a', 'b'], 'HORIZONTAL')).toBe(markers);
  });
});
