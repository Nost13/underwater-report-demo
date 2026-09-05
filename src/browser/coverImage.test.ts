import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverSourceRect, renderCoverPhoto } from './coverImage';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('cover crop', () => {
  it('fills a wide banner with a centered landscape crop', () => {
    expect(coverSourceRect(1200, 800, { focusX: .5, focusY: .5, zoom: 1 }, 1600, 800))
      .toEqual({ x: 0, y: 100, width: 1200, height: 600 });
  });
  it('clamps focused crops at both edges and handles portrait sources', () => {
    expect(coverSourceRect(1200, 800, { focusX: 1, focusY: 0, zoom: 2 }, 1600, 800))
      .toEqual({ x: 600, y: 0, width: 600, height: 300 });
    expect(coverSourceRect(800, 1200, { focusX: -1, focusY: 2, zoom: 1 }, 1600, 800))
      .toEqual({ x: 0, y: 800, width: 800, height: 400 });
  });
  it('rejects invalid dimensions and zoom rather than producing invalid canvas geometry', () => {
    expect(() => coverSourceRect(0, 800, { focusX: .5, focusY: .5, zoom: 1 }, 1600, 800)).toThrow();
    expect(() => coverSourceRect(1200, 800, { focusX: .5, focusY: .5, zoom: 0 }, 1600, 800)).toThrow();
  });
});

describe('cover photo rendering', () => {
  it('compensates the retained Word crop so it reveals the full intended source rectangle', async () => {
    const bitmap = { width: 1200, height: 800, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, fillRect: vi.fn() } as unknown as CanvasRenderingContext2D);
    let outputHeight = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
      outputHeight = this.height;
      callback({ arrayBuffer: async () => new Uint8Array([1]).buffer } as Blob);
    });
    await renderCoverPhoto(new File(['photo'], 'photo.jpg'), { focusX: 1, focusY: .5, zoom: 2 }, { width: 3026, height: 1551, cropInsets: { top: .15821, bottom: .15821 } });
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = drawImage.mock.calls[0];
    expect(sx).toBe(600);
    expect(sy).toBeCloseTo(400 - 600 * 1551 / 3026 / 2);
    expect(sw).toBe(600);
    expect(sh).toBeCloseTo(600 * 1551 / 3026);
    expect(outputHeight).toBe(Math.ceil(1551 / .68358));
    expect([dx, dw]).toEqual([0, 3026]);
    expect(dy).toBeCloseTo(outputHeight * .15821);
    expect(dh).toBeCloseTo(outputHeight * .68358);
    // Applying Word's existing source crop exposes exactly the intended draw region.
    expect((outputHeight * .15821 - dy) / dh).toBeCloseTo(0);
    expect((outputHeight * (1 - .15821) - dy) / dh).toBeCloseTo(1);
  });
  it('draws the selected source crop into the requested output size and releases the bitmap', async () => {
    const close = vi.fn();
    const bitmap = { width: 1200, height: 800, close };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    let outputSize: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
      outputSize = [this.width, this.height];
      callback({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob);
    });
    expect(await renderCoverPhoto(new File(['photo'], 'photo.jpg'), { focusX: 1, focusY: .5, zoom: 2 }, { width: 1600, height: 800 })).toEqual(new Uint8Array([1, 2, 3]));
    expect(drawImage).toHaveBeenCalledWith(bitmap, 600, 250, 600, 300, 0, 0, 1600, 800);
    expect(outputSize).toEqual([1600, 800]);
    expect(close).toHaveBeenCalledOnce();
  });
  it('releases the bitmap when canvas encoding fails', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1200, height: 800, close }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
    await expect(renderCoverPhoto(new File([], 'photo.jpg'), { focusX: .5, focusY: .5, zoom: 1 })).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });
});
