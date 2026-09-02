import { describe, expect, it, vi } from 'vitest';
import { lookupVesselSchedule } from './scheduleLookup';

describe('ChainPortal vessel schedule lookup', () => {
  it('maps the next ChainPortal schedule into report-ready values', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      source: 'supabase',
      matches: [{
        vessel: 'STAR KVARVEN',
        terminal: 'PNIT',
        berth: '3',
        carrier: 'MSC',
        direction: 'PORT',
        port: 'Busan',
        eta: '2026-09-04T08:30',
        etd: '2026-09-05T20:00',
      }],
    }), { status: 200 }));

    await expect(lookupVesselSchedule('STAR KVARVEN', fetcher)).resolves.toEqual([{
      vessel: 'STAR KVARVEN',
      terminal: 'PNIT',
      berth: '3',
      carrier: 'MSC',
      direction: 'PORT',
      port: 'Busan',
      eta: '2026-09-04T08:30',
      etd: '2026-09-05T20:00',
    }]);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/chainportal?vessel=STAR%20KVARVEN',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns no schedules when ChainPortal is unavailable', async () => {
    await expect(lookupVesselSchedule(
      'STAR KVARVEN',
      async () => new Response('', { status: 502 }),
    )).resolves.toEqual([]);
  });
});
