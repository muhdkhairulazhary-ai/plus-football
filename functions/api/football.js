// The singleton owns the key, cache and quota. No direct upstream fallback.
const json = (value, status) => Response.json(value, {status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
}});
export async function onRequestGet({request, env}) {
  if (request.method !== 'GET') return json({error: 'Expected GET request'}, 400);
  const query = new URL(request.url).searchParams;
  if (query.getAll('endpoint').length !== 1 || query.get('endpoint') !== 'fixtures' ||
      query.getAll('date').length !== 1 ||
      [...query.keys()].some(key => key !== 'endpoint' && key !== 'date'))
    return json({error: 'Expected fixtures and exactly one date parameter'}, 400);
  const date = query.get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + 'T00:00:00Z')) ||
      new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date)
    return json({error: 'Invalid calendar date'}, 400);
  if (!env.FOOTBALL_QUOTA) return json({error: 'Football service unavailable'}, 503);
  try {
    // Same singleton across public origins, regions and dates. All deployments
    // spending the same provider key must use the same namespace and name.
    const id = env.FOOTBALL_QUOTA.idFromName('api-football-global-v1');
    return await env.FOOTBALL_QUOTA.get(id).fetch('https://football-quota.internal/fixtures', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({date, client: request.headers.get('CF-Connecting-IP') || 'unknown'})
    });
  } catch { return json({error: 'Football service unavailable'}, 503); }
}
