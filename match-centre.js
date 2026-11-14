// Presentation/controller only. All network access reuses app.js transports.
(() => {
 const D=globalThis.PlusMatchData;
 const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e};
 function create({sportsGet,sportsCache,sportsTTL}){
  const box=document.getElementById('scoreContent'),date=document.getElementById('matchDate'),source=document.getElementById('matchSource');
  const summary=document.getElementById('matchSummary'),refresh=document.getElementById('matchRefresh');
  let leagueId='4328',selected=D.dayMY(),token=0,records=[],receivedAt=0,partial=false,isLoading=false,apiAvailable=false,expiry,cooldown=0;
  const apiDays=new Map();date.value=selected;
  const fmt=stamp=>new Intl.DateTimeFormat('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(stamp))+' MYT';
  function official(){const a=el('a','SEMAK SUMBER RASMI ↗','mc-official');a.href=D.leagues[leagueId].url;a.target='_blank';a.rel='noopener noreferrer';return a}
  function state(title,description,retry=false){isLoading=false;box.replaceChildren();box.setAttribute('aria-busy','false');const panel=el('div',undefined,'mc-state');panel.append(el('strong',title),el('p',description));if(retry){const b=el('button',source.value==='api'?'SEMAK TARIKH API ↗':'CUBA LAGI ↗','pill');b.type='button';b.addEventListener('click',()=>{if(source.value==='api'){document.querySelector('.free-api-panel').open=true;document.getElementById('apiMatchDate').value=selected;document.getElementById('apiMatchCheck').focus()}else loadLeague(leagueId)});panel.append(b)}panel.append(official());box.append(panel)}
  function invalidate(message='Data perlawanan telah luput. Semak semula untuk maklumat baharu.'){
   token++;records=[];clearTimeout(expiry);state('Semakan baharu diperlukan',message,true);summary.textContent='Status semasa tidak tersedia.';
  }
  function loading(){isLoading=true;box.setAttribute('aria-busy','true');const status=el('div',undefined,'loading-state');status.setAttribute('role','status');status.append(el('p','Sedang menyemak sampel pembekal…'));for(let i=0;i<3;i++){const s=el('div',undefined,'skeleton');s.setAttribute('aria-hidden','true');status.append(s)}box.replaceChildren(status);summary.textContent='Memuatkan data…'}
  function badge(url,name){
   const fallback=()=>{const icon=el('span',name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(),'mc-badge-fallback');icon.setAttribute('aria-hidden','true');return icon};
   if(!url)return fallback();const img=el('img');img.src=url;img.alt='Logo '+name;img.width=32;img.height=32;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.replaceWith(fallback());return img;
  }
  function card(m,index){
   const group=D.groupFor(m);const article=el('article',undefined,'mc-card');article.dataset.matchId=m.id;
   const top=el('div',undefined,'mc-card-top');top.append(el('span',m.kickoff===null?'Tarikh sumber · masa belum tersedia':D.timeMY(m.kickoff),'mc-kickoff'));
   let status=m.status||'Status belum tersedia';if(m.group==='live'&&group!=='live')status='Status LIVE lama / belum disahkan';if(m.group==='upcoming'&&group==='other')status='Jadual lama / status belum disahkan';
   const statusNode=el('span',status,'mc-status '+group);if(group==='live')statusNode.setAttribute('aria-label','Status LIVE daripada pembekal; data mungkin lewat');top.append(statusNode);article.append(top);
   const teams=el('div',undefined,'mc-teams');
   for(const [name,url,score] of [[m.home,m.homeLogo,m.homeScore],[m.away,m.awayLogo,m.awayScore]]){
    const row=el('div',undefined,'mc-team');row.append(badge(url,name),el('strong',name));
    const played=m.group!=='upcoming';row.append(el('b',played?(score===null?'—':score):'—','mc-team-score'));teams.append(row);
   }
   article.append(teams);if(m.kickoff===null)article.append(el('p','MYT tidak dapat dipastikan tanpa masa sumber.','mc-date-note'));
   if(m.details.length||m.stats.length||m.timeline.length){
    const details=el('details',undefined,'mc-details');const trigger=el('summary','BUTIRAN PERLAWANAN');trigger.setAttribute('aria-label','Butiran '+m.home+' lawan '+m.away);details.append(trigger);
    const list=el('dl');for(const [label,value] of m.details)list.append(el('dt',label),el('dd',value));if(m.details.length)details.append(list);
    if(m.stats.length){details.append(el('h4','Statistik tersedia'));const stats=el('div',undefined,'mc-stats');for(const stat of m.stats){const line=el('div');line.append(el('b',stat.home+stat.suffix),el('span',stat.label),el('b',stat.away+stat.suffix));stats.append(line)}details.append(stats)}
    if(m.timeline.length){details.append(el('h4','Timeline sumber'));const timeline=el('ol',undefined,'mc-timeline');for(const event of m.timeline)timeline.append(el('li',(event.minute===null?'Minit tiada':event.minute+(event.added?'+'+event.added:'')+"'")+' · '+event.type+' · '+event.team+' · '+event.description));details.append(timeline)}
    details.append(el('p','Hanya medan yang dipulangkan pembekal dipaparkan. Tiada permintaan tambahan untuk butiran.','mc-date-note'));article.append(details);
   }
   return article;
  }
  function render(){
   box.setAttribute('aria-busy','false');clearTimeout(expiry);
   if(!navigator.onLine){invalidate('Di luar talian. Skor dan jadual API tidak disimpan untuk paparan offline.');return}
   const league=D.leagues[leagueId];source.setAttribute('aria-label','Sumber data Match Centre');
   if(source.value==='api'&&!apiAvailable){
    summary.textContent='API-Football · semakan manual sahaja';state('Belum disemak','Pilih tarikh dan tekan SEMAK TARIKH dalam panel API-Football di bawah. Tiada permintaan automatik dibuat.');return;
   }
   if(source.value==='sports'&&!league.sportsId){summary.textContent='Liga Super · liputan TheSportsDB belum disahkan';state('Liputan belum disahkan','Pemetaan Liga Super TheSportsDB belum disahkan. Gunakan sumber rasmi atau semakan API-Football manual.');return}
   const age=Date.now()-receivedAt;if(receivedAt&&age>=sportsTTL){invalidate();return}
   const rows=records.filter(m=>m.date===selected),groups={live:[],upcoming:[],finished:[],other:[]};rows.forEach(m=>groups[D.groupFor(m)].push(m));
   summary.textContent=rows.length+' rekod dalam sampel · '+league.short+' · '+selected+' (MYT; rekod tanpa masa mengikut tarikh sumber)';
   box.replaceChildren();
   const provenance=el('div',undefined,'mc-provenance');provenance.append(el('strong',source.value==='api'?'API-FOOTBALL':'THESPORTSDB'));
   if(receivedAt)provenance.append(el('span','Diambil '+fmt(receivedAt)));
   const apiUpdated=source.value==='api'?Date.parse([...apiDays.values()].at(-1)?.updatedAt||''):NaN;
   const providerAt=records.find(m=>m.providerUpdatedAt!==null)?.providerUpdatedAt??(Number.isFinite(apiUpdated)?apiUpdated:null);
   provenance.append(el('span',providerAt?'Gerbang dikemas kini '+fmt(providerAt):'Masa kemas kini pembekal tidak diberikan.'));
   provenance.append(el('p',(partial?'Sebahagian permintaan gagal. ':'')+'Sampel terhad; bukan senarai penuh atau feed masa nyata. LIVE hanya mengikut status pembekal yang masih segar.'));box.append(provenance);
   if(!rows.length){const empty=el('div',undefined,'mc-state');empty.append(el('strong','Tiada rekod dalam sampel untuk tarikh ini'),el('p','Ini tidak bermakna tiada perlawanan berlangsung. Pilih tarikh lain atau semak sumber rasmi.'));
    const dates=[...new Set(records.map(m=>m.date))].sort().slice(0,8);
    if(dates.length){const samples=el('div',undefined,'mc-sample-days');samples.append(el('p','Tarikh yang tersedia dalam sampel:'));for(const day of dates){const b=el('button',day);b.type='button';b.addEventListener('click',()=>selectDate(day));samples.append(b)}empty.append(samples)}
    empty.append(official());box.append(empty)}
   for(const [key,label] of [['live','LIVE'],['upcoming','AKAN DATANG'],['finished','TAMAT'],['other','STATUS LAIN / BELUM DISAHKAN']]){
    if(!groups[key].length)continue;const section=el('section',undefined,'mc-group');section.dataset.group=key;const heading=el('h3',label);heading.append(el('span',groups[key].length));section.append(heading);const grid=el('div',undefined,'mc-grid');groups[key].forEach((m,i)=>grid.append(card(m,i)));section.append(grid);box.append(section);
   }
   if(receivedAt)expiry=setTimeout(()=>invalidate(),Math.max(1,sportsTTL-age));
  }
  async function loadLeague(id){
   if(!D.leagues[id])return;leagueId=id;
   document.querySelectorAll('[data-score]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.score===id)));
   const request=++token;isLoading=false;records=[];clearTimeout(expiry);partial=false;
   if(source.value==='api'){
    document.getElementById('apiMatchDate').value=selected;
    const entries=[...apiDays.values()].filter(entry=>Date.now()-entry.at<sportsTTL).reverse();
    apiAvailable=entries.length>0;receivedAt=apiAvailable?Math.min(...entries.map(entry=>entry.at)):0;
    records=D.unique(entries.flatMap(entry=>entry.raw.map(raw=>D.normalize(raw,'api',D.leagues[id],entry.at,entry.updatedAt))));
    render();return;
   }
   if(!D.leagues[id].sportsId){receivedAt=0;render();return}
   if(!navigator.onLine){invalidate('Di luar talian. Data perlawanan memerlukan internet.');return}
   loading();const paths=['eventsnextleague.php?id='+id,'eventspastleague.php?id='+id];
   const results=await Promise.allSettled(paths.map(sportsGet));
   if(request!==token||!navigator.onLine)return;
   isLoading=false;
   const available=results.filter(result=>result.status==='fulfilled'&&(result.value.events===null||Array.isArray(result.value.events)));
   if(!available.length){summary.textContent='Data belum tersedia.';state('Sambungan tergendala','Pembekal tidak dapat dicapai atau respons tidak sah. Tiada data rekaan dipaparkan.',true);return}
   partial=available.length<2;receivedAt=Math.min(...paths.filter((path,i)=>results[i].status==='fulfilled'&&(results[i].value.events===null||Array.isArray(results[i].value.events))).map(path=>sportsCache.get(path)?.at).filter(Number.isFinite));if(!Number.isFinite(receivedAt))receivedAt=Date.now();
   records=D.unique(available.flatMap(result=>(result.value.events||[]).map(raw=>D.normalize(raw,'sports',D.leagues[id],receivedAt))));render();
  }
  function selectDate(value){if(!D.validDate(value)){date.setCustomValidity('Pilih tarikh kalendar yang sah.');date.reportValidity();return}date.setCustomValidity('');selected=value;date.value=value;if(source.value==='api')loadLeague(leagueId);else if(!isLoading)render();else summary.textContent='Memuatkan sampel untuk '+selected+'…'}
  date.addEventListener('change',()=>selectDate(date.value));
  for(const [id,delta] of [['matchPrev',-1],['matchNext',1]])document.getElementById(id).addEventListener('click',()=>selectDate(D.shiftDay(selected,delta)));
  document.getElementById('matchToday').addEventListener('click',()=>selectDate(D.dayMY()));
  source.addEventListener('change',()=>loadLeague(leagueId));
  refresh.addEventListener('click',()=>{
   if(source.value==='api'){document.querySelector('.free-api-panel').open=true;document.getElementById('apiMatchDate').value=selected;document.getElementById('apiMatchCheck').focus();return}
   if(Date.now()<cooldown)return;cooldown=Date.now()+15000;refresh.disabled=true;setTimeout(()=>{refresh.disabled=false},15000);loadLeague(leagueId);
  });
  function acceptAPI(data,day,at=Date.now()){
   if(!D.validDate(day)||!Array.isArray(data?.response))return false;
   apiDays.set(day,{raw:data.response,at,updatedAt:data.updatedAt});while(apiDays.size>5)apiDays.delete(apiDays.keys().next().value);
   source.value='api';selected=day;date.value=day;loadLeague(leagueId);return true;
  }
  window.addEventListener('offline',()=>{apiDays.clear();invalidate('Di luar talian. Tiada skor tersimpan dipaparkan.')});
  window.addEventListener('pageshow',()=>{if(receivedAt&&Date.now()-receivedAt>=sportsTTL)invalidate()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&receivedAt&&Date.now()-receivedAt>=sportsTTL)invalidate()});
  return Object.freeze({loadLeague,acceptAPI,invalidate,selectDate,suspend(){token++;clearTimeout(expiry)}});
 }
 globalThis.PlusMatchCentre=Object.freeze({create});
})();
