// Deterministic cache revisions. No network, credentials or deployment.
import {readFile, writeFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const paths=['/','/index.html','/styles.css','/liquid-glass.css','/app.js','/match-data.js','/match-centre.js','/football-client.js','/international-data.js','/international-centre.js','/pwa.js','/offline.html','/manifest.webmanifest','/icon.svg'];
for(const dir of ['images','icons']){
 for(const file of (await readdir(new URL(dir+'/',root))).sort()){
  if(/\.(svg|webp|png)$/.test(file))paths.push('/'+dir+'/'+file);
 }
}
for(const file of (await readdir(root)).sort())if(/\.(jpe?g|png|webp)$/.test(file))paths.push('/'+file);
const swURL=new URL('sw.js',root);
const original=await readFile(swURL,'utf8');
let result=original.replace(/^const ASSETS = .*;$/m,'const ASSETS = '+JSON.stringify(paths)+';');
const normalized=result.replace(/^const VERSION = .*;$/m,"const VERSION = 'REVISION';");
const hash=createHash('sha256').update(normalized);
for(const path of paths){hash.update(path);hash.update(await readFile(new URL(path==='/'?'index.html':path.slice(1),root)))}
result=result.replace(/^const VERSION = .*;$/m,"const VERSION = 'pwa-v1-"+hash.digest('hex').slice(0,16)+"';");
if(process.argv.includes('--check')){
 if(result!==original){console.error('FAIL: stale PWA cache revision. Run node scripts/update-pwa-cache.mjs');process.exitCode=1}
 else console.log('PASS: PWA cache revision matches all static assets');
}else{await writeFile(swURL,result);console.log('PWA cache revision updated ('+paths.length+' public assets)')}
