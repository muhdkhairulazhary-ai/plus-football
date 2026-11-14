"""Headless UI checks. Every request is fulfilled locally or aborted: no live APIs.
Run: python tests/redesign_browser.py
Uses preinstalled Python Playwright and /usr/bin/chromium; no install required.
"""
import asyncio,json,unittest
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from datetime import date
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path('/tmp/plus-football-redesign-screenshots')
class RedesignBrowser(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.pw=await async_playwright().start()
  self.browser=await self.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  self.context=await self.browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  self.page=await self.context.new_page();self.errors=[];self.calls=[];self.offline=False;self.slow=False
  self.page.on('pageerror',lambda error:self.errors.append(str(error)))
  await self.context.route('**/*',self.route)
  await self.page.goto('https://plus-preview.test/')
 async def asyncTearDown(self):
  try:self.assertEqual(self.errors,[])
  finally:await self.browser.close();await self.pw.stop()
 async def route(self,route):
  u=urlparse(route.request.url)
  if '/api/football' in u.path:
   self.calls.append(route.request.url)
   await asyncio.sleep(.08)
   return await route.fulfill(status=429 if self.offline else 200,json={'error':'Mock rate limit'} if self.offline else {'response':[{'teams':{'home':{'name':'MOCK Home'},'away':{'name':'MOCK Away'}},'fixture':{'status':{'short':'FT'}},'league':{'name':'MOCK league'},'goals':{'home':0,'away':0}}]})
  if u.netloc=='www.thesportsdb.com':
   self.calls.append(route.request.url)
   if self.offline:return await route.fulfill(status=503,json={'error':'mock offline'})
   query=parse_qs(u.query);league=query.get('id',['4328'])[0]
   await asyncio.sleep(.3 if self.slow and league=='4328' else .08)
   if 'searchplayers' in u.path:return await route.fulfill(json={'player':[{'strPlayer':'MOCK Player','strTeam':'MOCK Club','strPosition':'Forward'}]})
   event={'idEvent':'1','strHomeTeam':'MOCK Home '+league,'strAwayTeam':'MOCK Away','dateEvent':date.today().isoformat(),'strTime':'12:00:00','strStatus':'Match Finished','strLeague':'MOCK '+league,'intHomeScore':0,'intAwayScore':0,'strVenue':'MOCK venue'}
   return await route.fulfill(json={'events':[event]})
  if u.netloc=='plus-preview.test':
   path=ROOT/('index.html' if u.path=='/' else u.path.lstrip('/'))
   if path.is_file() and path.resolve().is_relative_to(ROOT):
    mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml'}.get(path.suffix,'application/octet-stream')
    return await route.fulfill(body=path.read_bytes(),content_type=mime)
  return await route.abort()
 async def nav(self,id):
  await self.page.locator(f'[data-view="{id}"]').click()
  await self.page.locator('#'+id).wait_for(state='visible')
 async def test_responsive_home_and_square_artwork(self):
  ARTIFACTS.mkdir(parents=True,exist_ok=True)
  for width in [375,390,430,1280]:
   await self.page.set_viewport_size({'width':width,'height':900})
   await self.page.screenshot(path=str(ARTIFACTS/f'home-{width}.png'),full_page=True)
   self.assertEqual(await self.page.locator('.story').count(),11)
   size=await self.page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
   self.assertLessEqual(size['scroll'],size['width'],str(width))
   art=await self.page.locator('.featured-story .art').bounding_box()
   self.assertAlmostEqual(art['width'],art['height'],delta=2)
   self.assertEqual(self.calls,[],'Homepage must not make football API calls')
 async def test_categories_search_and_article_focus(self):
  await self.page.locator('.category-nav [data-nav="EPL"]').click()
  self.assertTrue(await self.page.locator('#homeLead').is_hidden())
  for cat in await self.page.locator('#articles .cat').all_text_contents():self.assertEqual(cat,'EPL')
  await self.page.locator('#search').fill('not-a-real-story')
  self.assertTrue(await self.page.locator('#empty').is_visible())
  await self.page.locator('#search').fill('')
  button=self.page.locator('#articles [data-id]').first
  title=await button.get_attribute('aria-label')
  await button.click();self.assertTrue(await self.page.locator('#modal').is_visible())
  self.assertEqual(await self.page.locator('#modalTitle').inner_text(),title.removeprefix('Baca: '))
  self.assertEqual(await self.page.evaluate('document.activeElement.id'),'close')
  await self.page.keyboard.press('Escape')
  self.assertTrue(await self.page.locator('#modal').is_hidden())
  self.assertEqual(await self.page.evaluate('document.activeElement.getAttribute("aria-label")'),title)
 async def test_score_skeleton_details_and_standings(self):
  await self.nav('skor')
  await self.page.locator('#scoreContent .skeleton').first.wait_for(state='visible')
  await self.page.locator('.score-centre b').wait_for()
  self.assertEqual(await self.page.locator('.score-centre b').inner_text(),'0 : 0')
  await self.page.locator('.match-detail-btn').first.click()
  self.assertTrue(await self.page.locator('.match-detail').first.is_visible())
  await self.page.locator('[data-score="4480"]').click()
  await self.page.wait_for_function('document.querySelector(".score-centre span")?.textContent==="MOCK 4480"')
  await self.nav('kedudukan')
  for league,count in [('epl',20),('ucl',36),('msl',12)]:
   await self.page.locator(f'[data-league="{league}"]').click()
   self.assertEqual(await self.page.locator('#standingsContent tbody tr').count(),count)
  self.assertIn('snapshot',await self.page.locator('#standingsContent').inner_text())
 async def test_error_retry_and_explicit_api_date(self):
  self.offline=True;await self.nav('skor')
  await self.page.locator('#scoreContent .error-state').wait_for()
  self.offline=False;await self.page.locator('#scoreContent .error-state button').click()
  await self.page.locator('.score-centre b').wait_for()
  await self.page.locator('details summary').click()
  await self.page.locator('#apiMatchDate').fill('2024-02-29')
  await self.page.locator('#apiMatchCheck').click()
  await self.page.wait_for_function('document.querySelector("#apiMatchResults").textContent.includes("MOCK Home")')
  self.assertIn('0 - 0',await self.page.locator('#apiMatchResults').inner_text())
  self.assertFalse(await self.page.locator('#apiMatchCheck').is_disabled())
 async def test_mobile_panels_menu_and_player_search(self):
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   for view in ['skor','perlawanan','kedudukan']:
    await self.nav(view)
    await self.page.wait_for_timeout(120)
    size=await self.page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
    self.assertLessEqual(size['scroll'],size['width'],f'{width} {view}')
   await self.page.screenshot(path=str(ARTIFACTS/f'standings-{width}.png'),full_page=True)
  await self.page.locator('#menuToggle').click()
  await self.page.locator('#quickMenu a[href="#statistik"]').click()
  self.assertTrue(await self.page.locator('#statistik').is_visible())
  self.assertTrue(await self.page.locator('#quickMenu').is_hidden())
  await self.page.locator('#playerName').fill('MOCK Player')
  await self.page.locator('#playerSearch').click()
  await self.page.wait_for_function('document.querySelector("#playerResults").textContent.includes("MOCK Player")')
 async def test_reduced_motion_and_direct_hash_navigation(self):
  await self.page.emulate_media(reduced_motion='reduce')
  await self.page.goto('https://plus-preview.test/#kedudukan')
  self.assertTrue(await self.page.locator('#kedudukan').is_visible())
  self.assertTrue(await self.page.locator('#berita').is_hidden())
  style=await self.page.locator('#kedudukan').evaluate('(e)=>getComputedStyle(e).animationName')
  self.assertEqual(style,'none')
 async def test_race_and_fixture_fallback(self):
  self.slow=True;await self.nav('skor')
  await self.page.locator('[data-score="4480"]').click()
  await self.page.wait_for_function('document.querySelector(".score-centre span")?.textContent==="MOCK 4480"')
  await self.page.wait_for_timeout(400)
  self.assertEqual(await self.page.locator('.score-centre span').inner_text(),'MOCK 4480')
  await self.nav('perlawanan')
  await self.page.locator('[data-fixture="msl"]').click()
  await self.page.wait_for_timeout(400)
  self.assertIn('belum disahkan',await self.page.locator('#fixturesContent').inner_text())
  self.assertFalse(await self.page.locator('#fixturesContent .skeleton').count())
if __name__=='__main__':unittest.main(verbosity=2)
