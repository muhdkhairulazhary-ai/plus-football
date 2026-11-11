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
  const endpoint = url.searchParams.get('endpoint');
  if (!Object.hasOwn(allowed,endpoint)) return json({error:'Unsupported endpoint'},400);
  const params = new URLSearchParams();
  for (const [key,value] of url.searchParams) {
    if (key==='endpoint') continue;
    if (!allowed[endpoint].includes(key) || value.length>80 || !/^[\w\s,:/+-]+$/.test(value))
      return json({error:'Invalid parameter'},400);
    params.append(key,value);
  }
  if (!params.size) return json({error:'Missing query parameters'},400);
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
