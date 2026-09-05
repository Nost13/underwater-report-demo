import type { CoverCrop } from '../app/coverInfo';

export interface PixelRect { x: number; y: number; width: number; height: number }
// Reduced from the source cover's 7686040 x 3939540 EMU floating frame.
export const COVER_PHOTO_SIZE = { width: 3026, height: 1551 };
export interface CoverPhotoTarget {
  width: number;
  height: number;
  /** Fractions cropped by the retained Word picture, outside the visible frame. */
  cropInsets?: { top: number; bottom: number };
}

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

export async function renderCoverPhoto(file: File, crop: CoverCrop, target: CoverPhotoTarget = COVER_PHOTO_SIZE): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const rect = coverSourceRect(bitmap.width, bitmap.height, crop, target.width, target.height);
    const { top = 0, bottom = 0 } = target.cropInsets ?? {};
    if (![top, bottom].every((value) => Number.isFinite(value) && value >= 0) || top + bottom >= 1) throw new Error('INVALID_COVER_INSETS');
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = Math.ceil(target.height / (1 - top - bottom));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    if (top || bottom) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Fractional destination edges compensate Word's crop exactly even when
    // the encoded canvas height must be rounded to an integer pixel count.
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, canvas.height * top, canvas.width, canvas.height * (1 - top - bottom));
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('COVER_IMAGE_RENDER_FAILED')), 'image/png',
    ));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
