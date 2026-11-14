"""Headless UI checks. Every request is fulfilled locally or aborted: no live APIs.
Run: python tests/redesign_browser.py
Uses preinstalled Python Playwright and /usr/bin/chromium; no install required.
"""
import asyncio,json,unittest
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from datetime import date,datetime,timezone,timedelta
from zoneinfo import ZoneInfo
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path('/tmp/plus-football-redesign-screenshots')
class RedesignBrowser(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.pw=await async_playwright().start()
  self.browser=await self.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  self.context=await self.browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
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
   if getattr(self,'mc_rate',False):return await route.fulfill(status=429,headers={'Retry-After':'120'},json={'error':'mock rate limit'})
   if getattr(self,'mc_api',False):
    return await route.fulfill(json={'updatedAt':datetime.now(timezone.utc).isoformat(),'results':1,'response':[{'fixture':{'id':900,'date':parse_qs(u.query)['date'][0]+'T20:00:00Z' if getattr(self,'mc_api_rollover',False) else datetime.now(timezone.utc).isoformat(),'status':{'short':'FT'},'venue':{'name':'MOCK Venue'}},'league':{'id':278,'name':'Super League'},'teams':{'home':{'name':'MOCK MSL Home'},'away':{'name':'MOCK MSL Away'}},'goals':{'home':0,'away':0}}]})
   return await route.fulfill(status=429 if self.offline else 200,json={'error':'Mock rate limit'} if self.offline else {'response':[{'teams':{'home':{'name':'MOCK Home'},'away':{'name':'MOCK Away'}},'fixture':{'id':901,'date':parse_qs(u.query).get('date',['2026-11-14'])[0]+'T12:00:00Z','status':{'short':'FT'}},'league':{'id':39,'name':'MOCK league'},'goals':{'home':0,'away':0}}]})
  if u.netloc=='www.thesportsdb.com':
   self.calls.append(route.request.url)
   if getattr(self,'mc_gate',None):await self.mc_gate.wait()
   if self.offline:return await route.fulfill(status=503,json={'error':'mock offline'})
   query=parse_qs(u.query);league=query.get('id',['4328'])[0]
   if getattr(self,'mc_mode',None)=='malformed':return await route.fulfill(json={'events':{'bad':'shape'}})
   if getattr(self,'mc_mode',None)=='empty':return await route.fulfill(json={'events':None})
   if getattr(self,'mc_mode',None)=='partial' and 'eventsnextleague' in u.path:return await route.fulfill(status=503,json={'error':'mock unavailable'})
   await asyncio.sleep(.3 if self.slow and league=='4328' else .08)
   if 'searchplayers' in u.path:return await route.fulfill(json={'player':[{'strPlayer':'MOCK Player','strTeam':'MOCK Club','strPosition':'Forward'}]})
   event={'idEvent':'1','strHomeTeam':'MOCK Home '+league,'strAwayTeam':'MOCK Away','dateEvent':datetime.now(ZoneInfo('Asia/Kuala_Lumpur')).date().isoformat(),'strTime':'00:00:00','strStatus':'Match Finished','strLeague':'MOCK '+league,'intHomeScore':0,'intAwayScore':0,'strVenue':'MOCK venue'}
   if getattr(self,'mc_mode',None) in ['mixed','partial','historical']:
    now=datetime.now(timezone.utc)
    stamp=(now-timedelta(days=1) if self.mc_mode=='historical' else now).isoformat()
    common={'idLeague':league,'strTimestamp':stamp,'strHomeTeamBadge':'https://plus-preview.test/icon.svg','strAwayTeamBadge':'https://missing-logo.invalid/away.png'}
    events=[]
    for ident,status in [('live','1H'),('next','NS'),('done','FT'),('postponed','PST')]:
     record={**event,**common,'idEvent':ident,'strHomeTeam':'MOCK '+ident+' '+league,'strStatus':status,'intHomeScore':0 if status=='FT' else None,'intAwayScore':0 if status=='FT' else None}
     record.pop('strVenue',None)
     if status=='FT':record.update({'strVenue':'<img src=x onerror=alert(1)>','strHomeGoalDetails':"90+2' MOCK Player",'intHomeShots':0,'intAwayShots':2})
     events.append(record)
    if self.mc_mode=='partial':events=events[2:3]
    if self.mc_mode=='historical':events=events[:1]
    return await route.fulfill(json={'events':events})
   return await route.fulfill(json={'events':[event]})
  if u.netloc=='plus-preview.test':
   path=ROOT/('index.html' if u.path=='/' else u.path.lstrip('/'))
   if path.is_file() and path.resolve().is_relative_to(ROOT):
    mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.webp':'image/webp'}.get(path.suffix,'application/octet-stream')
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
  await self.page.locator('.mc-team-score').first.wait_for()
  self.assertEqual(await self.page.locator('.mc-team-score').first.inner_text(),'0')
  await self.page.locator('.mc-details summary').first.click()
  self.assertTrue(await self.page.locator('.mc-details').first.evaluate('(el)=>el.open'))
  await self.page.locator('[data-score="4480"]').click()
  await self.page.wait_for_function('document.querySelector("#matchSummary")?.textContent.includes("UCL")&&document.querySelector(".mc-teams")?.textContent.includes("4480")')
  await self.nav('kedudukan')
  for league,count in [('epl',20),('ucl',36),('msl',12)]:
   await self.page.locator(f'[data-league="{league}"]').click()
   self.assertEqual(await self.page.locator('#standingsContent tbody tr').count(),count)
  self.assertIn('snapshot',await self.page.locator('#standingsContent').inner_text())
 async def test_error_retry_and_explicit_api_date(self):
  self.offline=True;await self.nav('skor')
  await self.page.locator('#scoreContent .mc-state').wait_for()
  self.offline=False;await self.page.locator('#scoreContent .mc-state button').click()
  await self.page.locator('.mc-team-score').first.wait_for()
  await self.page.locator('details.free-api-panel > summary').click()
  await self.page.locator('#apiMatchDate').fill('2024-02-29')
  await self.page.locator('#apiMatchCheck').click()
  await self.page.wait_for_function('document.querySelector(".mc-teams")?.textContent.includes("MOCK Home")&&document.querySelector("#matchSource").value==="api"')
  self.assertEqual(await self.page.locator('.mc-team-score').first.inner_text(),'0')
  self.assertTrue(await self.page.locator('#apiMatchCheck').is_disabled())
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
 async def test_latest_photos_cards_featured_and_modals(self):
  photos=Path('/tmp/plus-football-photo-screenshots');photos.mkdir(parents=True,exist_ok=True)
  self.assertEqual(await self.page.locator('.featured-story').get_attribute('data-article'),'14')
  featured=self.page.locator('.featured-story img')
  await self.page.wait_for_function('document.querySelector(".featured-story img")?.naturalWidth>0')
  self.assertEqual(await featured.get_attribute('loading'),'eager')
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   for ident in [14,15,16]:
    card=self.page.locator(f'#articles [data-article="{ident}"]')
    await card.scroll_into_view_if_needed()
    image=card.locator('img')
    await image.evaluate('(img)=>img.decode()')
    self.assertTrue((await image.get_attribute('src')).startswith('images/'))
    self.assertEqual(await image.get_attribute('loading'),'lazy')
    self.assertTrue(await image.get_attribute('alt'))
    size=await card.locator('.art').bounding_box();self.assertAlmostEqual(size['width'],size['height'],delta=2)
    self.assertIn('Foto arkib',await card.locator('figcaption').inner_text())
    self.assertIn('creativecommons.org',await card.locator('figcaption a').last.get_attribute('href'))
    await card.locator('button[data-id]').click()
    await self.page.locator('#modalMedia img').scroll_into_view_if_needed()
    await self.page.locator('#modalMedia img').evaluate('(img)=>img.decode()')
    self.assertEqual(await self.page.locator('#modalMedia img').get_attribute('src'),await image.get_attribute('src'))
    self.assertIn('Foto arkib',await self.page.locator('#modalMedia figcaption').inner_text())
    await self.page.screenshot(path=str(photos/f'modal-{ident}-{width}.png'))
    size=await self.page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
    self.assertLessEqual(size['scroll'],size['width'])
    await self.page.keyboard.press('Escape')
 async def test_photo_failure_fallback_and_modal_media_clearing(self):
  async def broken(route):await route.abort()
  await self.context.route('**/images/*.webp',broken)
  await self.page.reload()
  await self.page.locator('.featured-story .image-failed').wait_for()
  self.assertEqual(await self.page.locator('.featured-story img').count(),0)
  self.assertTrue(await self.page.locator('.featured-story .art>strong').is_visible())
  card=self.page.locator('#articles [data-article="14"]')
  await card.locator('button').click()
  await self.page.locator('#modalMedia .image-failed').wait_for()
  self.assertTrue(await self.page.locator('#modalMedia .art>strong').is_visible())
  self.assertIn('3skandar',await self.page.locator('#modalMedia figcaption').inner_text())
  await self.page.keyboard.press('Escape')
  await self.page.locator('#articles [data-article="11"] button').click()
  self.assertNotIn('3skandar',await self.page.locator('#modalMedia').inner_text())
 async def test_latest_photo_requests_stay_on_local_origin(self):
  requested=[]
  self.page.on('request',lambda request:requested.append(request.url))
  await self.page.reload()
  for ident in [14,15,16]:
   image=self.page.locator(f'#articles [data-article="{ident}"] img')
   await image.scroll_into_view_if_needed();await image.evaluate('(img)=>img.decode()')
   src=await image.evaluate('(img)=>img.currentSrc')
   self.assertTrue(src.startswith('https://plus-preview.test/images/'))
  self.assertEqual(self.calls,[])
  self.assertFalse(any('upload.wikimedia.org' in u for u in requested))
 async def test_match_centre_groups_dates_details_and_mobile_widths(self):
  self.mc_mode='mixed';await self.nav('skor');await self.page.locator('.mc-card').first.wait_for()
  for group in ['live','upcoming','finished','other']:self.assertEqual(await self.page.locator(f'.mc-group[data-group="{group}"] .mc-card').count(),1)
  self.assertIn('Diambil',await self.page.locator('.mc-provenance').inner_text())
  self.assertEqual(await self.page.locator('.mc-group[data-group="finished"] .mc-team-score').first.inner_text(),'0')
  self.assertEqual(await self.page.locator('.mc-group[data-group="upcoming"] .mc-team-score').first.inner_text(),'—')
  self.assertEqual(await self.page.locator('.mc-group[data-group="live"] .mc-details').count(),0)
  details=self.page.locator('.mc-group[data-group="finished"] .mc-details')
  await details.locator('summary').focus();await self.page.keyboard.press('Enter')
  self.assertTrue(await details.evaluate('(el)=>el.open'))
  self.assertIn('90+2',await details.inner_text());self.assertIn('Statistik tersedia',await details.inner_text())
  self.assertEqual(await details.locator('dd img').count(),0)
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   size=await self.page.evaluate('({w:innerWidth,s:document.documentElement.scrollWidth})');self.assertLessEqual(size['s'],size['w'])
   ARTIFACTS.mkdir(parents=True,exist_ok=True)
   await self.page.screenshot(path=str(ARTIFACTS/f'match-centre-{width}.png'),full_page=True)
  self.assertGreater(await self.page.locator('.mc-badge-fallback').count(),0)
  calls=len(self.calls);await self.page.locator('#matchNext').click()
  self.assertIn('Tiada rekod dalam sampel',await self.page.locator('#scoreContent').inner_text())
  await self.page.locator('#matchPrev').click();self.assertEqual(await self.page.locator('.mc-card').count(),4)
  self.assertEqual(len(self.calls),calls)
 async def test_match_centre_msl_coverage_and_manual_api_cooldown(self):
  self.mc_api=True;await self.nav('skor');await self.page.locator('.mc-card').first.wait_for()
  calls=len(self.calls);await self.page.locator('[data-score="4792"]').click()
  self.assertIn('Liputan belum disahkan',await self.page.locator('#scoreContent').inner_text())
  self.assertEqual(len(self.calls),calls)
  await self.page.locator('#matchSource').select_option('api')
  self.assertEqual(len(self.calls),calls)
  await self.page.locator('#matchRefresh').click()
  self.assertTrue(await self.page.locator('details.free-api-panel').evaluate('(e)=>e.open'))
  await self.page.locator('#apiMatchCheck').click()
  await self.page.wait_for_function('document.querySelector(".mc-teams")?.textContent.includes("MOCK MSL Home")')
  self.assertTrue(await self.page.locator('#apiMatchCheck').is_disabled())
  apiCalls=sum('/api/football?' in call for call in self.calls);self.assertEqual(apiCalls,1)
  await self.page.locator('#apiMatchCheck').evaluate("e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true}))")
  self.assertEqual(sum('/api/football?' in call for call in self.calls),1)
 async def test_match_centre_partial_empty_malformed_and_retry(self):
  self.mc_mode='partial';await self.nav('skor');await self.page.locator('.mc-card').wait_for()
  self.assertIn('Sebahagian permintaan gagal',await self.page.locator('.mc-provenance').inner_text())
  self.mc_mode='malformed';await self.page.locator('[data-score="4480"]').click()
  await self.page.wait_for_function('document.querySelector("#scoreContent").textContent.includes("Sambungan tergendala")')
  self.mc_mode='empty';await self.page.locator('#scoreContent .mc-state button').click()
  await self.page.wait_for_function('document.querySelector("#scoreContent").textContent.includes("Tiada rekod dalam sampel")')
  self.assertEqual(await self.page.locator('.mc-card').count(),0)
 async def test_match_centre_api_MYT_rollover_reuses_manual_source_day(self):
  self.mc_api=True;self.mc_api_rollover=True
  await self.nav('skor');await self.page.locator('.mc-card').first.wait_for()
  await self.page.locator('[data-score="4792"]').click();await self.page.locator('#matchSource').select_option('api')
  await self.page.locator('#matchRefresh').click();await self.page.locator('#apiMatchCheck').click()
  await self.page.wait_for_function('document.querySelector("#apiMatchResults").textContent.includes("Lihat kad")')
  self.assertEqual(await self.page.locator('.mc-card').count(),0)
  await self.page.locator('#matchNext').click()
  await self.page.locator('.mc-card').wait_for()
  self.assertIn('04:00 MYT',await self.page.locator('.mc-kickoff').inner_text())
  self.assertEqual(sum('/api/football?' in call for call in self.calls),1)
 async def test_match_centre_retry_after_stays_manual(self):
  await self.nav('skor');await self.page.locator('.mc-card').first.wait_for()
  self.mc_rate=True;await self.page.locator('#matchSource').select_option('api')
  await self.page.locator('#matchRefresh').click();await self.page.locator('#apiMatchCheck').click()
  await self.page.wait_for_function('document.querySelector("#apiMatchResults").textContent.includes("Had semakan")')
  self.assertIn('120',await self.page.locator('#apiMatchCheck').inner_text())
  self.assertTrue(await self.page.locator('#apiMatchCheck').is_disabled())
  self.assertEqual(sum('/api/football?' in call for call in self.calls),1)
  self.assertEqual(await self.page.locator('.mc-card').count(),0)
 async def test_match_centre_date_change_keeps_pending_skeleton_without_extra_calls(self):
  self.mc_gate=asyncio.Event();await self.nav('skor')
  await self.page.locator('#scoreContent .skeleton').first.wait_for()
  await self.page.locator('#matchNext').click()
  self.assertTrue(await self.page.locator('#scoreContent .skeleton').first.is_visible())
  self.assertEqual(len(self.calls),2)
  self.mc_gate.set()
  await self.page.wait_for_function('document.querySelector("#scoreContent").textContent.includes("Tiada rekod dalam sampel")')
  self.assertEqual(len(self.calls),2)
 async def test_match_centre_historical_live_is_not_current_live(self):
  self.mc_mode='historical';await self.nav('skor');await self.page.locator('.mc-provenance').wait_for()
  await self.page.locator('#matchPrev').click()
  self.assertEqual(await self.page.locator('.mc-group[data-group="live"]').count(),0)
  self.assertEqual(await self.page.locator('.mc-group[data-group="other"] .mc-card').count(),1)
  self.assertIn('Status LIVE lama',await self.page.locator('.mc-status').inner_text())
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
  await self.page.wait_for_function('document.querySelector("#matchSummary")?.textContent.includes("UCL")&&document.querySelector(".mc-teams")?.textContent.includes("4480")')
  await self.page.wait_for_timeout(400)
  self.assertIn('4480',await self.page.locator('.mc-teams').first.inner_text())
  await self.nav('perlawanan')
  await self.page.locator('[data-fixture="msl"]').click()
  await self.page.wait_for_timeout(400)
  self.assertIn('belum disahkan',await self.page.locator('#fixturesContent').inner_text())
  self.assertFalse(await self.page.locator('#fixturesContent .skeleton').count())
if __name__=='__main__':unittest.main(verbosity=2)
