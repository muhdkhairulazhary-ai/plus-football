// Cloudflare Pages Function: conservative API-Football free-tier gateway.
// Secrets remain server-side. Limits are best-effort per Cloudflare colo,
// not a globally atomic daily quota.
const allowed = {
  fixtures: ['league','season','date','from','to','status','team','id','timezone'],
  standings: ['league','season','team'],
  'fixtures/statistics': ['fixture','team','type'],
  'fixtures/events': ['fixture','team','player','type'],
  'players/topscorers': ['league','season'],
  'players/topassists': ['league','season']
};
const ttl = 3600;
const json = (value,status=200,extra={}) => Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
export async function onRequestGet({request,env}) {
  const url = new URL(request.url);
  // Phase 1: expose only the date-based fixture lookup used by the UI.
  // Reject duplicate keys and invalid calendar dates before using API quota.
  if (url.searchParams.getAll('endpoint').length !== 1 ||
      url.searchParams.get('endpoint') !== 'fixtures')
    return json({error:'Unsupported endpoint'},400);
  if (url.searchParams.getAll('date').length !== 1 ||
      [...url.searchParams.keys()].some(key => key !== 'endpoint' && key !== 'date'))
    return json({error:'Expected exactly one date parameter (YYYY-MM-DD)'},400);
  const date = url.searchParams.get('date');
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date+'T00:00:00Z')) &&
    new Date(date+'T00:00:00Z').toISOString().slice(0,10) === date;
  if (!isDate) return json({error:'Invalid calendar date'},400);
  const endpoint = 'fixtures';
  const params = new URLSearchParams({date});
  params.sort();
  // Normalize the cache key, avoiding tracking query strings and query order.
  const cacheKey = new Request(url.origin+'/api/football?endpoint='+encodeURIComponent(endpoint)+'&'+params.toString());
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  if (!env.API_FOOTBALL_KEY) return json({error:'API secret not configured'},503);
  // One request per 60 seconds per Cloudflare data centre, across endpoints.
  // Fail closed instead of burning through the provider's free-tier quota.
  const guardKey = new Request(url.origin+'/api/football-quota-guard');
  if (await cache.match(guardKey)) return json({error:'Refresh temporarily limited to protect free API quota. Try again later.',retryAfterSeconds:60},429,{'Retry-After':'60'});
  const guard = new Response('limited',{headers:{'Cache-Control':'public,max-age=60'}});
  await cache.put(guardKey,guard);
  try {
    const target='https://v3.football.api-sports.io/'+endpoint+'?'+params.toString();
    const upstream=await fetch(target,{headers:{'x-apisports-key':env.API_FOOTBALL_KEY,accept:'application/json'},signal:AbortSignal.timeout(9000)});
    if (!upstream.ok) return json({error:'Football provider unavailable',status:upstream.status},502);
    const data=await upstream.json();
    if (data.errors && (Array.isArray(data.errors)?data.errors.length:Object.keys(data.errors).length)) {
      const errorText=JSON.stringify(data.errors);
      const limited=/rateLimit|too many requests/i.test(errorText);
      return json({error:limited?'Provider rate limit reached':'Provider restriction or unsupported coverage',details:data.errors},limited?429:422,limited?{'Retry-After':'60'}:{});
    }
    const result=Response.json({response:data.response||[],results:data.results||0,paging:data.paging||null,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'public,max-age='+ttl,'X-Content-Type-Options':'nosniff'}});
    await cache.put(cacheKey,result.clone());
    return result;
  } catch {
    return json({error:'Football data temporarily unavailable'},502);
  }
}
