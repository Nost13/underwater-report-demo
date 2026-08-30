import { describe, expect, it } from 'vitest';
import {
  composeVesselDiagram,
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
    expect(calls).toContain('lineWidth:4');
    expect(calls).toContain('ellipse:460.8');
    expect(calls).toContain('ellipse:1484.8');
    expect(calls.indexOf('ellipse:460.8')).toBeLessThan(calls.indexOf('ellipse:1484.8'));
    expect(calls.filter((call) => call.startsWith('ellipse:'))).toHaveLength(2);
    expect(calls).not.toContain('ellipse:256');
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
