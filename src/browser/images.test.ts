import { describe, expect, it, vi } from 'vitest';
import { ThumbnailPool } from './images';

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
