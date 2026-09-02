const OPERATIONS_CHAINPORTAL_API = 'https://marine-ops-dashboard.vercel.app/api/chainportal';

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(request: Request) {
  const vessel = new URL(request.url).searchParams.get('vessel')?.trim() ?? '';
  if (vessel.length < 2) return json({ error: 'Enter at least two characters.' }, 400);

  try {
    const response = await fetch(`${OPERATIONS_CHAINPORTAL_API}?vessel=${encodeURIComponent(vessel)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return json({ error: 'Schedule information is temporarily unavailable.' }, 502);
    }
    return json(await response.json());
  } catch {
    return json({ error: 'Schedule information is temporarily unavailable.' }, 502);
  }
}
