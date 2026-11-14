import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const js=await readFile(new URL('../app.js',import.meta.url),'utf8');
const base=execFileSync('git',['show','f1ef6c8:app.js'],{encoding:'utf8'});
const newsBlock=s=>s.slice(s.indexOf('const news='),s.indexOf('const sportsCache'));
const currentNews=vm.runInNewContext(newsBlock(js)+';news');
const baselineNews=vm.runInNewContext(newsBlock(base)+';news');
test('all original article facts and attribution preserved; only approved media fields change',()=>{
 const facts=records=>Array.from(records,record=>{const copy=JSON.parse(JSON.stringify(record));delete copy.photo;if([14,15,16].includes(copy.id))copy.image='';return copy});
 assert.deepEqual(facts(currentNews),facts(baselineNews));
 assert.equal(new Set(currentNews.map(x=>x.id)).size,currentNews.length);
 assert.equal(currentNews.filter(n=>n.verified).length,12);
});
test('original image assets and API function remain byte-identical to baseline',async()=>{
 const paths=execFileSync('git',['ls-tree','-r','--name-only','fdb99a9','--','images','functions/api/football.js'],{encoding:'utf8'}).trim().split('\n');
 for(const path of paths)assert.deepEqual(await readFile(new URL('../'+path,import.meta.url)),execFileSync('git',['show','fdb99a9:'+path]),path);
});
test('JavaScript parses and public API paths remain the same',()=>{new vm.Script(js);assert(js.includes("footballClient.fixtures(date)"));assert(js.includes("https://www.thesportsdb.com/api/v1/json/123/"))});
test('navigation targets exist and local resources resolve',async()=>{for(const id of ['berita','skor','perlawanan','kedudukan','statistik','tentang'])assert(html.includes(`id="${id}"`));for(const file of ['styles.css','app.js']){assert(html.includes(file));await readFile(new URL('../'+file,import.meta.url))}});
test('styles provide reduced motion, safe areas and square editorial artwork',async()=>{const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');assert(css.includes('prefers-reduced-motion:reduce'));assert(css.includes('safe-area-inset-top'));assert(css.includes('aspect-ratio:1/1'));assert(css.includes('object-fit:contain'))});

test('latest photos are local and include alt text, license, source and responsive metadata',async()=>{
 const credits=JSON.parse(await readFile(new URL('../images/photo-credits.json',import.meta.url),'utf8'));
 for(const id of [14,15,16]){const n=currentNews.find(n=>n.id===id),credit=credits.find(c=>c.articleId===id);
  assert(n.image.startsWith('images/')&&n.image.endsWith('.webp'));
  assert(n.photo.alt.length>20);assert(n.photo.caption.includes('Foto arkib'));
  assert(n.photo.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:'));
  assert(n.photo.licenseUrl.startsWith('https://creativecommons.org/licenses/'));
  assert(n.photo.author&&n.photo.srcset);assert.equal(credit.localPath,n.image);
  for(const path of [credit.localPath,credit.responsivePath]){const bytes=await readFile(new URL('../'+path,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP')}
 }
});
