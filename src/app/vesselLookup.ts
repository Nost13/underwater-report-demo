import type { Vessel } from './demoData';

const OPERATIONS_VESSEL_API = 'https://marine-ops-dashboard.vercel.app/api/vessels';

interface OperationsVessel {
  vesselName?: string;
  vesselType?: string;
  imoNo?: string;
  callsign?: string;
  loa?: string;
  breadth?: string;
  gt?: string;
  dwt?: string;
  built?: string;
  ownerClient?: string;
}

const text = (value: unknown) => typeof value === 'string' ? value : '';

function mapVessel(vessel: OperationsVessel): Vessel {
  return {
    imo: text(vessel.imoNo),
    name: text(vessel.vesselName),
    type: text(vessel.vesselType),
    callSign: text(vessel.callsign),
    loa: text(vessel.loa),
    breadth: text(vessel.breadth),
    gt: text(vessel.gt),
    dwt: text(vessel.dwt),
    yearBuilt: text(vessel.built),
    ownerClient: text(vessel.ownerClient),
    classSociety: '',
    flag: '',
  };
}

export async function lookupVessel(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<Vessel[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  try {
    const response = await fetcher(`${OPERATIONS_VESSEL_API}?name=${encodeURIComponent(normalized)}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];
    const body = await response.json() as { matches?: OperationsVessel[] };
    return (body.matches ?? []).map(mapVessel).filter((vessel) => vessel.name);
  } catch {
    return [];
  }
}
