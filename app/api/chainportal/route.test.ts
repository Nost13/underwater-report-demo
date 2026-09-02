import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('ChainPortal proxy route', () => {
  it('forwards a normalized vessel name to the operations dashboard', async () => {
    const upstream = {
      ok: true,
      source: 'supabase',
      matches: [{ vessel: 'STAR KVARVEN', eta: '2026-09-04T08:30', etd: '2026-09-05T20:00' }],
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(upstream), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetcher);

    const response = await GET(new Request('http://localhost/api/chainportal?vessel=%20STAR%20KVARVEN%20'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(upstream);
    expect(fetcher).toHaveBeenCalledWith(
      'https://marine-ops-dashboard.vercel.app/api/chainportal?vessel=STAR%20KVARVEN',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
  });

  it('keeps upstream failure separate from the vessel lookup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 502 })));

    const response = await GET(new Request('http://localhost/api/chainportal?vessel=STAR%20KVARVEN'));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Schedule information is temporarily unavailable.' });
  });
});
