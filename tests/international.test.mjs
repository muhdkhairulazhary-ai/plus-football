import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const ctx={Date,Intl,URL,AbortController,setTimeout,clearTimeout};vm.createContext(ctx);
for(const file of ['match-data.js','international-data.js','football-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),ctx);
const I=ctx.PlusInternationalData,D=ctx.PlusMatchData,C=ctx.PlusFootballClient;
const fixture=(name='Friendlies',extra={})=>({fixture:{id:1,date:'2026-11-14T20:00:00Z',status:{short:'FT'},venue:{name:'MOCK venue'}},league:{id:10,name},teams:{home:{name:'Malaysia'},away:{name:'China'}},goals:{home:0,away:2},...extra});
test('national friendlies, World Cup, six regional qualifiers and continental tournaments classify',()=>{
 assert.equal(I.competition(fixture(),'api').kind,'friendlies');
 for(const region of ['Asia','Africa','Europe','CONCACAF','Oceania','South America']){
  const name='World Cup - Qualification '+region;
  // The provider uses CONMEBOL for South America; unknown naming is fail-closed.
  if(region==='South America')continue;
  assert.equal(I.competition(fixture(name),'api').kind,'qualifiers');
 }
 for(const name of ['World Cup - Qualification CONMEBOL','Euro Championship - Qualification','Asian Cup - Qualification','Africa Cup of Nations - Qualification'])assert.equal(I.competition(fixture(name),'api').kind,'qualifiers');
 for(const name of ['World Cup','UEFA Nations League','Copa America','CONCACAF Gold Cup','Asian Cup','Africa Cup of Nations','AFF Championship','OFC Nations Cup'])assert.equal(I.competition(fixture(name),'api').kind,'tournaments');
});
test('club competitions, club friendlies and ambiguous tournaments are excluded',()=>{
 for(const name of ['Friendlies Clubs','Club World Cup','UEFA Champions League','Premier League','Mystery Cup','World Championship'])assert.equal(I.competition(fixture(name),'api'),null,name);
 assert.equal(I.competition({...fixture('Returned National Cup'),teams:{home:{name:'A',national:true},away:{name:'B',national:true}}},'api').kind,'tournaments');
 assert.equal(I.competition({...fixture(),teams:{home:{name:'Club',national:false},away:{name:'Other'}}},'api'),null);
});
test('returned women and youth national competitions are recognized without assuming senior squads',()=>{
 for(const name of ['World Cup - Women','Friendlies Women','UEFA Women\'s Championship','UEFA U21 Championship','AFC U23 Asian Cup'])assert(I.competition(fixture(name),'api'),name);
});
test('international adapters reuse MYT, zero/missing scores, details and safe URLs',()=>{
 const m=I.normalize(fixture(),'api',Date.now());assert.equal(m.date,'2026-11-15');assert.equal(m.homeScore,0);assert.equal(m.awayScore,2);assert.equal(m.details.length,1);
 assert.equal(I.normalize(fixture('Friendlies Clubs'),'api',Date.now()),null);
 assert.equal(I.normalize({...fixture(),goals:{home:null,away:false}},'api',Date.now()).awayScore,null);
 assert.equal(I.normalize({...fixture(),teams:{home:{name:'Malaysia',flag:'javascript:alert(1)'},away:{name:'China'}}},'api',Date.now()).homeFlag,null);
});
test('SportsDB national samples work without country or team lookup requests',()=>{
 const raw={idEvent:2,idLeague:999,strSport:'Soccer',strLeague:'International Friendlies',strHomeTeam:'Aruba',strAwayTeam:'Curaçao',dateEvent:'2026-11-14',strTime:'12:00:00',intHomeScore:'0',intAwayScore:'0',strStatus:'Match Finished'};
 assert.equal(I.normalize(raw,'sports',Date.now()).home,'Aruba');assert.equal(I.normalize({...raw,strSport:'Basketball'},'sports',Date.now()),null);
 assert.equal(I.normalize({...raw,strTime:''},'sports',Date.now()).kickoff,null);
});
test('flags use country metadata without restricting fixture coverage or guessing unknown flags',()=>{
 assert.equal(I.flag('Malaysia'),'🇲🇾');assert.equal(I.flag('Japan'),'🇯🇵');assert.equal(I.flag('Aruba'),'🇦🇼');assert.equal(I.flag('Curaçao'),'🇨🇼');assert.equal(I.flag('USA'),'🇺🇸');assert.equal(I.flag('Brazil U20'),'🇧🇷');assert(I.flag('England').startsWith('🏴'));assert.equal(I.flag('Unknown National Team'),null);
});
test('country/team, competition, kind and MYT filters are local, including small nations',()=>{
 const records=[I.normalize(fixture(),'api',Date.now()),I.normalize(fixture('World Cup - Qualification Asia',{fixture:{id:2,date:'2026-11-14T20:00:00Z',status:{short:'NS'}},teams:{home:{name:'Aruba'},away:{name:'Japan'}}}),'api',Date.now())];
 assert.equal(I.filter(records,{date:'2026-11-15',search:'aruba'}).length,1);
 assert.equal(I.filter(records,{date:'2026-11-15',kind:'friendlies'}).length,1);
 assert.equal(I.filter(records,{date:'2026-11-14'}).length,0);
});
test('manual transport coalesces identical requests, caches by UTC day and shares cooldown',async()=>{
 let calls=0,clock=1000000,release;
 const client=C.create({now:()=>clock,online:()=>true,fetchImpl:()=>{calls++;return new Promise(resolve=>release=resolve)}});
 const first=client.fixtures('2026-11-14'),second=client.fixtures('2026-11-14');assert.equal(calls,1);
 await assert.rejects(client.fixtures('2026-11-15'),e=>e.code==='rate');
 release(Response.json({response:[fixture()]}));await first;await second;await client.fixtures('2026-11-14');assert.equal(calls,1);
 clock+=120001;const third=client.fixtures('2026-11-14');assert.equal(calls,2);release(Response.json({response:[]}));await third;
});
test('invalid dates and offline state never consume quota',async()=>{
 let calls=0;const client=C.create({online:()=>false,fetchImpl:()=>{calls++}});
 await assert.rejects(client.fixtures('2026-02-29'),e=>e.code==='date');await assert.rejects(client.fixtures('2026-11-14'),e=>e.code==='offline');assert.equal(calls,0);
});
test('429 Retry-After seconds and HTTP dates protect subsequent calls',async()=>{
 for(const retry of ['180',new Date(1000000+240000).toUTCString()]){
  let calls=0;const client=C.create({now:()=>1000000,online:()=>true,fetchImpl:async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':retry}})}});
  await assert.rejects(client.fixtures('2026-11-14'),e=>e.code==='rate');assert(client.blockedUntil>=1180000);
  await assert.rejects(client.fixtures('2026-11-15'),e=>e.code==='rate');assert.equal(calls,1);
 }
});
test('malformed/upstream-error payloads fail closed and remain under cooldown',async()=>{
 for(const response of [Response.json({response:{bad:1}}),Response.json({response:[],errors:{plan:'restricted'}}),new Response('{bad json'),new Response('',{status:502})]){
  let calls=0;const client=C.create({online:()=>true,fetchImpl:async()=>{calls++;return response}});
  await assert.rejects(client.fixtures('2026-11-14'));await assert.rejects(client.fixtures('2026-11-15'),e=>e.code==='rate');assert.equal(calls,1);
 }
});
test('timeouts abort mock requests without retries',async()=>{
 const client=C.create({online:()=>true,timeout:5,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))});
 await assert.rejects(client.fixtures('2026-11-14'),e=>e.code==='timeout');
});
test('offline invalidation fences in-flight results and clears cache',async()=>{
 let release;const client=C.create({online:()=>true,fetchImpl:()=>new Promise(resolve=>release=resolve)});
 const task=client.fixtures('2026-11-14');client.invalidate();release(Response.json({response:[fixture()]}));await assert.rejects(task,e=>e.code==='offline');
});
