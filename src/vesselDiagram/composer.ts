import {
  DIAGRAM_HEIGHT,
  DIAGRAM_WIDTH,
  type VesselDiagramConfig,
  type ZoneMarker,
} from './types';
import { isValidRect } from './geometry';

// Word output dimensions are independent of the editor's saved coordinate space.
export const WORD_DIAGRAM_WIDTH = 1600;
export const WORD_DIAGRAM_HEIGHT = 381;

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
  drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  getImageData?(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
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
  outputWidth?: number;
  outputHeight?: number;
  trimOuterWhitespace?: boolean;
}

export function contentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 248,
): PixelRect | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const visible = pixels[offset + 3] > 8 && (
        pixels[offset] < threshold || pixels[offset + 1] < threshold || pixels[offset + 2] < threshold
      );
      if (!visible) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left || bottom < top
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
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

function createCanvas(dependencies: ComposeDependencies, width = DIAGRAM_WIDTH, height = DIAGRAM_HEIGHT): CanvasLike | null {
  const factory = dependencies.createCanvas ?? ((width: number, height: number) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });

  try {
    return factory(width, height);
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

function vesselBounds(context: CanvasContext, fallback: PixelRect, dependencies: ComposeDependencies): PixelRect {
  if (dependencies.trimOuterWhitespace === false || !context.getImageData) return fallback;
  try {
    return contentBounds(context.getImageData(0, 0, DIAGRAM_WIDTH, DIAGRAM_HEIGHT).data, DIAGRAM_WIDTH, DIAGRAM_HEIGHT) ?? fallback;
  } catch {
    return fallback;
  }
}

function markerPixels(marker: ZoneMarker): PixelRect {
  const { x, y, width, height } = marker.rect;
  return { x: x * DIAGRAM_WIDTH, y: y * DIAGRAM_HEIGHT, width: width * DIAGRAM_WIDTH, height: height * DIAGRAM_HEIGHT };
}

function drawMarker(context: CanvasContext, marker: ZoneMarker, source: PixelRect, target: PixelRect, scale: number): void {
  const rect = markerPixels(marker);
  const pixelX = target.x + (rect.x - source.x) * scale;
  const pixelY = target.y + (rect.y - source.y) * scale;
  const pixelWidth = rect.width * scale;
  const pixelHeight = rect.height * scale;

  if (marker.shape === 'RECTANGLE') {
    context.fillRect(pixelX, pixelY, pixelWidth, pixelHeight);
    context.strokeRect(pixelX, pixelY, pixelWidth, pixelHeight);
    return;
  }

  context.beginPath();
  context.ellipse(
    pixelX + pixelWidth / 2,
    pixelY + pixelHeight / 2,
    (marker.shape === 'CIRCLE' ? Math.min(pixelWidth, pixelHeight) : pixelWidth) / 2,
    (marker.shape === 'CIRCLE' ? Math.min(pixelWidth, pixelHeight) : pixelHeight) / 2,
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
    const selected: ZoneMarker[] = [];
    for (const id of markerIds) {
      const marker = markers.get(id);
      if (marker) {
        if (!isValidRect(marker.rect)) return fail(`VESSEL_MARKER_INVALID:${id}`);
        selected.push(marker);
      }
    }

    const bounds = [vesselBounds(context, rect, dependencies), ...selected.map(markerPixels)];
    const left = Math.min(...bounds.map((bound) => bound.x));
    const top = Math.min(...bounds.map((bound) => bound.y));
    const right = Math.max(...bounds.map((bound) => bound.x + bound.width));
    const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height));
    const padding = Math.max(8, Math.max(right - left, bottom - top) * .005);
    // Keep padding outside the original raster too: edge-marker strokes must not be clipped.
    const source = { x: left - padding, y: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 };
    const outputWidth = dependencies.outputWidth ?? WORD_DIAGRAM_WIDTH;
    const outputHeight = dependencies.outputHeight ?? WORD_DIAGRAM_HEIGHT;
    const output = createCanvas(dependencies, outputWidth, outputHeight);
    const outputContext = output?.getContext('2d');
    if (!output || !outputContext) return fail('VESSEL_CANVAS_UNAVAILABLE');
    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, outputWidth, outputHeight);
    const target = fitContain(source.width, source.height, outputWidth, outputHeight);
    const scale = target.width / source.width;
    const cropX = Math.max(0, source.x);
    const cropY = Math.max(0, source.y);
    const cropWidth = Math.min(DIAGRAM_WIDTH, source.x + source.width) - cropX;
    const cropHeight = Math.min(DIAGRAM_HEIGHT, source.y + source.height) - cropY;
    outputContext.drawImage(canvas as unknown as CanvasImageSource,
      cropX, cropY, cropWidth, cropHeight,
      target.x + (cropX - source.x) * scale, target.y + (cropY - source.y) * scale,
      cropWidth * scale, cropHeight * scale);
    outputContext.fillStyle = 'rgba(230, 64, 64, 0.32)';
    outputContext.strokeStyle = '#d83b3b';
    outputContext.lineWidth = 4 * scale;
    for (const marker of selected) drawMarker(outputContext, marker, source, target, scale);
    return encodePng(output);
  } finally {
    image.close?.();
  }
}
