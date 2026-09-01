import { describe, expect, it } from 'vitest';
import {
  CALLOUT_BAND_HEIGHT,
  CALLOUT_LABEL_WIDTH,
  layoutMarkerCallouts,
} from './callouts';

const marker = (id: string, x: number, y = .5) => ({
  id,
  label: id,
  rect: { x, y, width: .04, height: .08 },
});

describe('vessel diagram callouts', () => {
  it('orders markers and alternates lanes', () => {
    const result = layoutMarkerCallouts([
      marker('c', .5),
      marker('a', .1),
      marker('b', .3),
      marker('d', .7),
    ]);

    expect(result.map(({ id, lane }) => [id, lane])).toEqual([
      ['a', 'TOP'],
      ['b', 'BOTTOM'],
      ['c', 'TOP'],
      ['d', 'BOTTOM'],
    ]);
  });

  it('keeps dense labels separated and in bounds', () => {
    const result = layoutMarkerCallouts(Array.from(
      { length: 12 },
      (_, index) => marker(String(index + 1), .44 + index * .01),
    ));

    for (const lane of ['TOP', 'BOTTOM'] as const) {
      const labels = result
        .filter((item) => item.lane === lane)
        .sort((a, b) => a.labelCenter.x - b.labelCenter.x);
      labels.forEach((item) => {
        expect(item.labelCenter.x - CALLOUT_LABEL_WIDTH / 2).toBeGreaterThanOrEqual(0);
        expect(item.labelCenter.x + CALLOUT_LABEL_WIDTH / 2).toBeLessThanOrEqual(2048);
      });
      for (let index = 1; index < labels.length; index += 1) {
        expect(labels[index].labelCenter.x - labels[index - 1].labelCenter.x)
          .toBeGreaterThanOrEqual(CALLOUT_LABEL_WIDTH + 12);
      }
    }
  });

  it('connects each line to its own marker center', () => {
    const [result] = layoutMarkerCallouts([marker('target', .25, .4)]);

    expect(result.anchor.x).toBeCloseTo(.27 * 2048, 8);
    expect(result.anchor.y).toBeCloseTo(CALLOUT_BAND_HEIGHT + .44 * 488, 8);
    expect(result.points[0]).toEqual(result.anchor);
    expect(result.points.at(-1)).toEqual(result.labelCenter);
  });

  it('drops malformed markers safely', () => {
    expect(layoutMarkerCallouts([
      { id: 'bad', label: 'Bad', rect: { x: Number.NaN, y: 0, width: .1, height: .1 } },
    ])).toEqual([]);
  });
});
