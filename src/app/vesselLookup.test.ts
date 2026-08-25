import { describe, expect, it, vi } from 'vitest';
import { lookupVessel } from './vesselLookup';

describe('operations vessel lookup', () => {
  it('maps the operations dashboard response into the report vessel model', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      matches: [{ vesselName: 'HMM ALGECIRAS', vesselType: 'Container Ship', imoNo: '9863297', callsign: 'D7JI', loa: '399.90', breadth: '61.00', gt: '228283', dwt: '232606', built: '2020', ownerClient: 'HMM' }],
    }), { status: 200 }));

    await expect(lookupVessel('HMM', fetcher)).resolves.toEqual([{
      imo: '9863297', name: 'HMM ALGECIRAS', type: 'Container Ship', callSign: 'D7JI', loa: '399.90', breadth: '61.00', gt: '228283', dwt: '232606', yearBuilt: '2020', ownerClient: 'HMM', classSociety: '', flag: '',
    }]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://marine-ops-dashboard.vercel.app/api/vessels?name=HMM',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns no records for an unsuccessful lookup instead of failing report input', async () => {
    await expect(lookupVessel('UNKNOWN', async () => new Response('', { status: 503 }))).resolves.toEqual([]);
  });
});
