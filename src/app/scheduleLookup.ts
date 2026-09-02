export interface VesselSchedule {
  vessel: string;
  terminal: string;
  berth: string;
  carrier: string;
  direction: string;
  port: string;
  eta: string;
  etd: string;
}

interface ChainPortalResponse {
  matches?: Partial<VesselSchedule>[];
}

const text = (value: unknown) => typeof value === 'string' ? value : '';

function mapSchedule(value: Partial<VesselSchedule>): VesselSchedule {
  return {
    vessel: text(value.vessel),
    terminal: text(value.terminal),
    berth: text(value.berth),
    carrier: text(value.carrier),
    direction: text(value.direction),
    port: text(value.port),
    eta: text(value.eta),
    etd: text(value.etd),
  };
}

export async function lookupVesselSchedule(
  vesselName: string,
  fetcher: typeof fetch = fetch,
): Promise<VesselSchedule[]> {
  const normalized = vesselName.trim();
  if (normalized.length < 2) return [];

  try {
    const response = await fetcher(`/api/chainportal?vessel=${encodeURIComponent(normalized)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return [];
    const body = await response.json() as ChainPortalResponse;
    return (body.matches ?? [])
      .map(mapSchedule)
      .filter((schedule) => schedule.vessel && (schedule.eta || schedule.etd));
  } catch {
    return [];
  }
}
