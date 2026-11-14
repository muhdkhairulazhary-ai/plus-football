// National-team classification uses returned competition names/explicit team
// metadata, not country whitelists or guesses from club names. Unknowns stay out.
(() => {
 const D=PlusMatchData;
 const clean=s=>typeof s==='string'?s.trim().slice(0,300):'';
 function competition(raw,source){
  const name=clean(source==='api'?raw?.league?.name:raw?.strLeague);
  if(raw?.teams?.home?.national===false||raw?.teams?.away?.national===false)return null;
  if(!name||/\b(?:club|clubs|premier league|champions league|liga super)\b/i.test(name))return null;
  const normalized=name.replace(/[’']/g,"'").replace(/Women's/gi,'Women').replace(/\s+/g,' ');
  let kind=null;
  if(/^(?:international\s+)?friendl(?:y|ies)(?:\s*-?\s+(?:international|women|u[ -]?\d{2}|men))*$/i.test(normalized))kind='friendlies';
  else if(/^(?:(?:fifa|women)\s+)?world cup(?:\s*-?\s+(?:women|u[ -]?\d{2}))?(?:\s*-\s*(?:qualification|qualifying)(?:\s+(?:africa|asia|europe|concacaf|conmebol|oceania|intercontinental|play-?offs?))?)?$/i.test(normalized))kind=/qualif/i.test(name)?'qualifiers':'tournaments';
  else if(/^(?:UEFA (?:Women|U(?:17|19|21)) Championship|AFC U(?:17|20|23) Asian Cup|CONCACAF W Championship)(?:\s*-?\s*Qualification)?$/i.test(normalized))kind=/qualif/i.test(name)?'qualifiers':'tournaments';
  else if(/^(?:(?:uefa|afc|caf|concacaf|ofc|fifa|conmebol|women'?s?)\s+)?(?:euro championship|european championship|european championships|euro|asian cup|africa cup of nations|african nations championship|copa am[eé]rica|gold cup|nations league|nations cup|aff championship|asean championship|asean cup|arab cup|gulf cup|saff championship|waff championship|cafa nations cup|cosafa cup|cecafa senior challenge cup|eaff e-?1 football championship|olympics|olympic games)(?:\s+(?:women|u[ -]?\d{2}))?(?:\s*-?\s*(?:qualification|qualifying|qualifiers))?$/i.test(normalized))kind=/qualif/i.test(name)?'qualifiers':'tournaments';
  else if(raw?.teams?.home?.national===true&&raw?.teams?.away?.national===true)kind=/qualif/i.test(name)?'qualifiers':/friendl/i.test(name)?'friendlies':'tournaments';
  return kind?{name,kind,id:String(source==='api'?raw.league?.id??name:raw.idLeague??name)}:null;
 }
 // ISO region names are UI metadata, never an allowlist on returned teams.
 const regions='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
 const names=new Map();
 if(typeof Intl.DisplayNames==='function')for(const locale of ['en','ms']){const display=new Intl.DisplayNames([locale],{type:'region'});for(const code of regions)names.set(display.of(code).toLocaleLowerCase(),code)}
 const aliases={'usa':'US','united states of america':'US','south korea':'KR','korea republic':'KR','north korea':'KP','korea dpr':'KP','iran':'IR','ir iran':'IR','cape verde':'CV','ivory coast':'CI',"cote d'ivoire":'CI','chinese taipei':'TW','dr congo':'CD','congo dr':'CD','turkey':'TR','russia':'RU','vietnam':'VN','czech republic':'CZ','palestine':'PS','brunei':'BN','laos':'LA','syria':'SY','tanzania':'TZ','moldova':'MD','bolivia':'BO','venezuela':'VE'};
 const subFlags={england:'gbeng',scotland:'gbsct',wales:'gbwls'};
 function flag(name){
  const key=clean(name).replace(/\s+(?:u[ -]?\d{2}|w|women)$/i,'').toLocaleLowerCase();
  if(subFlags[key])return '🏴'+Array.from(subFlags[key],ch=>String.fromCodePoint(0xe0000+ch.charCodeAt(0))).join('')+String.fromCodePoint(0xe007f);
  const code=aliases[key]||names.get(key);return code?Array.from(code,ch=>String.fromCodePoint(0x1f1e6+ch.charCodeAt(0)-65)).join(''):null;
 }
 function normalize(raw,source,at,updatedAt){
  const comp=competition(raw,source);if(!comp)return null;
  if(source==='sports'&&raw.strSport&&raw.strSport!=='Soccer')return null;
  const league={name:comp.name,apiId:Number(raw.league?.id),sportsId:String(raw.idLeague)};
  const m=D.normalize(raw,source,league,at,updatedAt);if(!m)return null;
  return {...m,competition:comp,homeFlag:D.logo(raw.teams?.home?.flag||raw.strHomeTeamFlag),awayFlag:D.logo(raw.teams?.away?.flag||raw.strAwayTeamFlag)};
 }
 function filter(records,{date,search='',kind='all',competition='all'}){
  const q=search.trim().toLocaleLowerCase();
  return records.filter(m=>m.date===date&&(kind==='all'||m.competition.kind===kind)&&(competition==='all'||m.competition.id===competition)&&(!q||(m.home+' '+m.away).toLocaleLowerCase().includes(q)));
 }
 globalThis.PlusInternationalData=Object.freeze({competition,normalize,flag,filter});
})();
