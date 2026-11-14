// Shared manual API-Football transport. No keys, polling, automatic retries or
// country/competition fan-out. Per-tab protection is NOT a global quota limit.
(() => {
 function create({fetchImpl=(...args)=>fetch(...args),now=()=>Date.now(),online=()=>navigator.onLine,timeout=12000}={}){
  const cache=new Map(),pending=new Map(),listeners=new Set();let blockedUntil=0,epoch=0;
  const fail=(code,retryAfter=0)=>Object.assign(new Error(code),{code,retryAfter});
  function block(seconds){blockedUntil=now()+Math.max(60,Math.min(86400,seconds||60))*1000;listeners.forEach(fn=>fn(blockedUntil))}
  async function fixtures(day){
   if(!PlusMatchData.validDate(day))throw fail('date');
   if(!online())throw fail('offline');
   const hit=cache.get(day);if(hit&&now()-hit.at<120000)return hit;
   if(pending.has(day))return pending.get(day);
   if(now()<blockedUntil)throw fail('rate',Math.ceil((blockedUntil-now())/1000));
   block(60);const startedEpoch=epoch;
   const work=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
     const res=await fetchImpl('/api/football?endpoint=fixtures&date='+encodeURIComponent(day),{signal:controller.signal,cache:'no-store'});
     if(res.status===429){const value=res.headers.get('Retry-After');const seconds=/^\d+$/.test(value||'')?Number(value):Math.ceil((Date.parse(value)-now())/1000);block(Number.isFinite(seconds)?seconds:60);throw fail('rate',Math.ceil((blockedUntil-now())/1000))}
     if(!res.ok)throw fail(res.status===422?'coverage':'unavailable');
     const data=await res.json();
     if(!Array.isArray(data?.response)||data.errors&&(Array.isArray(data.errors)?data.errors.length:Object.keys(data.errors).length))throw fail('invalid');
     if(!online()||startedEpoch!==epoch)throw fail('offline');
     const result={data,at:now()};cache.delete(day);cache.set(day,result);while(cache.size>5)cache.delete(cache.keys().next().value);return result;
    }catch(e){if(typeof e.code==='string')throw e;throw fail(e.name==='AbortError'?'timeout':e.name==='SyntaxError'?'invalid':'unavailable')}
    finally{clearTimeout(timer)}
   })();
   pending.set(day,work);try{return await work}finally{if(pending.get(day)===work)pending.delete(day)}
  }
  function invalidate(){epoch++;cache.clear();pending.clear()}
  return Object.freeze({fixtures,invalidate,get blockedUntil(){return blockedUntil},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}});
 }
 globalThis.PlusFootballClient=Object.freeze({create});
})();
