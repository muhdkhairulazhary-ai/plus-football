import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));
const html=await readFile(new URL('index.html',root),'utf8');
test('manifest has exact PWA identity, standalone scope and colors',()=>{
 assert.equal(manifest.name,'plus+ Football');assert.equal(manifest.short_name,'plus+');
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
 assert.equal(manifest.theme_color,'#0b0b0b');assert.equal(manifest.background_color,'#0b0b0b');
});
test('branded PNG icons have valid signatures and exact dimensions',async()=>{
 for(const [path,size] of [['icons/icon-192.png',192],['icons/icon-512.png',512],['icons/apple-touch-icon.png',180],['icons/plus-football-192-v2.png',192],['icons/plus-football-512-v2.png',512],['icons/apple-touch-icon-plus-football-v2.png',180]]){
  const b=await readFile(new URL(path,root));assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(b.readUInt32BE(16),size);assert.equal(b.readUInt32BE(20),size);
 }
 for(const size of [192,512])assert(manifest.icons.some(icon=>icon.sizes===size+'x'+size&&icon.type==='image/png'));
});
test('Safari and manifest reference versioned wordmark icons; old URLs stay compatible',async()=>{
 assert.equal((html.match(/rel="apple-touch-icon"/g)||[]).length,1);
 assert(html.includes('href="/icons/apple-touch-icon-plus-football-v2.png"'));
 assert(html.includes('manifest.webmanifest?v=plus-football-brand-2'));
 for(const [path,alias] of [['apple-touch-icon-plus-football-v2.png','apple-touch-icon.png'],['plus-football-192-v2.png','icon-192.png'],['plus-football-512-v2.png','icon-512.png']]){
  assert.deepEqual(await readFile(new URL('icons/'+path,root)),await readFile(new URL('icons/'+alias,root)));
 }
 assert.deepEqual(manifest.icons.map(icon=>icon.src),['/icons/plus-football-192-v2.png','/icons/plus-football-512-v2.png']);
 const brand=await readFile(new URL('icons/plus-football-brand.svg',root),'utf8');
 assert(brand.includes('font-style="italic"'));assert(brand.includes('>plus</text>'));assert(brand.includes('>+</text>'));assert(brand.includes('>FOOTBALL</text>'));
});
test('iOS installation metadata and safe viewport are present',()=>{
 for(const text of ['viewport-fit=cover','apple-mobile-web-app-capable','apple-mobile-web-app-status-bar-style','apple-touch-icon','180x180','Add to Home Screen','installGuide'])assert(html.includes(text),text);
});
test('all pre-PWA article data, photos and API implementation are preserved',async()=>{
 const js=await readFile(new URL('app.js',root),'utf8');const baseline=execFileSync('git',['show','f1ef6c8:app.js'],{encoding:'utf8'});
 const news=s=>s.slice(s.indexOf('const news='),s.indexOf('const sportsCache'));
 assert.equal(news(js),news(baseline));
 for(const path of execFileSync('git',['ls-tree','-r','--name-only','f1ef6c8','--','images','functions','icon.svg'],{encoding:'utf8'}).trim().split('\n'))
  assert.deepEqual(await readFile(new URL(path,root)),execFileSync('git',['show','f1ef6c8:'+path]),path);
});
test('cache revision is current, deterministic and limited to local public static files',async()=>{
 execFileSync(process.execPath,['scripts/update-pwa-cache.mjs','--check'],{cwd:new URL('../',import.meta.url)});
 const sw=await readFile(new URL('sw.js',root),'utf8');new vm.Script(sw);
 const paths=JSON.parse(sw.match(/^const ASSETS = (.*);$/m)[1]);
 assert(paths.includes('/offline.html')&&paths.includes('/app.js'));
 assert(paths.every(path=>path.startsWith('/')&&!path.startsWith('//')&&!path.includes('/api/')&&!path.includes('/functions/')&&!path.includes('/workers/')));
 for(const path of paths)await readFile(new URL(path==='/'?'index.html':path.slice(1),root));
});
test('PWA controller script parses and uses explicit update activation',async()=>{
 const script=await readFile(new URL('pwa.js',root),'utf8');new vm.Script(script);
 assert(script.includes("updateViaCache: 'none'"));assert(script.includes("type: 'ACTIVATE_UPDATE'"));
});
