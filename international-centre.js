(() => {
 const D=PlusMatchData,I=PlusInternationalData;
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e};
 function create({footballClient,sportsGet,sportsCache}){
  const panel=document.getElementById('internationalPanel'),box=document.getElementById('internationalResults');
  const query=document.getElementById('internationalQueryDate'),day=document.getElementById('internationalDate'),source=document.getElementById('internationalSource');
  const search=document.getElementById('internationalSearch'),kind=document.getElementById('internationalKind'),comp=document.getElementById('internationalCompetition'),button=document.getElementById('internationalLoad');
  const refresh=document.getElementById('internationalRefresh'),notice=document.getElementById('internationalCooldown'),dataCooldown=document.getElementById('internationalDataCooldown'),provenance=document.getElementById('internationalProvenance');
  let records=[],at=0,updatedAt=null,token=0,expiry,timer,sportsUntil=0,loading=false,noticeWanted=false;
  query.value=day.value=D.dayMY();
  const fmt=value=>new Intl.DateTimeFormat('ms-MY',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'medium',hour12:false}).format(new Date(value))+' MYT';
  function waitSeconds(){return Math.max(0,Math.ceil(((source.value==='api'?footballClient.blockedUntil:sportsUntil)-Date.now())/1000))}
  function controls(){
   clearTimeout(timer);const wait=waitSeconds(),message=wait>60?'Cuba lagi dalam '+Math.ceil(wait/60)+' minit.':'Cuba lagi dalam '+wait+' saat.';
   button.disabled=!navigator.onLine||loading||wait>0;button.textContent='Muat tarikh sumber';
   refresh.disabled=!navigator.onLine||loading;refresh.dataset.waiting=String(wait>0);
   notice.hidden=!wait||!noticeWanted;notice.textContent=wait?message:'';
   dataCooldown.hidden=!wait;dataCooldown.textContent=wait?message:'';
   if(!wait)noticeWanted=false;
   document.querySelectorAll('[data-international-offset]').forEach(b=>b.setAttribute('aria-pressed',String(day.value===D.shiftDay(D.dayMY(),Number(b.dataset.internationalOffset)))));
   document.getElementById('internationalDateCaption').textContent=D.validDate(day.value)?new Intl.DateTimeFormat('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric'}).format(new Date(day.value+'T12:00:00Z'))+' · MYT':'Pilih tarikh';
   if(wait)timer=setTimeout(controls,(wait>60?(wait%60||60):wait)*1000);
  }
  footballClient.subscribe(controls);
  source.addEventListener('change',()=>{token++;loading=false;noticeWanted=false;hydrateCached();render();controls()});
  function state(title,text){box.setAttribute('aria-busy','false');box.replaceChildren(el('strong',title),el('p',text))}
  function invalidate(){token++;loading=false;clearTimeout(expiry);records=[];at=0;provenance.replaceChildren();state('Semakan baharu diperlukan',navigator.onLine?'Skor telah luput. Tekan Kemas kini untuk semakan baharu.':'Di luar talian. Skor memerlukan internet.');controls()}
  function hydrateCached(){
   const provider=source.value;
   const samples=provider==='api'?footballClient.cachedFixtures():[...sportsCache].filter(([path,entry])=>path.startsWith('eventsday.php?')&&Date.now()-entry.at<120000&&(entry.data.events===null||Array.isArray(entry.data.events))).map(([path,entry])=>({day:new URLSearchParams(path.split('?')[1]).get('d'),...entry}));
   const fresh=samples.filter(entry=>Date.now()-entry.at<120000);
   at=fresh.length?Math.min(...fresh.map(entry=>entry.at)):0;
   const stamps=fresh.map(entry=>Date.parse(entry.data.updatedAt)).filter(Number.isFinite);updatedAt=stamps.length?new Date(Math.min(...stamps)).toISOString():null;
   records=D.unique(fresh.flatMap(entry=>(provider==='api'?entry.data.response:entry.data.events||[]).map(raw=>I.normalize(raw,provider,entry.at,entry.data.updatedAt))));populate();
   provenance.replaceChildren();if(at)provenance.append(el('strong',provider==='api'?'API-FOOTBALL':'THESPORTSDB'),el('span','Diambil '+fmt(at)),el('p',updatedAt?'Gerbang dikemas kini '+fmt(Date.parse(updatedAt)):'Masa kemas kini pembekal tidak diberikan.'));
   const rawCount=fresh.reduce((total,entry)=>total+(provider==='api'?entry.data.response:entry.data.events||[]).length,0);
   document.getElementById('internationalCoverage').textContent=at?records.length+' rekod kebangsaan dikenal pasti daripada '+rawCount+' rekod dalam cache tarikh UTC '+fresh.map(entry=>entry.day).join(', ')+'. Pertandingan tidak dikenali/kelab ditapis. Satu hari MYT boleh merentasi dua tarikh UTC.':'Carian dan penapis hanya menapis data tersedia. Satu hari MYT boleh merentasi dua tarikh sumber UTC; tiada pertanyaan tambahan dibuat secara automatik.';
  }
  function icon(name,flagURL,logoURL){
   const fallback=()=>{const span=el('span',I.flag(name)||'◌','international-flag');span.setAttribute('aria-hidden','true');return span};
   const url=flagURL||logoURL;if(!url)return fallback();const img=el('img');img.src=url;img.width=32;img.height=32;img.alt=(flagURL?'Bendera ':'Lencana / bendera ')+name;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.replaceWith(fallback());return img;
  }
  function card(m){
   const group=D.groupFor(m),article=el('article',undefined,'mc-card');article.dataset.matchId=m.id;
   const top=el('div',undefined,'mc-card-top');const status=m.group==='live'&&group!=='live'?'LIVE belum disahkan':m.group==='upcoming'&&group==='other'?'Jadual lama / belum disahkan':m.status||'Status tiada';top.append(el('span',m.kickoff===null?'Masa sumber tiada':D.timeMY(m.kickoff),'mc-kickoff'),el('span',status,'mc-status '+group));article.append(top,el('p',m.competition.name,'international-competition'));
   const teams=el('div',undefined,'mc-teams');for(const [name,flag,logo,score] of [[m.home,m.homeFlag,m.homeLogo,m.homeScore],[m.away,m.awayFlag,m.awayLogo,m.awayScore]]){
    const row=el('div',undefined,'mc-team');row.append(icon(name,flag,logo),el('strong',name),el('b',m.group==='upcoming'||score===null?'—':score,'mc-team-score'));teams.append(row);
   }article.append(teams);if(m.kickoff===null)article.append(el('p','Tarikh sumber sahaja; MYT tidak dapat dipastikan tanpa masa.','mc-date-note'));
   if(m.details.length){const details=el('details',undefined,'mc-details');details.append(el('summary','BUTIRAN PERLAWANAN'));const dl=el('dl');for(const [label,value] of m.details)dl.append(el('dt',label),el('dd',value));details.append(dl);article.append(details)}
   return article;
  }
  function render(){
   if(loading)return;
   clearTimeout(expiry);if(!navigator.onLine){invalidate();return}
   if(!at){state('Perlawanan belum dimuatkan','Tekan Kemas kini untuk melihat perlawanan yang tersedia.');return}
   if(Date.now()-at>=120000){invalidate();return}
   box.setAttribute('aria-busy','false');box.replaceChildren();
   const rows=I.filter(records,{date:day.value,search:search.value,kind:kind.value,competition:comp.value});
   if(!rows.length)box.append(el('strong','Tiada perlawanan dalam data tersedia'),el('p','Ini tidak mengesahkan bahawa tiada perlawanan. Cuba tarikh atau penapis lain.'));
   for(const [key,title] of [['live','LIVE'],['upcoming','AKAN DATANG'],['finished','TAMAT'],['other','STATUS LAIN / BELUM DISAHKAN']]){
    const matches=rows.filter(m=>D.groupFor(m)===key);if(!matches.length)continue;const section=el('section',undefined,'mc-group');section.dataset.group=key;section.append(el('h3',title+' · '+matches.length));const grid=el('div',undefined,'mc-grid');matches.forEach(m=>grid.append(card(m)));section.append(grid);box.append(section);
   }
   expiry=setTimeout(invalidate,Math.max(1,120000-(Date.now()-at)));
  }
  function populate(){const previous=comp.value;comp.replaceChildren(new Option('Semua pertandingan','all'));const competitions=new Map(records.map(m=>[m.competition.id,m.competition.name]));for(const [id,name] of [...competitions].sort((a,b)=>a[1].localeCompare(b[1])))comp.add(new Option(name,id));if(competitions.has(previous))comp.value=previous}
  async function load(){
   if(loading)return;
   if(waitSeconds()){noticeWanted=true;hydrateCached();render();controls();return}
   if(!D.validDate(query.value)||!D.validDate(day.value)){state('Tarikh tidak sah','Pilih tarikh kalendar yang sah.');return}
   if(!navigator.onLine){invalidate();return}
   const request=++token,provider=source.value,utc=query.value;clearTimeout(expiry);records=[];at=0;loading=true;noticeWanted=false;controls();
   box.setAttribute('aria-busy','true');const skeleton=el('div',undefined,'skeleton');skeleton.setAttribute('aria-hidden','true');box.replaceChildren(el('p','Menyemak perlawanan…'),skeleton);
   try{
    if(provider==='api')await footballClient.fixtures(utc);
    else{
     const path='eventsday.php?d='+encodeURIComponent(utc)+'&s=Soccer';
     if(Date.now()<sportsUntil&&!sportsCache.has(path))throw Object.assign(new Error('rate'),{code:'rate'});
     sportsUntil=Date.now()+60000;controls();const data=await sportsGet(path);
     if(!(data?.events===null||Array.isArray(data?.events)))throw Object.assign(new Error('invalid'),{code:'invalid'});
    }
    if(request!==token||!navigator.onLine)return;
    loading=false;hydrateCached();render();
   }catch(e){if(request!==token)return;loading=false;noticeWanted=true;if(provider==='sports'&&e.retryAfter)sportsUntil=Math.max(sportsUntil,Date.now()+e.retryAfter*1000);const errors={rate:'Had semakan sementara dicapai. Tunggu sebelum cuba lagi.',coverage:'Tarikh atau pertandingan tidak tersedia dalam pelan semasa.',offline:'Sambungan terputus. Tiada skor tersimpan dipaparkan.',timeout:'Pembekal tamat masa. Cuba lagi secara manual selepas tempoh menunggu.',invalid:'Respons pembekal tidak sah; tiada skor direka.'};state('Perlawanan belum tersedia',errors[e.code]||'Pembekal tidak dapat dicapai. Cuba lagi secara manual selepas tempoh menunggu.')}finally{controls()}
  }
  button.addEventListener('click',load);refresh.addEventListener('click',load);
  function changeDay(value){if(!D.validDate(value)){day.setCustomValidity('Pilih tarikh kalendar yang sah.');day.reportValidity();return}day.setCustomValidity('');day.value=value;if(!loading)hydrateCached();render();controls()}
  document.querySelectorAll('[data-international-offset]').forEach(b=>b.addEventListener('click',()=>{const value=D.shiftDay(D.dayMY(),Number(b.dataset.internationalOffset));query.value=value;changeDay(value)}));
  day.addEventListener('change',()=>changeDay(day.value));
  for(const control of [search,kind,comp])control.addEventListener(control===search?'input':'change',render);
  window.addEventListener('offline',invalidate);window.addEventListener('online',controls);
  const check=()=>{if(at&&Date.now()-at>=120000)invalidate()};window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
  controls();
  return Object.freeze({show(){panel.hidden=false;hydrateCached();render();controls()},hide(){token++;loading=false;panel.hidden=true;clearTimeout(expiry)}});
 }
 globalThis.PlusInternationalCentre=Object.freeze({create});
})();
