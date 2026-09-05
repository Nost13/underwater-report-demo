import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizeForReportSlot, ThumbnailPool } from './images';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fixed report photo slots', () => {
  it.each([
    { width: 600, height: 1200, source: [0, 375, 600, 450] },
    { width: 1600, height: 600, source: [400, 0, 800, 600] },
  ])('center crops a $width by $height image without stretching', async ({ width, height, source }) => {
    const bitmap = { width, height, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const drawImage = vi.fn();
    const context = { drawImage, fillRect: vi.fn(), fillStyle: '' };
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob));
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    expect(await resizeForReportSlot(new File(['image'], 'photo.jpg'), 1200, 900)).toEqual(new Uint8Array([1, 2, 3]));
    expect([canvas.width, canvas.height]).toEqual([1200, 900]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, ...source, 0, 0, 1200, 900);
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1200, 900);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('closes the decoded bitmap if canvas encoding fails', async () => {
    const bitmap = { width: 1600, height: 1200, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({ drawImage: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(null));
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    await expect(resizeForReportSlot(new File(['image'], 'photo.jpg'), 1200, 900)).rejects.toThrow('IMAGE_RESIZE_FAILED');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});

describe('thumbnail resource management', () => {
  it('revokes a generated object URL exactly once when released', async () => {
    const urlApi = {
      createObjectURL: vi.fn(() => 'blob:thumb-1'),
      revokeObjectURL: vi.fn(),
    };
    const pool = new ThumbnailPool(async () => new Blob(['small']), urlApi, 2);
    const lease = await pool.acquire(new File(['large'], 'a.jpg'));
    lease.release();
    lease.release();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:thumb-1');
  });

  it('never runs more thumbnail jobs than its concurrency limit', async () => {
    let active = 0;
    let maximum = 0;
    const producer = async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Blob(['small']);
    };
    const pool = new ThumbnailPool(producer, URL, 2);
    const files = [1, 2, 3, 4].map((number) => new File(['x'], `${number}.jpg`));
    const leases = await Promise.all(files.map((file) => pool.acquire(file)));
    leases.forEach((lease) => lease.release());
    expect(maximum).toBe(2);
  });
});
