(() => {
 const D=PlusMatchData,I=PlusInternationalData;
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e};
 function create({footballClient,sportsGet,sportsCache}){
  const panel=document.getElementById('internationalPanel'),box=document.getElementById('internationalResults');
  const query=document.getElementById('internationalQueryDate'),day=document.getElementById('internationalDate'),source=document.getElementById('internationalSource');
  const search=document.getElementById('internationalSearch'),kind=document.getElementById('internationalKind'),comp=document.getElementById('internationalCompetition'),button=document.getElementById('internationalLoad');
  let records=[],at=0,updatedAt=null,loadedSource='',token=0,expiry,timer,sportsUntil=0,loading=false;
  query.value=day.value=D.dayMY();
  const fmt=value=>new Intl.DateTimeFormat('ms-MY',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'medium',hour12:false}).format(new Date(value))+' MYT';
  function controls(){clearTimeout(timer);const until=source.value==='api'?footballClient.blockedUntil:sportsUntil;const wait=Math.max(0,Math.ceil((until-Date.now())/1000));button.disabled=!navigator.onLine||wait>0;button.textContent=wait?'TUNGGU '+wait+' SAAT':'MUAT SAMPEL TARIKH';if(wait)timer=setTimeout(controls,Math.min(wait*1000,2147483647))}
  footballClient.subscribe(controls);source.addEventListener('change',controls);
  function state(title,text){box.setAttribute('aria-busy','false');box.replaceChildren(el('strong',title),el('p',text))}
  function invalidate(){token++;loading=false;clearTimeout(expiry);records=[];at=0;state('Semakan baharu diperlukan','Skor tidak tersedia di luar talian atau selepas dua minit. Muatkan sampel baharu secara manual.');controls()}
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
   if(!at){state('Sampel belum dimuatkan','Pilih sumber dan tarikh pertanyaan UTC, kemudian muatkan secara manual. Tiada panggilan untuk setiap negara.');return}
   if(Date.now()-at>=120000){invalidate();return}
   box.setAttribute('aria-busy','false');box.replaceChildren();
   const provenance=el('div',undefined,'mc-provenance');provenance.append(el('strong',loadedSource==='api'?'API-FOOTBALL':'THESPORTSDB'),el('span','Diambil '+fmt(at)),el('p',updatedAt&&Number.isFinite(Date.parse(updatedAt))?'Gerbang dikemas kini '+fmt(Date.parse(updatedAt)):'Masa kemas kini pembekal tidak diberikan.'));box.append(provenance);
   const rows=I.filter(records,{date:day.value,search:search.value,kind:kind.value,competition:comp.value});
   box.append(el('p',rows.length+' rekod sepadan dalam sampel · tarikh paparan '+day.value+' MYT (rekod tanpa masa mengikut tarikh sumber). Bukan senarai penuh atau feed masa nyata.'));
   if(!rows.length)box.append(el('strong','Tiada rekod sepadan dalam sampel'),el('p','Ini tidak mengesahkan bahawa tiada perlawanan. Semak tarikh MYT, carian atau sumber rasmi.'));
   for(const [key,title] of [['live','LIVE'],['upcoming','AKAN DATANG'],['finished','TAMAT'],['other','STATUS LAIN / BELUM DISAHKAN']]){
    const matches=rows.filter(m=>D.groupFor(m)===key);if(!matches.length)continue;const section=el('section',undefined,'mc-group');section.dataset.group=key;section.append(el('h3',title+' · '+matches.length));const grid=el('div',undefined,'mc-grid');matches.forEach(m=>grid.append(card(m)));section.append(grid);box.append(section);
   }
   expiry=setTimeout(invalidate,Math.max(1,120000-(Date.now()-at)));
  }
  function populate(){const previous=comp.value;comp.replaceChildren(new Option('Semua pertandingan tersedia','all'));const competitions=new Map(records.map(m=>[m.competition.id,m.competition.name]));for(const [id,name] of [...competitions].sort((a,b)=>a[1].localeCompare(b[1])))comp.add(new Option(name,id));if(competitions.has(previous))comp.value=previous}
  button.addEventListener('click',async()=>{
   if(!D.validDate(query.value)||!D.validDate(day.value)){state('Tarikh tidak sah','Pilih tarikh kalendar yang sah.');return}
   if(!navigator.onLine){invalidate();return}
   const request=++token,provider=source.value,utc=query.value;clearTimeout(expiry);records=[];at=0;loading=true;
   box.setAttribute('aria-busy','true');const skeleton=el('div',undefined,'skeleton');skeleton.setAttribute('aria-hidden','true');box.replaceChildren(el('p','Sedang memuatkan sampel antarabangsa…'),skeleton);
   try{
    let data,received;
    if(provider==='api'){const result=await footballClient.fixtures(utc);data=result.data;received=result.at}
    else{
     const path='eventsday.php?d='+encodeURIComponent(utc)+'&s=Soccer';
     if(Date.now()<sportsUntil&&!sportsCache.has(path))throw Object.assign(new Error('rate'),{code:'rate'});
     sportsUntil=Date.now()+60000;controls();data=await sportsGet(path);received=sportsCache.get(path)?.at||Date.now();
     if(!(data?.events===null||Array.isArray(data?.events)))throw Object.assign(new Error('invalid'),{code:'invalid'});
    }
    if(request!==token||!navigator.onLine)return;
    loading=false;const raw=provider==='api'?data.response:(data.events||[]);records=D.unique(raw.map(row=>I.normalize(row,provider,received,data.updatedAt)));at=received;updatedAt=data.updatedAt;loadedSource=provider;populate();render();
    document.getElementById('internationalCoverage').textContent=records.length+' rekod pasukan kebangsaan dikenal pasti daripada '+raw.length+' rekod pembekal. Pertandingan tidak dikenali/kelab ditapis; liputan mungkin tidak lengkap. Tarikh pertanyaan '+utc+' UTC; satu hari MYT boleh merentasi dua tarikh UTC.';
   }catch(e){if(request!==token)return;loading=false;if(provider==='sports'&&e.retryAfter)sportsUntil=Math.max(sportsUntil,Date.now()+e.retryAfter*1000);const errors={rate:'Had semakan sementara dicapai. Tunggu sebelum cuba lagi.',coverage:'Tarikh atau pertandingan tidak tersedia dalam pelan semasa.',offline:'Sambungan terputus. Tiada skor tersimpan dipaparkan.',timeout:'Pembekal tamat masa. Cuba lagi secara manual selepas tempoh menunggu.',invalid:'Respons pembekal tidak sah; tiada skor direka.'};state('Sampel tidak tersedia',errors[e.code]||'Pembekal tidak dapat dicapai. Cuba lagi secara manual selepas tempoh menunggu.')}finally{controls()}
  });
  for(const control of [search,kind,comp,day])control.addEventListener(control===search?'input':'change',()=>{if(!D.validDate(day.value)){day.setCustomValidity('Pilih tarikh kalendar yang sah.');day.reportValidity();return}day.setCustomValidity('');render()});
  window.addEventListener('offline',invalidate);window.addEventListener('online',controls);
  const check=()=>{if(at&&Date.now()-at>=120000)invalidate()};window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
  controls();
  return Object.freeze({show(){panel.hidden=false;render();controls()},hide(){token++;loading=false;panel.hidden=true;clearTimeout(expiry)}});
 }
 globalThis.PlusInternationalCentre=Object.freeze({create});
})();
