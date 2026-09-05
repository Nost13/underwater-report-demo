import { describe, expect, it, vi } from 'vitest';
import {
  composeVesselDiagram,
  contentBounds,
  fitContain,
  type CanvasContext,
  type ComposeDependencies,
} from './composer';
import type { VesselDiagramConfig } from './types';

const configWithAllMarkers = (): VesselDiagramConfig => ({
  imageFile: new File(['image'], 'vessel.png', { type: 'image/png' }),
  imageName: 'vessel.png',
  calibration: { sternX: 0.08, bowX: 0.92, hullTopY: 0.15, bottomY: 0.86 },
  confirmed: true,
  hullMarkers: [{
    id: 'hull-aft', groupId: 'hull', shape: 'RECTANGLE', rect: { x: 0.1, y: 0.2, width: 0.1, height: 0.2 },
  }],
  nicheMarkers: [
    {
      id: 'transducer-aft', groupId: 'transducer', shape: 'ELLIPSE', rect: { x: 0.2, y: 0.3, width: 0.05, height: 0.1 },
    },
    {
      id: 'transducer-fwd', groupId: 'transducer', shape: 'ELLIPSE', rect: { x: 0.7, y: 0.3, width: 0.05, height: 0.1 },
    },
    {
      id: 'propeller-group', groupId: 'propeller-group', shape: 'ELLIPSE', rect: { x: 0.1, y: 0.7, width: 0.05, height: 0.1 },
    },
  ],
});

function fakeComposer(calls: string[]): ComposeDependencies {
  let fillStyle = '';
  let strokeStyle = '';
  let lineWidth = 0;
  const context: CanvasContext = {
    fillStyle,
    strokeStyle,
    lineWidth,
    fillRect: () => calls.push('fill:white'),
    drawImage: () => calls.push('image'),
    beginPath: () => undefined,
    ellipse: (x: number) => calls.push(`ellipse:${x}`),
    fill: () => calls.push('marker-fill'),
    stroke: () => calls.push('marker-stroke'),
    strokeRect: () => calls.push('rect-stroke'),
  };
  Object.defineProperties(context, {
    fillStyle: {
      get: () => fillStyle,
      set: (value: string) => {
        fillStyle = value;
        calls.push(`fillStyle:${value}`);
      },
    },
    strokeStyle: {
      get: () => strokeStyle,
      set: (value: string) => {
        strokeStyle = value;
        calls.push(`strokeStyle:${value}`);
      },
    },
    lineWidth: {
      get: () => lineWidth,
      set: (value: number) => {
        lineWidth = value;
        calls.push(`lineWidth:${value}`);
      },
    },
  });

  return {
    decodeImage: async () => ({ width: 1000, height: 250 }),
    createCanvas: (width, height) => {
      calls.push(`canvas:${width}x${height}`);
      return {
        getContext: () => context,
        toBlob: (callback) => callback(new Blob([new Uint8Array([137, 80, 78, 71])])),
      };
    },
  };
}

describe('vessel diagram composer', () => {
  it('crops vessel whitespace and uniformly contains edge markers in the exact Word PNG', async () => {
    const config = configWithAllMarkers();
    config.nicheMarkers = [
      { id: 'aft', groupId: 'point', shape: 'CIRCLE', rect: { x: 0, y: .4, width: 80 / 2048, height: 80 / 488 } },
      { id: 'fwd', groupId: 'point', shape: 'CIRCLE', rect: { x: 1 - 80 / 2048, y: .4, width: 80 / 2048, height: 80 / 488 } },
      { id: 'unselected', groupId: 'point', shape: 'CIRCLE', rect: { x: .5, y: 0, width: 80 / 2048, height: 80 / 488 } },
    ];
    const original = structuredClone({ calibration: config.calibration, nicheMarkers: config.nicheMarkers });
    const contexts: (CanvasContext & { drawImage: ReturnType<typeof vi.fn>; ellipse: ReturnType<typeof vi.fn> })[] = [];
    const encoded: number[][] = [];
    await composeVesselDiagram(config, ['aft', 'fwd'], {
      decodeImage: async () => ({ width: 2048, height: 488 }),
      createCanvas: (width, height) => {
        const context = {
          fillStyle: '', strokeStyle: '', lineWidth: 0,
          fillRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(),
          fill: vi.fn(), stroke: vi.fn(), strokeRect: vi.fn(),
          getImageData: () => {
            const data = new Uint8ClampedArray(width * height * 4).fill(255);
            for (let y = 200; y < 280; y++) for (let x = 300; x < 1748; x++) data[(y * width + x) * 4] = 0;
            return { data };
          },
        };
        contexts.push(context);
        return { getContext: () => context, toBlob: (callback) => {
          encoded.push([width, height]);
          callback(new Blob([new Uint8Array([137, 80, 78, 71])]));
        } };
      },
    });
    expect(encoded).toEqual([[1600, 381]]);
    const output = contexts.at(-1)!;
    const image = output.drawImage.mock.calls[0];
    // The crop removes the large source top/bottom whitespace; axes share one scale.
    expect(image).toHaveLength(9);
    expect(image[2]).toBeGreaterThan(0);
    expect(image[4]).toBeLessThan(200);
    expect(image[1]).toBeLessThanOrEqual(300);
    expect(image[1] + image[3]).toBeGreaterThanOrEqual(1748);
    expect(image[2]).toBeLessThanOrEqual(200);
    expect(image[2] + image[4]).toBeGreaterThanOrEqual(280);
    expect(image[7] / image[3]).toBeCloseTo(image[8] / image[4], 10);
    expect(output.drawImage).toHaveBeenCalledTimes(1);
    expect(output.fillRect).toHaveBeenCalledTimes(1); // White background only; no label/handle boxes.
    expect(output.strokeRect).not.toHaveBeenCalled();
    expect(output.ellipse.mock.calls).toHaveLength(2);
    for (const [x, y, rx, ry] of output.ellipse.mock.calls) {
      expect(rx).toBeCloseTo(ry, 10);
      expect(x - rx - output.lineWidth / 2).toBeGreaterThan(0);
      expect(x + rx + output.lineWidth / 2).toBeLessThan(1600);
      expect(y - ry - output.lineWidth / 2).toBeGreaterThan(0);
      expect(y + ry + output.lineWidth / 2).toBeLessThan(381);
    }
    expect(output.ellipse.mock.calls[0][0]).toBeLessThan(output.ellipse.mock.calls[1][0]);
    expect({ calibration: config.calibration, nicheMarkers: config.nicheMarkers }).toEqual(original);
  });

  it('finds visible content while ignoring a near-white outer margin', () => {
    const pixels = new Uint8ClampedArray(10 * 10 * 4).fill(255);
    for (let y = 3; y < 7; y += 1) {
      for (let x = 2; x < 8; x += 1) {
        const offset = (y * 10 + x) * 4;
        pixels[offset] = 20;
        pixels[offset + 1] = 30;
        pixels[offset + 2] = 40;
      }
    }

    expect(contentBounds(pixels, 10, 10, 248)).toEqual({ x: 2, y: 3, width: 6, height: 4 });
    expect(contentBounds(new Uint8ClampedArray(10 * 10 * 4).fill(255), 10, 10, 248)).toBeNull();
  });

  it.each([
    { x: .1, y: .2, width: 0, height: .2 },
    { x: .1, y: .2, width: .1, height: 0 },
    { x: Number.NaN, y: .2, width: .1, height: .2 },
    { x: .1, y: .2, width: Number.POSITIVE_INFINITY, height: .2 },
  ])('rejects malformed requested geometry before Preview or Word can encode it: %j', async (rect) => {
    const config = configWithAllMarkers();
    config.hullMarkers[0].rect = rect;
    await expect(composeVesselDiagram(config, ['hull-aft'], fakeComposer([])))
      .rejects.toThrow('VESSEL_MARKER_INVALID:hull-aft');
  });

  it('contain-fits a wide image without stretching', () => {
    expect(fitContain(1000, 250, 2048, 488)).toEqual({ x: 48, y: 0, width: 1952, height: 488 });
  });

  it('draws white, image, then requested markers in ID order and excludes others', async () => {
    const calls: string[] = [];
    const bytes = await composeVesselDiagram(
      configWithAllMarkers(),
      ['transducer-aft', 'transducer-fwd'],
      fakeComposer(calls),
    );

    expect(calls.slice(0, 4)).toEqual(['canvas:2048x488', 'fillStyle:#ffffff', 'fill:white', 'image']);
    expect(calls).toContain('fillStyle:rgba(230, 64, 64, 0.32)');
    expect(calls).toContain('strokeStyle:#d83b3b');
    expect(calls).toContain('canvas:1600x381');
    const centers = calls.filter((call) => call.startsWith('ellipse:')).map((call) => Number(call.split(':')[1]));
    expect(centers[0]).toBeLessThan(centers[1]);
    expect(calls.filter((call) => call.startsWith('ellipse:'))).toHaveLength(2);
    expect(calls).not.toContain('rect-stroke');
    expect(calls).toContain('marker-fill');
    expect(calls).toContain('marker-stroke');
    expect(bytes).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('closes a decoded bitmap after encoding', async () => {
    const calls: string[] = [];
    const bitmap = { width: 1000, height: 250, close: () => calls.push('close') };
    const dependencies = fakeComposer(calls);
    dependencies.decodeImage = undefined;
    dependencies.createImageBitmap = async () => bitmap;

    await composeVesselDiagram(configWithAllMarkers(), [], dependencies);

    expect(calls.at(-1)).toBe('close');
  });
});
