"""Real service worker on localhost. All dynamic data is a local mock.
External hosts are blocked at Chromium DNS resolution; no live football APIs.
Run: python tests/pwa_browser.py
"""
import asyncio,json,re,threading,unittest
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
class LocalSite(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=urlparse(self.path).path;state=self.server.state;state['requests'].append(path)
  if path==state.get('fail_path'):
   self.send_response(503);self.end_headers();return
  if path.startswith('/api/') or path.startswith('/mock-sports/'):
   if path.startswith('/api/'):
    body={'response':[{'teams':{'home':{'name':'LOCAL MOCK Home'},'away':{'name':'LOCAL MOCK Away'}},'goals':{'home':0,'away':0},'fixture':{'status':{'short':'FT'}},'league':{'name':'LOCAL MOCK League'}}],'results':1}
   else:body={'events':[{'strHomeTeam':'LOCAL MOCK Home','strAwayTeam':'LOCAL MOCK Away','dateEvent':'2026-11-14','strLeague':'LOCAL MOCK League','strStatus':'Match Finished','intHomeScore':0,'intAwayScore':0}]}
   data=json.dumps(body).encode();mime='application/json'
  else:
   file=ROOT/('index.html' if path=='/' else unquote(path).lstrip('/'))
   if not file.resolve().is_relative_to(ROOT) or not file.is_file():self.send_response(404);self.end_headers();return
   data=file.read_bytes();mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}.get(file.suffix,'application/octet-stream')
   if file.name=='app.js':
    # Test transport only. The repository's provider URL remains unchanged.
    data=data.replace(b'https://www.thesportsdb.com/api/v1/json/123/',b'/mock-sports/')
    data+=f'\ndocument.documentElement.dataset.assetEdition="{state["version"]}";'.encode()
   if file.name=='index.html':data=data.replace(b'<html lang="ms">',f'<html lang="ms" data-test-edition="{state["version"]}">'.encode())
   if file.name=='sw.js':data=re.sub(rb"const VERSION = '[^']+';",f"const VERSION = 'local-test-{state['version']}';".encode(),data)
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers()
  try:self.wfile.write(data)
  except (BrokenPipeError,ConnectionResetError):pass
class PwaBrowser(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.server=ThreadingHTTPServer(('127.0.0.1',0),LocalSite);self.server.state={'version':1,'requests':[]};self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
  self.url=f'http://127.0.0.1:{self.server.server_port}'
  self.pw=await async_playwright().start()
  self.browser=await self.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'])
  self.context=await self.browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  self.page=await self.context.new_page();self.errors=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)))
  await self.page.goto(self.url+'/');await self.page.evaluate('navigator.serviceWorker.ready')
  await self.page.wait_for_function('navigator.serviceWorker.controller!==null')
 async def asyncTearDown(self):
  try:self.assertEqual(self.errors,[])
  finally:
   await self.browser.close();await self.pw.stop();await asyncio.to_thread(self.server.shutdown);self.server.server_close();self.thread.join()
 async def cache_keys(self):return await self.page.evaluate('''async()=>{let paths=[];for(const name of await caches.keys()){const c=await caches.open(name);paths.push(...(await c.keys()).map(r=>new URL(r.url).pathname))}return paths}''')
 async def test_manifest_installation_and_iPhone_layout(self):
  data=await self.page.evaluate('fetch("/manifest.webmanifest").then(r=>r.json())');self.assertEqual(data['short_name'],'plus+')
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   await self.page.locator('#installButton').click()
   self.assertTrue(await self.page.locator('#installGuide').is_visible())
   self.assertTrue(await self.page.locator('#installGuide').evaluate('(e)=>e.open'))
   self.assertIn('Add to Home Screen',await self.page.locator('#installGuide').inner_text())
   size=await self.page.evaluate('({w:innerWidth,s:document.documentElement.scrollWidth})');self.assertLessEqual(size['s'],size['w'])
  await self.page.emulate_media(media='screen')
  self.assertIn('/offline.html',await self.cache_keys())
 async def test_browser_manifest_parser_and_iOS_standalone_detection(self):
  session=await self.context.new_cdp_session(self.page)
  manifest=await session.send('Page.getAppManifest')
  self.assertEqual(manifest['errors'],[])
  self.assertEqual(urlparse(manifest['url']).path,'/manifest.webmanifest')
  await self.page.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true})")
  await self.page.reload()
  await self.page.locator('#installButton').click()
  self.assertTrue(await self.page.locator('#standaloneStatus').is_visible())
 async def test_suspended_page_clears_expired_score_on_resume(self):
  await self.page.locator('[data-view="skor"]').click();await self.page.locator('.score-centre b').wait_for()
  await self.page.evaluate("for(const value of sportsCache.values())value.at=Date.now()-121000;window.dispatchEvent(new Event('pageshow'))")
  self.assertEqual(await self.page.locator('.score-centre b').count(),0)
  self.assertIn('telah luput',await self.page.locator('#scoreContent').inner_text())
 async def test_versioned_icon_urls_decode_with_brand_colors(self):
  icons=await self.page.evaluate("""async()=>{
   const manifest=await fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json());
   const urls=[document.querySelector('link[rel=apple-touch-icon]').href,...manifest.icons.map(i=>new URL(i.src,location.href).href)];
   return await Promise.all(urls.map(async url=>{
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let white=0,red=0,transparent=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]>230&&pixels[i+1]>230&&pixels[i+2]>230)white++;if(pixels[i]>180&&pixels[i+1]<90&&pixels[i+2]<100)red++;if(pixels[i+3]!==255)transparent++;}
    return {url,width:canvas.width,height:canvas.height,white,red,transparent,corner:[...pixels.slice(0,4)]};
   }));
  }""")
  for icon,size in zip(icons,[180,192,512]):
   self.assertEqual((icon['width'],icon['height']),(size,size))
   self.assertEqual(icon['corner'],[11,11,11,255]);self.assertEqual(icon['transparent'],0)
   self.assertGreater(icon['white'],100);self.assertGreater(icon['red'],20)
   self.assertIn('v2.png',icon['url'])
 async def test_saved_news_offline_and_uncached_route_fallback(self):
  await self.context.set_offline(True);await self.page.reload()
  await self.page.locator('#connectionNotice').wait_for(state='visible')
  self.assertEqual(await self.page.locator('#articles .story').count(),11)
  self.assertIn('luar talian',await self.page.locator('#connectionMessage').inner_text())
  await self.page.locator('#articles [data-id="14"]').click()
  self.assertIn('Dion Cools',await self.page.locator('#modalTitle').inner_text())
  await self.page.locator('#modalMedia img').evaluate('(img)=>img.decode()')
  await self.page.keyboard.press('Escape')
  await self.page.goto(self.url+'/uncached-article')
  self.assertIn('Anda di luar talian',await self.page.locator('h1').inner_text())
 async def test_API_is_never_cached_and_displayed_scores_clear_offline(self):
  await self.page.locator('[data-view="skor"]').click();await self.page.locator('.score-centre b').wait_for()
  self.assertEqual(await self.page.locator('.score-centre b').inner_text(),'0 : 0')
  result=await self.page.evaluate('fetch("/api/football?endpoint=fixtures&date=2026-11-14").then(r=>r.json())');self.assertEqual(result['results'],1)
  self.assertFalse(any(p.startswith('/api/') or p.startswith('/mock-sports/') for p in await self.cache_keys()))
  await self.context.set_offline(True)
  await self.page.wait_for_function('!document.querySelector(".score-centre b")')
  self.assertIn('luar talian',await self.page.locator('#scoreContent').inner_text())
  result=await self.page.evaluate('fetch("/api/football?endpoint=fixtures&date=2026-11-14").then(async r=>({status:r.status,body:await r.json()}))')
  self.assertEqual(result['status'],503);self.assertNotIn('response',result['body'])
  await self.page.reload();await self.page.locator('#scoreContent').wait_for()
  self.assertEqual(await self.page.locator('.score-centre b').count(),0)
 async def test_network_first_new_articles_waiting_update_and_cache_cleanup(self):
  # A news/asset release is fetched fresh even before SW activation changes.
  self.server.state['version']=2
  await self.page.reload()
  self.assertEqual(await self.page.locator('html').get_attribute('data-test-edition'),'2')
  self.assertEqual(await self.page.locator('html').get_attribute('data-asset-edition'),'2')
  await self.page.evaluate('(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()})()')
  await self.page.wait_for_function('(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting)()')
  await self.page.locator('#updateNotice').wait_for(state='visible')
  await self.page.locator('#applyUpdate').click();await self.page.wait_for_load_state('load')
  await self.page.wait_for_function('(async()=>{const keys=await caches.keys();return keys.includes("plus-football-static-local-test-2")&&!keys.includes("plus-football-static-local-test-1")})()')
  await self.context.set_offline(True);await self.page.reload()
  self.assertEqual(await self.page.locator('html').get_attribute('data-asset-edition'),'2')
  self.assertTrue(await self.page.locator('#connectionNotice').is_visible())
 async def test_update_in_another_tab_prompts_without_forced_reload(self):
  other=await self.context.new_page();await other.goto(self.url+'/')
  await other.wait_for_function('navigator.serviceWorker.controller!==null')
  self.server.state['version']=2
  await self.page.evaluate('(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()})()')
  await self.page.locator('#updateNotice').wait_for(state='visible')
  await self.page.locator('#applyUpdate').click()
  await self.page.wait_for_function('document.documentElement.dataset.testEdition==="2"')
  await other.locator('#updateNotice').wait_for(state='visible')
  self.assertEqual(await other.locator('html').get_attribute('data-test-edition'),'1')
  await other.locator('#applyUpdate').click()
  await other.wait_for_function('document.documentElement.dataset.testEdition==="2"')
  await other.close()
 async def test_cached_news_is_marked_during_server_failure_even_if_online(self):
  self.server.state['fail_path']='/'
  await self.page.reload()
  self.assertTrue(await self.page.evaluate('navigator.onLine'))
  self.assertTrue(await self.page.locator('#connectionNotice').is_visible())
  self.assertIn('simpanan peranti',await self.page.locator('#connectionMessage').inner_text())
 async def test_failed_worker_install_does_not_replace_working_version(self):
  self.server.state.update(version=3,fail_path='/app.js')
  await self.page.evaluate('(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()})()')
  await self.page.wait_for_function('(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing&&!r.waiting})()')
  self.assertEqual(await self.page.evaluate('(async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active.state})()'),'activated')
  await self.context.set_offline(True);await self.page.reload()
  self.assertEqual(await self.page.locator('html').get_attribute('data-asset-edition'),'1')
if __name__=='__main__':unittest.main(verbosity=2)
