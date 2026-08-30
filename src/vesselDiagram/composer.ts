import {
  DIAGRAM_HEIGHT,
  DIAGRAM_WIDTH,
  type VesselDiagramConfig,
  type ZoneMarker,
} from './types';
import { isValidRect } from './geometry';

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageSource {
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
  close?: () => void;
}

export interface CanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: CanvasImageSource, x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
}

interface CanvasLike {
  getContext(kind: '2d'): CanvasContext | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

export interface ComposeDependencies {
  decodeImage?: (file: File) => Promise<ImageSource>;
  createCanvas?: (width: number, height: number) => CanvasLike | null;
  createImageBitmap?: (file: File) => Promise<ImageSource>;
  createObjectURL?: (file: File) => string;
  revokeObjectURL?: (url: string) => void;
  loadImage?: (url: string) => Promise<ImageSource>;
}

export function fitContain(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): PixelRect {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

async function decode(file: File, deps: ComposeDependencies): Promise<ImageSource> {
  if (deps.decodeImage) return deps.decodeImage(file);

  const createImageBitmap = deps.createImageBitmap
    ?? (typeof globalThis.createImageBitmap === 'function'
      ? globalThis.createImageBitmap.bind(globalThis)
      : undefined);
  if (createImageBitmap) return createImageBitmap(file);

  const createObjectURL = deps.createObjectURL ?? ((value: File) => URL.createObjectURL(value));
  const revokeObjectURL = deps.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const loadImage = deps.loadImage ?? ((url: string) => new Promise<ImageSource>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'));
      return;
    }
    const image = document.createElement('img');
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = url;
  }));
  const url = createObjectURL(file);

  try {
    return await loadImage(url);
  } finally {
    revokeObjectURL(url);
  }
}

function fail(code: string): never {
  throw new Error(code);
}

function createCanvas(dependencies: ComposeDependencies): CanvasLike | null {
  const factory = dependencies.createCanvas ?? ((width: number, height: number) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });

  try {
    return factory(DIAGRAM_WIDTH, DIAGRAM_HEIGHT);
  } catch {
    return fail('VESSEL_CANVAS_UNAVAILABLE');
  }
}

async function encodePng(canvas: CanvasLike): Promise<Uint8Array> {
  let blob: Blob | null;
  try {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return fail('VESSEL_PNG_ENCODE_FAILED');
  }
  if (!blob) return fail('VESSEL_PNG_ENCODE_FAILED');

  try {
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return fail('VESSEL_PNG_ENCODE_FAILED');
  }
}

function drawMarker(context: CanvasContext, marker: ZoneMarker): void {
  const { x, y, width, height } = marker.rect;
  const pixelX = x * DIAGRAM_WIDTH;
  const pixelY = y * DIAGRAM_HEIGHT;
  const pixelWidth = width * DIAGRAM_WIDTH;
  const pixelHeight = height * DIAGRAM_HEIGHT;

  if (marker.shape === 'RECTANGLE') {
    context.fillRect(pixelX, pixelY, pixelWidth, pixelHeight);
    context.strokeRect(pixelX, pixelY, pixelWidth, pixelHeight);
    return;
  }

  context.beginPath();
  context.ellipse(
    pixelX + pixelWidth / 2,
    pixelY + pixelHeight / 2,
    pixelWidth / 2,
    pixelHeight / 2,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();
}

export async function composeVesselDiagram(
  config: VesselDiagramConfig,
  markerIds: string[],
  dependencies: ComposeDependencies = {},
): Promise<Uint8Array> {
  const image = await decode(config.imageFile, dependencies)
    .catch(() => fail('VESSEL_IMAGE_DECODE_FAILED'));

  try {
    const canvas = createCanvas(dependencies);
    if (!canvas) return fail('VESSEL_CANVAS_UNAVAILABLE');
    const context = canvas.getContext('2d');
    if (!context) return fail('VESSEL_CANVAS_UNAVAILABLE');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, DIAGRAM_WIDTH, DIAGRAM_HEIGHT);

    const rect = fitContain(
      image.naturalWidth ?? image.width,
      image.naturalHeight ?? image.height,
      DIAGRAM_WIDTH,
      DIAGRAM_HEIGHT,
    );
    context.drawImage(image as CanvasImageSource, rect.x, rect.y, rect.width, rect.height);

    const markers = new Map(
      [...config.hullMarkers, ...config.nicheMarkers].map((marker) => [marker.id, marker]),
    );
    context.fillStyle = 'rgba(230, 64, 64, 0.32)';
    context.strokeStyle = '#d83b3b';
    context.lineWidth = 4;
    for (const id of markerIds) {
      const marker = markers.get(id);
      if (marker) {
        if (!isValidRect(marker.rect)) return fail(`VESSEL_MARKER_INVALID:${id}`);
        drawMarker(context, marker);
      }
    }

    return encodePng(canvas);
  } finally {
    image.close?.();
  }
}
