import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('Liquid Glass preserves content, API, PWA logic, metadata and source adapters',()=>{
 for(const path of ['match-data.js','pwa.js','manifest.webmanifest','functions/api/football.js']){
  assert.equal(read(path),execFileSync('git',['show','f1ef6c8:'+path],{cwd:root,encoding:'utf8'}),path);
 }
 const before=execFileSync('git',['show','f1ef6c8:index.html'],{cwd:root,encoding:'utf8'});
 const metadata=html=>html.match(/<(?:meta|title|link)[^>]*(?:>[^<]*<\/title>)?/g).filter(line=>!line.includes('stylesheet'));
 assert.deepEqual(metadata(read('index.html')),metadata(before));
});
test('Glass is progressive, reduced motion aware and safe-area aware without JS scroll work',()=>{
 const css=read('liquid-glass.css');
 assert.match(css,/@supports.*backdrop-filter/);
 assert.match(css,/-webkit-backdrop-filter/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(css,/@media \(prefers-contrast: more\)/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.doesNotMatch(css,/will-change|background-attachment:\s*fixed|@import/);
 const html=read('index.html');
 assert.equal((html.match(/class="nav-icon" aria-hidden="true"/g)||[]).length,4);
 assert.equal((html.match(/data-view=/g)||[]).length,4);
});
