// Pure provider adapters. No network, DOM, guessed scores or inferred finals.
(() => {
 const TZ='Asia/Kuala_Lumpur';
 const leagues=Object.freeze({
  '4328':{key:'epl',name:'Premier League',short:'EPL',apiId:39,sportsId:'4328',url:'https://www.premierleague.com/en/fixtures'},
  '4480':{key:'ucl',name:'UEFA Champions League',short:'UCL',apiId:2,sportsId:'4480',url:'https://www.uefa.com/uefachampionsleague/fixtures-results/'},
  // The previous site used 4792, but its TheSportsDB coverage was not verified.
  // Preserve the filter identity without fetching an unverified league mapping.
  '4792':{key:'msl',name:'Liga Super Malaysia',short:'LIGA SUPER',apiId:278,sportsId:null,url:'https://www.malaysianfootballleague.com/'}
 });
 function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
 function dayMY(value=Date.now()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
 }
 function shiftDay(day,delta){return validDate(day)?new Date(Date.parse(day+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10):null}
 function kickoff(raw,date,time){
  let text=typeof raw==='string'?raw.trim():'';
  if(!text&&validDate(date)&&typeof time==='string'&&/^\d{2}:\d{2}(?::\d{2})?$/.test(time))text=date+'T'+time;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(text)||!validDate(text.slice(0,10)))return null;
  if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text))text+='Z'; // Provider fields explicitly treated as UTC.
  const clock=text.slice(11,19).split(':');if(Number(clock[0])>23||Number(clock[1])>59||(clock[2]&&Number(clock[2])>59))return null;
  const stamp=Date.parse(text);return Number.isFinite(stamp)?stamp:null;
 }
 function score(value){if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+$/.test(value.trim())))return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null}
 function logo(url){if(typeof url!=='string'||url.length>1000)return null;try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
 const text=value=>typeof value==='string'?value.trim().slice(0,300):'';
 function category(status){
  const s=text(status).toUpperCase();
  if(['1H','HT','2H','ET','BT','P','LIVE','IN PROGRESS','HALF TIME','HALFTIME'].includes(s))return 'live';
  if(['FT','AET','PEN','MATCH FINISHED','FINISHED','FULL TIME','AFTER EXTRA TIME','AFTER PENALTIES'].includes(s))return 'finished';
  if(['NS','TBD','NOT STARTED','SCHEDULED','FIXTURE'].includes(s))return 'upcoming';
  return 'other';
 }
 function detailFields(raw,source){
  if(source==='api')return [['Venue',raw.fixture?.venue?.name],['Bandar',raw.fixture?.venue?.city],['Pusingan',raw.league?.round],['Pengadil',raw.fixture?.referee]];
  return [['Venue',raw.strVenue],['Pusingan',raw.intRound],['Pengadil',raw.strReferee],['Penjaring tuan rumah',raw.strHomeGoalDetails],['Penjaring pelawat',raw.strAwayGoalDetails]];
 }
 function normalize(raw,source,league,fetchedAt,providerUpdatedAt=null){
  if(!raw||typeof raw!=='object')return null;
  const api=source==='api';
  if(api&&Number(raw.league?.id)!==league.apiId)return null;
  if(!api&&raw.idLeague!=null&&String(raw.idLeague)!==league.sportsId)return null;
  const home=text(api?raw.teams?.home?.name:raw.strHomeTeam),away=text(api?raw.teams?.away?.name:raw.strAwayTeam);
  if(!home||!away)return null;
  const at=api?kickoff(raw.fixture?.date):kickoff(raw.strTimestamp,raw.dateEvent,raw.strTime);
  const date=at!==null?dayMY(at):(!api&&validDate(raw.dateEvent)?raw.dateEvent:null);
  if(!date)return null;
  const status=text(api?raw.fixture?.status?.short:raw.strStatus);
  const id=api?raw.fixture?.id:raw.idEvent;
  const details=detailFields(raw,source).filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()).map(([label,value])=>[label,String(value).slice(0,500)]);
  const stats=[];
  if(!api)for(const [label,h,a,suffix] of [['Penguasaan bola','intHomePossession','intAwayPossession','%'],['Percubaan','intHomeShots','intAwayShots',''],['Tepat sasaran','intHomeShotsOnGoal','intAwayShotsOnGoal',''],['Sepakan penjuru','intHomeCorners','intAwayCorners',''],['Kad kuning','intHomeYellowCards','intAwayYellowCards','']]){
   const hv=score(raw[h]),av=score(raw[a]);if(hv!==null&&av!==null&&(!suffix||(hv<=100&&av<=100)))stats.push({label,home:hv,away:av,suffix});
  }
  const timeline=[];
  if(!api)for(const [field,team,type] of [['strHomeGoalDetails',home,'Gol'],['strAwayGoalDetails',away,'Gol'],['strHomeYellowCards',home,'Kad kuning'],['strAwayYellowCards',away,'Kad kuning'],['strHomeRedCards',home,'Kad merah'],['strAwayRedCards',away,'Kad merah']]){
   const value=raw[field];if(typeof value!=='string')continue;
   for(const part of value.split(';').map(v=>v.trim()).filter(Boolean).slice(0,15)){
    const m=part.match(/(?:^|\s)(\d{1,3})(?:\+(\d{1,2}))?(?:['’]|\s*min)/i);
    timeline.push({team,type,description:part.slice(0,180),minute:m?Number(m[1]):null,added:m&&m[2]?Number(m[2]):0});
   }
  }
  timeline.sort((a,b)=>(a.minute??999)-(b.minute??999)||a.added-b.added);
  const updated=typeof providerUpdatedAt==='string'?Date.parse(providerUpdatedAt):NaN;
  return {id:String(id??[home,away,at??date].join('|')),source,league:league.name,home,away,date,kickoff:at,status,group:category(status),
   homeScore:score(api?raw.goals?.home:raw.intHomeScore),awayScore:score(api?raw.goals?.away:raw.intAwayScore),
   homeLogo:logo(api?raw.teams?.home?.logo:raw.strHomeTeamBadge),awayLogo:logo(api?raw.teams?.away?.logo:raw.strAwayTeamBadge),
   fetchedAt,providerUpdatedAt:Number.isFinite(updated)?updated:null,details,stats,timeline};
 }
 function groupFor(match,now=Date.now()){
  if(match.group==='upcoming'&&match.date<dayMY(now))return 'other';
  if(match.group!=='live')return match.group;
  const age=now-(match.providerUpdatedAt??match.fetchedAt);
  if(match.date!==dayMY(now)||match.kickoff===null||match.kickoff>now+300000||now-match.kickoff>21600000||age>120000||age< -300000)return 'other';
  return 'live';
 }
 function unique(records){const seen=new Set();return records.filter(m=>{if(!m)return false;const k=m.source+'|'+m.id;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>(a.kickoff??Infinity)-(b.kickoff??Infinity))}
 function timeMY(stamp){return stamp===null?'Masa belum tersedia':new Intl.DateTimeFormat('ms-MY',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(stamp))+' MYT'}
 globalThis.PlusMatchData=Object.freeze({leagues,validDate,dayMY,shiftDay,kickoff,score,logo,category,normalize,groupFor,unique,timeMY});
})();
