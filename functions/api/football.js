// Cloudflare Pages Function: server-side API-Football gateway.
// Never expose API_FOOTBALL_KEY to client code.
const allowed = {
  fixtures: ['league','season','date','from','to','next','last','status','team','id','live','timezone'],
  standings: ['league','season','team'],
  'fixtures/statistics': ['fixture','team','type'],
  'fixtures/events': ['fixture','team','player','type'],
  'players/topscorers': ['league','season'],
  'players/topassists': ['league','season'],
};
export async function onRequestGet({request,env}) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');
  if (!Object.prototype.hasOwnProperty.call(allowed,endpoint)) {
    return Response.json({error:'Unsupported endpoint'}, {status:400});
  }
  if (!env.API_FOOTBALL_KEY) return Response.json({error:'API secret not configured'}, {status:503});
  const params = new URLSearchParams();
  for (const [key,value] of url.searchParams) {
    if (key === 'endpoint') continue;
    if (!allowed[endpoint].includes(key) || value.length > 80 || !/^[\w\s,:/+-]+$/.test(value))
      return Response.json({error:'Invalid parameter'}, {status:400});
    params.append(key,value);
  }
  if (!params.size) return Response.json({error:'Missing query parameters'}, {status:400});
  const target = 'https://v3.football.api-sports.io/'+endpoint+'?'+params.toString();
  const cacheKey = new Request(url.toString(),{method:'GET'});
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;
  try {
    const upstream = await fetch(target,{headers:{'x-apisports-key':env.API_FOOTBALL_KEY,'accept':'application/json'},signal:AbortSignal.timeout(9000)});
    if (!upstream.ok) return Response.json({error:'Football provider unavailable',status:upstream.status},{status:502});
    const data = await upstream.json();
    if (data.errors && (Array.isArray(data.errors)?data.errors.length:Object.keys(data.errors).length)) {
      return Response.json({error:'Provider restriction or unsupported coverage',details:data.errors},{status:422});
    }
    const result = Response.json({response:data.response||[],results:data.results||0,paging:data.paging||null,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff'}});
    await caches.default.put(cacheKey,result.clone());
    return result;
  } catch {
    return Response.json({error:'Football data temporarily unavailable'},{status:502});
  }
}
