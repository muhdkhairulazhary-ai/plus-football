import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const ctx={URL,Date,Intl};vm.createContext(ctx);vm.runInContext(await readFile(new URL('../match-data.js',import.meta.url),'utf8'),ctx);
const D=ctx.PlusMatchData,league=D.leagues['4328'],now=Date.parse('2026-11-14T12:00:00Z');
const sports=(extra={})=>({idEvent:'1',idLeague:'4328',strHomeTeam:'Home',strAwayTeam:'Away',dateEvent:'2026-11-14',strTime:'11:00:00',strStatus:'Match Finished',intHomeScore:0,intAwayScore:'0',...extra});
const normalize=(extra={})=>D.normalize(sports(extra),'sports',league,now);
test('real dates and MYT rollover are independent of device timezone',()=>{
 assert(D.validDate('2024-02-29'));assert(!D.validDate('2026-02-29'));assert(!D.validDate('2026-11-31'));
 assert.equal(D.dayMY(Date.parse('2026-11-14T20:00:00Z')),'2026-11-15');
 assert.equal(D.shiftDay('2026-12-31',1),'2027-01-01');
 assert.equal(D.timeMY(Date.parse('2026-11-14T12:00:00Z')),'20:00 MYT');
});
test('kickoff parsing rejects impossible dates/times and does not invent midnight',()=>{
 assert.equal(D.kickoff('', '2026-11-14',''),null);
 assert.equal(D.kickoff('2026-02-29T12:00:00Z'),null);
 assert.equal(D.kickoff('2026-11-14T24:00:00Z'),null);
 assert.equal(D.kickoff('2026-11-14T11:00:00+08:00'),Date.parse('2026-11-14T03:00:00Z'));
 assert.equal(D.kickoff('','2026-11-14','12:00'),Date.parse('2026-11-14T12:00:00Z'));
});
test('only real non-negative integer scores are retained, including zero',()=>{
 for(const value of [0,'0',2,'3'])assert.equal(D.score(value),Number(value));
 for(const value of [null,undefined,'',' ',false,true,-1,'x',1.5,Infinity])assert.equal(D.score(value),null);
 assert.equal(normalize().homeScore,0);assert.equal(normalize({intAwayScore:null}).awayScore,null);
});
test('group status comes from provider, never inferred from scores',()=>{
 assert.equal(normalize().group,'finished');assert.equal(normalize({strStatus:''}).group,'other');
 for(const status of ['PST','CANC','ABD','SUSP','unknown'])assert.equal(D.category(status),'other');
 assert.equal(D.category('NS'),'upcoming');assert.equal(D.groupFor(normalize({strStatus:'NS',dateEvent:'2026-11-13'}),now),'other');assert.equal(D.category('HT'),'live');
});
test('historical, old provider timestamps and future LIVE statuses are not current LIVE',()=>{
 assert.equal(D.groupFor(normalize({strStatus:'1H'}),now),'live');
 assert.equal(D.groupFor(normalize({strStatus:'1H',dateEvent:'2026-11-13'}),now),'other');
 const match=normalize({strStatus:'1H'});match.providerUpdatedAt=now-3600000;assert.equal(D.groupFor(match,now),'other');
 assert.equal(D.groupFor(normalize({strStatus:'LIVE',strTime:'20:00:00'}),now),'other');
 assert.equal(D.groupFor(normalize({strStatus:'LIVE',strTime:''}),now),'other');
});
test('sports records deduplicate by real event id and reject league mismatch',()=>{
 assert.equal(D.unique([normalize(),normalize(),null]).length,1);
 assert.equal(normalize({idLeague:'4480'}),null);assert.equal(normalize({strHomeTeam:''}),null);
 assert.equal(normalize({dateEvent:'garbage'}),null);
});
test('API-Football uses returned league ids and date offsets without extra requests',()=>{
 const raw={fixture:{id:3,date:'2026-11-14T20:00:00Z',status:{short:'NS'},venue:{name:'Real venue'}},league:{id:39,name:'Premier League'},teams:{home:{name:'Home',logo:'https://example.test/home.png'},away:{name:'Away'}},goals:{home:null,away:null}};
 const m=D.normalize(raw,'api',league,now,'2026-11-14T11:00:00Z');assert.equal(m.date,'2026-11-15');assert.equal(m.group,'upcoming');assert.equal(m.homeScore,null);assert.equal(m.details.length,1);
 assert.equal(D.normalize(raw,'api',D.leagues['4480'],now),null);
});
test('details/stats/timeline are conditional, source text remains plain and added time retained',()=>{
 assert.equal(normalize().details.length,0);assert.equal(normalize().stats.length,0);
 const m=normalize({strVenue:'<script>alert(1)</script>',intHomePossession:'55',intAwayPossession:'45',strHomeGoalDetails:"90+2' Player; 12' Another"});
 assert.equal(m.details[0][1],'<script>alert(1)</script>');assert.equal(m.stats.length,1);
 assert.equal(m.timeline[0].minute,12);assert.equal(m.timeline[1].added,2);
});
test('logos require HTTPS and MSL sports mapping stays disabled until verified',()=>{
 assert.equal(D.logo('javascript:alert(1)'),null);assert.equal(D.logo('http://example.test/logo.png'),null);
 assert.equal(D.logo('https://user:password@example.test/logo.png'),null);
 assert.equal(D.leagues['4792'].sportsId,null);
});
