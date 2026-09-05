import type { CoverCrop } from '../app/coverInfo';

export interface PixelRect { x: number; y: number; width: number; height: number }
export const COVER_PHOTO_SIZE = { width: 1600, height: 800 };

export function coverSourceRect(sourceWidth: number, sourceHeight: number, crop: CoverCrop, targetWidth: number, targetHeight: number): PixelRect {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isFinite(value) && value > 0)
    || !Number.isFinite(crop.zoom) || crop.zoom < 1 || !Number.isFinite(crop.focusX) || !Number.isFinite(crop.focusY)) {
    throw new Error('INVALID_COVER_CROP');
  }
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) * crop.zoom;
  const width = Math.min(sourceWidth, targetWidth / scale);
  const height = Math.min(sourceHeight, targetHeight / scale);
  return {
    x: Math.max(0, Math.min(sourceWidth - width, sourceWidth * crop.focusX - width / 2)),
    y: Math.max(0, Math.min(sourceHeight - height, sourceHeight * crop.focusY - height / 2)),
    width, height,
  };
}

export async function renderCoverPhoto(file: File, crop: CoverCrop, target = COVER_PHOTO_SIZE): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const rect = coverSourceRect(bitmap.width, bitmap.height, crop, target.width, target.height);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('COVER_IMAGE_RENDER_FAILED')), 'image/png',
    ));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
